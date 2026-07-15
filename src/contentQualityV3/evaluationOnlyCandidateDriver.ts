import { resolve } from 'node:path';

import {
  runContentQualityV3CandidateRuntimeForEvaluationOnly,
  type ContentSource,
  type GenerateOptions,
  type StructuredContent,
} from '../contentGenerator.js';
import { EVALUATED_V3_CONTENT_MODES } from '../contentPipeline/mode.js';
import {
  finalizeContentQualityV3PublicationCandidate,
  materializeContentQualityV3PublicationEnvelope,
} from './publicationBoundary.js';
import { resolveContentQualityV3TitleContract } from './titleContract.js';
import {
  verifyContentQualityV3CandidateRuntimeFingerprint,
} from './candidateRuntimeFingerprint.js';

export type ContentQualityV3CandidateEvaluationOptions = Omit<
  GenerateOptions,
  'contentPipelineMode' | 'v3Allowlist'
>;

type EvaluatedContentMode = typeof EVALUATED_V3_CONTENT_MODES[number];

export type ContentQualityV3EvaluationOnlyIssueCode =
  | 'unsupported_mode'
  | 'runtime_fingerprint_invalid'
  | 'candidate_execution_failed'
  | 'candidate_result_invalid';

export class ContentQualityV3EvaluationOnlyError extends Error {
  readonly issueCode: ContentQualityV3EvaluationOnlyIssueCode;

  constructor(issueCode: ContentQualityV3EvaluationOnlyIssueCode) {
    super(`[content-quality-v3-evaluation] ${issueCode}`);
    this.name = 'ContentQualityV3EvaluationOnlyError';
    this.issueCode = issueCode;
    Object.freeze(this);
  }
}

function isEvaluatedMode(value: unknown): value is EvaluatedContentMode {
  return typeof value === 'string'
    && EVALUATED_V3_CONTENT_MODES.some(contentMode => contentMode === value);
}

function readContentMode(source: unknown): unknown {
  try {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(source, 'contentMode');
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

const EVALUATION_WORKSPACE_ROOT = resolve(__dirname, '../..');

/**
 * Explicit pre-release evaluation entrypoint. Production modules must use
 * generateStructuredContent, whose activation is controlled only by the
 * source-reviewed release manifest.
 */
export async function generateContentQualityV3CandidateForEvaluation(
  source: ContentSource,
  options: ContentQualityV3CandidateEvaluationOptions = {},
): Promise<StructuredContent> {
  const contentMode = readContentMode(source);
  if (!isEvaluatedMode(contentMode)) {
    throw new ContentQualityV3EvaluationOnlyError('unsupported_mode');
  }

  try {
    await verifyContentQualityV3CandidateRuntimeFingerprint(EVALUATION_WORKSPACE_ROOT);
  } catch {
    throw new ContentQualityV3EvaluationOnlyError('runtime_fingerprint_invalid');
  }

  let candidate: StructuredContent;
  try {
    candidate = await runContentQualityV3CandidateRuntimeForEvaluationOnly(source, options);
  } catch {
    throw new ContentQualityV3EvaluationOnlyError('candidate_execution_failed');
  }

  try {
    const finalized = finalizeContentQualityV3PublicationCandidate(candidate, {
      titleContract: resolveContentQualityV3TitleContract(source),
      contentMode,
      affiliateEvidence: source,
      businessEvidence: source,
      minimumBodyChars: options.minChars,
    });
    if (!finalized.ok) {
      throw new ContentQualityV3EvaluationOnlyError('candidate_result_invalid');
    }
    return materializeContentQualityV3PublicationEnvelope(finalized.envelope);
  } catch (error) {
    if (error instanceof ContentQualityV3EvaluationOnlyError) throw error;
    throw new ContentQualityV3EvaluationOnlyError('candidate_result_invalid');
  }
}
