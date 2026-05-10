/**
 * SPEC-CONVERSION-001 L3-3.2 — 본문 키워드 → 이미지 프롬프트 매핑
 *
 * keywordExtractor의 결과를 받아 *이미지 생성 프롬프트 단편*으로 변환.
 * 기존 PromptBuilder(src/image/promptBuilder.ts)와 별개로 동작 — 호출자가
 * 본 결과를 PromptBuilder의 categoryStyle 또는 stylePrompt에 합성 가능.
 *
 * 영어/한국어 듀얼 모드:
 *   - 호출자가 'ko' 지정 시 → 한국어 표현
 *   - 'en' 또는 미지정 시 → 영어 (기본 — 이미지 AI 영어 우선 가중치)
 *
 * 결정론. 외부 의존성 X. NLP 미사용 (사전 + 휴리스틱).
 *
 * 메모리 [silent 폴백 금지]: 키워드 0건은 빈 문자열 + reason.
 * 메모리 [추정 효과 금지]: 이미지 일치율 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

import type { ExtractedKeyword } from '../content/keywordExtractor';

export type ImagePromptLang = 'ko' | 'en';

export interface KeywordImagePromptInput {
  readonly keywords: readonly ExtractedKeyword[];
  readonly title?: string;
  readonly maxKeywords?: number;
  readonly lang?: ImagePromptLang;
  readonly preferConcrete?: boolean;     // true면 visualHint=concrete 우선 (기본 true)
  readonly headingHint?: string;          // 헤딩 텍스트가 있으면 prefix로 사용
}

export interface KeywordImagePromptResult {
  readonly prompt: string;                // 이미지 생성 프롬프트 단편
  readonly usedKeywords: readonly string[];
  readonly skippedAbstract: readonly string[];
  readonly lang: ImagePromptLang;
  readonly fallbackReason?: string;
}

const DEFAULT_MAX = 4;

/**
 * 단순 영문 매핑 사전 — 한글 키워드를 영어 프롬프트로 직역.
 * 미매칭 시 한글 그대로 사용 (이미지 AI는 한국어도 어느 정도 처리).
 */
const KO_TO_EN_DICTIONARY: Readonly<Record<string, string>> = {
  카페: 'cafe',
  맛집: 'restaurant',
  음식: 'food',
  요리: 'cooking',
  레시피: 'recipe',
  디저트: 'dessert',
  커피: 'coffee',
  여행: 'travel',
  호텔: 'hotel',
  풍경: 'landscape',
  인테리어: 'interior',
  공간: 'space',
  분위기: 'atmosphere',
  메뉴: 'menu',
  제품: 'product',
  화장품: 'cosmetics',
  뷰티: 'beauty',
  패션: 'fashion',
  운동: 'workout',
  헬스: 'fitness',
  건강: 'health',
  영양제: 'supplement',
  스마트폰: 'smartphone',
  노트북: 'laptop',
  카메라: 'camera',
  자동차: 'car',
  가전: 'home appliance',
  가구: 'furniture',
  소파: 'sofa',
  침대: 'bed',
  주방: 'kitchen',
  육아: 'parenting',
  아기: 'baby',
  유아: 'toddler',
  영화: 'movie',
  드라마: 'drama',
  게임: 'game',
};

function translateTerm(term: string, lang: ImagePromptLang): string {
  if (lang === 'ko') return term;
  return KO_TO_EN_DICTIONARY[term] ?? term;
}

function rankKeywords(
  keywords: readonly ExtractedKeyword[],
  preferConcrete: boolean,
): { used: ExtractedKeyword[]; skipped: ExtractedKeyword[] } {
  const concrete: ExtractedKeyword[] = [];
  const unknown: ExtractedKeyword[] = [];
  const abstract: ExtractedKeyword[] = [];
  for (const k of keywords) {
    if (k.visualHint === 'concrete') concrete.push(k);
    else if (k.visualHint === 'abstract') abstract.push(k);
    else unknown.push(k);
  }
  if (preferConcrete) {
    return { used: [...concrete, ...unknown], skipped: abstract };
  }
  return { used: [...keywords], skipped: [] };
}

export function buildKeywordImagePrompt(
  input: KeywordImagePromptInput,
): KeywordImagePromptResult {
  const lang: ImagePromptLang = input.lang ?? 'en';
  const max = Math.max(1, input.maxKeywords ?? DEFAULT_MAX);
  const preferConcrete = input.preferConcrete !== false;

  if (input.keywords.length === 0) {
    return {
      prompt: '',
      usedKeywords: [],
      skippedAbstract: [],
      lang,
      fallbackReason: 'KEYWORDS_EMPTY',
    };
  }

  const { used, skipped } = rankKeywords(input.keywords, preferConcrete);
  const top = used.slice(0, max);
  if (top.length === 0) {
    return {
      prompt: '',
      usedKeywords: [],
      skippedAbstract: skipped.map((k) => k.term),
      lang,
      fallbackReason: 'NO_VISUAL_KEYWORDS',
    };
  }

  const translated = top.map((k) => translateTerm(k.term, lang));
  const headingPart = input.headingHint?.trim();

  let prompt: string;
  if (lang === 'ko') {
    prompt = headingPart
      ? `${headingPart}, ${translated.join(', ')}, 깔끔한 구도, 자연광`
      : `${translated.join(', ')}, 깔끔한 구도, 자연광`;
  } else {
    prompt = headingPart
      ? `${headingPart}, ${translated.join(', ')}, clean composition, natural lighting`
      : `${translated.join(', ')}, clean composition, natural lighting`;
  }

  return {
    prompt,
    usedKeywords: top.map((k) => k.term),
    skippedAbstract: skipped.map((k) => k.term),
    lang,
  };
}
