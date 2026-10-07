/**
 * 무료 맛보기 다섯 — **발행기와 화면이 같은 다섯을 고르게 하는 한 곳.**
 *
 * 왜 한 곳인가(실측 2026-09-11): 화면은 이름으로 잠금을 푸는데(순번이 아니라),
 * 발행본의 다섯 중 보드에 남은 것이 하나뿐이라 방문자가 카드 한 장만 봤다
 * (leaderspro.kr 발행 2026-09-09 · 행 43개 · 살아남은 이름 '제주렌트카 본사' 하나).
 * 발행기와 화면이 다른 다섯을 고르면 잠금과 정렬이 어긋난다.
 *
 * 규칙: **하루 동안 고정하되, 사라진 자리만 메운다.**
 *   · 하루 고정의 이유(사장님 2026-08-20): "5건을 랜덤으로 보여주면 굳이 구매 안 해도
 *     새로고침하면 새 키워드를 볼 수 있다고 생각한다고." 맞다 — 그래서 이름을 박아 둔다.
 *   · 그런데 보드 행은 회차마다 바뀐다(신규·이월·만료). 살아남았는지 확인하지 않아
 *     이름이 증발했다. 살아남은 이름은 그대로 두고 모자란 만큼만 채운다.
 *   · 채울 때는 **보드 전체의 발행 순서**에서 가져온다. 화면이 주제·레인으로 거른
 *     목록에서 채우면, 필터를 돌려 가며 새 키워드를 여는 구멍이 생긴다.
 */

/** 비로그인 방문자가 선명하게 보는 카드 수. */
export const FREE_SAMPLE_SIZE = 5;

/**
 * @param board 발행본 — rows 만 본다(발행 순서 그대로).
 * @param published 발행본이 하루 고정으로 박아 둔 이름들. 없으면 보드 앞줄로만 채운다.
 * @param prefer 처음 보는 목록 이름(오늘 확인 → 최근 7일, 주제·레인 필터 전). 있으면 그 안에서 먼저 연다.
 * @returns 실제로 열어 줄 이름들. 보드가 다섯보다 적으면 있는 만큼만 — 없는 이름은 지어내지 않는다.
 */
export function repairFreeSample(board, published, prefer) {
  const rows = (board && Array.isArray(board.rows)) ? board.rows : [];
  const names = rows.map((row) => String((row && row.keyword) || '')).filter(Boolean);
  const onBoard = new Set(names);

  const out = [];
  const seen = new Set();
  const push = (name) => {
    if (!name || seen.has(name) || out.length >= FREE_SAMPLE_SIZE) return;
    seen.add(name);
    out.push(name);
  };

  const publishedOnBoard = (Array.isArray(published) ? published : []).map(String).filter((name) => onBoard.has(name));
  /*
   * ⓪ 처음 보는 목록(오늘 확인 → 최근 7일, 필터 전 전체)이 있으면 그 안에서 먼저 연다(2026-10-07 사장님 "LEWORD 5개는 보여줘야").
   *    발행본 다섯이 보드 앞줄(보관 순서)이라 '오늘 확인' 6개와 하나도 겹치지 않아 첫 화면이 전부 잠겼다.
   *    이 목록도 주제·레인 필터를 거치기 전 전체라 필터를 돌려 새 키워드를 여는 구멍은 그대로 막혀 있다.
   */
  const preferOnBoard = (Array.isArray(prefer) ? prefer : []).map(String).filter((name) => onBoard.has(name));
  const preferSet = new Set(preferOnBoard);
  for (const name of publishedOnBoard) if (preferSet.has(name)) push(name);
  for (const name of preferOnBoard) push(name);

  // ① 발행본이 준 이름 중 아직 보드에 있는 것 — 자리를 그대로 지킨다.
  for (const name of publishedOnBoard) push(name);
  // ② 모자란 만큼 보드 앞줄에서 메운다.
  for (const name of names) push(name);

  return out;
}
