import type {
  ContentPolicyConfig,
  ExposureCheck,
  ExposureMethod,
  ExposureStatus,
  MonitoredPublication,
  PublicationState,
} from './types';

export interface ExposureMonitorResult {
  publication: MonitoredPublication;
  state: PublicationState;
}

function cloneState(state: PublicationState): PublicationState {
  return {
    ...state,
    paused_templates: [...state.paused_templates],
    paused_structures: [...state.paused_structures],
    history: state.history.map((entry) => ({ ...entry })),
    resume_approval: state.resume_approval ? { ...state.resume_approval } : undefined,
    manual_test_evidence: state.manual_test_evidence
      ? { ...state.manual_test_evidence, checks: state.manual_test_evidence.checks.map((check) => ({ ...check })) }
      : undefined,
    pause_incident: state.pause_incident ? { ...state.pause_incident } : undefined,
  };
}

function appendUnique(values: readonly string[], value: string): string[] {
  return values.includes(value) ? [...values] : [...values, value];
}

function minimumIndependentChecks(config: ContentPolicyConfig): number {
  const configured = config.monitoring.minimum_cross_checks;
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.max(2, configured)
    : 2;
}

function latestCheckPerMethod(checks: readonly ExposureCheck[]): ExposureCheck[] {
  const latest = new Map<ExposureMethod, { check: ExposureCheck; time: number; index: number }>();
  checks.forEach((check, index) => {
    const time = Date.parse(check.checked_at);
    const candidateTime = Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
    const previous = latest.get(check.method);
    if (!previous
      || candidateTime > previous.time
      || (candidateTime === previous.time && index > previous.index)) {
      latest.set(check.method, { check, time: candidateTime, index });
    }
  });
  return [...latest.values()].map(({ check }) => check);
}

function classifyChecks(
  checks: readonly ExposureCheck[],
  currentStatus: ExposureStatus,
  config: ContentPolicyConfig,
): ExposureStatus {
  if (checks.length === 0) return currentStatus;

  const searchMethods = new Set<ExposureMethod>([
    'exact_title_search',
    'blog_search_tab',
    'integrated_search',
  ]);
  const searchFound = checks.some((check) => (
    check.outcome === 'FOUND' && searchMethods.has(check.method)
  ));
  if (searchFound) return 'INDEXED';
  const conflictingExternalFound = checks.some((check) => (
    check.outcome === 'FOUND' && check.method === 'third_party'
  ));

  const independentMisses = new Set<ExposureMethod>();
  let hasError = false;
  for (const check of checks) {
    if (check.outcome === 'NOT_FOUND') independentMisses.add(check.method);
    if (check.outcome === 'ERROR') hasError = true;
  }

  if (conflictingExternalFound && independentMisses.size > 0) return 'MISSING_SUSPECT';
  if (independentMisses.size >= minimumIndependentChecks(config)) {
    return 'MISSING_CONFIRMED';
  }
  if (independentMisses.size > 0) return 'MISSING_SUSPECT';
  if (hasError) return 'CHECK_ERROR';
  return currentStatus;
}

function updateHistoryStatus(
  state: PublicationState,
  articleId: string,
  status: ExposureStatus,
): PublicationState {
  return {
    ...state,
    history: state.history.map((entry) => entry.article_id === articleId
      ? { ...entry, exposure_status: status }
      : { ...entry }),
  };
}

function applyConfirmedMissing(
  publication: MonitoredPublication,
  state: PublicationState,
  now: Date,
): PublicationState {
  const alreadyConfirmed = publication.exposure_status === 'MISSING_CONFIRMED'
    || state.history.some(
      (entry) => entry.article_id === publication.article_id
        && entry.exposure_status === 'MISSING_CONFIRMED',
    );
  const nextStreak = alreadyConfirmed
    ? Math.max(1, state.confirmed_missing_streak)
    : state.confirmed_missing_streak + 1;

  const nextState: PublicationState = {
    ...state,
    paused_templates: appendUnique(state.paused_templates, publication.template_id),
    paused_structures: appendUnique(state.paused_structures, publication.structure_type),
    confirmed_missing_streak: nextStreak,
    resume_approval: undefined,
    manual_test_evidence: undefined,
    pause_incident: {
      article_id: publication.article_id,
      blog_id: publication.blog_id,
      primary_keyword: publication.primary_keyword,
      template_id: publication.template_id,
      structure_type: publication.structure_type,
      detected_at: Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString(),
    },
  };

  if (nextStreak < 2) return nextState;

  return {
    ...nextState,
    status: 'PAUSED',
    pause_reason: state.pause_reason ?? 'TWO_CONSECUTIVE_CONFIRMED_MISSING',
    paused_at: state.paused_at
      ?? (Number.isFinite(now.getTime()) ? now.toISOString() : undefined),
  };
}

export function createInitialPublicationState(): PublicationState {
  return {
    status: 'ACTIVE',
    paused_templates: [],
    paused_structures: [],
    confirmed_missing_streak: 0,
    history: [],
  };
}

/**
 * Resolves one monitoring round. Distinct methods count as independent checks;
 * Search discovery wins over misses; direct URL access alone is not indexing proof.
 */
export function applyExposureChecks(
  publication: MonitoredPublication,
  checks: readonly ExposureCheck[],
  state: PublicationState,
  config: ContentPolicyConfig,
  now: Date,
): ExposureMonitorResult {
  const copiedChecks = checks.map((check) => ({ ...check }));
  const allChecks = [
    ...publication.exposure_checks.map((check) => ({ ...check })),
    ...copiedChecks,
  ];
  const decisionChecks = latestCheckPerMethod(allChecks);
  const nextStatus = classifyChecks(decisionChecks, publication.exposure_status, config);
  const nextPublication: MonitoredPublication = {
    ...publication,
    exposure_status: nextStatus,
    exposure_checks: allChecks,
  };

  let nextState = cloneState(state);
  if (nextStatus === 'INDEXED') {
    nextState = { ...nextState, confirmed_missing_streak: 0 };
  } else if (nextStatus === 'MISSING_CONFIRMED') {
    nextState = applyConfirmedMissing(publication, nextState, now);
  }

  nextState = updateHistoryStatus(nextState, publication.article_id, nextStatus);
  return { publication: nextPublication, state: nextState };
}
