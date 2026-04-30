/**
 * ✅ [v2.7.62] AI 이미지 관련성 평가 — 다중 vendor (Strategy 패턴)
 *
 * Opus 5인 팀 토론 결론:
 *   - 사용자 요청: "글 생성 AI랑 같은 모델로 vision도 해줘" → Strategy 디스패치
 *   - Vision 미지원 모델(Perplexity) → B안: 사용자 동의 후 Gemini Flash 폴백
 *   - SSRF 차단: file:/, private IP 거부
 *   - OOM 차단: pLimit(2) + Content-Length 사전 검사
 *   - 실패 시 score=50 중립 반환 (false-negative 차단보다 안전 — 발행 막지 않음)
 */

import * as https from 'https';
import { VISION_MODELS, routeTextToVision, type VisionRouting } from '../runtime/modelRegistry.js';

interface RelevanceScore {
  url: string;
  score: number;
  reason?: string;
}

const RELEVANCE_THRESHOLD_DEFAULT = 60;

// ─── SSRF 가드 ────────────────────────────────────────
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^localhost$/i,
];

function isSSRFRisk(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
    const host = u.hostname.toLowerCase();
    return PRIVATE_IP_PATTERNS.some(p => p.test(host));
  } catch {
    return true;
  }
}

// ─── 동시성 제한 ──────────────────────────────────────
let _activeFetches = 0;
const MAX_CONCURRENT_FETCH = 2;
async function acquireFetchSlot(): Promise<void> {
  while (_activeFetches >= MAX_CONCURRENT_FETCH) {
    await new Promise(r => setTimeout(r, 50));
  }
  _activeFetches++;
}
function releaseFetchSlot(): void {
  _activeFetches = Math.max(0, _activeFetches - 1);
}

// ─── 이미지 다운로드 (10MB 가드) ────────────────────────
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (isSSRFRisk(url)) {
    console.warn(`[ImageRelevance] 🛡️ SSRF 차단: ${url.slice(0, 80)}`);
    return null;
  }
  await acquireFetchSlot();
  try {
    return await new Promise<Buffer | null>(resolve => {
      try {
        const u = new URL(url);
        const lib = u.protocol === 'http:' ? require('http') : https;
        const req = lib.get(u, {
          timeout: 8000,
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }, (res: any) => {
          // redirect
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            fetchImageBuffer(res.headers.location).then(resolve);
            return;
          }
          if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
          // Content-Length 사전 체크 (10MB 초과 즉시 abort)
          const cl = parseInt(res.headers['content-length'] || '0', 10);
          if (cl > 10 * 1024 * 1024) {
            console.warn(`[ImageRelevance] 🛡️ 10MB 초과 차단: ${cl}B`);
            req.destroy();
            resolve(null);
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          res.on('data', (c: Buffer) => {
            total += c.length;
            if (total > 10 * 1024 * 1024) {
              req.destroy();
              resolve(null);
              return;
            }
            chunks.push(c);
          });
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      } catch {
        resolve(null);
      }
    });
  } finally {
    releaseFetchSlot();
  }
}

function detectMimeType(buf: Buffer): string {
  if (buf.length < 4) return 'image/jpeg';
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return 'image/webp';
  return 'image/jpeg';
}

// ─── 공통 프롬프트 ────────────────────────────────────
function buildScoringPrompt(heading: string, mainKeyword: string): string {
  return [
    `다음 이미지가 블로그 글의 소제목 "${heading}" 에 시각적으로 적합한지 0~100으로 평가해주세요.`,
    `메인 키워드(주제): "${mainKeyword}"`,
    ``,
    `평가 기준:`,
    `- 100: 소제목과 정확히 일치 (인물 일치, 상황 일치)`,
    `- 70-90: 주제 관련 일반 이미지 (분야는 맞으나 정확하진 않음)`,
    `- 40-60: 약한 관련 (같은 카테고리 다른 대상)`,
    `- 0-30: 무관 이미지 (광고, 무관한 인물/풍경)`,
    ``,
    `JSON 형식으로만 응답: {"score": 숫자, "reason": "한 줄 사유"}`,
  ].join('\n');
}

function parseScoreJson(text: string): { score: number; reason: string } {
  try {
    const parsed = JSON.parse(text);
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    return { score, reason: String(parsed.reason || '').slice(0, 80) };
  } catch {
    const m = text.match(/(\d{1,3})/);
    return { score: m ? Math.min(100, parseInt(m[1], 10)) : 50, reason: 'parse fallback' };
  }
}

// ─── HTTP 헬퍼 ────────────────────────────────────────
function httpsPost(urlStr: string, body: any, headers: Record<string, string>, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: timeoutMs,
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(text));
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Provider Strategies ─────────────────────────────
interface VisionStrategy {
  score(buf: Buffer, mime: string, prompt: string): Promise<{ score: number; reason: string }>;
  timeoutMs: number;
}

function geminiStrategy(model: string, apiKey: string): VisionStrategy {
  const timeoutMs = model === VISION_MODELS.GEMINI_PRO ? 25000 : 8000;
  return {
    timeoutMs,
    async score(buf, mime, prompt) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const body = {
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: buf.toString('base64') } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 100, responseMimeType: 'application/json' },
      };
      const res = await httpsPost(url, body, {}, timeoutMs);
      const text = res?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return parseScoreJson(text);
    },
  };
}

function claudeStrategy(model: string, apiKey: string): VisionStrategy {
  return {
    timeoutMs: 12000,
    async score(buf, mime, prompt) {
      const body = {
        model,
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: buf.toString('base64') } },
            { type: 'text', text: prompt + '\n\nJSON만 출력하고 다른 설명은 하지 마세요.' },
          ],
        }],
      };
      const res = await httpsPost('https://api.anthropic.com/v1/messages', body, {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }, 12000);
      const text = res?.content?.[0]?.text || '';
      // Claude는 ```json ... ``` 래퍼 가능 → 제거
      const cleaned = text.replace(/```json\s*|\s*```/g, '').trim();
      return parseScoreJson(cleaned);
    },
  };
}

function openaiStrategy(model: string, apiKey: string): VisionStrategy {
  const timeoutMs = model === VISION_MODELS.OPENAI_41_MINI ? 8000 : 10000;
  return {
    timeoutMs,
    async score(buf, mime, prompt) {
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      const body = {
        model,
        max_tokens: 100,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      };
      const res = await httpsPost('https://api.openai.com/v1/chat/completions', body, {
        'Authorization': `Bearer ${apiKey}`,
      }, timeoutMs);
      const text = res?.choices?.[0]?.message?.content || '';
      return parseScoreJson(text);
    },
  };
}

// ─── 핵심 dispatcher ──────────────────────────────────
export interface RelevanceCheckOptions {
  enabled: boolean;
  textGenerator: string;       // 글 생성 AI 키 (e.g. 'claude-sonnet')
  apiKeys: {
    gemini?: string;
    claude?: string;
    openai?: string;
  };
  threshold?: number;
}

function pickStrategy(routing: VisionRouting, keys: RelevanceCheckOptions['apiKeys']): VisionStrategy | null {
  if (routing.vendor === 'gemini' && keys.gemini) return geminiStrategy(routing.model, keys.gemini);
  if (routing.vendor === 'claude' && keys.claude) return claudeStrategy(routing.model, keys.claude);
  if (routing.vendor === 'openai' && keys.openai) return openaiStrategy(routing.model, keys.openai);
  // 키 없으면 Gemini Flash로 최후 폴백 (있으면)
  if (keys.gemini) return geminiStrategy(VISION_MODELS.GEMINI_FLASH, keys.gemini);
  return null;
}

async function scoreOne(
  imageUrl: string,
  heading: string,
  mainKeyword: string,
  strategy: VisionStrategy
): Promise<RelevanceScore> {
  try {
    const buf = await fetchImageBuffer(imageUrl);
    if (!buf) return { url: imageUrl, score: 50, reason: '다운로드 실패 (중립)' };
    const mime = detectMimeType(buf);
    const prompt = buildScoringPrompt(heading, mainKeyword);
    const result = await Promise.race([
      strategy.score(buf, mime, prompt),
      new Promise<{ score: number; reason: string }>((_, rej) =>
        setTimeout(() => rej(new Error('vision timeout')), strategy.timeoutMs)
      ),
    ]);
    return { url: imageUrl, score: result.score, reason: result.reason };
  } catch (e: any) {
    return { url: imageUrl, score: 50, reason: `오류 → 중립: ${(e.message || '?').slice(0, 50)}` };
  }
}

export async function filterImagesByRelevance(
  imageUrls: string[],
  heading: string,
  mainKeyword: string,
  options: RelevanceCheckOptions
): Promise<{ filtered: string[]; scores: RelevanceScore[]; routing?: VisionRouting }> {
  if (!options.enabled || imageUrls.length === 0) {
    return { filtered: imageUrls, scores: [] };
  }

  const routing = routeTextToVision(options.textGenerator);
  const strategy = pickStrategy(routing, options.apiKeys);
  if (!strategy) {
    console.warn(`[ImageRelevance] ⚠️ 사용 가능한 vision API 키 없음 (vendor=${routing.vendor}) → 검증 스킵`);
    return { filtered: imageUrls, scores: [], routing };
  }

  const threshold = options.threshold ?? RELEVANCE_THRESHOLD_DEFAULT;
  console.log(`[ImageRelevance] 🤖 "${heading}" — ${imageUrls.length}개 평가 (provider=${routing.provider}${routing.fellBack ? ', 폴백' : ''}, threshold=${threshold})`);
  if (routing.fellBack && routing.reason) console.log(`[ImageRelevance]   ↳ ${routing.reason}`);

  // 병렬 5개 (외부 API RPM 보호)
  const CONCURRENT = 5;
  const scores: RelevanceScore[] = [];
  for (let i = 0; i < imageUrls.length; i += CONCURRENT) {
    const batch = imageUrls.slice(i, i + CONCURRENT);
    const batchResults = await Promise.all(batch.map(url => scoreOne(url, heading, mainKeyword, strategy)));
    scores.push(...batchResults);
  }

  const filtered = scores
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(s => s.url);

  const rejected = scores.filter(s => s.score < threshold);
  console.log(`[ImageRelevance] ✅ "${heading}" — 통과 ${filtered.length}/${imageUrls.length} | 차단 ${rejected.length}개`);
  if (rejected.length > 0) {
    rejected.forEach(r => console.log(`[ImageRelevance]   ❌ ${r.score}점: ${r.reason || '?'} | ${r.url.slice(0, 70)}`));
  }

  return { filtered, scores, routing };
}
