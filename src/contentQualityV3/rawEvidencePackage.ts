import { createHash, type Hash } from 'node:crypto';

import { CONTENT_QUALITY_V3_GEMINI_MODEL } from './providerPolicy.js';

export const CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_SCHEMA_VERSION = 2 as const;
export const CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_ERROR =
  'INVALID_CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE' as const;

export const CONTENT_QUALITY_V3_EVALUATION_PRICE_SNAPSHOT = Object.freeze({
  provider: 'gemini' as const,
  model: CONTENT_QUALITY_V3_GEMINI_MODEL,
  inputNanoUsdPerToken: 250,
  outputNanoUsdPerToken: 1_500,
});

export type ContentQualityV3RawEvidenceCallReason =
  | 'INITIAL'
  | 'NETWORK_RETRY'
  | 'PROVIDER_RETRY'
  | 'INVALID_OUTPUT_RETRY'
  | 'TITLE_CONTRACT_RETRY'
  | 'AFFILIATE_AUTHENTICITY_RETRY'
  | 'AFFILIATE_QUALITY_RETRY'
  | 'QUALITY_RETRY';

export type ContentQualityV3RawEvidenceCallOutcome =
  | 'SUCCESS'
  | 'PRODUCT_REJECTED'
  | 'INFRA_EXTERNAL';

export interface ContentQualityV3RawEvidenceCallBytesInput {
  readonly attempt: number;
  readonly reason: ContentQualityV3RawEvidenceCallReason;
  readonly outcome: ContentQualityV3RawEvidenceCallOutcome;
  readonly provider: 'gemini';
  readonly model: typeof CONTENT_QUALITY_V3_GEMINI_MODEL;
  readonly requestBytes: Uint8Array;
  readonly responseBytes: Uint8Array;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly backoffMsBefore: number;
}

export interface ContentQualityV3RawEvidenceRunBytesInput {
  readonly calls: readonly ContentQualityV3RawEvidenceCallBytesInput[];
  readonly finalOutputBytes: Uint8Array;
}

export interface ContentQualityV3RawEvidenceBytesInput {
  readonly caseId: string;
  readonly candidateRun: ContentQualityV3RawEvidenceRunBytesInput;
  readonly legacyRun: ContentQualityV3RawEvidenceRunBytesInput;
}

export interface ContentQualityV3RawEvidenceCall {
  readonly attempt: number;
  readonly reason: ContentQualityV3RawEvidenceCallReason;
  readonly outcome: ContentQualityV3RawEvidenceCallOutcome;
  readonly provider: 'gemini';
  readonly model: typeof CONTENT_QUALITY_V3_GEMINI_MODEL;
  readonly requestBase64: string;
  readonly responseBase64: string;
  readonly requestSha256: string;
  readonly responseSha256: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly backoffMsBefore: number;
  readonly costNanoUsd: number;
}

export interface ContentQualityV3RawEvidenceRun {
  readonly calls: readonly ContentQualityV3RawEvidenceCall[];
  readonly finalOutputBase64: string;
  readonly finalOutputSha256: string;
  readonly requestLedgerSha256: string;
  readonly responseLedgerSha256: string;
  readonly runSha256: string;
  readonly totalCostNanoUsd: number;
  readonly totalElapsedMs: number;
}

export interface ContentQualityV3RawEvidencePackageCase {
  readonly caseId: string;
  readonly candidateRun: ContentQualityV3RawEvidenceRun;
  readonly legacyRun: ContentQualityV3RawEvidenceRun;
  readonly candidateOutputSha256: string;
  readonly legacyOutputSha256: string;
  readonly requestSha256: string;
  readonly providerResponseSha256: string;
  readonly costRatio: number;
  readonly latencyRatio: number;
}

export interface ContentQualityV3RawEvidencePackage {
  readonly schemaVersion: typeof CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_SCHEMA_VERSION;
  readonly cases: readonly ContentQualityV3RawEvidencePackageCase[];
  readonly manifestSha256: string;
}

export class ContentQualityV3RawEvidencePackageError extends Error {
  readonly code = CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_ERROR;

  constructor() {
    super(CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_ERROR);
    this.name = 'ContentQualityV3RawEvidencePackageError';
  }
}

const CASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const CALL_REASONS: readonly ContentQualityV3RawEvidenceCallReason[] = Object.freeze([
  'INITIAL',
  'NETWORK_RETRY',
  'PROVIDER_RETRY',
  'INVALID_OUTPUT_RETRY',
  'TITLE_CONTRACT_RETRY',
  'AFFILIATE_AUTHENTICITY_RETRY',
  'AFFILIATE_QUALITY_RETRY',
  'QUALITY_RETRY',
]);
const CALL_OUTCOMES: readonly ContentQualityV3RawEvidenceCallOutcome[] = Object.freeze([
  'SUCCESS',
  'PRODUCT_REJECTED',
  'INFRA_EXTERNAL',
]);
const MAX_CASES = 10_000;
const MAX_CALLS_PER_RUN = 16;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
const MAX_TOKENS_PER_CALL = 100_000_000;
const MAX_TIMING_MS = 86_400_000;
const MANIFEST_DOMAIN = Buffer.from('CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_V2', 'utf8');
const REQUEST_LEDGER_DOMAIN = Buffer.from('CONTENT_QUALITY_V3_REQUEST_LEDGER_V1', 'utf8');
const RESPONSE_LEDGER_DOMAIN = Buffer.from('CONTENT_QUALITY_V3_RESPONSE_LEDGER_V1', 'utf8');
const RUN_DOMAIN = Buffer.from('CONTENT_QUALITY_V3_RAW_RUN_V1', 'utf8');

const INPUT_CASE_KEYS = Object.freeze(['caseId', 'candidateRun', 'legacyRun'] as const);
const INPUT_RUN_KEYS = Object.freeze(['calls', 'finalOutputBytes'] as const);
const INPUT_CALL_KEYS = Object.freeze([
  'attempt',
  'reason',
  'outcome',
  'provider',
  'model',
  'requestBytes',
  'responseBytes',
  'inputTokens',
  'outputTokens',
  'latencyMs',
  'backoffMsBefore',
] as const);
const PACKAGE_CALL_KEYS = Object.freeze([
  'attempt',
  'reason',
  'outcome',
  'provider',
  'model',
  'requestBase64',
  'responseBase64',
  'requestSha256',
  'responseSha256',
  'inputTokens',
  'outputTokens',
  'latencyMs',
  'backoffMsBefore',
  'costNanoUsd',
] as const);
const PACKAGE_RUN_KEYS = Object.freeze([
  'calls',
  'finalOutputBase64',
  'finalOutputSha256',
  'requestLedgerSha256',
  'responseLedgerSha256',
  'runSha256',
  'totalCostNanoUsd',
  'totalElapsedMs',
] as const);
const PACKAGE_CASE_KEYS = Object.freeze([
  'caseId',
  'candidateRun',
  'legacyRun',
  'candidateOutputSha256',
  'legacyOutputSha256',
  'requestSha256',
  'providerResponseSha256',
  'costRatio',
  'latencyRatio',
] as const);
const PACKAGE_KEYS = Object.freeze(['schemaVersion', 'cases', 'manifestSha256'] as const);

interface ByteBudget {
  remaining: number;
}

interface CallMaterial {
  readonly attempt: number;
  readonly reason: ContentQualityV3RawEvidenceCallReason;
  readonly outcome: ContentQualityV3RawEvidenceCallOutcome;
  readonly provider: 'gemini';
  readonly model: typeof CONTENT_QUALITY_V3_GEMINI_MODEL;
  readonly requestBytes: Buffer;
  readonly responseBytes: Buffer;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly backoffMsBefore: number;
}

type RunKind = 'candidate' | 'legacy';

function invalid(): never {
  throw new ContentQualityV3RawEvidencePackageError();
}

function readPlainDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) invalid();
    copy[key] = descriptor.value;
  }
  return Object.freeze(copy);
}

function readDenseArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor
  >;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !('value' in lengthDescriptor)) invalid();
  const length = lengthDescriptor.value;
  if (
    typeof length !== 'number'
    || !Number.isSafeInteger(length)
    || length < minimumLength
    || length > maximumLength
  ) invalid();
  const expectedKeys = new Set([
    'length',
    ...Array.from({ length }, (_, index) => String(index)),
  ]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.size
    || keys.some(key => typeof key !== 'string' || !expectedKeys.has(key))
  ) invalid();
  return Object.freeze(Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor)) invalid();
    return descriptor.value;
  }));
}

function readCaseId(value: unknown): string {
  if (typeof value !== 'string' || !CASE_ID_PATTERN.test(value)) invalid();
  return value;
}

function readSha256(value: unknown): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) invalid();
  return value;
}

function readSafeInteger(value: unknown, maximum: number): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
    || value > maximum
  ) invalid();
  return value;
}

function readRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid();
  return value;
}

function readReason(value: unknown): ContentQualityV3RawEvidenceCallReason {
  if (!CALL_REASONS.includes(value as ContentQualityV3RawEvidenceCallReason)) invalid();
  return value as ContentQualityV3RawEvidenceCallReason;
}

function readOutcome(value: unknown): ContentQualityV3RawEvidenceCallOutcome {
  if (!CALL_OUTCOMES.includes(value as ContentQualityV3RawEvidenceCallOutcome)) invalid();
  return value as ContentQualityV3RawEvidenceCallOutcome;
}

function readProvider(value: unknown): 'gemini' {
  if (value !== CONTENT_QUALITY_V3_EVALUATION_PRICE_SNAPSHOT.provider) invalid();
  return value;
}

function readModel(value: unknown): typeof CONTENT_QUALITY_V3_GEMINI_MODEL {
  if (value !== CONTENT_QUALITY_V3_EVALUATION_PRICE_SNAPSHOT.model) invalid();
  return value;
}

function debitBytes(bytes: Buffer, budget: ByteBudget, allowEmpty: boolean): Buffer {
  if (
    (!allowEmpty && bytes.byteLength < 1)
    || bytes.byteLength > MAX_ARTIFACT_BYTES
  ) invalid();
  budget.remaining -= bytes.byteLength;
  if (budget.remaining < 0) invalid();
  return bytes;
}

function readRawBytes(value: unknown, budget: ByteBudget, allowEmpty = false): Buffer {
  if (!(value instanceof Uint8Array)) invalid();
  return debitBytes(Buffer.from(value), budget, allowEmpty);
}

function readBase64(value: unknown, budget: ByteBudget, allowEmpty = false): Buffer {
  if (
    typeof value !== 'string'
    || (!allowEmpty && value.length === 0)
    || value.length > Math.ceil(MAX_ARTIFACT_BYTES / 3) * 4
    || value.length % 4 !== 0
    || !BASE64_PATTERN.test(value)
  ) invalid();
  const decoded = debitBytes(Buffer.from(value, 'base64'), budget, allowEmpty);
  if (decoded.toString('base64') !== value) invalid();
  return decoded;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function updateLengthPrefixed(hash: Hash, value: string | Uint8Array): void {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.byteLength));
  hash.update(length);
  hash.update(bytes);
}

function hashValues(domain: Uint8Array, values: readonly (string | Uint8Array)[]): string {
  const hash = createHash('sha256');
  updateLengthPrefixed(hash, domain);
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(BigInt(values.length));
  hash.update(count);
  for (const value of values) updateLengthPrefixed(hash, value);
  return hash.digest('hex');
}

function safeSum(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) invalid();
  return total;
}

function computeCostNanoUsd(inputTokens: number, outputTokens: number): number {
  const cost = inputTokens * CONTENT_QUALITY_V3_EVALUATION_PRICE_SNAPSHOT.inputNanoUsdPerToken
    + outputTokens * CONTENT_QUALITY_V3_EVALUATION_PRICE_SNAPSHOT.outputNanoUsdPerToken;
  if (!Number.isSafeInteger(cost)) invalid();
  return cost;
}

function buildCall(material: CallMaterial): ContentQualityV3RawEvidenceCall {
  const responseRequired = material.outcome !== 'INFRA_EXTERNAL';
  if (responseRequired && material.responseBytes.byteLength === 0) invalid();
  if (
    material.outcome === 'SUCCESS'
    && material.inputTokens + material.outputTokens === 0
  ) invalid();
  const costNanoUsd = computeCostNanoUsd(material.inputTokens, material.outputTokens);
  return Object.freeze({
    attempt: material.attempt,
    reason: material.reason,
    outcome: material.outcome,
    provider: material.provider,
    model: material.model,
    requestBase64: material.requestBytes.toString('base64'),
    responseBase64: material.responseBytes.toString('base64'),
    requestSha256: sha256(material.requestBytes),
    responseSha256: sha256(material.responseBytes),
    inputTokens: material.inputTokens,
    outputTokens: material.outputTokens,
    latencyMs: material.latencyMs,
    backoffMsBefore: material.backoffMsBefore,
    costNanoUsd,
  });
}

function readInputCall(value: unknown, budget: ByteBudget): ContentQualityV3RawEvidenceCall {
  const record = readPlainDataRecord(value, INPUT_CALL_KEYS);
  const outcome = readOutcome(record.outcome);
  return buildCall({
    attempt: readSafeInteger(record.attempt, MAX_CALLS_PER_RUN - 1),
    reason: readReason(record.reason),
    outcome,
    provider: readProvider(record.provider),
    model: readModel(record.model),
    requestBytes: readRawBytes(record.requestBytes, budget),
    responseBytes: readRawBytes(record.responseBytes, budget, outcome === 'INFRA_EXTERNAL'),
    inputTokens: readSafeInteger(record.inputTokens, MAX_TOKENS_PER_CALL),
    outputTokens: readSafeInteger(record.outputTokens, MAX_TOKENS_PER_CALL),
    latencyMs: readSafeInteger(record.latencyMs, MAX_TIMING_MS),
    backoffMsBefore: readSafeInteger(record.backoffMsBefore, MAX_TIMING_MS),
  });
}

function assertPackageCallMatches(
  record: Readonly<Record<string, unknown>>,
  call: ContentQualityV3RawEvidenceCall,
): void {
  for (const key of PACKAGE_CALL_KEYS) {
    if (record[key] !== call[key]) invalid();
  }
}

function readPackageCall(value: unknown, budget: ByteBudget): ContentQualityV3RawEvidenceCall {
  const record = readPlainDataRecord(value, PACKAGE_CALL_KEYS);
  const outcome = readOutcome(record.outcome);
  const requestBytes = readBase64(record.requestBase64, budget);
  const responseBytes = readBase64(
    record.responseBase64,
    budget,
    outcome === 'INFRA_EXTERNAL',
  );
  readSha256(record.requestSha256);
  readSha256(record.responseSha256);
  readSafeInteger(record.costNanoUsd, Number.MAX_SAFE_INTEGER);
  const call = buildCall({
    attempt: readSafeInteger(record.attempt, MAX_CALLS_PER_RUN - 1),
    reason: readReason(record.reason),
    outcome,
    provider: readProvider(record.provider),
    model: readModel(record.model),
    requestBytes,
    responseBytes,
    inputTokens: readSafeInteger(record.inputTokens, MAX_TOKENS_PER_CALL),
    outputTokens: readSafeInteger(record.outputTokens, MAX_TOKENS_PER_CALL),
    latencyMs: readSafeInteger(record.latencyMs, MAX_TIMING_MS),
    backoffMsBefore: readSafeInteger(record.backoffMsBefore, MAX_TIMING_MS),
  });
  assertPackageCallMatches(record, call);
  return call;
}

function validateCallSequence(
  kind: RunKind,
  calls: readonly ContentQualityV3RawEvidenceCall[],
): void {
  if (kind === 'candidate' && calls.length !== 1) invalid();
  calls.forEach((call, index) => {
    if (call.attempt !== index) invalid();
    if ((index === 0) !== (call.reason === 'INITIAL')) invalid();
    if (index === 0 && call.backoffMsBefore !== 0) invalid();
    if (index < calls.length - 1 && call.outcome === 'SUCCESS') invalid();
  });
  if (calls[calls.length - 1]?.outcome !== 'SUCCESS') invalid();
  if (
    kind === 'candidate'
    && (
      calls[0].reason !== 'INITIAL'
      || calls[0].outcome !== 'SUCCESS'
      || calls[0].backoffMsBefore !== 0
    )
  ) invalid();
}

function computeRequestLedgerSha256(
  calls: readonly ContentQualityV3RawEvidenceCall[],
): string {
  return hashValues(REQUEST_LEDGER_DOMAIN, calls.flatMap(call => [
    String(call.attempt),
    call.reason,
    call.provider,
    call.model,
    call.requestSha256,
  ]));
}

function computeResponseLedgerSha256(
  calls: readonly ContentQualityV3RawEvidenceCall[],
): string {
  return hashValues(RESPONSE_LEDGER_DOMAIN, calls.flatMap(call => [
    String(call.attempt),
    call.outcome,
    call.responseSha256,
    String(call.inputTokens),
    String(call.outputTokens),
    String(call.latencyMs),
    String(call.backoffMsBefore),
    String(call.costNanoUsd),
  ]));
}

function buildRun(
  kind: RunKind,
  calls: readonly ContentQualityV3RawEvidenceCall[],
  finalOutputBytes: Buffer,
): ContentQualityV3RawEvidenceRun {
  validateCallSequence(kind, calls);
  const frozenCalls = Object.freeze([...calls]);
  const finalOutputSha256 = sha256(finalOutputBytes);
  const requestLedgerSha256 = computeRequestLedgerSha256(frozenCalls);
  const responseLedgerSha256 = computeResponseLedgerSha256(frozenCalls);
  const totalCostNanoUsd = safeSum(frozenCalls.map(call => call.costNanoUsd));
  const totalElapsedMs = safeSum(frozenCalls.map(call => (
    call.backoffMsBefore + call.latencyMs
  )));
  if (totalCostNanoUsd <= 0 || totalElapsedMs <= 0) invalid();
  const runSha256 = hashValues(RUN_DOMAIN, [
    kind,
    requestLedgerSha256,
    responseLedgerSha256,
    finalOutputSha256,
    String(totalCostNanoUsd),
    String(totalElapsedMs),
  ]);
  return Object.freeze({
    calls: frozenCalls,
    finalOutputBase64: finalOutputBytes.toString('base64'),
    finalOutputSha256,
    requestLedgerSha256,
    responseLedgerSha256,
    runSha256,
    totalCostNanoUsd,
    totalElapsedMs,
  });
}

function readInputRun(
  value: unknown,
  kind: RunKind,
  budget: ByteBudget,
): ContentQualityV3RawEvidenceRun {
  const record = readPlainDataRecord(value, INPUT_RUN_KEYS);
  const calls = readDenseArray(record.calls, 1, MAX_CALLS_PER_RUN)
    .map(call => readInputCall(call, budget));
  const finalOutputBytes = readRawBytes(record.finalOutputBytes, budget);
  return buildRun(kind, calls, finalOutputBytes);
}

function assertPackageRunMatches(
  record: Readonly<Record<string, unknown>>,
  run: ContentQualityV3RawEvidenceRun,
): void {
  for (const key of PACKAGE_RUN_KEYS) {
    if (key === 'calls') continue;
    if (record[key] !== run[key]) invalid();
  }
}

function readPackageRun(
  value: unknown,
  kind: RunKind,
  budget: ByteBudget,
): ContentQualityV3RawEvidenceRun {
  const record = readPlainDataRecord(value, PACKAGE_RUN_KEYS);
  const calls = readDenseArray(record.calls, 1, MAX_CALLS_PER_RUN)
    .map(call => readPackageCall(call, budget));
  const finalOutputBytes = readBase64(record.finalOutputBase64, budget);
  readSha256(record.finalOutputSha256);
  readSha256(record.requestLedgerSha256);
  readSha256(record.responseLedgerSha256);
  readSha256(record.runSha256);
  readSafeInteger(record.totalCostNanoUsd, Number.MAX_SAFE_INTEGER);
  readSafeInteger(record.totalElapsedMs, Number.MAX_SAFE_INTEGER);
  const run = buildRun(kind, calls, finalOutputBytes);
  assertPackageRunMatches(record, run);
  return run;
}

function buildCaseFromRuns(
  caseId: string,
  candidateRun: ContentQualityV3RawEvidenceRun,
  legacyRun: ContentQualityV3RawEvidenceRun,
): ContentQualityV3RawEvidencePackageCase {
  const costRatio = candidateRun.totalCostNanoUsd / legacyRun.totalCostNanoUsd;
  const latencyRatio = candidateRun.totalElapsedMs / legacyRun.totalElapsedMs;
  if (!Number.isFinite(costRatio) || !Number.isFinite(latencyRatio)) invalid();
  return Object.freeze({
    caseId,
    candidateRun,
    legacyRun,
    candidateOutputSha256: candidateRun.finalOutputSha256,
    legacyOutputSha256: legacyRun.finalOutputSha256,
    requestSha256: candidateRun.requestLedgerSha256,
    providerResponseSha256: candidateRun.responseLedgerSha256,
    costRatio,
    latencyRatio,
  });
}

function readInputCase(
  value: unknown,
  budget: ByteBudget,
): ContentQualityV3RawEvidencePackageCase {
  const record = readPlainDataRecord(value, INPUT_CASE_KEYS);
  return buildCaseFromRuns(
    readCaseId(record.caseId),
    readInputRun(record.candidateRun, 'candidate', budget),
    readInputRun(record.legacyRun, 'legacy', budget),
  );
}

function assertPackageCaseMatches(
  record: Readonly<Record<string, unknown>>,
  evidenceCase: ContentQualityV3RawEvidencePackageCase,
): void {
  for (const key of PACKAGE_CASE_KEYS) {
    if (key === 'candidateRun' || key === 'legacyRun') continue;
    if (record[key] !== evidenceCase[key]) invalid();
  }
}

function readPackageCase(
  value: unknown,
  budget: ByteBudget,
): ContentQualityV3RawEvidencePackageCase {
  const record = readPlainDataRecord(value, PACKAGE_CASE_KEYS);
  readSha256(record.candidateOutputSha256);
  readSha256(record.legacyOutputSha256);
  readSha256(record.requestSha256);
  readSha256(record.providerResponseSha256);
  readRatio(record.costRatio);
  readRatio(record.latencyRatio);
  const evidenceCase = buildCaseFromRuns(
    readCaseId(record.caseId),
    readPackageRun(record.candidateRun, 'candidate', budget),
    readPackageRun(record.legacyRun, 'legacy', budget),
  );
  assertPackageCaseMatches(record, evidenceCase);
  return evidenceCase;
}

function computeManifestSha256(
  cases: readonly ContentQualityV3RawEvidencePackageCase[],
): string {
  return hashValues(MANIFEST_DOMAIN, cases.flatMap(item => [
    item.caseId,
    item.candidateRun.runSha256,
    item.legacyRun.runSha256,
    item.candidateOutputSha256,
    item.legacyOutputSha256,
    item.requestSha256,
    item.providerResponseSha256,
    String(item.costRatio),
    String(item.latencyRatio),
  ]));
}

function compareCaseId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezePackage(
  cases: readonly ContentQualityV3RawEvidencePackageCase[],
): ContentQualityV3RawEvidencePackage {
  const sortedCases = Object.freeze([...cases].sort((left, right) => (
    compareCaseId(left.caseId, right.caseId)
  )));
  if (new Set(sortedCases.map(item => item.caseId)).size !== sortedCases.length) invalid();
  return Object.freeze({
    schemaVersion: CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_SCHEMA_VERSION,
    cases: sortedCases,
    manifestSha256: computeManifestSha256(sortedCases),
  });
}

function buildPackage(inputs: unknown): ContentQualityV3RawEvidencePackage {
  const budget: ByteBudget = { remaining: MAX_PACKAGE_BYTES };
  const cases = readDenseArray(inputs, 1, MAX_CASES)
    .map(value => readInputCase(value, budget));
  return freezePackage(cases);
}

function validatePackage(value: unknown): ContentQualityV3RawEvidencePackage {
  const record = readPlainDataRecord(value, PACKAGE_KEYS);
  if (record.schemaVersion !== CONTENT_QUALITY_V3_RAW_EVIDENCE_PACKAGE_SCHEMA_VERSION) invalid();
  const budget: ByteBudget = { remaining: MAX_PACKAGE_BYTES };
  const cases = readDenseArray(record.cases, 1, MAX_CASES)
    .map(item => readPackageCase(item, budget));
  const sanitized = freezePackage(cases);
  if (readSha256(record.manifestSha256) !== sanitized.manifestSha256) invalid();
  return sanitized;
}

export function buildContentQualityV3RawEvidencePackage(
  inputs: readonly ContentQualityV3RawEvidenceBytesInput[],
): ContentQualityV3RawEvidencePackage {
  try {
    return buildPackage(inputs);
  } catch (error) {
    if (error instanceof ContentQualityV3RawEvidencePackageError) throw error;
    return invalid();
  }
}

export function validateContentQualityV3RawEvidencePackage(
  value: unknown,
): ContentQualityV3RawEvidencePackage {
  try {
    return validatePackage(value);
  } catch (error) {
    if (error instanceof ContentQualityV3RawEvidencePackageError) throw error;
    return invalid();
  }
}
