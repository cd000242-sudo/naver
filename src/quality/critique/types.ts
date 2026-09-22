// [2026-09-22 Critique Loop] Shared types for the post-draft quality loop
// (deterministic precheck -> Critic 1 -> targeted revision -> verification ->
// editorial critic -> final judge). Feature-flagged, default OFF (see flag.ts).

export type IssueSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

export type IssueType =
  | 'FACT_ERROR'
  | 'CONTRADICTION'
  | 'MIXED_ENTITY'
  | 'UNSUPPORTED_VALUE'
  | 'MISSING_INFORMATION'
  | 'TITLE_PROMISE'
  | 'SEARCH_INTENT'
  | 'REDUNDANCY'
  | 'STRUCTURE'
  | 'STYLE'
  | 'PRECHECK';

export type IssueOperation = 'ADD' | 'REMOVE' | 'REPLACE' | 'REORDER';

export type IssueState = 'OPEN' | 'PENDING_VERIFICATION' | 'RESOLVED' | 'REGRESSED' | 'ADVISORY';

export type CriticStatus = 'PASS' | 'REVISION_REQUIRED' | 'NEEDS_MORE_RESEARCH';

/** One issue as the Critic emits it (before validation). */
export interface RawIssue {
  issueKey?: string;
  severity?: string;
  type?: string;
  sectionId?: string;
  exactSpan?: string;
  operation?: string;
  evidenceIds?: unknown;
  problem?: string;
  requiredChange?: string;
}

export interface RawCriticOutput {
  status?: string;
  issues?: RawIssue[];
  researchQueries?: unknown;
}

/** A validated issue with a stable fingerprint and lifecycle state. */
export interface QualityIssue {
  readonly issueKey: string;
  readonly severity: IssueSeverity;
  readonly type: IssueType;
  readonly sectionId: string;
  readonly exactSpan: string;
  readonly operation: IssueOperation;
  readonly evidenceIds: readonly string[];
  readonly problem: string;
  readonly requiredChange: string;
  /** For MISSING_INFORMATION + ADD: the H2/H3 title the insertion anchors to. */
  readonly insertionAnchor?: string;
  readonly state: IssueState;
  /** 'critic' | 'precheck' | 'editorial' — where the issue came from. */
  readonly origin: 'critic' | 'precheck' | 'editorial';
  readonly round: number;
  /** Why a raw issue was demoted/dropped (validator note). */
  readonly note?: string;
}

export type SectionKind = 'intro' | 'section' | 'conclusion' | 'cta';

export interface ArticleSection {
  readonly id: string;
  readonly kind: SectionKind;
  readonly title: string;
  readonly text: string;
  /** For 'section': the index into StructuredContent.headings. */
  readonly headingIndex?: number;
  readonly level?: 'h2' | 'h3';
}

export interface ArticleModel {
  readonly title: string;
  readonly sections: readonly ArticleSection[];
  readonly hashtags: readonly string[];
  /** Whether bodyPlain carries the heading titles (publish types bodyPlain in that case). */
  readonly bodyHasHeadingMarkers: boolean;
}

export interface EvidenceItem {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly date: string;
  readonly excerpt: string;
}

export interface EvidencePack {
  readonly items: readonly EvidenceItem[];
  readonly keyFacts: readonly string[];
  readonly keyDates: readonly string[];
  readonly readerQuestions: readonly string[];
  readonly sourceCount: number;
}

export interface CriticResult {
  readonly status: CriticStatus;
  readonly issues: readonly QualityIssue[];
  readonly dropped: readonly QualityIssue[];
  readonly researchQueries: readonly string[];
  readonly rawText: string;
}

export interface RevisionResult {
  readonly sections: Readonly<Record<string, string>>;
  readonly patchedIssueKeys: readonly string[];
  readonly targetedSectionIds: readonly string[];
  /** Sections the editor returned but was not asked to touch (dropped, counted as over-edit attempts). */
  readonly rejectedSectionIds: readonly string[];
  readonly rawText: string;
}

export interface VerificationResult {
  readonly resolved: readonly string[];
  readonly stillOpen: readonly string[];
  readonly newIssues: readonly QualityIssue[];
  readonly rawText: string;
}

export interface JudgeIssue {
  readonly type: string;
  readonly sectionId: string;
  readonly exactSpan: string;
  readonly reason: string;
}

export interface JudgeResult {
  readonly decision: 'PASS' | 'BLOCK';
  readonly blockingIssues: readonly JudgeIssue[];
  readonly advisory: readonly string[];
  readonly demoted: readonly string[];
  readonly rawText: string;
}

export interface QualityCallRecord {
  readonly stage: 'critic' | 'revision' | 'verification' | 'editorial' | 'judge' | 'research';
  readonly engine: string;
  readonly promptChars: number;
  readonly responseChars: number;
  readonly elapsedMs: number;
  readonly round: number;
}

export interface CostLedger {
  readonly baseCalls: number;
  readonly qualityCalls: number;
  readonly totalCalls: number;
  readonly baseCostUsd: number | null;
  readonly qualityCostUsd: number | null;
  readonly totalCostUsd: number | null;
  readonly qualityPromptChars: number;
  readonly qualityResponseChars: number;
  readonly calls: readonly QualityCallRecord[];
}

export interface PreservationReport {
  readonly unchangedSections: number;
  readonly revisedSections: number;
  readonly flaggedSections: readonly string[];
  readonly untouchedPreserved: boolean;
  readonly lostNumbers: readonly string[];
  readonly lostDates: readonly string[];
  readonly lostOrganizations: readonly string[];
}

export interface QualityMetrics {
  readonly coreFactCoverage: number | null;
  readonly readerQuestionCoverage: number | null;
  readonly vagueSentenceRatio: number;
  readonly redundantCoreFacts: number;
  readonly actionability: number;
}

export type QualityLoopDecision = 'QUALITY_CONVERGED' | 'MANUAL_REVIEW' | 'SKIPPED';

export interface QualityLoopSummary {
  readonly enabled: boolean;
  readonly decision: QualityLoopDecision;
  readonly fastPath: boolean;
  readonly revisionCycles: number;
  readonly researchRecoveries: number;
  readonly manualReviewReasons: readonly string[];
  readonly models: Readonly<Record<'criticModel' | 'revisionModel' | 'verificationModel' | 'editorialModel' | 'judgeModel', string>>;
  readonly cost: CostLedger;
  readonly preservation: PreservationReport;
  readonly metrics: QualityMetrics;
  readonly issues: readonly QualityIssue[];
  readonly judge: Pick<JudgeResult, 'decision' | 'blockingIssues' | 'advisory'> | null;
}

/** One LLM route (the user's selected engine, quality tier). Injected so tests can fake it. */
export interface QualityRoute {
  readonly engine: string;
  readonly subscription?: boolean;
  readonly callModel: (prompt: string, options?: { maxTokens?: number; timeoutMs?: number }) => Promise<string>;
}
