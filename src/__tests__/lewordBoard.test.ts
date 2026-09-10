/**
 * [2026-09-10 사장님] "오늘의 글감 사이트까지 줬는데 이럴래?
 * 지금은 또 실시간 검색어 상위 3개를 가져오는데?"
 *
 * 맞는 지적이었다. 앱에 leword 데이터를 읽는 코드가 **한 줄도 없었다**
 * (grep "brief-titles|topic-briefs|today-picks|issue-niche-board" src/ → 0건).
 * 앱은 leword 를 브라우저로 열기만 하고(openExternalUrl), 정작 키워드는 자체적으로
 * 랜덤 시드 3개를 뽑아 크롤링했다(keywordAnalyzer.ts:928, 1343 — sort(random).slice(0,3)).
 *
 * leword 보드는 이런 걸 매일 07·13·19시에 만든다:
 *   { keyword: "에코프로 방문신청", searchVolume: 450, documentCount: 11356,
 *     verdict: "niche", lane: "realtime", origin: "autocomplete" }
 *
 * 검색량과 문서수가 붙은 키워드다. 앱이 이걸 쓰면 32자 뉴스 제목을 키워드 자리에 넣는
 * 일이 사라진다.
 */
import { describe, it, expect } from 'vitest';
import { parseLewordBoard, LEWORD_BOARD_URL } from '../analytics/lewordBoard';

const board = {
  publishedAt: '2026-09-10T00:37:52.438Z',
  schedule: '매일 07·13·19시(KST) 갱신',
  measured: { issues: 18, candidates: 220, niche: 1, preemption: 6 },
  rows: [
    { keyword: '에코프로 방문신청', searchVolume: 450, documentCount: 11356, verdict: 'niche', lane: 'realtime', origin: 'autocomplete' },
    { keyword: '(주)피씨엔', searchVolume: null, documentCount: 55, verdict: 'preemption', lane: 'tech' },
  ],
  observations: [
    { keyword: '쿤텍 상장', searchVolume: 10, documentCount: 64, verdict: 'preemption', lane: 'tech' },
    { keyword: '   ', searchVolume: 99, documentCount: 3, verdict: 'niche' },
  ],
};

describe('parseLewordBoard — 보드에서 쓸 수 있는 키워드만 꺼낸다', () => {
  it('확정 추천(rows)이 관측(observations)보다 앞에 온다', () => {
    const r = parseLewordBoard(board);
    expect(r.picks[0].keyword).toBe('에코프로 방문신청');
    expect(r.picks.map((p) => p.keyword)).toContain('쿤텍 상장');
  });

  it('검색량·문서수·판정을 그대로 싣는다 — 고를 근거가 화면에 있어야 한다', () => {
    const first = parseLewordBoard(board).picks[0];
    expect(first.searchVolume).toBe(450);
    expect(first.documentCount).toBe(11356);
    expect(first.verdict).toBe('niche');
    expect(first.recommended).toBe(true);
  });

  it('검색량을 모르면 null 로 둔다 — 0 으로 적으면 "검색량 없음" 과 구분이 안 된다', () => {
    const p = parseLewordBoard(board).picks.find((x) => x.keyword === '(주)피씨엔');
    expect(p?.searchVolume).toBeNull();
  });

  it('빈 키워드는 버린다', () => {
    expect(parseLewordBoard(board).picks.some((p) => !p.keyword.trim())).toBe(false);
  });

  it('갱신 시각과 주기를 함께 준다 — 언제 것인지 모르면 못 믿는다', () => {
    const r = parseLewordBoard(board);
    expect(r.publishedAt).toBe('2026-09-10T00:37:52.438Z');
    expect(r.schedule).toMatch(/07/);
  });

  it('보드 형태가 아니면 빈 결과 — 앱을 깨뜨리지 않는다', () => {
    expect(parseLewordBoard(null).picks).toEqual([]);
    expect(parseLewordBoard({}).picks).toEqual([]);
    expect(parseLewordBoard({ rows: 'nope' }).picks).toEqual([]);
  });

  it('중복 키워드는 한 번만 (rows 와 observations 에 같은 말이 있을 수 있다)', () => {
    const dup = { rows: [{ keyword: 'A', verdict: 'niche' }], observations: [{ keyword: 'A', verdict: 'preemption' }] };
    expect(parseLewordBoard(dup).picks).toHaveLength(1);
    expect(parseLewordBoard(dup).picks[0].recommended).toBe(true);
  });

  it('보드 주소는 leword 공개 데이터를 가리킨다', () => {
    expect(LEWORD_BOARD_URL).toMatch(/^https:\/\/.*issue-niche-board\.json$/);
  });
});

/**
 * [2026-09-10 심층분석] leword 는 키워드마다 **블로그가 이길 자리인지**를 이미 재고 있다.
 * 앱은 실검 틈새 보드만 읽고 그 데이터를 통째로 놓치고 있었다.
 *
 * 실측(preemption-board.json, 43건):
 *   layoutBestFor  naver-blog 25건(58%) · wordpress 14 · kin 2
 *   → 33% 는 워드프레스가 이기는 자리다. 네이버 블로그로 쓰면 애초에 못 이긴다.
 *   frontalSaturated  앞자리 포화 여부
 *   adClicks          광고 클릭 추정 = 실제 수익 신호
 *     기아 ev5 375.9(포화) · 쳇지티피무료 214.8(여유) · patchit 103.7(여유)
 *
 * 이 셋의 교집합 — "블로그가 이기고 · 앞자리가 비었고 · 광고 클릭이 있는" 자리가
 * 예약 발행으로 꾸준히 노릴 곳이다.
 */
describe('parsePreemptionBoard — 블로그가 이길 자리를 가려낸다', () => {
  const board = {
    publishedAt: '2026-09-09T01:24:19.386Z',
    rows: [
      { keyword: '쳇지티피무료', topic: 'IT·컴퓨터', searchVolume: 3530, documentCount: 246, openSlot: 4, adClicks: 214.8, adDepth: 1, layoutBestFor: 'naver-blog', layoutHeadline: '블로그 글이 맨 위에 뜨는 화면', frontalSaturated: false },
      { keyword: '기아 ev5', topic: '자동차', searchVolume: 60710, documentCount: 30794, openSlot: 1, adClicks: 375.9, adDepth: 7, layoutBestFor: 'naver-blog', frontalSaturated: true },
      { keyword: '무료게임 crazy', topic: '게임', searchVolume: 1000, documentCount: 10, adClicks: 57.6, layoutBestFor: 'wordpress', frontalSaturated: false },
      { keyword: '   ', layoutBestFor: 'naver-blog' },
    ],
  };

  it('블로그가 이기는 자리만 남긴다 — 워드프레스 자리는 애초에 못 이긴다', async () => {
    const { parsePreemptionBoard } = await import('../analytics/lewordBoard');
    const picks = parsePreemptionBoard(board).picks;
    expect(picks.map((p) => p.keyword)).toEqual(['쳇지티피무료', '기아 ev5']);
  });

  it('앞자리가 빈 것을 먼저 보여준다 — 포화된 자리는 뒤로', async () => {
    const { parsePreemptionBoard } = await import('../analytics/lewordBoard');
    const picks = parsePreemptionBoard(board).picks;
    expect(picks[0].keyword).toBe('쳇지티피무료');
    expect(picks[0].saturated).toBe(false);
    expect(picks[1].saturated).toBe(true);
  });

  it('수익 신호(광고 클릭)를 그대로 싣는다 — 이게 없으면 고를 근거가 없다', async () => {
    const { parsePreemptionBoard } = await import('../analytics/lewordBoard');
    const p = parsePreemptionBoard(board).picks[0];
    expect(p.adClicks).toBeCloseTo(214.8);
    expect(p.openSlot).toBe(4);
    expect(p.topic).toBe('IT·컴퓨터');
  });

  it('빈 키워드는 버리고, 형태가 다르면 빈 결과', async () => {
    const { parsePreemptionBoard } = await import('../analytics/lewordBoard');
    expect(parsePreemptionBoard(board).picks.some((p) => !p.keyword.trim())).toBe(false);
    expect(parsePreemptionBoard(null).picks).toEqual([]);
    expect(parsePreemptionBoard({ rows: 'nope' }).picks).toEqual([]);
  });

  it('보드 주소가 정의돼 있다', async () => {
    const { LEWORD_PREEMPTION_URL } = await import('../analytics/lewordBoard');
    expect(LEWORD_PREEMPTION_URL).toMatch(/^https:\/\/.*preemption-board\.json$/);
  });
});
