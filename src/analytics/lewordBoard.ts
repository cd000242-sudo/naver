// src/analytics/lewordBoard.ts
// [2026-09-10] leword 의 "오늘의 글감"(실검 틈새 보드)을 앱이 읽는다.
//
// 사장님 지적: "오늘의 글감 사이트까지 줬는데 이럴래? 지금은 또 실시간 검색어 상위 3개를
// 가져오는데?"
//
// 맞는 지적이었다. 앱에 leword 데이터를 읽는 코드가 한 줄도 없었다. leword 는 브라우저로
// 열기만 했고(openExternalUrl), 정작 키워드는 앱이 자체적으로 랜덤 시드 3개를 뽑아
// 크롤링했다(keywordAnalyzer.ts:928·1343 — sort(random).slice(0,3)).
//
// 보드는 매일 07·13·19시에 이런 것을 만든다:
//   { keyword: "에코프로 방문신청", searchVolume: 450, documentCount: 11356,
//     verdict: "niche", lane: "realtime" }
// 검색량과 문서수가 붙은 키워드다. 이걸 쓰면 32자 뉴스 제목이 키워드 자리에 들어가는
// 일이 사라진다(그게 노출률 83% 허수의 뿌리였다).

/** 공개 보드 주소. 로그인 없이 읽히는 무료 데이터다. */
export const LEWORD_BOARD_URL = 'https://leaderspro.kr/data/issue-niche-board.json';

/**
 * 선점 보드 — 키워드마다 **어느 채널이 이기는 화면인지**를 재 둔 자료.
 *
 * [2026-09-10 심층분석] 실측 43건에서 naver-blog 25 · wordpress 14 · kin 2 였다.
 * 33% 는 워드프레스가 이기는 자리라, 네이버 블로그로 쓰면 애초에 못 이긴다.
 * 검색량·문서수만 보고 고르면 그 3분의 1을 헛되이 쓴다.
 */
export const LEWORD_PREEMPTION_URL = 'https://leaderspro.kr/data/preemption-board.json';

export interface LewordPick {
  readonly keyword: string;
  /** 월 검색량. 모르면 null — 0 으로 적으면 "검색량 없음" 과 구분이 안 된다. */
  readonly searchVolume: number | null;
  /** 이 키워드로 이미 나와 있는 문서 수. 적을수록 선점 여지가 크다. */
  readonly documentCount: number | null;
  /** 보드의 판정: niche(틈새) · preemption(선점) 등. */
  readonly verdict: string;
  /** realtime · tech 같은 수집 갈래. */
  readonly lane: string;
  /** 보드가 확정 추천(rows)한 것인가. 관측(observations)보다 근거가 강하다. */
  readonly recommended: boolean;
  /** 주제(선점 보드에만 있다). */
  readonly topic?: string;
  /** 상위 10칸 중 비어 있는 자리 수. 클수록 비집고 들어갈 여지가 크다. */
  readonly openSlot?: number | null;
  /** 광고 클릭 추정치 — 이 말에 돈이 도는지의 신호. 0 이면 광고주가 없다. */
  readonly adClicks?: number | null;
  /** 앞자리가 이미 꽉 찼는가. 같은 조건이면 비어 있는 쪽을 먼저 쓴다. */
  readonly saturated?: boolean;
  /** 사람이 읽는 한 줄 설명(보드가 만든 문장 그대로). */
  readonly layoutHeadline?: string;
}

export interface LewordBoard {
  readonly picks: readonly LewordPick[];
  readonly publishedAt: string;
  readonly schedule: string;
  /** 보드가 오늘 몇 개를 재고 몇 개를 골랐는지. 적게 나오는 날이 정상이다. */
  readonly measured: Record<string, number>;
}

const EMPTY: LewordBoard = { picks: [], publishedAt: '', schedule: '', measured: {} };

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toPick(raw: unknown, recommended: boolean): LewordPick | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const keyword = str(row.keyword);
  if (!keyword) return null;
  return {
    keyword,
    searchVolume: num(row.searchVolume),
    documentCount: num(row.documentCount),
    verdict: str(row.verdict),
    lane: str(row.lane),
    recommended,
  };
}

/**
 * 보드 JSON 에서 고를 수 있는 키워드만 꺼낸다.
 *
 * rows(확정 추천)를 먼저 놓고 observations(관측)를 뒤에 붙인다 — 근거가 강한 순서다.
 * 같은 키워드가 양쪽에 있으면 rows 쪽(추천)이 이긴다.
 * 형태가 다르면 빈 결과를 돌려준다. 보드가 바뀌었다고 앱이 깨지면 안 된다.
 */
export function parseLewordBoard(raw: unknown): LewordBoard {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const board = raw as Record<string, unknown>;

  const rows = Array.isArray(board.rows) ? board.rows : [];
  const observations = Array.isArray(board.observations) ? board.observations : [];

  const picks: LewordPick[] = [];
  const seen = new Set<string>();
  for (const [list, recommended] of [[rows, true], [observations, false]] as const) {
    for (const entry of list) {
      const pick = toPick(entry, recommended);
      if (!pick || seen.has(pick.keyword)) continue;
      seen.add(pick.keyword);
      picks.push(pick);
    }
  }

  const measuredRaw = board.measured && typeof board.measured === 'object'
    ? board.measured as Record<string, unknown>
    : {};
  const measured: Record<string, number> = {};
  for (const [key, value] of Object.entries(measuredRaw)) {
    const parsed = num(value);
    if (parsed !== null) measured[key] = parsed;
  }

  return { picks, publishedAt: str(board.publishedAt), schedule: str(board.schedule), measured };
}

/**
 * 선점 보드에서 **네이버 블로그가 이기는 자리만** 꺼낸다.
 *
 * 워드프레스·지식iN 이 위에 뜨는 화면은 블로그 글로는 못 이긴다 — 검색량과 문서수가
 * 아무리 좋아도 자리가 없다. 그런 키워드를 걸러 주는 것이 이 함수의 존재 이유다.
 *
 * 정렬: 앞자리가 빈 것 먼저, 그 다음 광고 클릭이 큰 것. 이길 수 있는가를 먼저 보고
 * 돈이 되는가를 나중에 본다 — 순서가 반대면 못 이길 자리에 힘을 쓴다.
 */
export function parsePreemptionBoard(raw: unknown): LewordBoard {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const board = raw as Record<string, unknown>;
  const rows = Array.isArray(board.rows) ? board.rows : [];

  const picks: LewordPick[] = [];
  const seen = new Set<string>();
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (str(row.layoutBestFor) !== 'naver-blog') continue;
    const keyword = str(row.keyword);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    picks.push({
      keyword,
      searchVolume: num(row.searchVolume),
      documentCount: num(row.documentCount),
      verdict: str(row.tier),
      lane: str(row.topic),
      recommended: true,
      topic: str(row.topic),
      openSlot: num(row.openSlot),
      adClicks: num(row.adClicks),
      saturated: row.frontalSaturated === true,
      layoutHeadline: str(row.layoutHeadline),
    });
  }

  picks.sort((a, b) => {
    if (a.saturated !== b.saturated) return a.saturated ? 1 : -1;
    return (b.adClicks ?? 0) - (a.adClicks ?? 0);
  });

  const measuredRaw = board.measured && typeof board.measured === 'object'
    ? board.measured as Record<string, unknown>
    : {};
  const measured: Record<string, number> = {};
  for (const [key, value] of Object.entries(measuredRaw)) {
    const parsed = num(value);
    if (parsed !== null) measured[key] = parsed;
  }

  return { picks, publishedAt: str(board.publishedAt), schedule: str(board.schedule), measured };
}
