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

  // 가산점을 주지 않는다. 이 채점기는 100점에서 시작해 결함을 빼고 Math.min(100)으로
  // 자르므로, 가산은 결함 없는 제목들 사이에서 묻히기만 하는 게 아니라 더 나쁘다 —
  // 다른 항목의 감점을 흡수해 실제 결함을 가린다. (실측: 구매 축이 없어 -10 이어야 할
  // 쇼핑 제목이 검색어 맞물림 +15에 상쇄되어 100점으로 나왔다.)
  // 그래서 "물려 있음"은 0점이고, 안 물린 정도만 결함으로 뺀다.
  if (ratio >= 2 / 3) {
    return { points: 0, reason: `검색어 맞물림 ${covered}/${total}`, covered, total };
  }
  if (ratio >= 1 / 3) {
    return {
      points: -8,
      reason: `검색어 부분 맞물림 ${covered}/${total} — 키워드가 분명히 보이지 않는다`,
      covered,
      total,
    };
  }
  return {
    points: -20,
    reason: `검색어 이탈 ${covered}/${total} — 검색 유입이 끊긴다`,
    covered,
    total,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 쇼핑 — 구매 축
// ═══════════════════════════════════════════════════════════════════
//
// situationTitleContract 의 쇼핑 분기는 "용도·대상·공간·비교 조건" 중 최소 1개를
// 필수로 요구한다. 그런데 채점기에는 쇼핑 감점만 5종 있고 가산이 하나도 없었다.
// 계약이 필수라고 한 것을 지켜도 점수가 오르지 않으니, 후보 재선택에서 구매 축이
// 없는 밋밋한 제목이 이길 수 있었다.
//
// 아래는 닫힌 목록이 아니라 "모양"을 본다 — 프롬프트의 예시는 예시일 뿐이고
// 자료마다 실제로 쓰이는 말이 다르기 때문이다. 못 잡으면 가산이 없을 뿐,
// 잘못된 감점은 생기지 않는다(fail-open).

const PURCHASE_AXIS_SHAPES: ReadonlyArray<{ readonly re: RegExp; readonly name: string }> = [
  // 용도 — "침실용 / 사무실용 / 캠핑용"
  { re: /[가-힣]{2,}용(?![어품량])/, name: '용도' },
  // 대상 — "아기 있는 집 / 반려동물 / 어르신 / 처음 사는 사람"
  { re: /(있는\s*집|아기|신생아|반려|어르신|초보|처음\s*(?:사|쓰|구매)|1인\s*가구|자취)/, name: '대상' },
  // 공간·조건 — "원룸 / 좁은 방 / 예산 10만원대"
  { re: /(원룸|투룸|좁은|작은\s*방|사무실|주방|욕실|차량|예산|만원대|이하로)/, name: '공간·예산' },
  // 비교 축 — "저소음 / 무선 / 각도 조절 / 세척 편한"
  { re: /(저소음|무소음|무선|유선|각도|조절|세척|분리|접이|경량|대용량|절전)/, name: '비교조건' },
];

export interface PurchaseAxisVerdict {
  readonly points: number;
  readonly reason: string;
  readonly matched: readonly string[];
}

/**
 * 쇼핑 제목이 구매 축을 갖고 있는지 본다. 없으면 감점한다.
 *
 * 가산이 아니라 감점인 이유: 이 채점기는 100점에서 시작해 결함을 빼는 구조이고,
 * 최종 점수가 Math.min(100)으로 잘린다. 즉 결함 없는 제목들 사이에서는 가산점이
 * 전부 묻혀 아무 차이도 만들지 못한다(후보 선택은 >= 75 같은 절대 임계도 쓴다).
 * 계약이 "최소 1개 필수"라고 못박은 것의 부재는 결함이므로 감점이 맞는 자리다.
 *
 * 판별은 닫힌 목록이 아니라 모양을 본다 — 자료마다 실제로 쓰이는 말이 다르다.
 * 그래서 감점 폭은 작게 둔다(-10). 못 잡아서 억울하게 깎이더라도 후보가
 * 통째로 탈락하지는 않게 한다.
 */
export function scorePurchaseAxis(title: string, mode: string | undefined): PurchaseAxisVerdict {
  if (String(mode || '').trim() !== 'affiliate') {
    return { points: 0, reason: '', matched: [] };
  }
  const t = String(title || '').trim();
  if (!t) return { points: 0, reason: '', matched: [] };

  const matched = PURCHASE_AXIS_SHAPES.filter((s) => s.re.test(t)).map((s) => s.name);
  if (matched.length > 0) {
    return { points: 0, reason: `쇼핑 구매 축: ${matched.join('·')}`, matched };
  }
  return {
    // [2026-09-02 사장님: "문제는 팔려야 되잖아"] -10 은 너무 약했다 — 구매 축 없는 상품명 나열 제목이 95점으로 통과했다(닥터웰).
    //   구매 축은 쇼핑 제목의 존재 이유다. 후보 채점에서 구매 축 있는 후보가 이기게 무게를 준다.
    points: -30,
    reason: '쇼핑: 구매 축 없음 (용도·대상·공간·비교조건 중 1개 필수)',
    matched: [],
  };
}

/**
 * [2026-09-02 닥터웰 실측] 스토어 상품명의 옵션 조합("그레이 본체+다리")이 제목에 그대로 들어갔다.
 * "A+B" 로 이어진 토큰은 구매 옵션 표기지 검색어도 판단도 아니다 — 독자에게 아무것도 주지 않고 자리만 먹는다.
 * 낱말을 나열하지 않는다: '+' 로 묶인 조합이라는 형태만 본다.
 */
export function scoreOptionNoise(title: string, mode: string | undefined): PurchaseAxisVerdict {
  if (String(mode || '').trim() !== 'affiliate') return { points: 0, reason: '', matched: [] };
  const t = String(title || '').trim();
  const combos = t.match(/[^\s+]+\+[^\s+]+/g) || [];
  // [2026-09-03] 대괄호 꼬리표("[슈퍼적립+사은품 증정]")도 스토어 표기다 — 형태만 본다.
  const tags = t.match(/\[[^\]]+\]|【[^】]+】/g) || [];
  const noise = [...combos, ...tags.filter((tag) => !combos.some((c) => tag.includes(c)))];
  if (noise.length === 0) return { points: 0, reason: '', matched: [] };
  return {
    points: -20,
    reason: `쇼핑: 상품 옵션·스토어 꼬리표 표기가 제목에 들어감 (${noise.join(', ')})`,
    matched: noise,
  };
}

/**
 * [2026-09-02 사장님] "팔린다 → 고객이 본다 → 노출된다 → 상위노출될 제목을 쓴다." 쇼핑 제목의 첫 임무는 검색에 걸리는 것.
 * scoreSearchMatch 는 낱말 단위라 "닥터웰 … 마사지기, 종아리 …" 처럼 흩어져 있어도 만점이었다.
 * 검색어는 사람들이 치는 구절이다 — 구절이 그대로 붙어 있어야 하고, 앞쪽에 있어야 한다. 형태만 본다.
 */
export function scoreSearchPhraseIntact(title: string, keyword: string, mode: string | undefined): PurchaseAxisVerdict {
  if (String(mode || '').trim() !== 'affiliate') return { points: 0, reason: '', matched: [] };
  const norm = (v: string) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const t = norm(title);
  const k = norm(keyword);
  if (!t || !k) return { points: 0, reason: '', matched: [] };
  const at = t.indexOf(k);
  if (at < 0) {
    return { points: -10, reason: `검색어 구절이 토막 나 있다 — "${keyword}" 를 그대로 붙여야 검색에 걸린다`, matched: [] };
  }
  if (at > Math.floor(t.length * 0.4)) {
    return { points: -4, reason: `검색어 구절이 뒤로 밀렸다 (${at}번째 글자) — 앞쪽에 둔다`, matched: [keyword] };
  }
  return { points: 0, reason: '', matched: [keyword] };
}
