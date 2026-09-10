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
