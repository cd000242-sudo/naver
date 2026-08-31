/**
 * 파이프라인 내부 수치 누출 감지.
 *
 * 사장님 실측: 자취방 인테리어 글에 "사진 검색 결과 419개", "포스터 33,991개" 가
 * 근거처럼 실렸다. 이미지 검색 결과 개수다 — 인테리어와 아무 상관이 없고,
 * 독자에게는 아무 의미가 없으며, 도구가 자기 배관을 보여주는 꼴이다.
 *
 * 논증도 성립하지 않는다. 사진이 419장 검색됐다는 사실은
 * 낮은 수납장이 낫다는 근거가 못 된다.
 *
 * 근거 게이트로는 못 잡는다. 그 숫자가 실제로 자료에 있기 때문이다.
 * "자료에 있는가" 가 아니라 "독자에게 뜻이 있는가" 를 묻는 자리가 따로 필요하다.
 *
 * 경고만 낸다. 문장을 지우지 않고 발행도 막지 않는다.
 */

/**
 * 검색 · 조회 맥락에 붙은 개수만 잡는다.
 *
 * "구성품 3개", "후기 7건" 같은 진짜 수치를 잡으면 안 되므로,
 * 앞뒤 여섯 어절 안에 검색 · 사진 · 데이터 같은 말이 있을 때만 누출로 본다.
 */
const SEARCH_CONTEXT = /(?:검색|조회|사진\s*수|이미지\s*수|데이터)/u;
const COUNT = /\d[\d,]*\s*(?:개|건|장)/gu;
const NEAR = 24;

const MAX_REPORTED = 6;

export function findPipelineMetricLeaks(text: string | undefined): string[] {
  const body = String(text ?? '');
  if (!body.trim()) return [];

  const found: string[] = [];
  for (const match of body.matchAll(COUNT)) {
    const at = match.index ?? 0;
    const window = body.slice(Math.max(0, at - NEAR), at + match[0].length + NEAR);
    if (!SEARCH_CONTEXT.test(window)) continue;
    found.push(window.replace(/\s+/gu, ' ').trim());
    if (found.length >= MAX_REPORTED) break;
  }
  return found;
}

export function describePipelineMetricLeaks(leaks: readonly string[]): string[] {
  return leaks.map((leak) => (
    `검색 건수가 근거처럼 쓰였습니다 — 독자에게 뜻이 없고 논증도 성립하지 않습니다: "${leak.slice(0, 44)}…"`
  ));
}
