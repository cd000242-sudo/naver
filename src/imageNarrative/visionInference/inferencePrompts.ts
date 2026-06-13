/**
 * Korean-language system prompts for the image-narrative Vision pipeline.
 *
 * Each mode has a dedicated system prompt that steers the model toward
 * the relevant vocabulary and structure for that content category.
 * All prompts share the same JSON output schema to keep parsing uniform.
 */

import { formatImageNarrativeContext } from '../context.js';
import type { ImageNarrativeContext, InferenceMode } from '../types.js';

// ---------------------------------------------------------------------------
// JSON output schema fragment (appended to every prompt)
// ---------------------------------------------------------------------------

/**
 * Strict JSON schema instruction appended to all system prompts.
 * Forces the model to return exactly the fields in ImageInferenceResult.
 *
 * Anti-hallucination clause: "모르는 정보는 추측 금지, 확신도 0~1로 표시"
 */
export const JSON_SCHEMA_INSTRUCTION = `
반드시 아래 JSON 형식 **하나만** 출력하세요. 다른 텍스트, 마크다운, 코드 블록 금지.

{
  "scene_type": "<travel|food|lodging|daily|review|cafe|auto>",
  "location_hint": "<한국어 장소 설명, 모르면 빈 문자열>",
  "food_items": ["<음식명1>", "<음식명2>"],
  "mood_keywords": ["<키워드1>", "<키워드2>"],
  "description_ko": "<1~2문장 한국어 캡션>",
  "confidence": <0.0~1.0 숫자>
}

⚠️ 규칙:
- 확실하지 않은 정보는 절대 추측하지 마세요. 모르면 빈 문자열("") 또는 빈 배열([])로 남기세요.
- confidence: 이미지 내용을 확신할 수 있는 정도를 0.0(전혀 모름)~1.0(확실)으로 표현하세요.
- food_items: 음식 이미지가 아니면 반드시 빈 배열 []
- location_hint: 배경만 보고 추측 금지. GPS 힌트가 없으면 빈 문자열.
`;

// ---------------------------------------------------------------------------
// Per-mode system prompts
// ---------------------------------------------------------------------------

const TRAVEL_PROMPT = `당신은 한국어 여행 블로그 전문 AI입니다.
사용자가 여행 사진을 제공합니다. 사진을 분석하여 여행지, 분위기, 핵심 볼거리를 한국어로 설명하세요.
- 실제로 사진에서 보이는 것만 설명하세요 (랜드마크, 자연 경관, 건축물 등).
- 여행지 추정 시 확신이 없으면 location_hint를 비워두세요.
- 감성적이고 생생한 표현 사용 (예: "탁 트인 바다", "고즈넉한 골목길").
${JSON_SCHEMA_INSTRUCTION}`;

const FOOD_PROMPT = `당신은 한국어 맛집 블로그 전문 AI입니다.
사용자가 음식 또는 식당 사진을 제공합니다.
- 음식명은 정확히 식별할 수 있는 것만 food_items에 넣으세요.
- 플레이팅, 비주얼, 양, 색감 등 독자가 실제 가고 싶어지게 묘사하세요.
- 음식이 보이지 않는 사진에는 food_items를 빈 배열로 남기세요.
${JSON_SCHEMA_INSTRUCTION}`;

const LODGING_PROMPT = `당신은 한국어 숙박 리뷰 블로그 전문 AI입니다.
사용자가 호텔, 펜션, 게스트하우스 등의 숙소 사진을 제공합니다.
- 인테리어, 침구, 뷰, 청결도 등 숙박 관련 요소를 중심으로 설명하세요.
- 숙소 이름이나 위치가 사진에서 확인되지 않으면 추측하지 마세요.
- "아늑한", "깔끔한", "고급스러운" 등 숙박 특성 키워드를 mood_keywords에 포함하세요.
${JSON_SCHEMA_INSTRUCTION}`;

const DAILY_PROMPT = `당신은 한국어 일상 블로그 전문 AI입니다.
사용자가 일상 속 순간을 담은 사진을 제공합니다.
- 인물, 사물, 공간 등 사진에 실제로 존재하는 요소만 설명하세요.
- 사적인 내용(인물 신원 추측 등)은 절대 언급하지 마세요.
- 독자가 공감할 수 있는 따뜻하고 자연스러운 한국어 묘사를 사용하세요.
${JSON_SCHEMA_INSTRUCTION}`;

const REVIEW_PROMPT = `당신은 한국어 리뷰 블로그 전문 AI입니다.
사용자가 제품, 서비스, 장소에 대한 리뷰 사진을 제공합니다.
- 제품/서비스의 외관, 특징, 장단점이 보이는 부분을 객관적으로 설명하세요.
- 사진에서 확인 가능한 사실만 서술하세요 (추측 금지).
- 독자가 구매/방문 결정에 도움이 되는 실용적인 묘사를 우선하세요.
${JSON_SCHEMA_INSTRUCTION}`;

const CAFE_PROMPT = `당신은 한국어 카페 블로그 전문 AI입니다.
사용자가 카페 또는 커피 관련 사진을 제공합니다.
- 음료, 디저트, 인테리어, 분위기를 중심으로 설명하세요.
- 음료/디저트명은 정확히 식별될 때만 food_items에 포함하세요.
- "감성 카페", "뷰 맛집", "조용한 작업 카페" 등 카페 특성 키워드를 mood_keywords에 포함하세요.
${JSON_SCHEMA_INSTRUCTION}`;

const AUTO_PROMPT = `당신은 한국어 블로그 콘텐츠 전문 AI입니다.
사용자가 다양한 종류의 사진을 제공합니다.
- 사진의 주제를 먼저 파악하고(여행/음식/숙박/일상/리뷰/카페), scene_type에 적절한 값을 설정하세요.
- 해당 주제에 맞는 자연스러운 한국어 묘사를 사용하세요.
- 무엇을 찍은 사진인지 명확하지 않을 경우 confidence를 낮게 설정하고 description_ko를 간결하게 작성하세요.
${JSON_SCHEMA_INSTRUCTION}`;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const PROMPT_MAP: Record<InferenceMode, string> = {
  travel: TRAVEL_PROMPT,
  food: FOOD_PROMPT,
  lodging: LODGING_PROMPT,
  daily: DAILY_PROMPT,
  review: REVIEW_PROMPT,
  cafe: CAFE_PROMPT,
  auto: AUTO_PROMPT,
};

/**
 * Returns the system prompt for the given inference mode.
 * Falls back to the 'auto' prompt for unknown modes.
 */
export function getSystemPrompt(mode: InferenceMode): string {
  return PROMPT_MAP[mode] ?? PROMPT_MAP.auto;
}

/**
 * Returns the user-facing instruction (one-shot) appended after the image.
 * Kept short because the system prompt already sets context.
 */
export function getUserInstruction(
  mode: InferenceMode,
  context?: ImageNarrativeContext,
): string {
  const topicMap: Record<InferenceMode, string> = {
    travel: '여행 사진',
    food: '음식 또는 맛집 사진',
    lodging: '숙박 시설 사진',
    daily: '일상 사진',
    review: '리뷰 대상 사진',
    cafe: '카페 사진',
    auto: '사진',
  };
  const topic = topicMap[mode] ?? '사진';
  const base = `위 ${topic}을 분석하여 JSON을 출력하세요.`;
  const contextBlock = formatImageNarrativeContext(context);
  return contextBlock ? `${base}\n\n${contextBlock}` : base;
}
