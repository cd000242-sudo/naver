/**
 * keywordPlacementEnforcer.ts — SPEC-KEYWORD-ENDGAME Phase 1 (배치 강제, 서론/결론).
 *
 * mainKeywordPositionScanner는 "서론 첫 100자 키워드 미등장 / 결론 미등장"을 경고만 하고
 * 그대로 발행했다(미강제). 이 모듈은 SEO 모드에서 그 갭을 결정적으로 닫는다:
 * 서론 첫 100자에 메인 키워드가 없으면 "{키워드}, " 콤마 리드인을 서론 앞에, 결론에 아예 없으면
 * 결론 앞에 붙인다. 콤마 리드인은 한국어 SEO 글의 관용 패턴이라 자연스럽고, LLM 재호출 없이
 * 0원·결정적이다. 제목 앞3자 강제는 contentKeywordPrefix(ensureFront3)가 담당.
 *
 * 게이트: 호출자(contentGenerator finalize)가 seo 모드에서만 부른다 — 홈판은 도입 4단 골격/
 * 공감 훅이 CTR 핵심이라 기계 리드인이 어색해질 수 있어 제외(경고 유지).
 */

export interface KeywordPlacementResult {
  introPatched: boolean;
  conclusionPatched: boolean;
}

function normalizeForMatch(text: string): string {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsKeyword(haystack: string, keyword: string): boolean {
  const hay = normalizeForMatch(haystack);
  const kw = normalizeForMatch(keyword);
  return Boolean(hay && kw && hay.includes(kw));
}

/** 서론 첫 100자·결론에 메인 키워드가 없으면 콤마 리드인으로 주입한다. 멱등(이미 있으면 무변경). */
export function enforceIntroConclusionKeyword(
  content: { introduction?: string; conclusion?: string },
  mainKeyword: string,
): KeywordPlacementResult {
  const result: KeywordPlacementResult = { introPatched: false, conclusionPatched: false };
  const keyword = (mainKeyword || '').trim();
  if (!content || !keyword) return result;

  const intro = (content.introduction || '').trim();
  // 스캐너와 동일 기준: 서론 '첫 100자' 내 등장 여부.
  if (intro && !containsKeyword(intro.slice(0, 100), keyword)) {
    content.introduction = `${keyword}, ${intro}`;
    result.introPatched = true;
  }

  const conclusion = (content.conclusion || '').trim();
  // 스캐너와 동일 기준: 결론 전체 내 등장 여부.
  if (conclusion && !containsKeyword(conclusion, keyword)) {
    content.conclusion = `${keyword}, ${conclusion}`;
    result.conclusionPatched = true;
  }

  return result;
}
