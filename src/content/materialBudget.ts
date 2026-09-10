// src/content/materialBudget.ts
// [2026-09-11] 재료를 어디에 얼마나 줄지 정하는 한 곳. 순수 함수.
//
// 사장님 지적: "팩트가 70~80%, 방향성 문제가 재기된다. 재료가 부족해서인가?"
// 측정 결과 재료를 못 모으는 게 아니라 **두 번 자르고 있었다.**
//   수집   8,000자에서 멈춤 (FULLTEXT_TOTAL_BUDGET_CHARS)
//   렌더러 10,000자로 자름   (crawledText.substring(0, 10000))
//   설계도 30,000자를 받을 수 있음
//
// 그런데 재료를 늘리면 본문 호출이 그만큼 비싸진다. 그래서 갈라 준다 —
// **설계도에는 긴 재료를, 본문 프롬프트에는 짧은 재료를.**
// 설계도가 재료를 사실·인용으로 압축하므로, 원재료를 늘려도 본문 호출은 커지지 않는다.
// 늘어나는 비용은 설계도 호출 입력뿐이고, 그건 편당 한 번이다.

export const MATERIAL_BUDGET = Object.freeze({
  /** 설계도(Blueprint)에 넘길 재료 상한. buildBlueprintPrompt 의 기본 상한과 같다. */
  blueprintMaxChars: 30_000,
  /** 본문 프롬프트의 [원본 텍스트] 상한. 여기를 키우면 편당 본문 호출이 바로 비싸진다. */
  bodyMaxChars: 10_000,
});

export interface MaterialSource {
  /** 본문 프롬프트에 실리는 재료(짧게 자른 것). */
  readonly rawText?: unknown;
  /** 설계도 전용 재료(자르기 전 원본). 없으면 rawText 로 되돌아간다. */
  readonly blueprintMaterial?: unknown;
}

/**
 * 설계도에 넘길 재료를 고른다.
 *
 * 긴 재료가 따로 실려 오면 그것을 쓰고, 없으면 본문 재료로 되돌아간다 —
 * 구버전 payload 나 다른 경로에서 온 요청도 그대로 살아야 한다.
 */
export function resolveBlueprintMaterial(source: MaterialSource | null | undefined): string {
  if (!source) return '';
  const long = typeof source.blueprintMaterial === 'string' ? source.blueprintMaterial : '';
  const short = typeof source.rawText === 'string' ? source.rawText : '';
  const chosen = long.length > 0 ? long : short;
  return chosen.slice(0, MATERIAL_BUDGET.blueprintMaxChars);
}
