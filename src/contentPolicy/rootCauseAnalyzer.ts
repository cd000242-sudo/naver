import type {
  AuditRecord,
  ContentPolicyConfig,
  ExposureCheck,
  ExposureMethod,
  MonitoredPublication,
  PublicationState,
  RecentPostRecord,
} from './types';
import {
  headingOverlapRatio,
  introCharNgramCosine,
  normalizeText,
  tokenCoverage,
  tokenize,
} from './textMetrics.js';

export type RootCauseCategory =
  | 'CONFLICTING_CHECKS'
  | 'CHECK_INFRASTRUCTURE_FAILURE'
  | 'CONFIRMED_DISCOVERY_FAILURE'
  | 'INSUFFICIENT_EVIDENCE';

export interface RootCauseAnalysis {
  article_id: string;
  category: RootCauseCategory;
  independent_methods: ExposureMethod[];
  evidence: ExposureCheck[];
  conclusive: boolean;
  analyzed_at: string;
  compared_indexed_article_ids: string[];
  findings: RootCauseFinding[];
  recommended_changes: string[];
}

export type RootCauseSignal =
  | 'search_intent_alignment'
  | 'title_body_alignment'
  | 'repeated_opening'
  | 'repeated_headings'
  | 'similarity'
  | 'keyword_stuffing'
  | 'source_coverage'
  | 'exaggerated_claims'
  | 'publish_interval'
  | 'publish_error'
  | 'visibility';

export interface RootCauseFinding {
  signal: RootCauseSignal;
  status: 'PASS' | 'RISK' | 'UNKNOWN';
  details: string;
}

export interface RootCauseContext {
  recentPosts: readonly RecentPostRecord[];
  audits: readonly AuditRecord[];
  state: PublicationState;
}

export interface ResumeApprovalInput {
  approvedBy: string;
  rootCauseReviewed: boolean;
  manualTestVerified: boolean;
}

export type ResumeBlockReason =
  | 'PUBLICATION_NOT_PAUSED'
  | 'RESUME_APPROVER_REQUIRED'
  | 'ROOT_CAUSE_REVIEW_REQUIRED'
  | 'MANUAL_TEST_REQUIRED'
  | 'MANUAL_TEST_EVIDENCE_REQUIRED';

export interface ResumeGateResult {
  allowed: boolean;
  reasons: ResumeBlockReason[];
}

function latestCheckPerMethod(checks: readonly ExposureCheck[]): ExposureCheck[] {
  const latest = new Map<ExposureMethod, { check: ExposureCheck; time: number; index: number }>();
  checks.forEach((check, index) => {
    const parsedTime = Date.parse(check.checked_at);
    const time = Number.isFinite(parsedTime) ? parsedTime : Number.NEGATIVE_INFINITY;
    const previous = latest.get(check.method);
    if (!previous || time > previous.time || (time === previous.time && index > previous.index)) {
      latest.set(check.method, { check, time, index });
    }
  });
  return [...latest.values()].map(({ check }) => check);
}

function validDateOrNow(value: Date): string {
  if (Number.isFinite(value.getTime())) return value.toISOString();
  return new Date().toISOString();
}

/** Produces a deterministic evidence summary for the operator's root-cause review. */
export function analyzeRootCause(
  publication: MonitoredPublication,
  now: Date = new Date(),
  context?: RootCauseContext,
): RootCauseAnalysis {
  const evidence = publication.exposure_checks.map((check) => ({ ...check }));
  const currentEvidence = latestCheckPerMethod(evidence);
  const methods = currentEvidence.map((check) => check.method);
  const hasFound = currentEvidence.some((check) => check.outcome === 'FOUND');
  const hasMissing = currentEvidence.some((check) => check.outcome === 'NOT_FOUND');
  const hasError = currentEvidence.some((check) => check.outcome === 'ERROR');
  const missingMethods = new Set(
    currentEvidence
      .filter((check) => check.outcome === 'NOT_FOUND')
      .map((check) => check.method),
  );

  let category: RootCauseCategory = 'INSUFFICIENT_EVIDENCE';
  let conclusive = false;
  if (hasFound && hasMissing) {
    category = 'CONFLICTING_CHECKS';
  } else if (missingMethods.size >= 2) {
    category = 'CONFIRMED_DISCOVERY_FAILURE';
    conclusive = true;
  } else if (hasError) {
    category = 'CHECK_INFRASTRUCTURE_FAILURE';
  }

  const contentAnalysis = analyzeContentAndPublishingSignals(publication, context);

  return {
    article_id: publication.article_id,
    category,
    independent_methods: methods,
    evidence,
    conclusive,
    analyzed_at: validDateOrNow(now),
    compared_indexed_article_ids: contentAnalysis.comparedIds,
    findings: contentAnalysis.findings,
    recommended_changes: contentAnalysis.recommendations,
  };
}

function finding(
  signal: RootCauseSignal,
  status: RootCauseFinding['status'],
  details: string,
): RootCauseFinding {
  return { signal, status, details };
}

function latestAuditFor(articleId: string, audits: readonly AuditRecord[]): AuditRecord | undefined {
  return [...audits]
    .filter((audit) => audit.article_id === articleId)
    .sort((left, right) => (Date.parse(right.created_at) || 0) - (Date.parse(left.created_at) || 0))[0];
}

function previousPublicationIntervalMinutes(
  articleId: string,
  state: PublicationState,
): number | null {
  const ordered = [...state.history]
    .filter((entry) => Number.isFinite(Date.parse(entry.published_at)))
    .sort((left, right) => Date.parse(left.published_at) - Date.parse(right.published_at));
  const index = ordered.findIndex((entry) => entry.article_id === articleId);
  if (index <= 0) return null;
  return (Date.parse(ordered[index].published_at) - Date.parse(ordered[index - 1].published_at)) / 60_000;
}

function keywordDensity(keyword: string, body: string): number | null {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedBody = normalizeText(body);
  if (!normalizedKeyword || !normalizedBody) return null;
  const occurrenceCount = normalizedBody.split(normalizedKeyword).length - 1;
  const bodyTokens = tokenize(normalizedBody).length;
  if (bodyTokens === 0) return null;
  return (occurrenceCount * Math.max(1, tokenize(normalizedKeyword).length)) / bodyTokens;
}

function analyzeContentAndPublishingSignals(
  publication: MonitoredPublication,
  context?: RootCauseContext,
): { comparedIds: string[]; findings: RootCauseFinding[]; recommendations: string[] } {
  if (!context) {
    return {
      comparedIds: [],
      findings: [finding('visibility', 'RISK', `Exposure status is ${publication.exposure_status}.`)],
      recommendations: ['Collect indexed comparison posts before resuming automatic publishing.'],
    };
  }

  const current = context.recentPosts.find((post) => post.article_id === publication.article_id);
  const indexed = context.recentPosts.filter((post) => (
    post.article_id !== publication.article_id && post.exposure_status === 'INDEXED'
  ));
  const audit = latestAuditFor(publication.article_id, context.audits);
  const findings: RootCauseFinding[] = [];
  const recommendations: string[] = [];

  const intentMismatch = audit?.quality_scores?.keyword_intent_mismatch === true
    || audit?.quality_scores?.fatal_errors.includes('keyword_body_mismatch') === true;
  findings.push(audit
    ? finding('search_intent_alignment', intentMismatch ? 'RISK' : 'PASS', intentMismatch
      ? 'The stored quality report contains a keyword-intent mismatch.'
      : 'No keyword-intent mismatch is recorded.')
    : finding('search_intent_alignment', 'UNKNOWN', 'No audit record is available.'));

  if (current) {
    const titleCoverage = tokenCoverage(current.title, current.body);
    findings.push(finding('title_body_alignment', titleCoverage < 0.25 ? 'RISK' : 'PASS', `Title token coverage in body: ${titleCoverage.toFixed(3)}.`));

    const openingScores = indexed.map((post) => introCharNgramCosine(current.intro, post.intro));
    const maxOpening = openingScores.length > 0 ? Math.max(...openingScores) : null;
    findings.push(maxOpening === null
      ? finding('repeated_opening', 'UNKNOWN', 'No indexed comparison opening is available.')
      : finding('repeated_opening', maxOpening > 0.65 ? 'RISK' : 'PASS', `Maximum indexed-opening cosine: ${maxOpening.toFixed(3)}.`));

    const headingScores = indexed.map((post) => headingOverlapRatio(current.headings, post.headings));
    const maxHeading = headingScores.length > 0 ? Math.max(...headingScores) : null;
    findings.push(maxHeading === null
      ? finding('repeated_headings', 'UNKNOWN', 'No indexed heading set is available.')
      : finding('repeated_headings', maxHeading > 0.5 ? 'RISK' : 'PASS', `Maximum indexed-heading overlap: ${maxHeading.toFixed(3)}.`));

    const density = keywordDensity(audit?.primary_keyword || '', current.body);
    findings.push(density === null
      ? finding('keyword_stuffing', 'UNKNOWN', 'Primary keyword or body is unavailable.')
      : finding('keyword_stuffing', density > 0.05 ? 'RISK' : 'PASS', `Primary-keyword density: ${(density * 100).toFixed(2)}%.`));
  } else {
    findings.push(finding('title_body_alignment', 'UNKNOWN', 'Current article body is unavailable.'));
    findings.push(finding('repeated_opening', 'UNKNOWN', 'Current article opening is unavailable.'));
    findings.push(finding('repeated_headings', 'UNKNOWN', 'Current article headings are unavailable.'));
    findings.push(finding('keyword_stuffing', 'UNKNOWN', 'Current article body is unavailable.'));
  }

  const similarityRisk = audit?.similarity_scores.risk;
  findings.push(similarityRisk
    ? finding('similarity', similarityRisk === 'HIGH' ? 'RISK' : 'PASS', `Stored similarity risk: ${similarityRisk}.`)
    : finding('similarity', 'UNKNOWN', 'Similarity report is unavailable.'));
  findings.push(audit
    ? finding('source_coverage', (audit.source_ids?.length || 0) === 0 ? 'RISK' : 'PASS', `Recorded source count: ${audit.source_ids?.length || 0}.`)
    : finding('source_coverage', 'UNKNOWN', 'Source audit is unavailable.'));
  findings.push(audit
    ? finding('exaggerated_claims', (audit.unsupported_claims?.length || 0) > 0 ? 'RISK' : 'PASS', `Unsupported claim count: ${audit.unsupported_claims?.length || 0}.`)
    : finding('exaggerated_claims', 'UNKNOWN', 'Claim audit is unavailable.'));

  const interval = previousPublicationIntervalMinutes(publication.article_id, context.state);
  findings.push(interval === null
    ? finding('publish_interval', 'UNKNOWN', 'A previous publication timestamp is unavailable.')
    : finding('publish_interval', interval < 30 ? 'RISK' : 'PASS', `Previous publication interval: ${interval.toFixed(1)} minutes.`));
  const infrastructureErrors = publication.exposure_checks.filter((check) => check.outcome === 'ERROR');
  findings.push(finding('publish_error', infrastructureErrors.length > 0 ? 'RISK' : 'PASS', `Exposure infrastructure errors: ${infrastructureErrors.length}.`));
  findings.push(finding('visibility', publication.exposure_status === 'MISSING_CONFIRMED' ? 'RISK' : 'PASS', `Exposure status: ${publication.exposure_status}.`));

  const riskySignals = new Set(findings.filter((item) => item.status === 'RISK').map((item) => item.signal));
  if (riskySignals.has('search_intent_alignment') || riskySignals.has('title_body_alignment')) {
    recommendations.push('Rebuild the article around one explicit reader question and verify title-body alignment.');
  }
  if (riskySignals.has('repeated_opening') || riskySignals.has('repeated_headings') || riskySignals.has('similarity')) {
    recommendations.push('Choose a new topic angle and redesign the opening and structure instead of replacing words.');
  }
  if (riskySignals.has('source_coverage') || riskySignals.has('exaggerated_claims')) {
    recommendations.push('Add verifiable first-party or official sources and remove unsupported claims.');
  }
  if (riskySignals.has('publish_interval') || riskySignals.has('publish_error')) {
    recommendations.push('Correct the publishing conditions, then run one manually approved test post.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Run one manually approved test post and verify it with independent exposure checks.');
  }

  return {
    comparedIds: indexed.map((post) => post.article_id),
    findings,
    recommendations: [...new Set(recommendations)],
  };
}

export function evaluateResumeApproval(
  state: PublicationState,
  approval: ResumeApprovalInput,
  config: ContentPolicyConfig,
): ResumeGateResult {
  const reasons: ResumeBlockReason[] = [];
  if (state.status !== 'PAUSED') reasons.push('PUBLICATION_NOT_PAUSED');
  if (!approval.approvedBy.trim()) reasons.push('RESUME_APPROVER_REQUIRED');
  if (config.monitoring.require_root_cause_analysis && !approval.rootCauseReviewed) {
    reasons.push('ROOT_CAUSE_REVIEW_REQUIRED');
  }
  if (config.monitoring.require_manual_test_before_resume && !approval.manualTestVerified) {
    reasons.push('MANUAL_TEST_REQUIRED');
  }
  if (config.monitoring.require_manual_test_before_resume) {
    const evidence = state.manual_test_evidence;
    const pausedAt = Date.parse(state.paused_at || '');
    const verifiedAt = Date.parse(evidence?.verified_at || '');
    if (!evidence?.passed
      || !Number.isFinite(verifiedAt)
      || (Number.isFinite(pausedAt) && verifiedAt < pausedAt)) {
      reasons.push('MANUAL_TEST_EVIDENCE_REQUIRED');
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Resumes automatic publishing only after the configured operator gates pass.
 * A successful resume clears both scoped pauses and the missing streak.
 */
export function resumePublicationState(
  state: PublicationState,
  approval: ResumeApprovalInput,
  config: ContentPolicyConfig,
  now: Date = new Date(),
): PublicationState {
  const decision = evaluateResumeApproval(state, approval, config);
  if (!decision.allowed) {
    throw new Error(decision.reasons.join(','));
  }

  const approvedAt = validDateOrNow(now);
  return {
    ...state,
    status: 'ACTIVE',
    pause_reason: undefined,
    paused_at: undefined,
    pause_incident: undefined,
    paused_templates: [],
    paused_structures: [],
    confirmed_missing_streak: 0,
    history: state.history.map((entry) => ({ ...entry })),
    resume_approval: {
      approved_by: approval.approvedBy.trim(),
      approved_at: approvedAt,
      root_cause_reviewed: approval.rootCauseReviewed,
      manual_test_verified: approval.manualTestVerified,
      manual_test_article_id: state.manual_test_evidence?.article_id,
    },
    manual_test_evidence: undefined,
  };
}

export const evaluateResumeGate = evaluateResumeApproval;
export const resumePublication = resumePublicationState;
