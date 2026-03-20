// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 프롬프트 번역 모듈
// renderer.ts에서 추출 — 멀티 모델 비동기 번역 + 스마트 형태소 분해
// Gemini → OpenAI → Claude → Perplexity → 형태소분해 → 한국어보존
// ═══════════════════════════════════════════════════════════════════

import { generateEnglishPromptForHeadingSync } from './headingImageGen.js';

// ✅ 번역 캐시 (최대 100개, 모든 모델 공유)
export const _promptTranslationCache = new Map<string, string>();

// ✅ [2026-03-20] 세션 내 실패 카운터 — 3회 연속 실패 시 해당 모델 건너뛰기
const _modelFailureCount = new Map<string, number>();
const MAX_CONSECUTIVE_FAILURES = 3;

// ✅ 공통 번역 프롬프트 (모든 AI 모델에 동일 적용)
export function getTranslationPrompt(headingText: string, imageStyle?: string, contentContext?: string): string {
    // ✅ [2026-02-26] 스타일별 AI 프롬프트 생성 가이드 (카메라 앵글/색감은 제너레이터 다양성 시스템이 추가)
    const styleGuides: Record<string, string> = {
        'realistic': 'Generate a PHOTOGRAPHY-style prompt. Focus on: subject detail, environment, mood, and composition (rule of thirds/symmetrical/leading lines). Use terms like "professional photography", "cinematic", "8K". Do NOT specify camera angle or lighting.',
        'anime': 'Generate an ANIME ILLUSTRATION prompt. Include: dynamic composition, vibrant colors, anime art style. Use terms like "anime illustration", "detailed background", "cel shading". Do NOT use photography terms.',
        'stickman': 'Generate a CUTE CARTOON CHARACTER prompt. Include: simple character with stick-like limbs performing an action related to the topic. Use terms like "cute character illustration", "simple cartoon", "expressive pose". Do NOT use photography terms.',
        'roundy': 'Generate a CUTE ROUND CHARACTER prompt. Include: adorable round/chibi character in a scene. Use terms like "chibi character", "kawaii style", "rounded proportions", "cute illustration". Do NOT use photography terms.',
        '2d': 'Generate a KOREAN WEBTOON style prompt. Include: manhwa/webtoon illustration style, Korean comic art, detailed scene. Use terms like "webtoon illustration", "Korean manhwa style", "digital art". Do NOT use photography terms.',
        'vintage': 'Generate a VINTAGE/RETRO PHOTOGRAPHY prompt. Focus on: film grain, warm tones, nostalgic atmosphere. Use terms like "vintage film photography", "retro aesthetic". Do NOT specify camera angle.',
    };

    const styleGuide = styleGuides[imageStyle || 'realistic'] || styleGuides['realistic'];

    // ✅ [2026-03-03 FIX] 본문 맥락이 있으면 프롬프트에 포함하여 추론 품질 향상
    const contextSection = contentContext
        ? `\nCONTEXT (use this to understand the EXACT scene described in the article — extract specific objects, actions, settings):\n"${contentContext.substring(0, 300)}"\n`
        : '';

    return `You are an expert AI image prompt engineer specializing in ${imageStyle || 'realistic'} style.

TASK: Generate a complete, ready-to-use image generation prompt from this Korean heading and its article context.

HEADING: "${headingText}"
STYLE: ${imageStyle || 'realistic'}
${contextSection}
STYLE-SPECIFIC INSTRUCTIONS:
${styleGuide}

CRITICAL RULES:
1. TRANSLATE THE EXACT MEANING — do NOT generalize or drift.
   Example: "전기차 냉동차 시장 전망" → "electric refrigerated vehicle market outlook" (NOT "food market tour")
   Example: "강아지 피부병 예방" → "dog skin disease prevention, veterinary care" (NOT "cute puppy photo")
   Example: "아파트 하자 보수 방법" → "apartment defect repair methods, construction fixing" (NOT "beautiful apartment interior")
2. Korean compound words must be parsed accurately: 전기차=electric vehicle, 냉동차=refrigerated truck, 피부병=skin disease
3. DECIDE whether people should appear based ONLY on the topic:
   - Food, tech gadgets, cars, scenery, animals, real estate → NO people, focus on objects/environment
   - Health, fitness, fashion, education, lifestyle activities → include people naturally with relevant actions
   - ETHNICITY: By default, any person should be Korean/East Asian (this is a Korean blog). 
     EXCEPTION: If the topic is clearly about foreign travel, foreign culture, or foreign celebrities, match the ethnicity to the topic context instead.
   - When people appear: describe their specific ACTION matching the topic (NOT generic "running" or "walking")
4. DO NOT include camera angle, color grading, or lighting — these are added separately by the system
5. Focus on: subject, composition, environment, and mood
6. If CONTEXT is provided, extract SPECIFIC details from it (e.g., specific product names, body parts, symptoms, locations, tools) and use them in the prompt instead of generic descriptions
7. Keep under 50 words — be dense and specific, not verbose
8. End with: NO TEXT NO WRITING
9. Output ONLY the English prompt, nothing else`;
}

// ✅ 캐시 저장 유틸리티 (최대 100개, 모든 모델 공유)
export function cacheTranslation(key: string, value: string): void {
    if (_promptTranslationCache.size > 100) {
        const firstKey = _promptTranslationCache.keys().next().value;
        if (firstKey) _promptTranslationCache.delete(firstKey);
    }
    _promptTranslationCache.set(key, value);
}

// ═══════ 1순위: Gemini ═══════
async function generateEnglishPromptWithGemini(headingText: string, imageStyle?: string, contentContext?: string): Promise<string | null> {
    try {
        if (_promptTranslationCache.has(headingText)) {
            console.log(`[PromptTranslation] 캐시 히트: "${headingText}"`);
            return _promptTranslationCache.get(headingText)!;
        }

        const config = await window.api.getConfig();
        const apiKey = (config as any).geminiApiKey;
        if (!apiKey) {
            console.log('[GeminiPrompt] Gemini API 키 없음 → 다음 모델 시도');
            return null;
        }

        // ✅ [2026-02-27 FIX] 환경설정의 주력 모델 사용 (gemini-2.0-flash 404 에러 해결)
        const geminiModel = (config as any).geminiTextModel || 'gemini-2.5-flash';
        console.log(`[GeminiPrompt] 사용 모델: ${geminiModel}`);

        // Gemini API 호출
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: getTranslationPrompt(headingText, imageStyle, contentContext) }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } // ✅ [2026-03-03] Gemini 2.5 Flash thinking model은 thinking+output 합산이므로 충분히 크게 설정
                })
            }
        );

        if (!response.ok) {
            console.warn(`[GeminiPrompt] API 오류: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const generatedPrompt = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (!generatedPrompt) {
            console.warn('[GeminiPrompt] 응답에서 프롬프트 추출 실패');
            return null;
        }

        cacheTranslation(headingText, generatedPrompt);
        console.log(`[GeminiPrompt] ✅ 생성 성공: "${headingText}" → "${generatedPrompt.substring(0, 60)}..."`);
        return generatedPrompt;
    } catch (error) {
        console.warn(`[GeminiPrompt] 오류:`, error);
        return null;
    }
}

// ═══════ 2순위: OpenAI GPT ═══════
async function generateEnglishPromptWithOpenAI(headingText: string, imageStyle?: string, contentContext?: string): Promise<string | null> {
    try {
        const config = await window.api.getConfig();
        const apiKey = (config as any).openaiApiKey || (config as any).OPENAI_API_KEY;
        if (!apiKey) {
            console.log('[OpenAIPrompt] OpenAI API 키 없음 → 다음 모델 시도');
            return null;
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-5.4',
                messages: [
                    { role: 'system', content: `You are an expert AI image prompt engineer for ${imageStyle || 'realistic'} style. Output ONLY the English prompt.` },
                    { role: 'user', content: getTranslationPrompt(headingText, imageStyle, contentContext) }
                ],
                max_tokens: 200,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            console.warn(`[OpenAIPrompt] API 오류: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const generatedPrompt = data?.choices?.[0]?.message?.content?.trim();

        if (!generatedPrompt) {
            console.warn('[OpenAIPrompt] 응답에서 프롬프트 추출 실패');
            return null;
        }

        cacheTranslation(headingText, generatedPrompt);
        console.log(`[OpenAIPrompt] ✅ 생성 성공: "${headingText}" → "${generatedPrompt.substring(0, 60)}..."`);
        return generatedPrompt;
    } catch (error) {
        console.warn(`[OpenAIPrompt] 오류:`, error);
        return null;
    }
}

// ═══════ 3순위: Claude ═══════
async function generateEnglishPromptWithClaude(headingText: string, imageStyle?: string, contentContext?: string): Promise<string | null> {
    try {
        const config = await window.api.getConfig();
        const apiKey = (config as any).claudeApiKey || (config as any).CLAUDE_API_KEY || (config as any).ANTHROPIC_API_KEY;
        if (!apiKey) {
            console.log('[ClaudePrompt] Claude API 키 없음 → 다음 모델 시도');
            return null;
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 200,
                messages: [
                    { role: 'user', content: getTranslationPrompt(headingText, imageStyle, contentContext) }
                ]
            })
        });

        if (!response.ok) {
            console.warn(`[ClaudePrompt] API 오류: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const generatedPrompt = data?.content?.[0]?.text?.trim();

        if (!generatedPrompt) {
            console.warn('[ClaudePrompt] 응답에서 프롬프트 추출 실패');
            return null;
        }

        cacheTranslation(headingText, generatedPrompt);
        console.log(`[ClaudePrompt] ✅ 생성 성공: "${headingText}" → "${generatedPrompt.substring(0, 60)}..."`);
        return generatedPrompt;
    } catch (error) {
        console.warn(`[ClaudePrompt] 오류:`, error);
        return null;
    }
}

// ═══════ 4순위: Perplexity ═══════
async function generateEnglishPromptWithPerplexity(headingText: string, imageStyle?: string, contentContext?: string): Promise<string | null> {
    try {
        const config = await window.api.getConfig();
        const apiKey = (config as any).perplexityApiKey || (config as any).PERPLEXITY_API_KEY;
        if (!apiKey) {
            console.log('[PerplexityPrompt] Perplexity API 키 없음 → 다음 모델 시도');
            return null;
        }

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    { role: 'system', content: `You are an expert AI image prompt engineer for ${imageStyle || 'realistic'} style. Output ONLY the English prompt.` },
                    { role: 'user', content: getTranslationPrompt(headingText, imageStyle, contentContext) }
                ],
                max_tokens: 200,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            console.warn(`[PerplexityPrompt] API 오류: ${response.status}`);
            return null;
        }

        const data = await response.json();
        const generatedPrompt = data?.choices?.[0]?.message?.content?.trim();

        if (!generatedPrompt) {
            console.warn('[PerplexityPrompt] 응답에서 프롬프트 추출 실패');
            return null;
        }

        cacheTranslation(headingText, generatedPrompt);
        console.log(`[PerplexityPrompt] ✅ 생성 성공: "${headingText}" → "${generatedPrompt.substring(0, 60)}..."`);
        return generatedPrompt;
    } catch (error) {
        console.warn(`[PerplexityPrompt] 오류:`, error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════
// ✅ 스마트 형태소 분해 엔진 (API 없이도 복합어 자동 번역)
// ═══════════════════════════════════════════════════════════════════
export const koreanMorphemes: Record<string, { noun: string; modifier?: string }> = {
    // ===== 접미 핵심어 (head nouns) =====
    '차': { noun: 'vehicle', modifier: 'vehicle' },
    '병': { noun: 'disease', modifier: 'disease' },
    '약': { noun: 'medicine', modifier: 'medical' },
    '방': { noun: 'room', modifier: 'room' },
    '법': { noun: 'method', modifier: 'legal' },
    '비': { noun: 'cost', modifier: 'cost' },
    '금': { noun: 'money', modifier: 'monetary' },
    '기': { noun: 'device', modifier: 'device' },
    '관': { noun: 'facility', modifier: 'facility' },
    '식': { noun: 'food', modifier: 'dietary' },
    '용': { noun: 'use', modifier: 'use' },
    '형': { noun: 'type', modifier: 'type' },
    '문': { noun: 'door', modifier: 'door' },
    '장': { noun: 'place', modifier: 'place' },
    '량': { noun: 'quantity', modifier: 'quantitative' },
    '물': { noun: 'item', modifier: 'material' },
    '복': { noun: 'clothing', modifier: 'clothing' },
    '점': { noun: 'store', modifier: 'store' },
    '원': { noun: 'institution', modifier: 'institutional' },
    '사': { noun: 'company', modifier: 'corporate' },
    '인': { noun: 'person', modifier: 'personal' },
    '제': { noun: 'product', modifier: 'product' },

    // ===== 접두 수식어 (modifier prefixes) =====
    '전기': { noun: 'electricity', modifier: 'electric' },
    '냉동': { noun: 'freezing', modifier: 'refrigerated' },
    '냉장': { noun: 'refrigeration', modifier: 'refrigerated' },
    '가열': { noun: 'heating', modifier: 'heated' },
    '자동': { noun: 'automation', modifier: 'automatic' },
    '수동': { noun: 'manual operation', modifier: 'manual' },
    '무선': { noun: 'wireless', modifier: 'wireless' },
    '유선': { noun: 'wired', modifier: 'wired' },
    '고급': { noun: 'luxury', modifier: 'premium' },
    '저가': { noun: 'low cost', modifier: 'budget' },
    '신형': { noun: 'new model', modifier: 'new-model' },
    '구형': { noun: 'old model', modifier: 'old-model' },
    '대형': { noun: 'large size', modifier: 'large' },
    '소형': { noun: 'small size', modifier: 'compact' },
    '중형': { noun: 'medium size', modifier: 'mid-size' },
    '초소형': { noun: 'ultra compact', modifier: 'ultra-compact' },
    '친환경': { noun: 'eco-friendliness', modifier: 'eco-friendly' },
    '지능형': { noun: 'intelligence', modifier: 'intelligent' },
    '휴대용': { noun: 'portable', modifier: 'portable' },
    '일회용': { noun: 'disposable', modifier: 'disposable' },
    '다기능': { noun: 'multi-function', modifier: 'multi-functional' },
    '고성능': { noun: 'high performance', modifier: 'high-performance' },
    '저전력': { noun: 'low power', modifier: 'low-power' },
    '고효율': { noun: 'high efficiency', modifier: 'high-efficiency' },
    '초고속': { noun: 'ultra high speed', modifier: 'ultra-fast' },

    // ===== 분야/상태 형태소 =====
    '피부': { noun: 'skin', modifier: 'skin' },
    '두피': { noun: 'scalp', modifier: 'scalp' },
    '모발': { noun: 'hair', modifier: 'hair' },
    '체중': { noun: 'weight', modifier: 'weight' },
    '혈압': { noun: 'blood pressure', modifier: 'blood-pressure' },
    '혈당': { noun: 'blood sugar', modifier: 'blood-sugar' },
    '면역': { noun: 'immunity', modifier: 'immune' },
    '소화': { noun: 'digestion', modifier: 'digestive' },
    '호흡': { noun: 'breathing', modifier: 'respiratory' },
    '근육': { noun: 'muscle', modifier: 'muscular' },
    '관절': { noun: 'joint', modifier: 'joint' },
    '치아': { noun: 'teeth', modifier: 'dental' },
    '시력': { noun: 'eyesight', modifier: 'vision' },
    '청력': { noun: 'hearing', modifier: 'hearing' },

    // ===== 동작/상태 =====
    '예방': { noun: 'prevention', modifier: 'preventive' },
    '치료': { noun: 'treatment', modifier: 'therapeutic' },
    '관리': { noun: 'management', modifier: 'managed' },
    '보수': { noun: 'repair', modifier: 'repair' },
    '설치': { noun: 'installation', modifier: 'installed' },
    '세척': { noun: 'cleaning', modifier: 'cleaning' },
    '교체': { noun: 'replacement', modifier: 'replacement' },
    '점검': { noun: 'inspection', modifier: 'inspection' },
    '수리': { noun: 'repair', modifier: 'repair' },
    '개조': { noun: 'modification', modifier: 'modified' },

    // ===== 사업/산업 =====
    '시장': { noun: 'market', modifier: 'market' },
    '전망': { noun: 'outlook', modifier: 'prospective' },
    '동향': { noun: 'trend', modifier: 'trending' },
    '산업': { noun: 'industry', modifier: 'industrial' },
    '기업': { noun: 'enterprise', modifier: 'corporate' },
    '무역': { noun: 'trade', modifier: 'trade' },
    '수출': { noun: 'export', modifier: 'export' },
    '수입': { noun: 'import', modifier: 'import' },
};

/**
 * 스마트 형태소 분해: 한 단어를 형태소로 쪼개어 영어로 조합
 * "전기차" → "전기"(electric) + "차"(vehicle) → "electric vehicle"
 * "피부병" → "피부"(skin) + "병"(disease) → "skin disease"
 */
export function decomposeKoreanCompound(word: string, mainDict: Record<string, string>): string | null {
    // 1. 기존 사전에 있으면 그대로 반환
    if (mainDict[word]) return mainDict[word];

    // 2글자 미만은 분해 불가
    if (word.length < 2) return null;

    // 2. Greedy longest-match 분해
    const parts: string[] = [];
    let i = 0;
    let unmatchedChars = 0;

    while (i < word.length) {
        let matched = false;

        // 긴 부분 문자열부터 매칭 시도 (최대 5글자)
        for (let len = Math.min(5, word.length - i); len >= 1; len--) {
            const substr = word.substring(i, i + len);

            // 기존 메인 사전에서 먼저 검색
            if (mainDict[substr]) {
                // 마지막 파트가 아니면 수식어 형태 우선 (modifier form)
                if (i + len < word.length && koreanMorphemes[substr]?.modifier) {
                    parts.push(koreanMorphemes[substr].modifier!);
                } else {
                    parts.push(mainDict[substr]);
                }
                i += len;
                matched = true;
                break;
            }

            // 형태소 사전에서 검색
            if (koreanMorphemes[substr]) {
                if (i + len < word.length && koreanMorphemes[substr].modifier) {
                    parts.push(koreanMorphemes[substr].modifier!);
                } else {
                    parts.push(koreanMorphemes[substr].noun);
                }
                i += len;
                matched = true;
                break;
            }
        }

        if (!matched) {
            unmatchedChars++;
            i++;
        }
    }

    // 매칭률이 50% 미만이면 분해 실패로 간주
    if (parts.length === 0 || unmatchedChars > word.length / 2) {
        return null;
    }

    const result = parts.join(' ');
    console.log(`[MorphemeDecompose] "${word}" → [${parts.join(' + ')}] = "${result}"`);
    return result;
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
        console.log(`[PromptTranslation] 🧹 AI 응답 정제: "${raw.substring(0, 40)}..." → "${cleaned.substring(0, 40)}..."`);
    }
    return cleaned;
}

// ═══════════════════════════════════════════════════════════════════
// ✅ 멀티 모델 폴백 체인 — 소제목 영어 프롬프트 생성
// Gemini → OpenAI → Claude → Perplexity → 형태소분해사전 → 한국어보존
// [2026-03-18] AI 응답 정제 sanitizeAIPromptResponse() 적용
// ═══════════════════════════════════════════════════════════════════
export async function generateEnglishPromptForHeading(heading: any, baseKeywords?: string, imageStyle?: string, contentContext?: string) {
    const headingTitle = heading.title || heading;
    // ✅ [2026-03-03] heading 객체에서 본문 맥락 자동 추출
    const resolvedContext = contentContext || (typeof heading === 'object' ? heading.content : undefined);

    // ✅ 0차: 캐시 확인 (모든 모델 공유) — 스타일별 캐시 키
    const cacheKey = `${headingTitle}__${imageStyle || 'realistic'}`;
    if (_promptTranslationCache.has(cacheKey)) {
        const cached = _promptTranslationCache.get(cacheKey)!;
        console.log(`[PromptTranslation] 캐시 히트: "${headingTitle}" [${imageStyle}] → "${cached.substring(0, 40)}..."`);
        return cached;
    }

    // ✅ 1순위~4순위: AI 멀티 모델 순차 시도
    // [2026-03-05] Gemini 1순위로 변경 — 무료/저렴 + 동일 프롬프트 템플릿으로 품질 동등
    const aiTranslators: Array<{ name: string; fn: (h: string, s?: string, c?: string) => Promise<string | null> }> = [
        { name: 'Gemini', fn: generateEnglishPromptWithGemini },
        { name: 'OpenAI', fn: generateEnglishPromptWithOpenAI },
        { name: 'Claude', fn: generateEnglishPromptWithClaude },
        { name: 'Perplexity', fn: generateEnglishPromptWithPerplexity },
    ];

    if (resolvedContext) {
        console.log(`[PromptTranslation] 📝 본문 맥락 포함 (${resolvedContext.length}자): "${String(resolvedContext).substring(0, 60)}..."`);
    }

    for (const { name, fn } of aiTranslators) {
        // ✅ [2026-03-20] 실패 카운터 체크 — 3회 연속 실패 시 세션 내 건너뛰기
        const failures = _modelFailureCount.get(name) || 0;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
            continue; // 해당 모델은 이 세션에서 비활성
        }

        try {
            const result = await fn(headingTitle, imageStyle, resolvedContext);
            if (result) {
                // ✅ [2026-03-18] AI 응답 정제 — Perplexity 자기 소개, 시스템 프롬프트 누출 차단
                const sanitized = sanitizeAIPromptResponse(result);
                console.log(`[PromptTranslation] ✅ ${name} 성공 [${imageStyle}]: "${headingTitle}" → "${sanitized.substring(0, 50)}..."`);
                cacheTranslation(cacheKey, sanitized);
                _modelFailureCount.set(name, 0); // 성공 시 카운터 리셋
                return sanitized;
            }
            // null 반환 = API 키 없음 또는 응답 실패 → 실패 카운트 증가
            _modelFailureCount.set(name, failures + 1);
        } catch (err) {
            _modelFailureCount.set(name, failures + 1);
            console.warn(`[PromptTranslation] ${name} 실패:`, err);
        }
    }

    // ✅ 5순위: 스마트 형태소 분해 + 정적 사전 (API 전부 실패 시)
    console.log(`[PromptTranslation] 모든 AI 모델 실패 → 스마트 사전 폴백: "${headingTitle}"`);
    const prompt = generateEnglishPromptForHeadingSync(headingTitle);
    console.log(`[PromptTranslation] 사전 폴백 결과: "${headingTitle}" → "${prompt}"`);
    return prompt;
}
