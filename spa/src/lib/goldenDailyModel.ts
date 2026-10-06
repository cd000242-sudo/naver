import type { PreemptionRow } from '../components/leword/PreemptionCard';
import { recentRiseRatio } from './goldenFocusModel';
import { preemptionIndex, TIER_ORDER } from './preemptionIndex';

export type GoldenDailyView = 'today' | 'recent' | 'archive';
export type GoldenDailyStatus = { view: GoldenDailyView; reason: string };
const DAY = 86_400_000;
const KST = 9 * 3_600_000;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const kstDay = (time: number) => Math.floor((time + KST) / DAY);

/** Reject ambiguous local dates and rolled-over calendar dates rather than guessing freshness. */
function measurementTime(value: string | null | undefined, now: number): number | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const time = Date.parse(value);
    const calendar = value.slice(0, 10);
    const day = Date.parse(`${calendar}T00:00:00Z`);
    if (!Number.isFinite(time) || !Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== calendar || time > now) return null;
    return time;
}

/** A separate SERP timestamp cannot be made fresh by a newer row publication. */
export function goldenDailyCheckedAt(row: PreemptionRow, now = Date.now()): number | null {
    const measured = measurementTime(row.measuredAt, now);
    if (measured === null) return null;
    const metrics = row as PreemptionRow & { searchVolumeMeasuredAt?: string | null; documentCountMeasuredAt?: string | null };
    let oldest = measured;
    for (const value of [row.serp?.measuredAt, metrics.searchVolumeMeasuredAt, metrics.documentCountMeasuredAt]) {
        if (value === undefined) continue;
        const time = measurementTime(value, now);
        if (time === null) return null;
        oldest = Math.min(oldest, time);
    }
    return oldest;
}

function competitionAvailable(row: PreemptionRow): boolean {
    const serp = row.serp;
    if (!serp || row.frontalSaturated || ['LOCKED', 'CONTESTED', 'NO_DATA'].includes(serp.verdict || '')) return false;
    const sampled = serp.sampledTitles;
    const exact = serp.exactTitleHits;
    if (!Number.isInteger(sampled) || sampled < 3 || !Number.isInteger(exact) || exact < 0 || exact > sampled || exact / sampled >= 0.8) return false;
    const openSlot = Array.isArray(serp.slots) && serp.slots.some(slot => Number.isInteger(slot.rank)
        && slot.rank >= 1 && slot.rank <= 10 && typeof slot.title === 'string' && slot.title.trim().length > 0
        && finite(slot.coverage) && slot.coverage >= 0 && slot.coverage < 0.6);
    return exact / sampled < 0.6 || openSlot;
}

/** Recompute recurring season distance using today's month, not a cached monthsToPeak value. */
function seasonDistance(row: PreemptionRow, now: number): number | null {
    if (!row.peakRecurring || !Number.isInteger(row.peakMonth) || row.peakMonth! < 1 || row.peakMonth! > 12) return null;
    const month = new Date(now + KST).getUTCMonth() + 1;
    return (row.peakMonth! - month + 12) % 12;
}

function seasonOutdated(row: PreemptionRow, now: number): boolean {
    if (row.timingGroup === '준비 시기' || row.timingGroup === '성수기 지남') return true;
    const distance = seasonDistance(row, now);
    // Actual short-term growth may override a historical seasonal pattern, never a label alone.
    return distance !== null && distance > 1 && recentRiseRatio(row, now) === null;
}

export function goldenDailyStatus(row: PreemptionRow, now = Date.now()): GoldenDailyStatus {
    const archive = (reason: string): GoldenDailyStatus => ({ view: 'archive', reason });
    if (!Number.isFinite(now)) return archive('확인 기준 시각을 읽을 수 없습니다');
    const checked = goldenDailyCheckedAt(row, now);
    if (checked === null) return archive('검색결과 확인 시각이 없거나 유효하지 않습니다');
    const rejection = (row as PreemptionRow & { revalidation?: { status: string; checkedAt: string; reason?: string } }).revalidation;
    const rejectedAt = rejection?.status === 'rejected' ? measurementTime(rejection.checkedAt, now) : null;
    const measured = measurementTime(row.measuredAt, now);
    if (rejectedAt !== null && measured !== null && rejectedAt >= measured) {
        const reason = typeof rejection?.reason === 'string' ? rejection.reason.trim().slice(0, 200) : '';
        return archive(reason ? `최근 재검증에서 제외: ${reason}` : '최근 재검증에서 추천 기준을 통과하지 못했습니다');
    }
    if (now - checked > 7 * DAY) return archive('검색결과를 확인한 지 7일이 지나 재확인이 필요합니다');
    if (!finite(row.searchVolume) || row.searchVolume <= 0 || row.searchVolumeLt10
        || !finite(row.documentCount) || row.documentCount <= 0) return archive('월 검색량·문서수 실측 확인이 필요합니다');
    const index = preemptionIndex(row);
    if (index.tier !== 'ultra' && index.tier !== 'golden') return archive('검색량·문서수 기준 황금 등급에 아직 미달합니다');
    if (!competitionAvailable(row)) return archive('검색 상위 글의 경쟁 여지를 다시 확인해야 합니다');
    if (seasonOutdated(row, now)) return archive('현재 작성 시기와 맞는지 다시 확인할 시즌 키워드입니다');
    const view = kstDay(checked) === kstDay(now) ? 'today' : 'recent';
    const reason = recentRiseRatio(row, now) !== null ? '최근 7일 수요 상승과 검색 경쟁 여지를 확인했습니다'
        : seasonDistance(row, now) !== null ? '현재 시즌의 검색 수요와 경쟁 여지를 확인했습니다'
            : row.timingGroup === '연중 상시' ? '연중 검색되는 주제로 검색 경쟁 여지를 확인했습니다'
                : '월 검색량·문서수와 검색 상위 글의 경쟁 여지를 확인했습니다';
    return { view, reason };
}

function priority(row: PreemptionRow, now: number): number[] {
    const rise = recentRiseRatio(row, now);
    const season = seasonDistance(row, now);
    const index = preemptionIndex(row);
    return [rise === null ? 1 : 0, -(rise || 0), season !== null && season <= 1 ? 0 : 1,
        -(finite(row.money?.value) ? row.money.value : 0), -(finite(row.serp?.adCount) ? row.serp.adCount : 0),
        TIER_ORDER[index.tier], -(finite(index.worth) ? index.worth : 0), -(goldenDailyCheckedAt(row, now) || 0)];
}

/** Stable, evidence-based order; never shuffle scores or mutate the board/free sample. */
export function selectGoldenDailyRows<T extends PreemptionRow>(rows: readonly T[], view: GoldenDailyView, now = Date.now()): T[] {
    return rows.filter(row => goldenDailyStatus(row, now).view === view)
        .map(row => ({ row, keys: priority(row, now) }))
        .sort((a, b) => {
            for (let i = 0; i < a.keys.length; i++) {
                if (a.keys[i] !== b.keys[i]) return a.keys[i] - b.keys[i];
            }
            return a.row.keyword < b.row.keyword ? -1 : a.row.keyword > b.row.keyword ? 1 : 0;
        }).map(item => item.row);
}

export function summarizeGoldenDaily(rows: readonly PreemptionRow[], now = Date.now()): Record<GoldenDailyView, number> {
    const summary = { today: 0, recent: 0, archive: 0 };
    for (const row of rows) summary[goldenDailyStatus(row, now).view]++;
    return summary;
}

/**
 * 처음 열 보기 — 비어 있지 않은 첫 보기(오늘 → 최근 7일 → 전체 보관). 2026-10-06 사장님 "선점보드가 불완전한 것 같은데":
 * 회차가 없는 날은 '오늘 확인'이 0행이라 판이 빈 것처럼 보였다. 버튼 · 개수는 그대로라 무엇을 보는지는 화면에 드러난다.
 */
export function defaultGoldenDailyView(summary: Record<GoldenDailyView, number>): 'today' | 'recent' | 'all' {
    if (summary.today > 0) return 'today';
    if (summary.today + summary.recent > 0) return 'recent';
    return 'all';
}


