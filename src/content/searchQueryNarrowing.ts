/**
 * 문장형 키워드를 검색 가능한 질의로 쪼갠다.
 *
 * 사장님 지적: "자료가 0건이면 글을 어떻게 쓰라고 하는 거니?"
 * 답은 생성을 멈추는 것이 아니라 자료를 제대로 찾는 것이다.
 *
 * 로그가 원인을 그대로 보여줬다.
 *   검색어: "추석 연휴 대비: 냉장고 파먹기 식재료 정리 및 성에 제거"
 *
 * 이건 검색어가 아니라 문장이다. 어느 검색엔진에 넣어도 0건이 나온다.
 * 그 0건 화면("표시할 항목이 없습니다" + 사이드바 헤드라인)을 긁어와
 * 뉴스 헤드라인이 자료가 됐고, 그 숫자가 냉장고 사실로 둔갑했다.
 *
 * 뿌리는 크롤러가 아니라 질의였다. 넓은 후보부터 좁은 후보 순으로 내고,
 * 호출자는 자료를 얻을 때까지 순서대로 시도한다.
 */

/** 이 길이를 넘으면 문장으로 보고 쪼갠다. 짧은 키워드는 그대로가 최선이다. */
const SENTENCE_LIKE_WORDS = 4;

/** 문장을 가르는 접속 · 나열 표기. */
const SPLITTERS = /\s*(?:및|그리고|와|과|또는|,|\/)\s*/u;

/** 검색어에서 뜻을 보태지 않는 꾸밈말. */
const FILLER = /^(?:추석|설날|명절)?\s*(?:연휴)?\s*(?:대비|준비|맞이|기념)$/u;

function clean(text: string): string {
  return text.replace(/[:：]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

/**
 * 넓은 것부터 좁은 것 순으로 검색어 후보를 낸다.
 * 첫 후보는 언제나 원문이다 — 그것으로 결과가 나오면 그게 가장 정확하다.
 */
export function narrowSearchQueries(keyword: string | undefined): string[] {
  const original = String(keyword ?? '').trim();
  if (!original) return [];

  const candidates: string[] = [original];
  const push = (value: string) => {
    const v = clean(value);
    if (v && v.length >= 2 && !candidates.includes(v)) candidates.push(v);
  };

  const words = clean(original).split(' ').filter(Boolean);
  if (words.length <= SENTENCE_LIKE_WORDS) return candidates;

  // 콜론 뒤 본체 — "추석 연휴 대비: 냉장고 파먹기…" 에서 앞머리는 맥락일 뿐이다.
  const afterColon = original.split(/[:：]/u).slice(1).join(' ').trim();
  if (afterColon) push(afterColon);

  // 접속어로 갈린 조각들. 각각이 독립된 검색어다.
  const body = afterColon || original;
  for (const piece of body.split(SPLITTERS)) {
    const trimmed = clean(piece);
    if (!trimmed || FILLER.test(trimmed)) continue;
    push(trimmed);
  }

  return candidates;
}
