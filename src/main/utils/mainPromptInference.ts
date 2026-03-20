// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-03-18] Main Process 전용 AI 프롬프트 추론 모듈
// renderer/modules/promptTranslation.ts를 main process용으로 포팅
// Gemini → OpenAI → Claude → Perplexity → 영어 폴백 체인
// ═══════════════════════════════════════════════════════════════════

import { loadConfig } from '../../configManager.js';

// ✅ 프롬프트 캐시 (최대 100개)
const _mainPromptCache = new Map<string, string>();

function cachePrompt(key: string, value: string): void {
  if (_mainPromptCache.size > 100) {
    const firstKey = _mainPromptCache.keys().next().value;
    if (firstKey) _mainPromptCache.delete(firstKey);
  }
  _mainPromptCache.set(key, value);
}

// ✅ 공유 프롬프트 템플릿 (renderer/modules/promptTranslation.ts와 동일)
function getTranslationPrompt(headingText: string, imageStyle?: string): string {
  const styleGuides: Record<string, string> = {
    'realistic': 'Generate a PHOTOGRAPHY-style prompt. Focus on: subject detail, environment, mood, and composition (rule of thirds/symmetrical/leading lines). Use terms like "professional photography", "cinematic", "8K". Do NOT specify camera angle or lighting.',
    'anime': 'Generate an ANIME ILLUSTRATION prompt. Include: dynamic composition, vibrant colors, anime art style. Use terms like "anime illustration", "detailed background", "cel shading". Do NOT use photography terms.',
    'stickman': 'Generate a CUTE CARTOON CHARACTER prompt. Include: simple character with stick-like limbs performing an action related to the topic. Use terms like "cute character illustration", "simple cartoon", "expressive pose". Do NOT use photography terms.',
    'roundy': 'Generate a CUTE ROUND CHARACTER prompt. Include: adorable round/chibi character in a scene. Use terms like "chibi character", "kawaii style", "rounded proportions", "cute illustration". Do NOT use photography terms.',
    '2d': 'Generate a KOREAN WEBTOON style prompt. Include: manhwa/webtoon illustration style, Korean comic art, detailed scene. Use terms like "webtoon illustration", "Korean manhwa style", "digital art". Do NOT use photography terms.',
    'vintage': 'Generate a VINTAGE/RETRO PHOTOGRAPHY prompt. Focus on: film grain, warm tones, nostalgic atmosphere. Use terms like "vintage film photography", "retro aesthetic". Do NOT specify camera angle.',
  };

  const styleGuide = styleGuides[imageStyle || 'realistic'] || styleGuides['realistic'];

  return `You are an expert AI image prompt engineer specializing in ${imageStyle || 'realistic'} style.

TASK: Generate a complete, ready-to-use image generation prompt from this Korean heading.

HEADING: "${headingText}"
STYLE: ${imageStyle || 'realistic'}

STYLE-SPECIFIC INSTRUCTIONS:
${styleGuide}

CRITICAL RULES:
1. TRANSLATE THE EXACT MEANING — do NOT generalize or drift.
   Example: "전기차 냉동차 시장 전망" → "electric refrigerated vehicle market outlook" (NOT "food market tour")
   Example: "강아지 피부병 예방" → "dog skin disease prevention, veterinary care" (NOT "cute puppy photo")
2. Korean compound words must be parsed accurately: 전기차=electric vehicle, 냉동차=refrigerated truck, 피부병=skin disease
3. DECIDE whether people should appear based ONLY on the topic:
   - Food, tech gadgets, cars, scenery, animals, real estate → NO people, focus on objects/environment
   - Health, fitness, fashion, education, lifestyle activities → include people naturally with relevant actions
   - ETHNICITY: By default, any person should be Korean/East Asian (this is a Korean blog).
4. DO NOT include camera angle, color grading, or lighting — these are added separately by the system
5. Focus on: subject, composition, environment, and mood
6. Keep under 50 words — be dense and specific, not verbose
7. End with: NO TEXT NO WRITING
8. Output ONLY the English prompt, nothing else`;
}

// ═══════ 1순위: Gemini ═══════
async function tryGemini(headingText: string, imageStyle?: string, apiKey?: string, geminiModel?: string): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const model = geminiModel || 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: getTranslationPrompt(headingText, imageStyle) }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

// ═══════ 2순위: OpenAI ═══════
async function tryOpenAI(headingText: string, imageStyle?: string, apiKey?: string): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You are an expert AI image prompt engineer for ${imageStyle || 'realistic'} style. Output ONLY the English prompt.` },
          { role: 'user', content: getTranslationPrompt(headingText, imageStyle) },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ═══════ 3순위: Claude ═══════
async function tryClaude(headingText: string, imageStyle?: string, apiKey?: string): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: getTranslationPrompt(headingText, imageStyle) }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.content?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

// ═══════ 4순위: Perplexity ═══════
async function tryPerplexity(headingText: string, imageStyle?: string, apiKey?: string): Promise<string | null> {
  if (!apiKey) return null;
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: `You are an expert AI image prompt engineer for ${imageStyle || 'realistic'} style. Output ONLY the English prompt.` },
          { role: 'user', content: getTranslationPrompt(headingText, imageStyle) },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-03-18] AI 응답 정제 — 프롬프트 오염 차단 (100점 위생 처리)
// Perplexity 자기 소개, 시스템 프롬프트 누출, 마크다운 서식 제거
// ═══════════════════════════════════════════════════════════════════
function sanitizeAIPromptResponse(raw: string): string {
  let cleaned = raw;

  // 1. AI 자기 소개 / 역할 선언 제거
  cleaned = cleaned
    .replace(/(?:^|\n)(?:I'm|I am|As an? )\s*(?:Perplexity|AI|assistant|language model|chatbot)[^.\n]*[.!]?/gi, '')
    .replace(/(?:^|\n)(?:Sure|Certainly|Of course|Here(?:'s| is))[^.\n]*[.:!]?\s*/gi, '')
    .replace(/(?:^|\n)(?:Here is|Below is|The following is)[^.\n]*[.:!]?\s*/gi, '');

  // 1.5. ✅ [2026-03-20] AI 브랜드명 완전 제거 — 프롬프트 내 어디든 Perplexity 등 삭제
  // Perplexity Sonar가 문장 중간에 자기 이름 삽입 → Imagen이 로고를 렌더링하는 버그 방지
  cleaned = cleaned
    .replace(/\bPerplexity\b/gi, '')
    .replace(/\bChatGPT\b/gi, '')
    .replace(/\bOpenAI\b/gi, '')
    .replace(/\bAnthropic\b/gi, '')
    .replace(/\bClaude\b/gi, '')
    .replace(/\bGemini\b/gi, '')
    .replace(/\bSonar\b/gi, '')
    .replace(/\bGPT-?\d[\w.-]*/gi, '')
    .replace(/\bpowered by [\w.]+/gi, '');

  // 2. 시스템 프롬프트 누출 제거
  cleaned = cleaned
    .replace(/(?:^|\n)(?:You are an expert|TASK:|HEADING:|STYLE:|CRITICAL RULES:|STYLE-SPECIFIC)[^\n]*/gi, '')
    .replace(/(?:^|\n)(?:IMPORTANT:|Output ONLY|Keep under \d+ words|End with:)[^\n]*/gi, '');

  // 3. 마크다운 서식 제거
  cleaned = cleaned
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/^[-*]\s+/gm, '');

  // 4. 따옴표 래핑 제거
  cleaned = cleaned.replace(/^["'`]+|["'`]+$/g, '');

  // 5. 정리
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  // 6. 빈 결과 방어
  if (!cleaned || cleaned.length < 5) {
    return raw.replace(/\s{2,}/g, ' ').trim();
  }

  if (cleaned !== raw.trim()) {
    console.log(`[MainPromptInference] 🧹 AI 응답 정제: "${raw.substring(0, 40)}..." → "${cleaned.substring(0, 40)}..."`);
  }
  return cleaned;
}

// ═══════ 최종 폴백: 간단한 영어 변환 ═══════
// ✅ [2026-03-18] "NO TEXT NO WRITING" 제거 — ImageFX Imagen 3.5가 이를 텍스트로 렌더링
function fallbackPrompt(headingText: string): string {
  return `eye-catching blog thumbnail, visual metaphor for: ${headingText}, cinematic lighting, compelling composition, hero image style`;
}

// ═══════════════════════════════════════════════════════════════════
// ✅ 메인 함수: AI 멀티모델 폴백 체인으로 영어 프롬프트 생성
// ═══════════════════════════════════════════════════════════════════
export async function generateEnglishPromptMain(
  headingText: string,
  imageStyle?: string,
): Promise<string> {
  // 캐시 확인
  const cacheKey = `${headingText}__${imageStyle || 'realistic'}`;
  if (_mainPromptCache.has(cacheKey)) {
    console.log(`[MainPromptInference] 캐시 히트: "${headingText}"`);
    return _mainPromptCache.get(cacheKey)!;
  }

  // API 키 로드
  let config: any;
  try {
    config = await loadConfig();
  } catch (e) {
    console.warn('[MainPromptInference] 설정 로드 실패, 폴백 프롬프트 사용');
    return fallbackPrompt(headingText);
  }

  const geminiKey = config?.geminiApiKey;
  const geminiModel = config?.geminiTextModel;
  const openaiKey = config?.openaiApiKey || config?.OPENAI_API_KEY;
  const claudeKey = config?.claudeApiKey || config?.CLAUDE_API_KEY || config?.ANTHROPIC_API_KEY;
  const perplexityKey = config?.perplexityApiKey || config?.PERPLEXITY_API_KEY;

  // 순차 시도: Gemini → OpenAI → Claude → Perplexity
  const attempts = [
    { name: 'Gemini', fn: () => tryGemini(headingText, imageStyle, geminiKey, geminiModel) },
    { name: 'OpenAI', fn: () => tryOpenAI(headingText, imageStyle, openaiKey) },
    { name: 'Claude', fn: () => tryClaude(headingText, imageStyle, claudeKey) },
    { name: 'Perplexity', fn: () => tryPerplexity(headingText, imageStyle, perplexityKey) },
  ];

  for (const { name, fn } of attempts) {
    try {
      const result = await fn();
      if (result) {
        // ✅ [2026-03-18] AI 응답 정제 — Perplexity 자기 소개, 시스템 프롬프트 누출 차단
        const sanitized = sanitizeAIPromptResponse(result);
        console.log(`[MainPromptInference] ✅ ${name} 성공: "${headingText}" → "${sanitized.substring(0, 60)}..."`);
        cachePrompt(cacheKey, sanitized);
        return sanitized;
      }
    } catch (err) {
      console.warn(`[MainPromptInference] ${name} 실패:`, err);
    }
  }

  // 모든 AI 실패 → 폴백
  console.log(`[MainPromptInference] 모든 AI 실패 → 폴백 프롬프트: "${headingText}"`);
  const fb = fallbackPrompt(headingText);
  cachePrompt(cacheKey, fb);
  return fb;
}
