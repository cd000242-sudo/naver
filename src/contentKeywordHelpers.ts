/**
 * [Phase 3-18/v2.10.164] contentGenerator god file decomposition — keyword preprocessing helpers.
 *
 * 입력 키워드/source 전처리:
 *   - getPrimaryKeywordFromSource: source.metadata.keywords[0] 추출
 *   - preprocessLongKeyword: 25자 이상 키워드 → core/context 분리
 */

import type { ContentSource } from './contentGenerator';

export function getPrimaryKeywordFromSource(source: ContentSource): string {
  return (source.metadata as any)?.keywords?.[0] ? String((source.metadata as any).keywords[0]).trim() : '';
}

/**
 * Secondary keywords = the semantic field around the primary keyword.
 * source.metadata.keywords[0] is primary; [1..] are related/sub keywords used for
 * topical-coverage scoring (seoEval #8). Returns [] when only a primary keyword exists.
 *
 * Filter mirrors the body-prompt subKeyword injection (contentGenerator ~2496):
 * length >= 2 and not purely numeric — so #8 scores exactly the terms the prompt
 * tells the model to distribute (keeps generation and evaluation aligned).
 */
export function getSecondaryKeywordsFromSource(source: ContentSource): string[] {
  const kws = (source.metadata as any)?.keywords;
  if (!Array.isArray(kws)) return [];
  return kws
    .slice(1)
    .map((k: unknown) => String(k).trim())
    .filter((k: string) => k.length >= 2 && !/^\d+$/.test(k));
}

/**
 * ✅ [2026-02-13] 긴 키워드 전처리
 * - 25자 이상의 키워드는 제목 생성에 그대로 사용하면 반복/의미없는 제목이 생성됨
 * - 콜론(:) 앞부분만 핵심 키워드로 추출하고, 나머지는 주제 문맥으로 분리
 * - 키워드가 짧으면 그대로 반환
 */
export function preprocessLongKeyword(rawKeyword: string): { coreKeyword: string; contextHint: string; isLong: boolean } {
  const trimmed = rawKeyword.trim();
  if (trimmed.length <= 25) {
    return { coreKeyword: trimmed, contextHint: '', isLong: false };
  }

  // 콜론 앞부분 추출 (예: "2026 연말정산 환급: 10가지 놓치기 쉬운 공제 항목" → "2026 연말정산 환급")
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 30) {
    const core = trimmed.substring(0, colonIdx).trim();
    const context = trimmed.substring(colonIdx + 1).trim();
    return { coreKeyword: core, contextHint: context, isLong: true };
  }

  // 콜론 없으면 첫 번째 쉼표 또는 공백 기준으로 25자 내에서 자르기
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx > 0 && commaIdx <= 25) {
    const core = trimmed.substring(0, commaIdx).trim();
    const context = trimmed.substring(commaIdx + 1).trim();
    return { coreKeyword: core, contextHint: context, isLong: true };
  }

  // 공백 기준으로 최대 4단어까지만 핵심 키워드로 사용
  const words = trimmed.split(/\s+/);
  if (words.length > 4) {
    const core = words.slice(0, 4).join(' ');
    const context = words.slice(4).join(' ');
    return { coreKeyword: core, contextHint: context, isLong: true };
  }

  return { coreKeyword: trimmed, contextHint: '', isLong: false };
}
