/**
 * ✅ [v2.7.61] AI 이미지 관련성 평가 모듈
 *
 * 목적:
 *   이미지 수집 후 소제목과 관련 없는 이미지(랜덤/오인 매칭)를 Gemini Vision으로 자동 차단.
 *
 * 사용:
 *   - 키워드 검색은 빠르지만 정확도 낮음 (예: "김연아" 검색 → 무관한 인물/풍경)
 *   - Gemini 2.5 Flash Vision이 "이 이미지가 '{heading}' 컨텍스트에 적절한가?" 평가
 *   - 점수 < threshold (기본 60) 이미지는 차단
 *
 * 비용:
 *   - Gemini 2.5 Flash Vision: ~$0.00004/이미지 (≈ ₩0.05)
 *   - 글 1개당 (8 소제목 × 3 후보) = 24회 → ₩1.2 추가
 *   - opt-in (config.imageRelevanceCheck=true일 때만 동작) → 기본 OFF
 */

import * as https from 'https';

interface RelevanceScore {
  url: string;
  score: number;
  reason?: string;
}

const GEMINI_VISION_MODEL = 'gemini-2.5-flash';
const RELEVANCE_THRESHOLD = 60;

/**
 * 이미지 1장의 관련성 점수 0~100 반환
 */
async function scoreImageRelevance(
  imageUrl: string,
  heading: string,
  mainKeyword: string,
  apiKey: string
): Promise<RelevanceScore> {
  try {
    // 이미지를 base64로 다운로드 (10MB 제한)
    const imageBuffer = await fetchImageBuffer(imageUrl);
    if (!imageBuffer || imageBuffer.length === 0) {
      return { url: imageUrl, score: 0, reason: '이미지 다운로드 실패' };
    }
    if (imageBuffer.length > 10 * 1024 * 1024) {
      return { url: imageUrl, score: 0, reason: '10MB 초과' };
    }

    const mimeType = detectMimeType(imageBuffer);
    if (!mimeType) {
      return { url: imageUrl, score: 0, reason: 'mime 추론 실패' };
    }

    const base64 = imageBuffer.toString('base64');
    const prompt = [
      `다음 이미지가 블로그 글의 소제목 "${heading}" 에 시각적으로 적합한지 0~100으로 평가해주세요.`,
      `메인 키워드(주제): "${mainKeyword}"`,
      ``,
      `평가 기준:`,
      `- 100: 소제목과 정확히 일치하는 이미지 (인물 일치, 상황 일치)`,
      `- 70-90: 주제 관련 일반 이미지 (분야는 맞으나 정확하진 않음)`,
      `- 40-60: 약하게 관련 (같은 카테고리지만 다른 대상)`,
      `- 0-30: 무관한 이미지 (광고, 무관한 인물/풍경)`,
      ``,
      `JSON 형식으로만 응답: {"score": 숫자, "reason": "한 줄 사유"}`
    ].join('\n');

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 100,
        responseMimeType: 'application/json'
      }
    };

    const response = await callGeminiAPI(requestBody, apiKey);
    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      const parsed = JSON.parse(text);
      const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
      return { url: imageUrl, score, reason: String(parsed.reason || '').slice(0, 80) };
    } catch {
      const numMatch = text.match(/(\d{1,3})/);
      const score = numMatch ? Math.min(100, parseInt(numMatch[1], 10)) : 50;
      return { url: imageUrl, score, reason: 'JSON parse fallback' };
    }
  } catch (e: any) {
    return { url: imageUrl, score: 50, reason: `평가 오류: ${e.message?.slice(0, 60)}` };
  }
}

/**
 * 후보 이미지 N개를 Gemini Vision으로 평가하고 임계값 이상만 반환.
 * API 키 없거나 평가 비활성화 시 원본 그대로 반환 (시각적 품질 검증 스킵).
 */
export async function filterImagesByRelevance(
  imageUrls: string[],
  heading: string,
  mainKeyword: string,
  options: {
    enabled: boolean;
    apiKey?: string;
    threshold?: number;
  }
): Promise<{ filtered: string[]; scores: RelevanceScore[] }> {
  if (!options.enabled || !options.apiKey || imageUrls.length === 0) {
    return { filtered: imageUrls, scores: [] };
  }

  const threshold = options.threshold ?? RELEVANCE_THRESHOLD;
  console.log(`[ImageRelevance] 🤖 "${heading}" — ${imageUrls.length}개 이미지 AI 평가 시작 (threshold=${threshold})`);

  // 병렬 평가 (최대 5개 동시 — Gemini RPM 한도 보호)
  const CONCURRENT = 5;
  const scores: RelevanceScore[] = [];
  for (let i = 0; i < imageUrls.length; i += CONCURRENT) {
    const batch = imageUrls.slice(i, i + CONCURRENT);
    const batchResults = await Promise.all(
      batch.map(url => scoreImageRelevance(url, heading, mainKeyword, options.apiKey!))
    );
    scores.push(...batchResults);
  }

  const filtered = scores
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(s => s.url);

  const rejected = scores.filter(s => s.score < threshold);
  console.log(`[ImageRelevance] ✅ "${heading}" — 통과 ${filtered.length}/${imageUrls.length}개 | 차단 ${rejected.length}개`);
  if (rejected.length > 0) {
    rejected.forEach(r => console.log(`[ImageRelevance]   ❌ ${r.score}점: ${r.reason || '?'} | ${r.url.slice(0, 80)}`));
  }

  return { filtered, scores };
}

// ─── helpers ─────────────────────────────────────────────────────────

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  return new Promise(resolve => {
    try {
      const u = new URL(url);
      const req = https.get(u, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, res => {
        if (res.statusCode && (res.statusCode >= 300 && res.statusCode < 400) && res.headers.location) {
          fetchImageBuffer(res.headers.location).then(resolve);
          return;
        }
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', () => resolve(null));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

function detectMimeType(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) return 'image/webp';
  return 'image/jpeg'; // 폴백
}

async function callGeminiAPI(body: any, apiKey: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${apiKey}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000
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
    req.on('timeout', () => { req.destroy(); reject(new Error('Gemini API timeout')); });
    req.write(JSON.stringify(body));
    req.end();
  });
}
