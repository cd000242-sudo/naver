import { TextDecoder } from 'node:util';

import type { ContentQualityV3OutputAssessment } from './evalAssessor.js';
import { assessContentQualityV3Output } from './evalAssessor.js';
import type { ContentQualityV3EvalCase } from './evalCorpusTypes.js';
import { snapshotContentQualityV3FactualEvidence } from './factualSafetyGuard.js';
import { createContentQualityV3GeminiRequestEnvelope } from './geminiRequestContract.js';
import {
  finalizeContentQualityV3PublicationCandidate,
  materializeContentQualityV3PublicationEnvelope,
} from './publicationBoundary.js';
import {
  buildContentQualityV3Prompt,
  createContentQualityV3InitialPromptOptions,
} from './prompt.js';
import { validateContentQualityV3StrictOutput } from './strictOutputValidator.js';
import { resolveContentQualityV3TitleContract } from './titleContract.js';

export const CONTENT_QUALITY_V3_EVALUATION_EVIDENCE_ERROR =
  'INVALID_CONTENT_QUALITY_V3_EVALUATION_EVIDENCE' as const;

export interface DerivedContentQualityV3CandidateEvidence {
  readonly candidateOutputBytes: Uint8Array;
  readonly assessment: ContentQualityV3OutputAssessment;
}

interface CanonicalBudget {
  nodesRemaining: number;
  stringCharsRemaining: number;
}

const UTF8_BOM = Object.freeze([0xef, 0xbb, 0xbf] as const);
const MAX_CANONICAL_NODES = 100_000;
const MAX_CANONICAL_STRING_CHARS = 4 * 1024 * 1024;
const MAX_CANONICAL_DEPTH = 32;

export class ContentQualityV3EvaluationEvidenceError extends Error {
  readonly code = CONTENT_QUALITY_V3_EVALUATION_EVIDENCE_ERROR;

  constructor() {
    super(CONTENT_QUALITY_V3_EVALUATION_EVIDENCE_ERROR);
    this.name = 'ContentQualityV3EvaluationEvidenceError';
  }
}

function invalid(): never {
  throw new ContentQualityV3EvaluationEvidenceError();
}

function canonicalizeJson(
  value: unknown,
  ancestors: WeakSet<object>,
  budget: CanonicalBudget,
  depth: number,
): string {
  budget.nodesRemaining -= 1;
  if (budget.nodesRemaining < 0 || depth > MAX_CANONICAL_DEPTH) invalid();
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid();
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    budget.stringCharsRemaining -= value.length;
    if (budget.stringCharsRemaining < 0) invalid();
    return JSON.stringify(value);
  }
  if (typeof value !== 'object' || ancestors.has(value)) return invalid();
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) invalid();
      const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
        string,
        PropertyDescriptor
      >;
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !('value' in lengthDescriptor)) invalid();
      const length = lengthDescriptor.value;
      if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) {
        invalid();
      }
      const expectedKeys = new Set([
        'length',
        ...Array.from({ length }, (_, index) => String(index)),
      ]);
      const keys = Reflect.ownKeys(value);
      if (
        keys.length !== expectedKeys.size
        || keys.some(key => typeof key !== 'string' || !expectedKeys.has(key))
      ) invalid();
      return `[${Array.from({ length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor)) invalid();
        return canonicalizeJson(descriptor.value, ancestors, budget, depth + 1);
      }).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string')) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return `{${(keys as string[]).sort().map(key => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) invalid();
      return `${JSON.stringify(key)}:${canonicalizeJson(
        descriptor.value,
        ancestors,
        budget,
        depth + 1,
      )}`;
    }).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function encodeContentQualityV3CanonicalJson(value: unknown): Uint8Array {
  return Buffer.from(canonicalizeJson(
    value,
    new WeakSet(),
    {
      nodesRemaining: MAX_CANONICAL_NODES,
      stringCharsRemaining: MAX_CANONICAL_STRING_CHARS,
    },
    0,
  ), 'utf8');
}

function parseStrictJsonBytes(bytes: Uint8Array): unknown {
  if (
    bytes.byteLength >= UTF8_BOM.length
    && UTF8_BOM.every((value, index) => bytes[index] === value)
  ) invalid();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return invalid();
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return invalid();
  }
}

export function buildContentQualityV3ExpectedRequestBytes(
  evalCase: ContentQualityV3EvalCase,
): Uint8Array {
  try {
    const prompt = buildContentQualityV3Prompt(createContentQualityV3InitialPromptOptions({
      mode: evalCase.stratum,
      source: evalCase.source,
      minChars: evalCase.minChars,
    }));
    return encodeContentQualityV3CanonicalJson(
      createContentQualityV3GeminiRequestEnvelope(prompt),
    );
  } catch (error) {
    if (error instanceof ContentQualityV3EvaluationEvidenceError) throw error;
    return invalid();
  }
}

export function deriveContentQualityV3CandidateEvidence(
  evalCase: ContentQualityV3EvalCase,
  providerResponseBytes: Uint8Array,
): DerivedContentQualityV3CandidateEvidence {
  try {
    const parsed = parseStrictJsonBytes(providerResponseBytes);
    const strictOutput = validateContentQualityV3StrictOutput(parsed);
    if (!strictOutput.ok) invalid();
    const finalized = finalizeContentQualityV3PublicationCandidate(strictOutput.content, {
      titleContract: resolveContentQualityV3TitleContract(evalCase.source),
      contentMode: evalCase.stratum,
      affiliateEvidence: evalCase.source,
      businessEvidence: evalCase.source,
      factualEvidence: snapshotContentQualityV3FactualEvidence(evalCase.source),
      minimumBodyChars: evalCase.minChars,
    });
    if (!finalized.ok) invalid();
    const materialized = materializeContentQualityV3PublicationEnvelope(finalized.envelope);
    const assessment = assessContentQualityV3Output(evalCase, strictOutput.content);
    return Object.freeze({
      candidateOutputBytes: encodeContentQualityV3CanonicalJson(materialized),
      assessment,
    });
  } catch (error) {
    if (error instanceof ContentQualityV3EvaluationEvidenceError) throw error;
    return invalid();
  }
}
