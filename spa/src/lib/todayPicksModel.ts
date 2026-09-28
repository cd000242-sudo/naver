export const FREE_PICK_ROWS = 3;

interface PickCountRow { ratio: number; seasonPeakMonth?: number }
interface PickCountTopic { rows: PickCountRow[]; targetCount?: number; shortfall?: number; golden?: number }
export interface PickTopicSummary { total: number; target: number; shortfall: number; golden: number; seasonal: number; general: number }

export function visiblePickRows<T>(rows: T[], unlocked: boolean): T[] {
    return unlocked ? [...rows] : rows.slice(0, FREE_PICK_ROWS);
}

export function summarizePickTopic(topic: PickCountTopic, minRatio = 1, fallbackTarget = 30): PickTopicSummary {
    const validTarget = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
    const target = validTarget(topic.targetCount) ? topic.targetCount : validTarget(fallbackTarget) ? fallbackTarget : 30;
    const golden = topic.rows.filter((row) => Number.isFinite(row.ratio) && row.ratio >= minRatio).length;
    const seasonal = topic.rows.filter((row) => !(Number.isFinite(row.ratio) && row.ratio >= minRatio)
        && Number.isInteger(row.seasonPeakMonth) && row.seasonPeakMonth! >= 1 && row.seasonPeakMonth! <= 12).length;
    return { total: topic.rows.length, target, shortfall: Math.max(0, target - topic.rows.length), golden, seasonal, general: topic.rows.length - golden - seasonal };
}

export function pickCountText(summary: PickTopicSummary): string {
    return `전체 ${summary.total}개 / 목표 ${summary.target}개 · 황금 ${summary.golden} · 시즌 앞 ${summary.seasonal} · 일반 ${summary.general}`;
}

export function pickFreshnessLabel(row: { freshness?: { status: 'new' | 'repeated'; lastShownAt?: string } }): string | null {
    if (row.freshness?.status !== 'repeated') return null;
    const time = row.freshness.lastShownAt ? new Date(row.freshness.lastShownAt) : null;
    return time && Number.isFinite(time.getTime())
        ? `재추천 · ${time.toLocaleDateString('ko-KR', {timeZone:'Asia/Seoul', month:'long', day:'numeric'})} 노출`
        : '재추천';
}
