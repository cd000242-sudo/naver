export type GoldenFocus = 'all' | 'economy' | 'rising' | 'high-rising';
export type ShortTermTrend = {
    status: 'rising' | 'flat' | 'falling' | 'unknown';
    ratio: number | null;
    measuredAt: string | null;
    windowEnd: string | null;
    series: Array<{ period: string; ratio: number }>;
};
type FocusRow = {
    keyword?: string;
    topic?: string;
    measuredAt?: string | null;
    money?: { value: number } | null;
    shortTermTrend?: ShortTermTrend | null;
    demandSeries?: unknown[] | null;
    trendLabel?: string;
};
const DAY = 86_400_000;
const ECONOMIC_TOPIC = /비즈니스|경제|금융|재테크|부동산|지원금|정책/;
const ECONOMIC_KEYWORD = /지원금|장려금|보조금|정책자금|소상공인|사업자|창업|고용보험|실업급여|대출|예금|적금|금리|환급|소득세|부가세|연말정산|세액공제|청약|월세지원|전세보증/;

export function isEconomicKeyword(row: FocusRow): boolean {
    return ECONOMIC_TOPIC.test(row.topic || '') || ECONOMIC_KEYWORD.test((row.keyword || '').replace(/\s/g, ''));
}

function fresh(iso: string | null | undefined, now: number, days = 7): boolean {
    const time = Date.parse(iso || '');
    return Number.isFinite(time) && time <= now && now - time <= days * DAY;
}

/** A fresh publication cannot turn old SERP measurements or monthly curves into a recent trend. */
export function recentRiseRatio(row: FocusRow, now = Date.now()): number | null {
    const trend = row.shortTermTrend;
    const today = Math.floor((now + 9 * 3_600_000) / DAY) * DAY;
    const end = Date.parse(trend?.windowEnd || '');
    if (!trend || trend.status !== 'rising' || !fresh(row.measuredAt, now)
        || !fresh(trend.measuredAt, now, 3) || !Number.isFinite(end) || end >= today || today - end > 3 * DAY
        || typeof trend.ratio !== 'number' || !Number.isFinite(trend.ratio) || trend.ratio < 1.2) return null;
    const points = Array.isArray(trend.series) ? trend.series.slice(-14) : [];
    if (points.length !== 14) return null;
    const dates = points.map(point => Date.parse(point.period));
    if (points.some((point, i) => !/^\d{4}-\d{2}-\d{2}$/.test(point.period)
        || !Number.isFinite(dates[i]) || dates[i] > now || new Date(dates[i]).toISOString().slice(0, 10) !== point.period
        || typeof point.ratio !== 'number' || !Number.isFinite(point.ratio) || point.ratio < 0 || point.ratio > 100
        || (i > 0 && dates[i] - dates[i - 1] !== DAY))) return null;
    if (dates[13] !== end) return null;
    const before = points.slice(0, 7).reduce((sum, point) => sum + point.ratio, 0);
    const recent = points.slice(7).reduce((sum, point) => sum + point.ratio, 0);
    const ratio = before > 0 ? recent / before : null;
    if (ratio === null || ratio < 1.2 || Math.abs(ratio - trend.ratio) > 0.01) return null;
    return trend.ratio;
}

export function matchesGoldenFocus(row: FocusRow, focus: GoldenFocus, now = Date.now()): boolean {
    if (focus === 'economy') return isEconomicKeyword(row);
    if (focus === 'rising') return recentRiseRatio(row, now) !== null;
    if (focus === 'high-rising') return recentRiseRatio(row, now) !== null && Number.isFinite(row.money?.value) && (row.money?.value ?? 0) >= 3000;
    return true;
}

export function goldenFocusPriority(row: FocusRow, now = Date.now()): number {
    return (isEconomicKeyword(row) ? 0 : 2) + (recentRiseRatio(row, now) !== null ? 0 : 1);
}

export function summarizeGoldenFocus(rows: FocusRow[], now = Date.now()) {
    return {
        total: rows.length,
        economy: rows.filter(isEconomicKeyword).length,
        rising: rows.filter(row => matchesGoldenFocus(row, 'rising', now)).length,
        highRising: rows.filter(row => matchesGoldenFocus(row, 'high-rising', now)).length,
        stale: rows.filter(row => !fresh(row.measuredAt, now)).length,
    };
}

export function goldenMeasurementLabel(row: FocusRow, now = Date.now()): string {
    const time = Date.parse(row.measuredAt || '');
    if (!Number.isFinite(time) || time > now) return '검색결과 확인일 없음';
    const date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(time);
    return `검색결과 확인 ${date}${fresh(row.measuredAt, now) ? '' : ' · 재확인 필요'}`;
}

export function goldenTrendLabel(row: FocusRow, now = Date.now()): string {
    const ratio = recentRiseRatio(row, now);
    if (ratio !== null) return `최근 7일 수요 ${ratio.toFixed(2)}배`;
    if (row.demandSeries?.length && row.trendLabel && row.trendLabel !== '판정불가') return `장기 추세 · ${row.trendLabel}`;
    return '최근 추세 미확인';
}
