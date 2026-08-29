// src/content/paraphraseUpgradeBlock.ts
// 1단 노출 분석 브리프를 "모드 프롬프트를 대체하지 않고 덧붙이는" 블록으로 만든다.
//
// [2026-08-29 사장님 요구] "기존 상위노출 글을 원하는 모드로 상위호환해서 생성한다."
//
// 붙여넣기 페러프레이징은 브리프를 customPrompt 로 넘기는데, customPrompt 가 있으면
// contentGenerator 가 모드 프롬프트를 버리고 사용자 프롬프트 분기로 간다.
// 그러면 "원하는 모드로" 가 성립하지 않는다. 그래서 URL 경로는 덧붙이기로 간다:
// SEO/홈판 계약은 그대로 두고, 원본 노출 요인과 상위호환 지점만 얹는다.

/** 브리프가 이보다 짧으면 재료로 볼 수 없다 — 붙이지 않는다. */
const MIN_BRIEF_CHARS = 80;

export function hasParaphraseUpgradeBrief(brief: unknown): boolean {
  return String(brief ?? '').trim().length >= MIN_BRIEF_CHARS;
}

/**
 * 모드 프롬프트 뒤에 붙일 블록.
 * 브리프 자체가 이미 [노출 근거]·[상위호환 지점]을 담고 있으므로 지시만 덧댄다.
 */
export function buildParaphraseUpgradeBlock(brief: string): string {
  return `## 원본보다 나은 글을 쓴다 (상위호환)

이 글의 원본은 **이미 네이버에서 상위노출된 글**이다. 그 글이 왜 떴는지 먼저 읽어 두었다.

${String(brief).trim()}

- 원본의 노출 요인(클릭 이유·전개 골격·경험 밀도·키워드 배치)은 **유지**한다.
- 그 위에 "상위호환 지점"을 **실제 내용으로 채운다**. 그게 이 글의 존재 이유다.
- ⛔ 원본 문장을 바꿔 쓰거나 순서만 섞으면 실패다. 유사문서로 걸려 원본보다 못한 글이 된다.
- ⛔ [반드시 보존할 사실]에 없는 숫자·날짜·발언을 새로 만들지 않는다.
  상위호환은 **없는 사실을 지어내는 것이 아니라, 원본이 다루지 않은 것을 자료 안에서 채우는 것**이다.
- 위 지침은 지금 쓰는 글의 모드(검색/홈판 등) 계약을 대체하지 않는다. 그 계약을 지킨 채로 적용한다.`;
}

/** 프롬프트 말미에 덧붙인다. 브리프가 없으면 원본 문자열 그대로 돌려준다. */
export function appendParaphraseUpgradeBlock(systemPrompt: string, brief: unknown): string {
  if (!hasParaphraseUpgradeBrief(brief)) return systemPrompt;
  return `${systemPrompt}\n\n${buildParaphraseUpgradeBlock(String(brief))}`;
}
