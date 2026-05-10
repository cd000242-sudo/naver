/**
 * SPEC-CONVERSION-001 L3-3.3 — 이미지 설명 ↔ 본문 키워드 일치 역검증
 *
 * keywordImagePromptBuilder가 생성한 프롬프트(또는 이미지 alt/설명)와
 * 본문에서 추출한 키워드가 *의미적으로 일치*하는지 결정론 휴리스틱으로 검증.
 *
 * 기존 imageTextConsistencyChecker는 LLM 기반 검증 — 본 모듈은 *전처리 단계*에서
 * 결정론 매칭으로 빠르게 거른 후 LLM 호출 비용을 줄이는 용도.
 *
 * 메모리 [silent 폴백 금지]: 검증 임계 미달 시 명시 reason + 미일치 키워드 노출.
 * 메모리 [추정 효과 금지]: 일치율 효과 약속 X.
 *
 * 파일 한도 200줄 준수.
 */

import type { ExtractedKeyword } from '../content/keywordExtractor';

export interface ImageBodyAlignmentInput {
  readonly bodyKeywords: readonly ExtractedKeyword[];   // keywordExtractor 결과
  readonly imagePromptOrAlt: string;                     // 이미지 prompt 또는 alt 텍스트
  readonly minOverlapRate?: number;                      // 0~1, 기본 0.4
  readonly minMatches?: number;                          // 최소 매칭 키워드 수, 기본 1
}

export interface ImageBodyAlignmentResult {
  readonly aligned: boolean;
  readonly overlapRate: number;            // matched / total bodyKeywords (top N)
  readonly matchedKeywords: readonly string[];
  readonly missingFromImage: readonly string[]; // 본문에 있지만 이미지 설명에 없음 (top concrete)
  readonly extraInImage: readonly string[];     // 이미지 설명에만 있는 토큰
  readonly reason?: string;
}

const DEFAULT_MIN_OVERLAP = 0.4;
const DEFAULT_MIN_MATCHES = 1;
const TOP_BODY_KEYWORDS = 8;

const STOP_TOKENS_EN: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'with', 'and', 'or', 'for', 'to', 'is',
  'photo', 'image', 'picture', 'shot', 'view', 'composition', 'lighting',
  'natural', 'clean', 'professional',
]);
const STOP_TOKENS_KO: ReadonlySet<string> = new Set([
  '사진', '이미지', '구도', '자연광', '깔끔한', '전문', '뷰',
]);

function tokenizeImageText(text: string): string[] {
  if (!text) return [];
  const tokens: string[] = [];
  const re = /[가-힣]{2,}|[A-Za-z]{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].toLowerCase();
    if (STOP_TOKENS_EN.has(t) || STOP_TOKENS_KO.has(t)) continue;
    tokens.push(t);
  }
  return tokens;
}

function looseMatch(bodyTerm: string, imageTokens: ReadonlySet<string>): boolean {
  // 정확 매치 우선
  if (imageTokens.has(bodyTerm)) return true;
  // 영어 사전 미매핑 한글 → 부분 일치 허용 (3자 이상)
  if (bodyTerm.length >= 3) {
    for (const tok of imageTokens) {
      if (tok.includes(bodyTerm) || bodyTerm.includes(tok)) return true;
    }
  }
  return false;
}

export function verifyImageBodyAlignment(
  input: ImageBodyAlignmentInput,
): ImageBodyAlignmentResult {
  const minOverlap = input.minOverlapRate ?? DEFAULT_MIN_OVERLAP;
  const minMatches = input.minMatches ?? DEFAULT_MIN_MATCHES;

  if (!input.imagePromptOrAlt || !input.imagePromptOrAlt.trim()) {
    return {
      aligned: false,
      overlapRate: 0,
      matchedKeywords: [],
      missingFromImage: input.bodyKeywords.slice(0, TOP_BODY_KEYWORDS).map((k) => k.term),
      extraInImage: [],
      reason: 'IMAGE_PROMPT_EMPTY',
    };
  }

  if (input.bodyKeywords.length === 0) {
    return {
      aligned: false,
      overlapRate: 0,
      matchedKeywords: [],
      missingFromImage: [],
      extraInImage: tokenizeImageText(input.imagePromptOrAlt),
      reason: 'BODY_KEYWORDS_EMPTY',
    };
  }

  const topBody = input.bodyKeywords.slice(0, TOP_BODY_KEYWORDS);
  const imgTokens = new Set(tokenizeImageText(input.imagePromptOrAlt));

  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of topBody) {
    if (looseMatch(k.term.toLowerCase(), imgTokens)) {
      matched.push(k.term);
    } else if (k.visualHint === 'concrete' || k.visualHint === 'unknown') {
      missing.push(k.term);
    }
  }

  const total = topBody.length;
  const overlapRate = total > 0 ? matched.length / total : 0;

  // body keyword set으로 image extra 추출
  const bodyTermSet = new Set(topBody.map((k) => k.term.toLowerCase()));
  const extra: string[] = [];
  for (const tok of imgTokens) {
    if (!bodyTermSet.has(tok)) extra.push(tok);
  }

  const aligned = overlapRate >= minOverlap && matched.length >= minMatches;
  return {
    aligned,
    overlapRate,
    matchedKeywords: matched,
    missingFromImage: missing,
    extraInImage: extra,
    reason: aligned
      ? undefined
      : `OVERLAP_TOO_LOW: ${(overlapRate * 100).toFixed(0)}% (임계 ${(minOverlap * 100).toFixed(0)}%, 매칭 ${matched.length}/${total})`,
  };
}

/**
 * 정렬 실패 시 호출자에게 재생성/교체 안내문 생성.
 */
export function buildAlignmentRetryHint(result: ImageBodyAlignmentResult): string {
  if (result.aligned) return '';
  const lines: string[] = [
    '⚠️ [이미지-본문 정렬 실패]',
    `  ${result.reason ?? ''}`,
  ];
  if (result.missingFromImage.length > 0) {
    lines.push('  본문에 있지만 이미지 설명에 빠진 키워드:');
    lines.push(`    • ${result.missingFromImage.slice(0, 5).join(', ')}`);
  }
  lines.push('', '  → 이미지 프롬프트 재생성 또는 다른 후보로 교체 권장.');
  return lines.join('\n');
}
