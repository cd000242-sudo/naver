import type { GenerationRouteSnapshot } from './routeSnapshot';

export type GenerationRunState =
  | 'CREATED'
  | 'PREFLIGHT_OK'
  | 'TEXT_SUBMITTING'
  | 'TEXT_PENDING'
  | 'TEXT_READY'
  | 'TEXT_FAILED'
  | 'TEXT_UNKNOWN'
  | 'IMAGE_SUBMITTING'
  | 'IMAGE_PENDING'
  | 'IMAGES_READY'
  | 'IMAGES_FAILED'
  | 'IMAGES_UNKNOWN'
  | 'READY_TO_PUBLISH'
  | 'PUBLISH_SUBMITTING'
  | 'PUBLISHED'
  | 'PUBLISH_UNKNOWN'
  | 'PUBLISH_FAILED'
  | 'CANCELLED';

export type GenerationRunExternalStage = 'text' | 'image' | 'publish';

export type GenerationRunExternalOutcome = 'ready' | 'failed' | 'unknown';

export type GenerationRunSubmissionStatus =
  | 'submitting'
  | 'pending'
  | GenerationRunExternalOutcome;

export interface GenerationRunStatusCheck {
  readonly checkedAt: number;
  readonly detail?: string;
}

export interface GenerationRunExternalSubmission {
  readonly stage: GenerationRunExternalStage;
  readonly requestId?: string;
  readonly status: GenerationRunSubmissionStatus;
  readonly submittedAt: number;
  readonly resolvedAt?: number;
  readonly reason?: string;
  readonly statusChecks: readonly GenerationRunStatusCheck[];
}

export interface GenerationRunEvent {
  readonly sequence: number;
  readonly type:
    | 'created'
    | 'state_transition'
    | 'external_submission'
    | 'external_pending'
    | 'external_result'
    | 'external_status_check';
  readonly state: GenerationRunState;
  readonly at: number;
  readonly stage?: GenerationRunExternalStage;
  readonly outcome?: GenerationRunExternalOutcome;
}

export interface GenerationRunRecord {
  readonly runId: string;
  readonly routeSnapshot: GenerationRouteSnapshot;
  readonly state: GenerationRunState;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly submissions: Readonly<Partial<Record<GenerationRunExternalStage, GenerationRunExternalSubmission>>>;
  readonly history: readonly GenerationRunEvent[];
}

export interface GenerationRunLedgerOptions {
  readonly now?: () => number;
}

export interface MarkExternalSubmissionInput {
  readonly stage: GenerationRunExternalStage;
  readonly requestId?: string;
}

export interface RecordExternalResultInput {
  readonly stage: GenerationRunExternalStage;
  readonly outcome: GenerationRunExternalOutcome;
  readonly reason?: string;
}

export interface RecordExternalStatusCheckInput {
  readonly checkedAt?: number;
  readonly detail?: string;
}

const EXTERNAL_STAGES: readonly GenerationRunExternalStage[] = Object.freeze([
  'text',
  'image',
  'publish',
]);

const EXTERNAL_OUTCOMES: readonly GenerationRunExternalOutcome[] = Object.freeze([
  'ready',
  'failed',
  'unknown',
]);

function transitionTargets(...states: GenerationRunState[]): readonly GenerationRunState[] {
  return Object.freeze(states);
}

const LEGAL_TRANSITIONS: Readonly<Record<GenerationRunState, readonly GenerationRunState[]>> = Object.freeze({
  CREATED: transitionTargets('PREFLIGHT_OK', 'CANCELLED'),
  PREFLIGHT_OK: transitionTargets('TEXT_SUBMITTING', 'CANCELLED'),
  TEXT_SUBMITTING: transitionTargets('TEXT_PENDING', 'TEXT_READY', 'TEXT_FAILED', 'TEXT_UNKNOWN', 'CANCELLED'),
  TEXT_PENDING: transitionTargets('TEXT_READY', 'TEXT_FAILED', 'TEXT_UNKNOWN', 'CANCELLED'),
  TEXT_READY: transitionTargets('IMAGE_SUBMITTING', 'READY_TO_PUBLISH', 'CANCELLED'),
  TEXT_FAILED: transitionTargets(),
  TEXT_UNKNOWN: transitionTargets(),
  IMAGE_SUBMITTING: transitionTargets('IMAGE_PENDING', 'IMAGES_READY', 'IMAGES_FAILED', 'IMAGES_UNKNOWN', 'CANCELLED'),
  IMAGE_PENDING: transitionTargets('IMAGES_READY', 'IMAGES_FAILED', 'IMAGES_UNKNOWN', 'CANCELLED'),
  IMAGES_READY: transitionTargets('READY_TO_PUBLISH', 'CANCELLED'),
  IMAGES_FAILED: transitionTargets(),
  IMAGES_UNKNOWN: transitionTargets(),
  READY_TO_PUBLISH: transitionTargets('PUBLISH_SUBMITTING', 'CANCELLED'),
  PUBLISH_SUBMITTING: transitionTargets('PUBLISHED', 'PUBLISH_UNKNOWN', 'PUBLISH_FAILED', 'CANCELLED'),
  PUBLISHED: transitionTargets(),
  PUBLISH_UNKNOWN: transitionTargets(),
  PUBLISH_FAILED: transitionTargets(),
  CANCELLED: transitionTargets(),
});

const EXTERNAL_SUBMITTING_STATE: Readonly<Record<GenerationRunExternalStage, GenerationRunState>> = Object.freeze({
  text: 'TEXT_SUBMITTING',
  image: 'IMAGE_SUBMITTING',
  publish: 'PUBLISH_SUBMITTING',
});

const EXTERNAL_PENDING_STATE: Readonly<Record<GenerationRunExternalStage, GenerationRunState>> = Object.freeze({
  text: 'TEXT_PENDING',
  image: 'IMAGE_PENDING',
  publish: 'PUBLISH_SUBMITTING',
});

const EXTERNAL_RESULT_STATE: Readonly<Record<GenerationRunExternalStage, Readonly<Record<GenerationRunExternalOutcome, GenerationRunState>>>> = Object.freeze({
  text: Object.freeze({
    ready: 'TEXT_READY',
    failed: 'TEXT_FAILED',
    unknown: 'TEXT_UNKNOWN',
  }),
  image: Object.freeze({
    ready: 'IMAGES_READY',
    failed: 'IMAGES_FAILED',
    unknown: 'IMAGES_UNKNOWN',
  }),
  publish: Object.freeze({
    ready: 'PUBLISHED',
    failed: 'PUBLISH_FAILED',
    unknown: 'PUBLISH_UNKNOWN',
  }),
});

const MANUAL_TRANSITION_TARGETS = new Set<GenerationRunState>([
  'PREFLIGHT_OK',
  'READY_TO_PUBLISH',
  'CANCELLED',
]);

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return assertNonEmptyString(value, label);
}

function isExternalStage(value: unknown): value is GenerationRunExternalStage {
  return EXTERNAL_STAGES.includes(value as GenerationRunExternalStage);
}

function isExternalOutcome(value: unknown): value is GenerationRunExternalOutcome {
  return EXTERNAL_OUTCOMES.includes(value as GenerationRunExternalOutcome);
}

function assertImmutableRouteSnapshot(snapshot: GenerationRouteSnapshot): void {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('route snapshot is required');
  }
  if (!Object.isFrozen(snapshot) || !Object.isFrozen(snapshot.text)
    || (snapshot.image !== undefined && !Object.isFrozen(snapshot.image))
    || (snapshot.vision !== undefined && !Object.isFrozen(snapshot.vision))) {
    throw new Error('route snapshot must be immutable');
  }
  if (snapshot.fallbackPolicy !== 'manual-only') {
    throw new Error('route snapshot must prohibit automatic fallback');
  }
  assertNonEmptyString(snapshot.runId, 'route snapshot runId');
}

function freezeStatusCheck(statusCheck: GenerationRunStatusCheck): GenerationRunStatusCheck {
  return Object.freeze({ ...statusCheck });
}

function freezeSubmission(submission: GenerationRunExternalSubmission): GenerationRunExternalSubmission {
  return Object.freeze({
    ...submission,
    statusChecks: Object.freeze(submission.statusChecks.map(freezeStatusCheck)),
  });
}

function freezeSubmissions(
  submissions: Readonly<Partial<Record<GenerationRunExternalStage, GenerationRunExternalSubmission>>>,
): GenerationRunRecord['submissions'] {
  return Object.freeze({ ...submissions });
}

function replaceSubmission(
  submissions: GenerationRunRecord['submissions'],
  stage: GenerationRunExternalStage,
  submission: GenerationRunExternalSubmission,
): GenerationRunRecord['submissions'] {
  return freezeSubmissions({
    ...submissions,
    [stage]: freezeSubmission(submission),
  });
}

function freezeEvent(event: GenerationRunEvent): GenerationRunEvent {
  return Object.freeze({ ...event });
}

function freezeRecord(record: GenerationRunRecord): GenerationRunRecord {
  return Object.freeze({
    ...record,
    submissions: freezeSubmissions(record.submissions),
    history: Object.freeze(record.history.map(freezeEvent)),
  });
}

/**
 * An in-memory, append-only run journal. Every mutation creates a new frozen
 * record, so callers can safely retain any earlier record for recovery UI or
 * audit purposes without it changing underneath them.
 */
export class GenerationRunLedger {
  private readonly records = new Map<string, GenerationRunRecord>();
  private readonly now: () => number;

  constructor(options: GenerationRunLedgerOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  create(routeSnapshot: GenerationRouteSnapshot): GenerationRunRecord {
    assertImmutableRouteSnapshot(routeSnapshot);
    const runId = assertNonEmptyString(routeSnapshot.runId, 'route snapshot runId');
    if (this.records.has(runId)) {
      throw new Error(`generation run already exists: ${runId}`);
    }

    const createdAt = this.nextTimestamp();
    const record = freezeRecord({
      runId,
      routeSnapshot,
      state: 'CREATED',
      revision: 0,
      createdAt,
      updatedAt: createdAt,
      submissions: Object.freeze({}),
      history: Object.freeze([freezeEvent({
        sequence: 0,
        type: 'created',
        state: 'CREATED',
        at: createdAt,
      })]),
    });
    this.records.set(runId, record);
    return record;
  }

  get(runId: string): GenerationRunRecord | undefined {
    return this.records.get(runId);
  }

  list(): readonly GenerationRunRecord[] {
    return Object.freeze([...this.records.values()]);
  }

  /**
   * Only non-provider state changes are available through this method.
   * Provider submission, pending, and result states must go through the
   * external methods below so a result can never exist without a submission.
   */
  transition(runId: string, nextState: GenerationRunState): GenerationRunRecord {
    const record = this.requireRun(runId);
    this.assertLegalTransition(record.state, nextState);
    if (!MANUAL_TRANSITION_TARGETS.has(nextState)) {
      throw new Error(`external state ${nextState} must be recorded through its stage operation`);
    }
    return this.append(record, {
      type: 'state_transition',
      state: nextState,
    });
  }

  markExternalSubmission(
    runId: string,
    input: MarkExternalSubmissionInput,
  ): GenerationRunRecord {
    const record = this.requireRun(runId);
    const stage = this.requireStage(input?.stage);
    this.assertStageConfigured(record, stage);
    if (record.submissions[stage]) {
      throw new Error(`external ${stage} submission already exists for run ${runId}`);
    }

    const nextState = EXTERNAL_SUBMITTING_STATE[stage];
    this.assertLegalTransition(record.state, nextState);
    const submittedAt = this.nextTimestampAfter(record.updatedAt);
    const submission = freezeSubmission({
      stage,
      requestId: optionalString(input.requestId, 'requestId'),
      status: 'submitting',
      submittedAt,
      statusChecks: Object.freeze([]),
    });

    return this.append(record, {
      type: 'external_submission',
      state: nextState,
      stage,
      submissions: replaceSubmission(record.submissions, stage, submission),
      at: submittedAt,
    });
  }

  markExternalPending(runId: string, stageInput: GenerationRunExternalStage): GenerationRunRecord {
    const record = this.requireRun(runId);
    const stage = this.requireStage(stageInput);
    const submission = this.requireOpenSubmission(record, stage);
    if (submission.status !== 'submitting') {
      throw new Error(`external ${stage} submission is already ${submission.status}`);
    }

    const nextState = EXTERNAL_PENDING_STATE[stage];
    if (nextState !== record.state) {
      this.assertLegalTransition(record.state, nextState);
    }
    const pendingSubmission = freezeSubmission({
      ...submission,
      status: 'pending',
    });
    return this.append(record, {
      type: 'external_pending',
      state: nextState,
      stage,
      submissions: replaceSubmission(record.submissions, stage, pendingSubmission),
    });
  }

  recordExternalResult(
    runId: string,
    input: RecordExternalResultInput,
  ): GenerationRunRecord {
    const record = this.requireRun(runId);
    const stage = this.requireStage(input?.stage);
    const outcome = this.requireOutcome(input?.outcome);
    const submission = this.requireOpenSubmission(record, stage);
    if (submission.status !== 'submitting' && submission.status !== 'pending') {
      throw new Error(`external ${stage} result is final: ${submission.status}`);
    }

    const nextState = EXTERNAL_RESULT_STATE[stage][outcome];
    this.assertLegalTransition(record.state, nextState);
    const resolvedAt = this.nextTimestampAfter(record.updatedAt);
    const resolvedSubmission = freezeSubmission({
      ...submission,
      status: outcome,
      reason: optionalString(input.reason, 'reason'),
      resolvedAt,
    });

    return this.append(record, {
      type: 'external_result',
      state: nextState,
      stage,
      outcome,
      submissions: replaceSubmission(record.submissions, stage, resolvedSubmission),
      at: resolvedAt,
    });
  }

  /**
   * UNKNOWN is deliberately terminal for re-submission. A later lookup may
   * record only what it observed; it may not issue a fresh paid request or
   * rewrite the already-unknown outcome.
   */
  recordExternalStatusCheck(
    runId: string,
    stageInput: GenerationRunExternalStage,
    input: RecordExternalStatusCheckInput = {},
  ): GenerationRunRecord {
    const record = this.requireRun(runId);
    const stage = this.requireStage(stageInput);
    const submission = this.requireSubmission(record, stage);
    if (submission.status !== 'unknown') {
      throw new Error(`status checks after finalization are allowed only for unknown ${stage} submissions`);
    }

    const checkedAt = input.checkedAt === undefined
      ? this.nextTimestampAfter(record.updatedAt)
      : this.requireTimestamp(input.checkedAt, 'checkedAt');
    const statusCheck = freezeStatusCheck({
      checkedAt,
      detail: optionalString(input.detail, 'detail'),
    });
    const updatedSubmission = freezeSubmission({
      ...submission,
      statusChecks: Object.freeze([...submission.statusChecks, statusCheck]),
    });

    return this.append(record, {
      type: 'external_status_check',
      state: record.state,
      stage,
      submissions: replaceSubmission(record.submissions, stage, updatedSubmission),
    });
  }

  private requireRun(runId: string): GenerationRunRecord {
    const normalizedRunId = assertNonEmptyString(runId, 'runId');
    const record = this.records.get(normalizedRunId);
    if (!record) throw new Error(`generation run does not exist: ${normalizedRunId}`);
    return record;
  }

  private requireStage(stage: unknown): GenerationRunExternalStage {
    if (!isExternalStage(stage)) throw new Error('external stage is invalid');
    return stage;
  }

  private requireOutcome(outcome: unknown): GenerationRunExternalOutcome {
    if (!isExternalOutcome(outcome)) throw new Error('external outcome is invalid');
    return outcome;
  }

  private requireSubmission(
    record: GenerationRunRecord,
    stage: GenerationRunExternalStage,
  ): GenerationRunExternalSubmission {
    const submission = record.submissions[stage];
    if (!submission) throw new Error(`external ${stage} submission must be marked before a result`);
    return submission;
  }

  private requireOpenSubmission(
    record: GenerationRunRecord,
    stage: GenerationRunExternalStage,
  ): GenerationRunExternalSubmission {
    const submission = this.requireSubmission(record, stage);
    if (submission.status === 'unknown') {
      throw new Error(`external ${stage} is unknown and cannot be resubmitted`);
    }
    return submission;
  }

  private assertStageConfigured(record: GenerationRunRecord, stage: GenerationRunExternalStage): void {
    if (stage === 'image' && !record.routeSnapshot.image) {
      throw new Error('image route is not configured for this run');
    }
  }

  private assertLegalTransition(current: GenerationRunState, next: GenerationRunState): void {
    if (!LEGAL_TRANSITIONS[current]?.includes(next)) {
      throw new Error(`illegal transition: ${current} -> ${next}`);
    }
  }

  private append(
    record: GenerationRunRecord,
    change: {
      readonly type: GenerationRunEvent['type'];
      readonly state: GenerationRunState;
      readonly stage?: GenerationRunExternalStage;
      readonly outcome?: GenerationRunExternalOutcome;
      readonly submissions?: GenerationRunRecord['submissions'];
      readonly at?: number;
    },
  ): GenerationRunRecord {
    const at = change.at ?? this.nextTimestampAfter(record.updatedAt);
    const event = freezeEvent({
      sequence: record.history.length,
      type: change.type,
      state: change.state,
      at,
      stage: change.stage,
      outcome: change.outcome,
    });
    const nextRecord = freezeRecord({
      ...record,
      state: change.state,
      revision: record.revision + 1,
      updatedAt: at,
      submissions: change.submissions ?? record.submissions,
      history: Object.freeze([...record.history, event]),
    });
    this.records.set(record.runId, nextRecord);
    return nextRecord;
  }

  private nextTimestamp(): number {
    return this.requireTimestamp(this.now(), 'clock value');
  }

  private nextTimestampAfter(previous: number): number {
    return Math.max(this.nextTimestamp(), previous + 1);
  }

  private requireTimestamp(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a non-negative finite timestamp`);
    }
    return Math.trunc(value);
  }
}
