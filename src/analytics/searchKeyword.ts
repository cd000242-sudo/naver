/**
 * searchKeyword.ts — 노출 측정에 쓸 검색어를 가려낸다.
 *
 * [2026-09-15 사장님 진단] 쌓인 109편 중 66%가 "검색어 = 제목 그대로"였다.
 * 예: "나연이 치과 진료 후 써본 혀클리너, 이게 뭐길래 하나요" 를 검색해 1위를 찾았다.
 * 아무도 검색하지 않는 문장이다. 이건 노출이 아니라 **내 글이 색인됐다**는 확인일 뿐인데,
 * 그대로 노출률에 합산돼 성적을 부풀렸다(제목검색 36% vs 진짜 키워드 19%).
 *
 * 그렇다고 버리면 안 된다. 실측에서 가장 값진 신호가 거기서 나왔다 —
 * 제 제목으로도 1위를 못 잡는 블로그(rimi_77-: 0/10)는 경쟁에서 밀린 게 아니라
 * 수집·색인 쪽이 막힌 것이다. 다른 블로그는 같은 조건에서 20~40%를 잡았다.
 *
 * 그래서 버리지 않고 **두 종류로 라벨링**한다.
 *   exposure — 진짜 검색어. 순위 경쟁의 결과다.
 *   index    — 제목 그대로. 색인 여부 확인이다. 노출률에 섞으면 안 된다.
 */

export type SearchKeywordKind = 'exposure' | 'index';

export interface SearchKeywordVerdict {
  /** 실제로 검색창에 넣을 말. 비어 있으면 측정 자체가 불가능하다. */
  readonly keyword: string;
  readonly kind: SearchKeywordKind;
  /** 왜 그렇게 판정했는지 — 로그·리포트에 그대로 쓴다. */
  readonly reason: string;
}

/**
 * 검색어로 보기엔 너무 긴 기준.
 *
 * 실측 분포: 진짜 키워드는 "전기요금 폭탄"(8자) "근로장려금 안내문 안옴"(12자)처럼 짧고,
 * 오염된 값은 중앙 31자였다. 20자를 경계로 두면 둘이 깨끗하게 갈린다.
 */
const MAX_SEARCH_KEYWORD_CHARS = 20;

/** 문장이라는 표시 — 검색어에는 이런 게 붙지 않는다. */
const SENTENCE_MARKERS = /[,·…?!~]|，|？|！/;

const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
const squash = (value: unknown): string => String(value ?? '').replace(/\s+/g, '').toLowerCase();

/** 검색어라기엔 문장에 가까운가. */
export function looksLikeSentence(value: string): boolean {
  const text = normalize(value);
  if (!text) return false;
  if (text.length > MAX_SEARCH_KEYWORD_CHARS) return true;
  if (SENTENCE_MARKERS.test(text)) return true;
  // 6어절을 넘으면 검색어가 아니라 문장이다.
  return text.split(' ').length > 6;
}

/**
 * 기록된 keyword 와 제목을 보고 어떤 측정이 가능한지 판정한다.
 *
 * 추측으로 키워드를 만들어내지 않는다. 제목에서 앞 두어 어절을 잘라 "이게 키워드겠지" 하는
 * 순간 또 하나의 가짜 측정이 생긴다. 진짜 검색어가 없으면 없다고 말하고 index 로 둔다.
 */
export function resolveSearchKeyword(rawKeyword: unknown, title: unknown): SearchKeywordVerdict {
  const keyword = normalize(rawKeyword);
  const postTitle = normalize(title);

  if (!keyword) {
    return postTitle
      ? { keyword: postTitle, kind: 'index', reason: '키워드 없음 — 제목으로 색인만 확인' }
      : { keyword: '', kind: 'index', reason: '키워드·제목 모두 없음 — 측정 불가' };
  }

  if (postTitle && squash(keyword) === squash(postTitle)) {
    return { keyword, kind: 'index', reason: '검색어가 제목과 같음 — 색인 확인' };
  }

  if (looksLikeSentence(keyword)) {
    return { keyword, kind: 'index', reason: `문장형 검색어(${keyword.length}자) — 색인 확인` };
  }

  return { keyword, kind: 'exposure', reason: '검색 가능한 키워드' };
}

/**
 * 노출률 집계에 넣어도 되는 체크인가.
 *
 * kind 가 없는 옛 기록은 검색어와 제목을 다시 비교해 판정한다 — 과거 데이터도 같은 잣대로 본다.
 */
export function isExposureMeasurement(
  check: { readonly searchedKeyword?: string; readonly keywordKind?: string },
  title?: string,
): boolean {
  if (check.keywordKind === 'exposure') return true;
  if (check.keywordKind === 'index') return false;
  return resolveSearchKeyword(check.searchedKeyword, title).kind === 'exposure';
}
