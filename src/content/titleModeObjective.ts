// src/content/titleModeObjective.ts
// 모드별로 제목이 이겨야 하는 판이 다르다 — 채점도 그에 맞춰 갈린다.
//
// [2026-08-26 사장님 지시]
//   "제목은 SEO 요즘 로직에 맞춰서 검색어에 맞물리게 나와야 되고,
//    홈판은 홈판에 노출될 수 있게끔 사람들의 반응을 먼저 끌어와야 하니까
//    제목에 후킹과 상황이 포함되어야 하고, 쇼핑커넥트/업체홍보 모드 등등
//    전부 그에 맞게 최적화되어서 나와야 된다."
//
// 실태 조사 결과 채점기(contentTitleEvaluator)는 keyword 를 "그대로 복사인지"
// 판정에만 쓰고 있었다. 즉 SEO 모드에서 검색어를 통째로 버린 후보가 길이만 맞으면
// 이길 수 있었다. 제목 후보 재선택이 이 점수로 고르므로, 검색으로 먹고사는 글이
// 검색어 없는 제목을 달고 나갈 수 있는 구조였다.
//
// 여기서는 "검색으로 먹고사는 모드"의 검색어 맞물림만 담당한다.
// 홈판의 후킹·상황은 ctrCombat + neoHookTitles 가 이미 담당한다(중복 채점 금지).

import { measureKeywordCoverage } from './keywordTitlePrefixPolicy.js';

/** 검색 결과로 유입이 결정되는 모드 — 제목에 검색어가 물려 있어야 한다. */
const SEARCH_DRIVEN_MODES = new Set(['seo', 'mate', 'affiliate', 'business']);

export function isSearchDrivenTitleMode(mode: string | undefined): boolean {
  return SEARCH_DRIVEN_MODES.has(String(mode || '').trim());
}

export interface SearchMatchVerdict {
  /** 점수 가감분. 양수는 가산, 음수는 감점. */
  readonly points: number;
  /** 로그·이슈 목록에 쓸 사유. 가감이 없으면 빈 문자열. */
  readonly reason: string;
  readonly covered: number;
  readonly total: number;
}

const NO_CHANGE: SearchMatchVerdict = { points: 0, reason: '', covered: 0, total: 0 };

/**
 * 검색 모드 제목이 검색어와 얼마나 물려 있는지 채점한다.
 *
 * 기준은 토큰 커버리지다. 위치는 보지 않는다 — seo/base R0-1이 "첫 3글자나 고정
 * 위치로 옮기지 않는다"고 못박기 때문에, 앞배치에 점수를 주면 계약과 부딪힌다.
 *
 * 검색어 원문을 그대로 붙여 넣은 제목은 채점기 앞단의 "키워드 그대로 사용 → 0점"
 * 규칙이 이미 잡으므로 여기서 또 막지 않는다.
 */
export function scoreSearchMatch(
  title: string,
  keyword: string,
  mode: string | undefined,
): SearchMatchVerdict {
  if (!isSearchDrivenTitleMode(mode)) return NO_CHANGE;

  const { covered, total, ratio } = measureKeywordCoverage(keyword, title);
  if (total === 0) return NO_CHANGE;

  if (ratio >= 2 / 3) {
    return { points: 15, reason: `검색어 맞물림 ${covered}/${total}`, covered, total };
  }
  if (ratio >= 1 / 3) {
    return { points: 5, reason: `검색어 부분 맞물림 ${covered}/${total}`, covered, total };
  }
  return {
    points: -20,
    reason: `검색어 이탈 ${covered}/${total} — 검색 유입이 끊긴다`,
    covered,
    total,
  };
}
