import type {
  ContentPolicyConfig,
  ContentPolicyResult,
  PublicationHistoryEntry,
  PublicationState,
} from './types';

export type PublishGuardReason =
  | 'BLOCK_POLICY_DECISION'
  | 'BLOCK_POLICY_PUBLICATION'
  | 'BLOCK_PUBLISH_PAUSED'
  | 'BLOCK_TEMPLATE_PAUSED'
  | 'BLOCK_STRUCTURE_PAUSED'
  | 'BLOCK_MIN_PUBLISH_INTERVAL'
  | 'BLOCK_DAILY_PUBLISH_CAP'
  | 'BLOCK_CONSECUTIVE_PATTERN'
  | 'BLOCK_INVALID_PUBLISH_GUARD_CONFIG'
  | 'BLOCK_INVALID_PUBLICATION_HISTORY';

export interface PublicationAvailabilityInput {
  state: PublicationState;
  accountId: string;
  now: Date;
  config: ContentPolicyConfig;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface PublishGuardInput extends PublicationAvailabilityInput {
  policyResult: ContentPolicyResult;
  enforceCadence?: boolean;
  currentArticleId?: string;
  excludeCurrentArticle?: boolean;
}

export interface PublishGuardDecision {
  allowed: boolean;
  reasons: PublishGuardReason[];
}

export interface PublishGuardReasonDisposition {
  blockingReasons: string[];
  advisoryReasons: string[];
}

const ADVISORY_PUBLISH_GUARD_REASONS = new Set([
  'BLOCK_CONSECUTIVE_PATTERN',
]);

/**
 * Template/structure/angle repetition is a quality diversity diagnostic.
 * Operational limits, invalid schedules, and pause controls remain hard stops.
 */
export function partitionPublishGuardReasons(
  reasons: readonly string[],
): PublishGuardReasonDisposition {
  const blockingReasons: string[] = [];
  const advisoryReasons: string[] = [];

  for (const reason of [...new Set(reasons.filter(Boolean))]) {
    if (ADVISORY_PUBLISH_GUARD_REASONS.has(reason)) {
      advisoryReasons.push(reason);
    } else {
      blockingReasons.push(reason);
    }
  }

  return { blockingReasons, advisoryReasons };
}

interface ParsedLimit {
  enabled: boolean;
  invalid: boolean;
  value: number;
}

function parseLimit(raw: string | undefined, integerOnly: boolean): ParsedLimit {
  if (raw === undefined || raw.trim() === '') {
    return { enabled: false, invalid: false, value: 0 };
  }

  const normalized = raw.trim();
  const value = Number(normalized);
  const invalid = !Number.isFinite(value)
    || value < 0
    || (integerOnly && !Number.isSafeInteger(value));

  if (invalid) return { enabled: false, invalid: true, value: 0 };
  return { enabled: value > 0, invalid: false, value };
}

function localDayKey(date: Date): string {
  return [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
}

function readAccountHistory(
  history: readonly PublicationHistoryEntry[],
  accountId: string,
  currentArticleId?: string,
  excludeCurrentArticle = false,
): { entries: PublicationHistoryEntry[]; invalid: boolean } {
  let invalid = false;
  const entries = history
    .filter((entry) => entry.account_id === accountId)
    .filter((entry) => !excludeCurrentArticle
      || !currentArticleId
      || entry.article_id !== currentArticleId)
    .filter((entry) => {
      const timestamp = Date.parse(entry.published_at);
      if (Number.isFinite(timestamp)) return true;
      invalid = true;
      return false;
    })
    .sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at));

  return { entries, invalid };
}

function hasConsecutivePattern(
  current: ContentPolicyResult,
  previous: PublicationHistoryEntry | undefined,
  config: ContentPolicyConfig,
): boolean {
  if (!previous) return false;

  const publicationConfig = config.publication;
  return (
    publicationConfig.prevent_consecutive_same_template
      && previous.template_id === current.publication.template_id
  ) || (
    publicationConfig.prevent_consecutive_same_structure
      && previous.structure_type === current.uniqueness_plan.structure_type
  ) || (
    publicationConfig.prevent_consecutive_same_angle
      && previous.topic_angle === current.uniqueness_plan.topic_angle
  );
}

function addStateReasons(
  reasons: Set<PublishGuardReason>,
  input: PublishGuardInput,
): void {
  const { policyResult, state, config } = input;
  if (policyResult.decision !== config.publication.require_decision) {
    reasons.add('BLOCK_POLICY_DECISION');
  }
  if (!policyResult.publication.allowed) reasons.add('BLOCK_POLICY_PUBLICATION');
  if (config.publication.disallow_when_paused && state.status === 'PAUSED') {
    reasons.add('BLOCK_PUBLISH_PAUSED');
  }
  if (state.paused_templates.includes(policyResult.publication.template_id)) {
    reasons.add('BLOCK_TEMPLATE_PAUSED');
  }
  if (state.paused_structures.includes(policyResult.uniqueness_plan.structure_type)) {
    reasons.add('BLOCK_STRUCTURE_PAUSED');
  }
}

function addCadenceReasons(
  reasons: Set<PublishGuardReason>,
  input: PublicationAvailabilityInput & { policyResult?: ContentPolicyResult },
): void {
  const { policyResult, state, accountId, now, config } = input;
  const env = input.env ?? process.env;
  const interval = parseLimit(env[config.publication.min_interval_minutes_env], false);
  const dailyCap = parseLimit(env[config.publication.daily_cap_env], true);
  if (interval.invalid || dailyCap.invalid) {
    reasons.add('BLOCK_INVALID_PUBLISH_GUARD_CONFIG');
  }

  const currentArticleId = 'currentArticleId' in input
    ? String(input.currentArticleId || '').trim()
    : '';
  const excludeCurrentArticle = 'excludeCurrentArticle' in input
    && input.excludeCurrentArticle === true;
  const accountHistory = readAccountHistory(
    state.history,
    accountId,
    currentArticleId,
    excludeCurrentArticle,
  );
  if (accountHistory.invalid) reasons.add('BLOCK_INVALID_PUBLICATION_HISTORY');
  const previous = accountHistory.entries.find(
    (entry) => Date.parse(entry.published_at) <= now.getTime(),
  );
  const next = [...accountHistory.entries].reverse().find(
    (entry) => Date.parse(entry.published_at) > now.getTime(),
  );

  if (interval.enabled) {
    const adjacentEntries = [previous, next].filter(
      (entry): entry is PublicationHistoryEntry => Boolean(entry),
    );
    const tooClose = adjacentEntries.some((entry) => (
      Math.abs(now.getTime() - Date.parse(entry.published_at)) / 60_000 < interval.value
    ));
    if (tooClose) reasons.add('BLOCK_MIN_PUBLISH_INTERVAL');
  }

  if (dailyCap.enabled) {
    const today = localDayKey(now);
    const publicationsToday = accountHistory.entries.filter(
      (entry) => localDayKey(new Date(entry.published_at)) === today,
    ).length;
    if (publicationsToday >= dailyCap.value) reasons.add('BLOCK_DAILY_PUBLISH_CAP');
  }

  if (policyResult && (
    hasConsecutivePattern(policyResult, previous, config)
    || hasConsecutivePattern(policyResult, next, config)
  )) {
    reasons.add('BLOCK_CONSECUTIVE_PATTERN');
  }
}

export function evaluatePublicationAvailability(
  input: PublicationAvailabilityInput,
): PublishGuardDecision {
  const reasons = new Set<PublishGuardReason>();
  if (input.config.publication.disallow_when_paused && input.state.status === 'PAUSED') {
    reasons.add('BLOCK_PUBLISH_PAUSED');
  }
  if (!input.accountId.trim() || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    reasons.add('BLOCK_INVALID_PUBLISH_GUARD_CONFIG');
    return { allowed: false, reasons: [...reasons] };
  }
  addCadenceReasons(reasons, input);
  return { allowed: reasons.size === 0, reasons: [...reasons] };
}

/**
 * Applies the final, stateful publication checks after the content pipeline has
 * passed. Every applicable failure is returned so an operator can fix the
 * complete set without repeatedly probing the guard.
 */
export function evaluatePublishGuard(input: PublishGuardInput): PublishGuardDecision {
  const reasons = new Set<PublishGuardReason>();
  const { accountId, now } = input;
  addStateReasons(reasons, input);

  if (!accountId.trim() || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    reasons.add('BLOCK_INVALID_PUBLISH_GUARD_CONFIG');
    return { allowed: false, reasons: [...reasons] };
  }

  if (input.enforceCadence !== false) addCadenceReasons(reasons, input);
  return { allowed: reasons.size === 0, reasons: [...reasons] };
}
