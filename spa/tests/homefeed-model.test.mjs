/**
 * 홈판 신호 화면 모델 — 미측정 표기 · 필터 · 정렬 · 보정 표 문장(사장님 명령서 STORY RADAR v2.0, 2026-09-16).
 * 못 잰 값은 '미측정'이고 0 으로 채우지 않는다. 표본이 적으면 비율을 내지 않는다. 확률 · 점수라는 말을 쓰지 않는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/lib/homefeedModel.mjs';

const story = (keyword, patch = {}) => ({
    keyword,
    category: 'sports',
    anchor: { text: keyword.split(' ')[0] },
    window: { state: 'OPEN' },
    status: { state: 'NOW' },
    signals: { ageMinutes: 30, firstSeenCensored: false, docAcceleration: 5, sourceCountNow: 2 },
    funGap: [{ flag: 'strong_quote' }],
    noSearchPassed: true,
    payoffCount: 2,
    thumbnail: { readiness: 'READY' },
    ...patch,
});

test('못 잰 값은 미측정 — 0 은 잰 값이라 그대로 적는다', () => {
    assert.equal(model.formatCount(null), '미측정');
    assert.equal(model.formatCount(0), '0');
    assert.equal(model.formatCount(12345, '건'), '12,345건');
    assert.equal(model.formatSigned(0), '±0');
    assert.equal(model.formatSigned(-3, '곳'), '−3곳');
    assert.equal(model.formatVelocity(undefined), '미측정');
});

test('순위 변화는 음수가 상승이다', () => {
    assert.equal(model.formatRankDelta(-5), '▲5');
    assert.equal(model.formatRankDelta(3), '▼3');
    assert.equal(model.formatRankDelta(0), '변화 없음');
    assert.equal(model.formatRankDelta(null), '미측정');
});

test('나이는 기록 시작 전부터 떠 있었을 수 있으면 하한으로만 말한다', () => {
    assert.equal(model.formatAge(40, false), '40분 전 처음 봄');
    assert.equal(model.formatAge(90, true), '기록 이후 1시간 30분 이상');
    assert.equal(model.formatAge(null, false), '미측정');
});

test('포화 · 지속은 실제 표본 수 · 실제 수집 횟수로 적는다(/10 같은 가정 분모 없음)', () => {
    assert.equal(model.formatSaturation(7, 3), '표본 7건 중 비슷한 제목 3건');
    assert.equal(model.formatSaturation(0, null), '기사 표본 없음');
    assert.equal(model.formatSaturation(5, null), '미측정');
    assert.equal(model.formatPresence({ seen: 5, total: 6 }), '최근 60분 수집 6회 중 5회 등장');
    assert.equal(model.formatPresence({ seen: 0, total: 0 }), '미측정');
});

test('시각은 한국 시간으로 적는다', () => {
    assert.match(model.formatTime('2026-09-15T22:20:13.886Z'), /07:20/);
    assert.equal(model.formatTime('없음'), '미측정');
});

test('기본 필터는 지금 · 이른 신호 · 지켜보기만, 기간 필터는 검열된 나이를 뺀다', () => {
    const rows = [
        story('손흥민 이적'),
        story('유튜버 복귀', { status: { state: 'LATE' } }),
        story('신차 공개', { status: { state: 'EARLY' }, signals: { ageMinutes: 20, firstSeenCensored: true, docAcceleration: null, sourceCountNow: 1 } }),
        story('금리 인하', { category: 'money', status: { state: 'WATCH' }, signals: { ageMinutes: 200, firstSeenCensored: false, docAcceleration: 1, sourceCountNow: 3 }, funGap: [], noSearchPassed: false, payoffCount: 1, thumbnail: { readiness: 'NEEDS_AI' } }),
    ];
    assert.deepEqual(model.filterStories(rows, model.DEFAULT_FILTERS).map((row) => row.keyword), ['손흥민 이적', '신차 공개', '금리 인하']);
    assert.deepEqual(model.filterStories(rows, { ...model.DEFAULT_FILTERS, period: '60' }).map((row) => row.keyword), ['손흥민 이적']);
    assert.deepEqual(model.filterStories(rows, { ...model.DEFAULT_FILTERS, status: 'all', funGap: true, noSearch: true, payoff2: true, visualReady: true }).map((row) => row.keyword), ['손흥민 이적', '유튜버 복귀', '신차 공개']);
    assert.deepEqual(model.filterStories(rows, { ...model.DEFAULT_FILTERS, category: 'money' }).map((row) => row.keyword), ['금리 인하']);
    assert.deepEqual(model.filterStories(rows, { ...model.DEFAULT_FILTERS, status: 'all', query: '손흥 민' }).map((row) => row.keyword), ['손흥민 이적']);
});

test('정렬 — 기본은 앱이 준 창 순서, 나이는 젊은 것 먼저 · 모르는 나이는 뒤, 가속은 미측정을 뒤로', () => {
    const rows = [
        story('A', { signals: { ageMinutes: 90, firstSeenCensored: false, docAcceleration: null, sourceCountNow: 1 } }),
        story('B', { signals: { ageMinutes: 10, firstSeenCensored: true, docAcceleration: 3, sourceCountNow: 3 } }),
        story('C', { signals: { ageMinutes: 20, firstSeenCensored: false, docAcceleration: 9, sourceCountNow: 2 } }),
    ];
    assert.deepEqual(model.sortStories(rows, 'window').map((row) => row.keyword), ['A', 'B', 'C']);
    assert.deepEqual(model.sortStories(rows, 'age').map((row) => row.keyword), ['C', 'A', 'B']);
    assert.deepEqual(model.sortStories(rows, 'acceleration').map((row) => row.keyword), ['C', 'B', 'A']);
    assert.deepEqual(model.sortStories(rows, 'sources').map((row) => row.keyword), ['B', 'C', 'A']);
    assert.deepEqual(rows.map((row) => row.keyword), ['A', 'B', 'C']);
});

test('원천 상태는 건너뜀 · 오류 · 정상으로 가른다', () => {
    const health = model.sourceHealth([
        { name: 'signal.bz', skipped: false, consecutiveFailures: 0, lastSuccessAt: 'x', lastError: null },
        { name: 'google', skipped: false, consecutiveFailures: 2, lastSuccessAt: null, lastError: '목록이 비었습니다' },
        { name: 'naver-news', skipped: true, consecutiveFailures: 0, lastSuccessAt: null, lastError: null },
    ]);
    assert.deepEqual([health.ok, health.error, health.skipped], [1, 1, 1]);
    assert.equal(health.rows[1].label, '구글 트렌드');
});

test('보정 표 문장 — 5건 전엔 수치를 숨기고, 20건 전엔 비율을 내지 않는다', () => {
    assert.equal(model.calibrationText({ display: 'sample_short', n: 3, entered: null, medianRecommend24h: null, p25: null, p75: null, entryRate: null }), '표본 부족(3건 — 5건부터 수치를 보여 줍니다)');
    const counts = model.calibrationText({ display: 'counts', n: 6, entered: 3, medianRecommend24h: 10, p25: null, p75: null, entryRate: null });
    assert.match(counts, /6건 중 피드 진입 3건/);
    assert.doesNotMatch(counts, /%/);
    assert.match(model.calibrationText({ display: 'rates', n: 20, entered: 15, medianRecommend24h: 9, p25: 0, p75: 14, entryRate: 0.75 }), /75%/);
});

test('사유 코드는 사람 말로, 모르는 코드는 그대로', () => {
    assert.equal(model.reasonLabel('NO_SEARCH_FAILED'), '검색 없이 이해되기 어렵다');
    assert.equal(model.reasonLabel('SOMETHING_NEW'), 'SOMETHING_NEW');
});

test('라벨 어디에도 확률 · 점수 · 사용 가능이라는 말이 없다', () => {
    const labels = [
        model.WINDOW_LABEL, model.STATUS_LABEL, model.CATEGORY_LABEL, model.TENSION_LABEL, model.FUN_GAP_LABEL, model.STRATEGY_LABEL,
        model.READINESS_LABEL, model.VERDICT_LABEL, model.TRIGGER_LABEL, model.SOURCE_LABEL, model.RIGHTS_LABEL, model.WATERMARK_LABEL,
    ].flatMap((table) => Object.values(table));
    for (const label of labels) assert.doesNotMatch(label, /확률|점수|사용\s?가능/, label);
    assert.equal(model.RIGHTS_LABEL.rights_check_required, '권리 확인 필요');
});
