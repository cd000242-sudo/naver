import { confirmedDailyUrl, dailyClaimKey, dailyKst, dueDailySlots, validateDailyPlans } from './dailyPublishingModel.js';
import { boundDailyRuns, copyDaily, emptyDailyState, validateDailyState } from './dailyPublishingState.js';
import type { DailyPublishingDependencies, DailyPublishingJob, DailyPublishingState, DailyRunReason } from './dailyPublishingTypes.js';
export type * from './dailyPublishingTypes.js';

/** Failing this many posts in a row means the setup itself is broken; stop before spending more generation. */
export const DAILY_FAILURE_LIMIT = 3;
/** An empty map is stored as no field, so a state without plans is unchanged by loading it. */
function withActivations(state: DailyPublishingState, activations: Record<string, string>): DailyPublishingState {
  const { activations: _previous, ...rest } = state;
  return Object.keys(activations).length ? { ...rest, activations } : rest;
}
function consecutiveFailures(runs: DailyPublishingJob[], accountId: string): number {
  // Latest first; runs finished in the same millisecond keep their claim order.
  const finished = runs.map((r, index) => ({ ...r, index }))
    .filter((r) => r.accountId === accountId && (r.status === 'confirmed' || r.status === 'needs_review'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.index - a.index);
  const streak = finished.findIndex((r) => r.status === 'confirmed');
  return streak === -1 ? finished.length : streak;
}

export class DailyPublishingScheduler {
  private state = emptyDailyState();
  private ready = false;
  private faulted = false;
  /** Plans saved before activations were recorded catch up only from this load onward. */
  private loadedAt?: string;
  private mutation: Promise<unknown> = Promise.resolve();
  private ticking?: Promise<void>;
  constructor(private readonly deps: DailyPublishingDependencies) {}

  async initialize(): Promise<void> {
    if (this.ready) return;
    await this.lock(async () => {
      if (this.ready) return;
      try { this.state = validateDailyState(await this.deps.load()); }
      catch { throw new Error('DAILY_LOAD_FAILED'); }
      const timestamp = this.deps.now().toISOString();
      // A post cut off by an app exit is held for review and never retried; the plan and the claims that
      // never started keep going — the next tick runs them or lets them expire.
      this.loadedAt = timestamp;
      const recovered = { ...this.state,
        runs: boundDailyRuns(this.state.runs.map((r): DailyPublishingJob => r.status === 'inflight'
          ? { ...r, status: 'needs_review', reason: 'interrupted', updatedAt: timestamp } : r), this.deps.now()) };
      if (JSON.stringify(recovered) !== JSON.stringify(this.state)) await this.persist(recovered);
      this.ready = true;
    });
  }
  getState(): DailyPublishingState { this.requireReady(); return copyDaily(this.state); }

  async replacePlans(value: unknown, expectedRevision: number): Promise<DailyPublishingState> {
    const plans = validateDailyPlans(value);
    return this.lock(async () => {
      this.requireRevision(expectedRevision);
      const nextPlans = new Map(plans.map((plan) => [plan.accountId, JSON.stringify(plan)]));
      const changed = new Set(this.state.plans.filter((plan) => nextPlans.get(plan.accountId) !== JSON.stringify(plan)).map((plan) => plan.accountId));
      const runs = this.cancelPending(this.state.runs, (run) => changed.has(run.accountId), 'plan_changed');
      const activations = this.activationsFor(plans, this.state.plans, this.deps.now().toISOString());
      await this.persist(withActivations({ ...this.state, plans, runs }, activations));
      return this.getState();
    });
  }
  async stop(accountId: string, expectedRevision: number): Promise<DailyPublishingState> {
    return this.lock(async () => {
      this.requireRevision(expectedRevision);
      if (!this.state.plans.some((p) => p.accountId === accountId)) throw new Error('DAILY_ACCOUNT_NOT_FOUND');
      await this.persist(this.disablePlans(this.state, (id) => id === accountId, this.state.runs));
      return this.getState();
    });
  }
  async tick(): Promise<void> {
    this.requireReady();
    await this.enqueueDue();
    if (this.ticking) return this.ticking;
    this.ticking = this.drain().finally(() => { this.ticking = undefined; });
    return this.ticking;
  }
  private async enqueueDue(): Promise<void> {
    await this.lock(async () => {
      const now = this.deps.now();
      const today = dailyKst(now).date;
      // A waiting post expires only when it can no longer be published: its own KST day ended, or its reservation time passed.
      const expired = (r: DailyPublishingJob) => r.status === 'pending'
        && (r.scheduledFor ? Date.parse(r.scheduledFor) <= now.getTime() : r.date < today);
      const current = this.state.runs.map((r): DailyPublishingJob => expired(r)
        ? { ...r, status: 'cancelled', reason: 'deadline_missed', updatedAt: now.toISOString() } : r);
      const keys = new Set(current.map((r) => r.key));
      const used = new Map<string, number>();
      for (const run of current) {
        const scope = `${run.accountId}:${run.date}`;
        if (run.status !== 'cancelled') used.set(scope, (used.get(scope) || 0) + 1);
      }
      const due: DailyPublishingJob[] = this.state.plans.filter((p) => p.enabled).flatMap((p) =>
        dueDailySlots(p, now, this.activatedAt(p.accountId)).flatMap((s) => {
          const targetDay = s.date;
          const timing = p.mode === 'schedule' ? { prepareAt: s.prepareAt, scheduledFor: s.scheduledFor } : {};
          return Array.from({ length: s.count }, (_, i) => ({
            key: dailyClaimKey(p.accountId, new Date(`${targetDay}T00:00:00+09:00`), s.time, i + 1), accountId: p.accountId, date: targetDay, time: s.time,
            ...timing, ordinal: i + 1, status: 'pending' as const, createdAt: now.toISOString(), updatedAt: now.toISOString(),
          }));
        })).filter((run) => {
          const scope = `${run.accountId}:${run.date}`; const total = used.get(scope) || 0;
          if (keys.has(run.key) || total >= 20) return false;
          used.set(scope, total + 1);
          return true;
        });
      const runs = boundDailyRuns([...current, ...due], now);
      if (due.length || runs.length !== this.state.runs.length || current.some((r, i) => r !== this.state.runs[i])) {
        await this.persist({ ...this.state, runs });
      }
    });
  }
  /** An account that is not available now keeps its posts waiting; other accounts still run in this pass. */
  private async drain(): Promise<void> {
    const waiting = new Set<string>();
    for (;;) {
      const job = this.state.runs.find((r) => r.status === 'pending' && !waiting.has(r.accountId));
      if (!job) return;
      if (!await this.executeNext(job)) waiting.add(job.accountId);
    }
  }
  /** Returns false when the job was left waiting for the account to become available. */
  private async executeNext(job: DailyPublishingJob): Promise<boolean> {
    const plan = this.state.plans.find((p) => p.accountId === job.accountId);
    if (!plan?.enabled) {
      await this.updateJob(job.key, 'cancelled', 'stopped');
      return true;
    }
    if (plan.mode === 'schedule' && (!job.scheduledFor || Date.parse(job.scheduledFor) <= this.deps.now().getTime())) {
      await this.updateJob(job.key, 'cancelled', 'deadline_missed'); return true;
    }
    let available = false;
    try { available = (await this.deps.checkAvailable(copyDaily(plan))).available === true; }
    catch { available = false; }
    if (!available) return false;
    const claimed = await this.lock(async () => {
      const pending = this.state.runs.find((r) => r.key === job.key);
      if (pending?.status !== 'pending' || !this.state.plans.some((p) => p.accountId === job.accountId && p.enabled)) return false;
      await this.persist({ ...this.state, runs: this.changedJob(job.key, 'inflight') });
      return true;
    });
    if (!claimed) return true;
    let url: string | null = null;
    let confirmed = false;
    let stopAll = false;
    let stopAccount = false;
    let deadlineMissed = false;
    let keywordsExhausted = false;
    try {
      if (plan.mode === 'schedule' && Date.parse(job.scheduledFor!) <= this.deps.now().getTime()) {
        throw new Error('DAILY_SCHEDULE_DEADLINE_MISSED');
      }
      const result = await this.deps.execute(copyDaily(plan), { ...copyDaily(job), status: 'inflight' });
      stopAll = result.stopAll === true;
      stopAccount = result.stopAccount === true;
      url = confirmedDailyUrl(result.publishedUrl);
      deadlineMissed = result.code === 'DAILY_SCHEDULE_DEADLINE_MISSED';
      keywordsExhausted = result.code === 'KEYWORDS_EXHAUSTED';
      confirmed = result.confirmed === true && (plan.mode === 'draft' ? result.draftSaved === true
        : plan.mode === 'schedule' ? result.scheduleVerified === true && result.scheduledFor === job.scheduledFor : url !== null);
    } catch (error) { confirmed = false; deadlineMissed = error instanceof Error && error.message === 'DAILY_SCHEDULE_DEADLINE_MISSED'; }
    if (!confirmed || stopAll) {
      const reason: DailyRunReason = deadlineMissed ? 'deadline_missed' : keywordsExhausted ? 'keywords_exhausted' : 'execution_uncertain';
      await this.fail(job, reason, stopAll ? 'all' : stopAccount ? 'account' : 'post');
      return true;
    }
    await this.lock(async () => {
      const runs = this.changedJob(job.key, 'confirmed').map((r) => r.key === job.key
        ? { ...r, ...(url ? { publishedUrl: url } : {}), ...(plan.mode === 'schedule' ? { scheduleVerified: true } : {}) } : r);
      await this.persist({ ...this.state, runs });
    });
    return true;
  }
  /**
   * The failed post is held for review and never retried. Only a block a person must clear (or the same account
   * failing DAILY_FAILURE_LIMIT times in a row) stops the plan; otherwise the next slot runs as planned.
   */
  private async fail(job: DailyPublishingJob, reason: DailyRunReason, scope: 'post' | 'account' | 'all'): Promise<void> {
    await this.lock(async () => {
      const current = this.state.runs.find((r) => r.key === job.key);
      if (!current || !['inflight', 'pending'].includes(current.status)) return;
      const runs = this.changedJob(job.key, 'needs_review', reason);
      const repeated = scope === 'post' && consecutiveFailures(runs, job.accountId) >= DAILY_FAILURE_LIMIT;
      if (scope === 'post' && !repeated) { await this.persist({ ...this.state, runs }); return; }
      await this.persist(this.disablePlans(this.state, (id) => scope === 'all' || id === job.accountId, runs));
    });
  }
  private disablePlans(state: DailyPublishingState, matches: (accountId: string) => boolean, runs: DailyPublishingJob[]): DailyPublishingState {
    const activations = Object.fromEntries(Object.entries(state.activations || {}).filter(([id]) => !matches(id)));
    return { ...withActivations(state, activations),
      plans: state.plans.map((p) => matches(p.accountId) ? { ...p, enabled: false } : p),
      runs: this.cancelPending(runs, (r) => matches(r.accountId), 'stopped') };
  }
  /** A plan that is started or edited counts from now; an unchanged enabled plan keeps its moment. */
  private activationsFor(plans: DailyPublishingState['plans'], previous: DailyPublishingState['plans'], timestamp: string): Record<string, string> {
    const before = new Map(previous.map((plan) => [plan.accountId, JSON.stringify(plan)]));
    return Object.fromEntries(plans.filter((plan) => plan.enabled).map((plan) => {
      const kept = before.get(plan.accountId) === JSON.stringify(plan) ? this.state.activations?.[plan.accountId] : undefined;
      return [plan.accountId, kept || timestamp];
    }));
  }
  private activatedAt(accountId: string): Date | undefined {
    const at = this.state.activations?.[accountId] || this.loadedAt;
    return at ? new Date(at) : undefined;
  }
  private changedJob(key: string, status: DailyPublishingJob['status'], reason?: DailyRunReason): DailyPublishingJob[] {
    return this.state.runs.map((r) => r.key === key ? { ...r, status, ...(reason ? { reason } : {}), updatedAt: this.deps.now().toISOString() } : r);
  }
  private cancelPending(runs: DailyPublishingJob[], matches: (r: DailyPublishingJob) => boolean, reason: DailyRunReason): DailyPublishingJob[] {
    return runs.map((r) => r.status === 'pending' && matches(r)
      ? { ...r, status: 'cancelled', reason, updatedAt: this.deps.now().toISOString() } : r);
  }
  private async updateJob(key: string, status: DailyPublishingJob['status'], reason: DailyRunReason): Promise<void> {
    await this.lock(() => this.persist({ ...this.state, runs: this.changedJob(key, status, reason) }));
  }
  private requireReady(): void {
    if (!this.ready) throw new Error('DAILY_NOT_INITIALIZED');
    if (this.faulted) throw new Error('DAILY_PERSISTENCE_FAILED');
  }
  private requireRevision(revision: number): void {
    this.requireReady();
    if (revision !== this.state.revision) throw new Error('DAILY_REVISION_CONFLICT');
  }
  private async persist(state: DailyPublishingState): Promise<void> {
    if (this.faulted) throw new Error('DAILY_PERSISTENCE_FAILED');
    const next = { ...state, revision: this.state.revision + 1, runs: boundDailyRuns(state.runs, this.deps.now()) };
    try { await this.deps.save(copyDaily(next)); }
    catch { this.faulted = true; throw new Error('DAILY_PERSISTENCE_FAILED'); }
    this.state = copyDaily(next);
  }
  private lock<T>(action: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(action);
    this.mutation = result.catch(() => undefined);
    return result;
  }
}
