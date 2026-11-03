import { dailyClaimKey, dailyId, dailyKst, dailyObject, dailyTime, confirmedDailyUrl, validateDailyPlans } from './dailyPublishingModel.js';
import type { DailyPublishingJob, DailyPublishingState } from './dailyPublishingTypes.js';

export const copyDaily = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const emptyDailyState = (): DailyPublishingState => ({ version: 1, revision: 0, plans: [], runs: [] });
const fail = (): never => { throw new Error('DAILY_STATE_INVALID'); };
export function validateDailyState(value: unknown): DailyPublishingState {
  if (value === null || value === undefined) return emptyDailyState();
  try {
    const state = dailyObject(value, ['version', 'revision', 'plans', 'runs', 'activations']);
    if (state.version !== 1 || !Number.isSafeInteger(state.revision) || (state.revision as number) < 0
      || !Array.isArray(state.runs) || state.runs.length > 2000) return fail();
    const plans = validateDailyPlans(state.plans);
    const keys = new Set<string>();
    const runs: DailyPublishingJob[] = state.runs.map((input) => {
      const run = dailyObject(input, ['key', 'accountId', 'date', 'time', 'ordinal', 'status', 'createdAt', 'updatedAt', 'reason', 'publishedUrl', 'scheduledFor', 'prepareAt', 'scheduleVerified']);
      const accountId = dailyId(run.accountId);
      const time = dailyTime(run.time);
      if (typeof run.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(run.date)) return fail();
      const now = new Date(`${run.date}T00:00:00+09:00`);
      if (!Number.isFinite(now.getTime()) || dailyKst(now).date !== run.date) return fail();
      if (!Number.isInteger(run.ordinal) || (run.ordinal as number) < 1 || (run.ordinal as number) > 20) return fail();
      if (run.key !== dailyClaimKey(accountId, now, time, run.ordinal as number) || keys.has(run.key as string)) return fail();
      keys.add(run.key as string);
      if (!['pending', 'inflight', 'confirmed', 'needs_review', 'cancelled'].includes(run.status as string)) return fail();
      for (const timestamp of [run.createdAt, run.updatedAt]) {
        if (typeof timestamp !== 'string' || new Date(timestamp).toISOString() !== timestamp) return fail();
      }
      if (run.reason !== undefined && !['execution_uncertain', 'unavailable', 'interrupted', 'stopped', 'plan_changed', 'deadline_missed', 'keywords_exhausted'].includes(run.reason as string)) return fail();
      if (run.scheduledFor !== undefined || run.prepareAt !== undefined || run.scheduleVerified !== undefined) {
        if (typeof run.scheduledFor !== 'string' || typeof run.prepareAt !== 'string'
          || new Date(run.scheduledFor).toISOString() !== run.scheduledFor || new Date(run.prepareAt).toISOString() !== run.prepareAt
          || Date.parse(run.scheduledFor) - Date.parse(run.prepareAt) !== 3_600_000
          || dailyKst(new Date(run.scheduledFor)).date !== run.date || dailyKst(new Date(run.scheduledFor)).time !== time
          || (run.scheduleVerified !== undefined && (run.scheduleVerified !== true || run.status !== 'confirmed'))) return fail();
      }
      if (run.publishedUrl !== undefined && confirmedDailyUrl(run.publishedUrl) !== run.publishedUrl) return fail();
      return copyDaily(run) as unknown as DailyPublishingJob;
    });
    const activations = validateActivations(state.activations, plans.map((plan) => plan.accountId));
    return { version: 1, revision: state.revision as number, plans, runs, ...(activations ? { activations } : {}) };
  } catch { return fail(); }
}
function validateActivations(value: unknown, accounts: string[]): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  // An entry for a removed plan is stale, not corrupt: drop it rather than refuse to load.
  const entries = Object.entries(dailyObject(value, Object.keys(value as object))).filter(([accountId]) => accounts.includes(accountId));
  for (const [, at] of entries) {
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) return fail();
  }
  return Object.fromEntries(entries) as Record<string, string>;
}
export function boundDailyRuns(runs: DailyPublishingJob[], now: Date): DailyPublishingJob[] {
  const today = dailyKst(now).date;
  const oldest = dailyKst(new Date(now.getTime() - 13 * 86400000)).date;
  const kept = runs.filter((run) => run.date >= oldest);
  const current = kept.filter((run) => run.date >= today);
  // Retaining today's claims is required even if plans are edited repeatedly.
  if (current.length > 2000) throw new Error('DAILY_LOG_CAPACITY');
  const past = kept.filter((run) => run.date < today).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...past.slice(Math.max(0, past.length - (2000 - current.length))), ...current];
}
