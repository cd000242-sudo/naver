/**
 * 홈판 속도 실측 화면 모델(2026-11-02) — 앱이 공개본(/data/homefeed-stories.json)에 "추가"한 필드를 읽는다.
 *   stories[].newsBuckets : 최근 12시간 뉴스 기사 수(30분 구간, 센 값)
 *   stories[].lead        : 우리가 처음 본 시각 vs 뉴스 첫 기사 시각(앞섬 · 늦음 · 미측정)
 *   speedScoreboard       : 7일 속도 성적표
 *
 * 사장님 규칙: 실측 · 산술 · 사실만 보인다. 못 잰 것은 칸을 비우고 '미측정'. 단정 문구 · 확률 · 점수 칸은 만들지 않는다.
 * 구버전 공개본(필드 없음)이면 normalizeSpeedBoard 가 null 을 돌려주고 화면은 아무것도 그리지 않는다.
 * 순수 함수만 둔다(React · fetch 없음) — spa/tests/homefeed-speed.test.mjs 가 검사한다.
 */

const KNOWN_REASONS = ['censored', 'no_first_seen', 'sample_capped', 'no_news_sample', 'within_one_minute'];
const STATUSES = ['ahead', 'behind', 'unmeasured'];
const DEFAULT_RESOLUTION_MINUTES = 10;
const DEFAULT_WINDOW_DAYS = 7;
const MAX_BUCKETS = 96;

export const SPEED_REASON_LABEL = Object.freeze({
    censored: '앱이 꺼져 있던 구간이라 처음 본 시각을 믿을 수 없음',
    no_first_seen: '처음 본 시각이 없음',
    sample_capped: '기사가 많아 첫 기사가 표본 밖에 있을 수 있음',
    no_news_sample: '뉴스 표본이 없음',
    within_one_minute: '1분 안의 차이라 먼저 · 늦게를 가릴 수 없음',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isCount = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isTime = (value) => typeof value === 'string' && value !== '' && Number.isFinite(Date.parse(value));
const timeOrNull = (value) => (isTime(value) ? value : null);

/** 막대 데이터 검사 — 모양이 틀리면 null(칸을 비운다). counted 는 칸 합으로 다시 센다. */
export function normalizeBuckets(raw) {
    if (!isObject(raw) || !Array.isArray(raw.counts)) return null;
    if (raw.counts.length < 1 || raw.counts.length > MAX_BUCKETS || !raw.counts.every(isCount)) return null;
    if (!Number.isInteger(raw.bucketMinutes) || raw.bucketMinutes < 1 || !isTime(raw.endAt)) return null;
    return {
        endAt: raw.endAt,
        bucketMinutes: raw.bucketMinutes,
        counts: [...raw.counts],
        counted: raw.counts.reduce((sum, value) => sum + value, 0),
        undated: isCount(raw.undated) ? raw.undated : 0,
        outOfRange: isCount(raw.outOfRange) ? raw.outOfRange : 0,
    };
}

/** 판정 검사 — 앞섬/늦음은 분이 양수일 때만 인정하고, 아니면 null. 알 수 없는 사유는 비운다. */
export function normalizeLead(raw) {
    if (!isObject(raw) || !STATUSES.includes(raw.status)) return null;
    const resolutionMinutes = typeof raw.resolutionMinutes === 'number' && Number.isFinite(raw.resolutionMinutes) && raw.resolutionMinutes > 0
        ? raw.resolutionMinutes : DEFAULT_RESOLUTION_MINUTES;
    const base = { resolutionMinutes, firstSeenAt: timeOrNull(raw.firstSeenAt), firstNewsAt: timeOrNull(raw.firstNewsAt) };
    if (raw.status === 'unmeasured') {
        return { status: 'unmeasured', minutes: null, reason: KNOWN_REASONS.includes(raw.reason) ? raw.reason : null, ...base };
    }
    if (typeof raw.minutes !== 'number' || !Number.isFinite(raw.minutes) || raw.minutes <= 0) return null;
    return { status: raw.status, minutes: raw.minutes, reason: null, ...base };
}

/** 성적표 검사 — 숫자가 하나라도 틀리면 null. */
export function normalizeScoreboard(raw) {
    if (!isObject(raw) || typeof raw.ready !== 'boolean') return null;
    const counts = ['windowDays', 'measuredDays', 'total', 'ahead', 'behind', 'unmeasured'];
    if (!counts.every((key) => isCount(raw[key]))) return null;
    const reasons = {};
    if (isObject(raw.unmeasuredReasons)) {
        for (const reason of KNOWN_REASONS) if (isCount(raw.unmeasuredReasons[reason]) && raw.unmeasuredReasons[reason] > 0) reasons[reason] = raw.unmeasuredReasons[reason];
    }
    return {
        windowDays: raw.windowDays || DEFAULT_WINDOW_DAYS,
        measuredDays: raw.measuredDays,
        ready: raw.ready,
        total: raw.total,
        ahead: raw.ahead,
        behind: raw.behind,
        unmeasured: raw.unmeasured,
        unmeasuredReasons: reasons,
        resolutionMinutes: typeof raw.resolutionMinutes === 'number' && raw.resolutionMinutes > 0 ? raw.resolutionMinutes : DEFAULT_RESOLUTION_MINUTES,
    };
}

/**
 * 공개본 → 화면 모델. 새 필드가 하나도 없으면(구버전 공개본) null — 화면은 아무것도 그리지 않는다.
 * 소재 순서는 공개본 그대로(다시 줄세우지 않는다).
 */
export function normalizeSpeedBoard(raw) {
    if (!isObject(raw) || !Array.isArray(raw.stories)) return null;
    const cards = raw.stories
        .filter((story) => isObject(story) && typeof story.keyword === 'string' && story.keyword.trim() !== '')
        .map((story) => ({
            id: typeof story.id === 'string' && story.id ? story.id : story.keyword,
            keyword: story.keyword.trim(),
            category: typeof story.category === 'string' ? story.category : '',
            buckets: normalizeBuckets(story.newsBuckets),
            lead: normalizeLead(story.lead),
        }));
    const scoreboard = normalizeScoreboard(raw.speedScoreboard);
    if (!scoreboard && !cards.some((card) => card.buckets || card.lead)) return null;
    return {
        publishedAt: timeOrNull(raw.publishedAt),
        snapshotAt: timeOrNull(raw.snapshotAt),
        scoreboard,
        cards,
    };
}

/** 분 → "N분" / "N시간 M분". */
export function formatMinutes(minutes) {
    const total = Math.round(minutes);
    if (total < 60) return `${total}분`;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/** 배지 문구. 앞섬/늦음은 잰 분만, 못 쟀으면 '미측정' + 사유. 오차 한계는 잰 경우에만 붙인다. */
export function leadBadge(lead) {
    if (!lead || lead.status === 'unmeasured') {
        return { tone: 'unmeasured', text: '미측정', detail: lead?.reason ? SPEED_REASON_LABEL[lead.reason] : '', note: '' };
    }
    const direction = lead.status === 'ahead' ? '먼저' : '늦게';
    return {
        tone: lead.status,
        text: `뉴스 첫 기사보다 ${formatMinutes(lead.minutes)} ${direction}`,
        detail: '',
        note: `수집 ${lead.resolutionMinutes}분 간격 기준`,
    };
}

/** 성적표 한 줄. 7일을 못 채웠으면(ready:false) '기록 쌓는 중'만 — 건수 · 비율 문구는 만들지 않는다. */
export function scoreboardLine(scoreboard) {
    if (!scoreboard) return null;
    if (!scoreboard.ready) {
        return { ready: false, text: `속도 기록 쌓는 중 (측정 ${scoreboard.measuredDays}일/${scoreboard.windowDays}일)`, detail: '' };
    }
    const reasons = Object.entries(scoreboard.unmeasuredReasons)
        .map(([reason, count]) => `${SPEED_REASON_LABEL[reason]} ${count}건`).join(' · ');
    return {
        ready: true,
        text: `최근 ${scoreboard.windowDays}일 · 앞섬 ${scoreboard.ahead}건 · 늦음 ${scoreboard.behind}건 · 미측정 ${scoreboard.unmeasured}건`,
        detail: [`수집 ${scoreboard.resolutionMinutes}분 간격 기준`, reasons && `미측정 사유: ${reasons}`].filter(Boolean).join(' · '),
    };
}

/** 한국 시각 HH:MM (일광절약 없음). */
export function kstClock(iso) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const shifted = new Date(ms + 9 * 3_600_000);
    const pad = (value) => String(value).padStart(2, '0');
    return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** 막대 SVG 좌표. 센 값에 비례할 뿐 다듬지 않는다(0 은 높이 0, 1 이상은 최소 2px). */
export function barGeometry(buckets, { width = 240, height = 56, gap = 2 } = {}) {
    const count = buckets.counts.length;
    const max = Math.max(1, ...buckets.counts);
    const barWidth = Math.max(1, (width - gap * (count - 1)) / count);
    const bars = buckets.counts.map((value, index) => {
        const barHeight = value === 0 ? 0 : Math.max(2, (value / max) * height);
        return { index, count: value, x: index * (barWidth + gap), y: height - barHeight, width: barWidth, height: barHeight };
    });
    return { width, height, max, bars };
}

/** 막대 아래 글: 창 길이 · 센 기사 수 · 뺀 기사 수. */
export function bucketCaption(buckets) {
    const totalMinutes = buckets.counts.length * buckets.bucketMinutes;
    const span = totalMinutes % 60 === 0 ? `${totalMinutes / 60}시간` : `${totalMinutes}분`;
    const parts = [`최근 ${span} 뉴스 기사 ${buckets.counted}건`, '서로 다른 제목 기준'];
    if (buckets.undated > 0) parts.push(`시각 없는 ${buckets.undated}건 제외`);
    if (buckets.outOfRange > 0) parts.push(`범위 밖 ${buckets.outOfRange}건 제외`);
    return parts.join(' · ');
}

/** 막대 양 끝 글: 왼쪽 = 창 시작, 오른쪽 = 수집 시각. */
export function bucketAxis(buckets) {
    const totalMinutes = buckets.counts.length * buckets.bucketMinutes;
    const left = totalMinutes % 60 === 0 ? `${totalMinutes / 60}시간 전` : `${totalMinutes}분 전`;
    return { left, right: `${kstClock(buckets.endAt)} 수집` };
}
