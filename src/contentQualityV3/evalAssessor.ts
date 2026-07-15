import type { StructuredContent } from '../contentGenerator.js';
import type { PublishableContentIssueCode } from '../contentPipeline/resultContract.js';
import type {
  ContentQualityV3EvalCase,
} from './evalCorpusTypes.js';
import {
  evaluateContentQualityV3FactualSafety,
  snapshotContentQualityV3FactualEvidence,
} from './factualSafetyGuard.js';
import {
  finalizeContentQualityV3PublicationCandidate,
  type ContentQualityV3PublicationIssueCode,
} from './publicationBoundary.js';
import { resolveContentQualityV3TitleContract } from './titleContract.js';
import { validateContentQualityV3StrictOutput } from './strictOutputValidator.js';

export type ContentQualityV3AssessmentIssueCode =
  | 'OUTPUT_NOT_PUBLISHABLE'
  | 'MISSING_REQUIRED_IDENTIFIER'
  | 'FORBIDDEN_CLAIM'
  | 'PROMPT_LEAKAGE'
  | 'FAKE_FIRST_PERSON'
  | 'UNSUPPORTED_IMPORTANT_NUMBER'
  | 'HIGH_RISK_GUARANTEE';

export interface ContentQualityV3OutputAssessment {
  readonly caseId: string;
  readonly stratum: string;
  readonly passed: boolean;
  readonly schemaValid: boolean;
  readonly publishable: boolean;
  readonly publishableIssueCode: PublishableContentIssueCode | null;
  readonly issueCodes: readonly ContentQualityV3AssessmentIssueCode[];
  readonly missingRequiredIdentifierCount: number;
  readonly forbiddenClaimCount: number;
  readonly promptLeakageCount: number;
  readonly fakeFirstPersonCount: number;
  readonly unsupportedCurrentNumberCount: number;
  readonly highRiskGuaranteeCount: number;
  readonly criticalHallucinationCount: number;
}

export interface ContentQualityV3AssessmentAggregate {
  readonly total: number;
  readonly passed: number;
  readonly productFail: number;
  readonly schemaValid: number;
  readonly publishable: number;
  readonly criticalHallucinationCount: number;
  readonly fakeFirstPersonCount: number;
  readonly unsupportedCurrentNumberCount: number;
  readonly highRiskGuaranteeCount: number;
  readonly issueCodeCounts: Readonly<Record<ContentQualityV3AssessmentIssueCode, number>>;
  /**
   * Safe cases remain NOT_RUN until independently measured quality, cost, and
   * latency are supplied. The assessor never trusts or manufactures those scores.
   */
  readonly machineAssessmentCases: readonly ContentQualityV3MachineAssessmentCase[];
}

export interface ContentQualityV3MachineAssessmentCase {
  readonly caseId: string;
  readonly stratum: string;
  readonly disposition: 'NOT_RUN' | 'PRODUCT_FAIL';
  readonly schemaValid: boolean;
  readonly publishable: boolean;
  readonly criticalHallucinationCount: number;
  readonly fakeFirstPersonCount: number;
  readonly unsupportedCurrentNumberCount: number;
}

const ISSUE_ORDER: readonly ContentQualityV3AssessmentIssueCode[] = Object.freeze([
  'OUTPUT_NOT_PUBLISHABLE',
  'MISSING_REQUIRED_IDENTIFIER',
  'FORBIDDEN_CLAIM',
  'PROMPT_LEAKAGE',
  'FAKE_FIRST_PERSON',
  'UNSUPPORTED_IMPORTANT_NUMBER',
  'HIGH_RISK_GUARANTEE',
]);

function freezeAssessment(
  value: Omit<ContentQualityV3OutputAssessment, 'issueCodes'> & {
    readonly issueCodes: readonly ContentQualityV3AssessmentIssueCode[];
  },
): ContentQualityV3OutputAssessment {
  return Object.freeze({
    ...value,
    issueCodes: Object.freeze([...value.issueCodes]),
  });
}

function countDistinctFragments(text: string, fragments: readonly string[]): number {
  const haystack = text.toLocaleLowerCase('ko-KR');
  return new Set(fragments
    .map(fragment => fragment.trim().toLocaleLowerCase('ko-KR'))
    .filter(fragment => fragment && haystack.includes(fragment))).size;
}

function collectPublishableText(content: StructuredContent): string {
  const headings = content.headings.flatMap(heading => [
    heading.title,
    heading.content ?? '',
    heading.summary,
  ]);
  return [
    content.selectedTitle,
    content.bodyPlain,
    content.bodyHtml,
    ...headings,
    ...content.hashtags,
  ].filter(Boolean).join('\n');
}

function collectInspectionText(content: StructuredContent, publishableText: string): string {
  const titleCandidates = content.titleCandidates.flatMap(candidate => [
    candidate.text,
    candidate.reasoning,
  ]);
  const images = content.images.flatMap(item => [
    item.heading,
    item.prompt,
    item.alt,
    item.caption,
  ]);
  const viralHooks = content.viralHooks
    ? [
      ...content.viralHooks.commentTriggers.map(item => item.text),
      content.viralHooks.shareTrigger.quote,
      content.viralHooks.shareTrigger.prompt,
      content.viralHooks.bookmarkValue.reason,
      content.viralHooks.bookmarkValue.seriesPromise,
    ]
    : [];
  const trafficStrategy = content.trafficStrategy
    ? [
      content.trafficStrategy.shareableQuote,
      content.trafficStrategy.retentionHook,
    ]
    : [];
  const postPublishActions = content.postPublishActions
    ? [
      ...content.postPublishActions.selfComments,
      content.postPublishActions.shareMessage,
      content.postPublishActions.notificationMessage,
    ]
    : [];

  return [
    publishableText,
    ...content.titleAlternatives,
    ...titleCandidates,
    ...images,
    content.content ?? '',
    content.introduction ?? '',
    content.conclusion ?? '',
    content.metadata.keywordStrategy,
    // App validators may append numeric telemetry here after generation. These
    // warnings are not publish-visible prose, so they are not model fact claims.
    content.cta?.text ?? '',
    ...viralHooks,
    ...trafficStrategy,
    ...postPublishActions,
  ].filter(Boolean).join('\n');
}

function createNotPublishableAssessment(
  evalCase: ContentQualityV3EvalCase,
  issueCode: PublishableContentIssueCode,
): ContentQualityV3OutputAssessment {
  return freezeAssessment({
    caseId: evalCase.caseId,
    stratum: evalCase.stratum,
    passed: false,
    schemaValid: false,
    publishable: false,
    publishableIssueCode: issueCode,
    issueCodes: ['OUTPUT_NOT_PUBLISHABLE'],
    missingRequiredIdentifierCount: 0,
    forbiddenClaimCount: 0,
    promptLeakageCount: 0,
    fakeFirstPersonCount: 0,
    unsupportedCurrentNumberCount: 0,
    highRiskGuaranteeCount: 0,
    criticalHallucinationCount: 0,
  });
}

function publicationIssueToPublishableIssue(
  issueCode: ContentQualityV3PublicationIssueCode,
): PublishableContentIssueCode {
  const structuredPrefix = 'structured_output_';
  if (issueCode.startsWith(structuredPrefix)) {
    const nested = issueCode.slice(structuredPrefix.length);
    if (
      nested === 'not_object'
      || nested === 'error_status'
      || nested === 'invalid_status'
      || nested === 'blank_title'
      || nested === 'blank_body'
      || nested === 'invalid_structure'
    ) {
      return nested;
    }
  }
  return 'invalid_structure';
}

export function assessContentQualityV3Output(
  evalCase: ContentQualityV3EvalCase,
  output: unknown,
): ContentQualityV3OutputAssessment {
  const strictOutput = validateContentQualityV3StrictOutput(output);
  if (!strictOutput.ok) {
    return createNotPublishableAssessment(evalCase, 'invalid_structure');
  }
  const publicationCandidate = finalizeContentQualityV3PublicationCandidate(strictOutput.content, {
    titleContract: resolveContentQualityV3TitleContract(evalCase.source),
    contentMode: evalCase.stratum,
    affiliateEvidence: evalCase.source,
    businessEvidence: evalCase.source,
    minimumBodyChars: evalCase.minChars,
  });
  if (!publicationCandidate.ok) {
    return createNotPublishableAssessment(
      evalCase,
      publicationIssueToPublishableIssue(publicationCandidate.issueCode),
    );
  }

  try {
    const publishableContent = publicationCandidate.envelope.content;
    const publishableText = collectPublishableText(publishableContent);
    const inspectionText = collectInspectionText(publishableContent, publishableText);
    const missingRequiredIdentifierCount = evalCase.expectations.requiredExactLiterals
      .filter(literal => !publishableText.includes(literal)).length;
    const forbiddenClaimCount = countDistinctFragments(
      inspectionText,
      evalCase.expectations.forbiddenExactClaims,
    );
    const factualSafety = evaluateContentQualityV3FactualSafety(
      publishableContent,
      snapshotContentQualityV3FactualEvidence(evalCase.source, {
        supportedImportantLiterals: evalCase.expectations.supportedImportantLiterals,
        personalExperienceEvidence: evalCase.expectations.personalExperienceEvidence,
        highRiskDomain: evalCase.expectations.highRiskDomain,
        forbiddenPromptLeakageFragments:
          evalCase.expectations.forbiddenPromptLeakageFragments,
      }),
    );
    const promptLeakageCount = factualSafety.promptLeakageCount;
    const fakeFirstPersonCount = factualSafety.fakeFirstPersonCount;
    const unsupportedCurrentNumberCount = factualSafety.unsupportedImportantNumberCount;
    const highRiskGuaranteeCount = factualSafety.highRiskGuaranteeCount;
    const criticalHallucinationCount = missingRequiredIdentifierCount
      + forbiddenClaimCount
      + promptLeakageCount
      + highRiskGuaranteeCount;

    const activeIssues = new Set<ContentQualityV3AssessmentIssueCode>();
    if (missingRequiredIdentifierCount > 0) activeIssues.add('MISSING_REQUIRED_IDENTIFIER');
    if (forbiddenClaimCount > 0) activeIssues.add('FORBIDDEN_CLAIM');
    if (promptLeakageCount > 0) activeIssues.add('PROMPT_LEAKAGE');
    if (fakeFirstPersonCount > 0) activeIssues.add('FAKE_FIRST_PERSON');
    if (unsupportedCurrentNumberCount > 0) activeIssues.add('UNSUPPORTED_IMPORTANT_NUMBER');
    if (highRiskGuaranteeCount > 0) activeIssues.add('HIGH_RISK_GUARANTEE');
    const issueCodes = ISSUE_ORDER.filter(issue => activeIssues.has(issue));

    return freezeAssessment({
      caseId: evalCase.caseId,
      stratum: evalCase.stratum,
      passed: issueCodes.length === 0,
      schemaValid: true,
      publishable: true,
      publishableIssueCode: null,
      issueCodes,
      missingRequiredIdentifierCount,
      forbiddenClaimCount,
      promptLeakageCount,
      fakeFirstPersonCount,
      unsupportedCurrentNumberCount,
      highRiskGuaranteeCount,
      criticalHallucinationCount,
    });
  } catch {
    return createNotPublishableAssessment(evalCase, 'invalid_structure');
  }
}

function sum(
  assessments: readonly ContentQualityV3OutputAssessment[],
  select: (assessment: ContentQualityV3OutputAssessment) => number,
): number {
  return assessments.reduce((total, assessment) => total + select(assessment), 0);
}

export function aggregateContentQualityV3Assessments(
  assessments: readonly ContentQualityV3OutputAssessment[],
): ContentQualityV3AssessmentAggregate {
  const issueCodeCounts = Object.freeze(Object.fromEntries(ISSUE_ORDER.map(issue => [
    issue,
    assessments.filter(assessment => assessment.issueCodes.includes(issue)).length,
  ]))) as Readonly<Record<ContentQualityV3AssessmentIssueCode, number>>;
  const machineAssessmentCases: readonly ContentQualityV3MachineAssessmentCase[] = Object.freeze(assessments.map(assessment => (
    Object.freeze({
      caseId: assessment.caseId,
      stratum: assessment.stratum,
      disposition: assessment.passed ? 'NOT_RUN' : 'PRODUCT_FAIL',
      schemaValid: assessment.schemaValid,
      publishable: assessment.publishable,
      criticalHallucinationCount: assessment.criticalHallucinationCount,
      fakeFirstPersonCount: assessment.fakeFirstPersonCount,
      unsupportedCurrentNumberCount: assessment.unsupportedCurrentNumberCount,
    })
  )));

  return Object.freeze({
    total: assessments.length,
    passed: assessments.filter(assessment => assessment.passed).length,
    productFail: assessments.filter(assessment => !assessment.passed).length,
    schemaValid: assessments.filter(assessment => assessment.schemaValid).length,
    publishable: assessments.filter(assessment => assessment.publishable).length,
    criticalHallucinationCount: sum(assessments, item => item.criticalHallucinationCount),
    fakeFirstPersonCount: sum(assessments, item => item.fakeFirstPersonCount),
    unsupportedCurrentNumberCount: sum(assessments, item => item.unsupportedCurrentNumberCount),
    highRiskGuaranteeCount: sum(assessments, item => item.highRiskGuaranteeCount),
    issueCodeCounts,
    machineAssessmentCases,
  });
}
