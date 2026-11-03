/**
 * 홈판 속도 실측 화면 모델(2026-11-02) — 앱이 공개본에 추가한 newsBuckets · lead · speedScoreboard 를 읽는다.
 * 사장님 규칙: 실측 · 산술 · 사실만. 못 잰 것은 '미측정', 단정 문구 · 확률 · 점수 칸은 없다. 구버전 공개본이면 아무것도 그리지 않는다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    barGeometry, bucketAxis, bucketCaption, formatMinutes, kstClock, leadBadge, normalizeBuckets, normalizeLead,
    normalizeScoreboard, normalizeSpeedBoard, scoreboardLine, SPEED_REASON_LABEL,
} from '../src/lib/homefeedSpeedModel.mjs';

const counts = Array.from({ length: 24 }, () => 0);
counts[23] = 4;
counts[20] = 2;
const buckets = { endAt: '2026-11-01T15:00:00.000Z', bucketMinutes: 30, counts, counted: 6, undated: 1, outOfRange: 0 };
const ahead = { status: 'ahead', minutes: 6, reason: null, resolutionMinutes: 10, firstSeenAt: '2026-11-01T14:20:00.000Z', firstNewsAt: '2026-11-01T14:26:00.000Z' };
const behind = { ...ahead, status: 'behind', minutes: 95 };
const unmeasured = { status: 'unmeasured', minutes: null, reason: 'censored', resolutionMinutes: 10, firstSeenAt: '2026-11-01T14:20:00.000Z', firstNewsAt: null };
const scoreboard = { windowDays: 7, measuredDays: 3, ready: false, total: 12, ahead: 5, behind: 3, unmeasured: 4, unmeasuredReasons: { censored: 3, sample_capped: 1 }, resolutionMinutes: 10 };
const story = (keyword, extra = {}) => ({ id: `${keyword}:1`, keyword, category: 'sports', ...extra });

test('구버전 공개본(새 필드 없음)이면 null — 화면은 아무것도 그리지 않는다', () => {
    assert.equal(normalizeSpeedBoard({ stories: [story('가'), story('나')] }), null);
    assert.equal(normalizeSpeedBoard(null), null);
    assert.equal(normalizeSpeedBoard({ stories: '목록아님' }), null);
    assert.equal(normalizeSpeedBoard({ stories: [] }), null);
});

test('새 필드가 있으면 소재 순서 그대로 카드를 만들고, 필드가 틀린 소재는 그 칸만 비운다', () => {
    const board = normalizeSpeedBoard({
        publishedAt: '2026-11-01T15:01:00.000Z',
        stories: [story('가', { newsBuckets: buckets, lead: ahead }), story('나', { newsBuckets: { counts: 'x' }, lead: { status: '빠름' } }), story('다')],
        speedScoreboard: scoreboard,
    });
    assert.deepEqual(board.cards.map((card) => card.keyword), ['가', '나', '다']);
    assert.equal(board.cards[0].buckets.counted, 6);
    assert.equal(board.cards[0].lead.status, 'ahead');
    assert.equal(board.cards[1].buckets, null);
    assert.equal(board.cards[1].lead, null);
    assert.equal(board.scoreboard.measuredDays, 3);
});

test('성적표만 있어도 판은 그리고(소재 필드는 비움), 성적표 숫자가 틀리면 성적표만 비운다', () => {
    assert.ok(normalizeSpeedBoard({ stories: [story('가')], speedScoreboard: scoreboard }));
    assert.equal(normalizeScoreboard({ ...scoreboard, ahead: -1 }), null);
    assert.equal(normalizeScoreboard({ ...scoreboard, ready: 'yes' }), null);
    assert.equal(normalizeSpeedBoard({ stories: [story('가')], speedScoreboard: { ahead: 'many' } }), null);
});

test('막대 검사: 칸 수 · 값이 틀리면 null, counted 는 칸 합으로 다시 센다', () => {
    assert.equal(normalizeBuckets({ ...buckets, counts: [1, -1] }), null);
    assert.equal(normalizeBuckets({ ...buckets, counts: [] }), null);
    assert.equal(normalizeBuckets({ ...buckets, endAt: '시각아님' }), null);
    assert.equal(normalizeBuckets({ ...buckets, counted: 999 }).counted, 6);
});

test('판정 검사: 앞섬/늦음은 분이 양수일 때만, 모르는 사유는 비운다', () => {
    assert.equal(normalizeLead({ ...ahead, minutes: 0 }), null);
    assert.equal(normalizeLead({ ...ahead, minutes: null }), null);
    assert.equal(normalizeLead({ ...unmeasured, reason: '이상한사유' }).reason, null);
    assert.equal(normalizeLead({ ...ahead, resolutionMinutes: 'x' }).resolutionMinutes, 10);
});

test('배지: 앞섬 · 늦음은 잰 분과 수집 간격 오차 문구, 미측정은 사유만', () => {
    assert.deepEqual(leadBadge(ahead), { tone: 'ahead', text: '뉴스 첫 기사보다 6분 먼저', detail: '', note: '수집 10분 간격 기준' });
    assert.deepEqual(leadBadge(behind), { tone: 'behind', text: '뉴스 첫 기사보다 1시간 35분 늦게', detail: '', note: '수집 10분 간격 기준' });
    assert.deepEqual(leadBadge(unmeasured), { tone: 'unmeasured', text: '미측정', detail: SPEED_REASON_LABEL.censored, note: '' });
    assert.deepEqual(leadBadge(null), { tone: 'unmeasured', text: '미측정', detail: '', note: '' });
});

test('분 표기', () => {
    assert.equal(formatMinutes(1), '1분');
    assert.equal(formatMinutes(59.6), '1시간');
    assert.equal(formatMinutes(120), '2시간');
    assert.equal(formatMinutes(125), '2시간 5분');
});

test('성적표 한 줄: 7일 미만이면 "기록 쌓는 중"만 — 건수 · 비율 문구가 없다', () => {
    const line = scoreboardLine(normalizeScoreboard(scoreboard));
    assert.equal(line.ready, false);
    assert.equal(line.text, '속도 기록 쌓는 중 (측정 3일/7일)');
    assert.equal(line.detail, '');
    assert.doesNotMatch(line.text, /앞섬|늦음|%|건/);
    assert.equal(scoreboardLine(null), null);
});

test('성적표 한 줄: 7일을 채웠을 때만 숫자를 사실 그대로 보인다', () => {
    const line = scoreboardLine(normalizeScoreboard({ ...scoreboard, ready: true, measuredDays: 7 }));
    assert.equal(line.ready, true);
    assert.equal(line.text, '최근 7일 · 앞섬 5건 · 늦음 3건 · 미측정 4건');
    assert.match(line.detail, /수집 10분 간격 기준/);
    assert.match(line.detail, /앱이 꺼져 있던 구간/);
    assert.doesNotMatch(line.text, /%/);
});

test('막대 좌표: 센 값에 비례하고 0 은 높이 0, 입력은 바꾸지 않는다', () => {
    const clean = normalizeBuckets(buckets);
    const frozen = JSON.stringify(clean);
    const geo = barGeometry(clean, { width: 240, height: 56, gap: 2 });
    assert.equal(geo.bars.length, 24);
    assert.equal(geo.max, 4);
    assert.equal(geo.bars[23].height, 56);
    assert.equal(geo.bars[20].height, 28);
    assert.equal(geo.bars[0].height, 0);
    assert.equal(geo.bars[0].y, 56);
    const last = geo.bars[23];
    assert.ok(last.x + last.width <= 240 + 1e-9);
    assert.equal(JSON.stringify(clean), frozen);
    // 기사가 1건뿐이어도 보이게 최소 2px
    const tiny = normalizeBuckets({ ...buckets, counts: [0, 1, 100] });
    assert.equal(barGeometry(tiny).bars[1].height, 2);
});

test('막대 글: 창 길이 · 센 수 · 뺀 수, 양 끝은 창 시작과 수집 시각(한국 시각)', () => {
    const clean = normalizeBuckets(buckets);
    assert.equal(bucketCaption(clean), '최근 12시간 뉴스 기사 6건 · 서로 다른 제목 기준 · 시각 없는 1건 제외');
    assert.deepEqual(bucketAxis(clean), { left: '12시간 전', right: '00:00 수집' });
    assert.equal(kstClock('2026-11-01T15:30:00.000Z'), '00:30');
    assert.equal(kstClock('x'), '');
});

test('화면 문구에는 단정 표현 · 확률 · 점수가 없다', () => {
    const clean = normalizeBuckets(buckets);
    const texts = [
        ...Object.values(SPEED_REASON_LABEL),
        ...[ahead, behind, unmeasured, null].flatMap((lead) => Object.values(leadBadge(lead))),
        scoreboardLine(normalizeScoreboard(scoreboard)).text,
        ...Object.values(scoreboardLine(normalizeScoreboard({ ...scoreboard, ready: true, measuredDays: 7 }))),
        bucketCaption(clean), ...Object.values(bucketAxis(clean)),
    ];
    for (const text of texts) assert.doesNotMatch(String(text), /빠르|가장 빠|실시간 1위|1위|확률|점수|예상|추정/);
});
