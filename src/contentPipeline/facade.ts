import { resolveContentPipelineMode } from './mode';
import type { ShadowQueueJob } from './shadowQueue';

export type ContentPipelineIssueCode =
  | 'v3_driver_missing'
  | 'v3_execution_failed'
  | 'v3_result_invalid';

export class ContentPipelineError extends Error {
  readonly issueCode: ContentPipelineIssueCode;

  constructor(issueCode: ContentPipelineIssueCode) {
    super(`[content-pipeline] ${issueCode}`);
    this.name = 'ContentPipelineError';
    this.issueCode = issueCode;
    Object.freeze(this);
  }
}

export type ContentPipelineValidatorResult<Result> = Readonly<
  | { ok: true; content: Result }
  | { ok: false; issueCode: string }
>;

export interface ContentPipelineSnapshot<Source, Options> {
  readonly source: Source;
  readonly options: Options;
}

export type ContentPipelineDriver<Source, Options> = (
  source: Source,
  options: Options,
) => unknown | PromiseLike<unknown>;

export interface ContentPipelineShadowQueue {
  readonly enqueue: (job: ShadowQueueJob) => unknown;
}

export interface RunContentPipelineOptions<Source, Options, Result> {
  readonly requestedMode?: unknown;
  readonly contentMode?: unknown;
  readonly v3Allowlist?: readonly string[];
  readonly source: Source;
  readonly options: Options;
  readonly legacy: ContentPipelineDriver<Source, Options>;
  readonly v3?: ContentPipelineDriver<Source, Options>;
  readonly validate: (value: unknown) => ContentPipelineValidatorResult<Result>;
  readonly shadowQueue?: ContentPipelineShadowQueue;
  readonly snapshot?: (
    source: Source,
    options: Options,
  ) => ContentPipelineSnapshot<Source, Options>;
}

function defaultSnapshot<Source, Options>(
  source: Source,
  options: Options,
): ContentPipelineSnapshot<Source, Options> {
  return structuredClone({ source, options });
}

function isValidatedResult<Result>(
  value: unknown,
): value is Readonly<{ ok: true; content: Result }> {
  try {
    return Boolean(
      value
      && typeof value === 'object'
      && (value as { ok?: unknown }).ok === true
      && 'content' in value,
    );
  } catch {
    return false;
  }
}

async function runValidatedV3<Source, Options, Result>(
  driver: ContentPipelineDriver<Source, Options>,
  source: Source,
  options: Options,
  validate: RunContentPipelineOptions<Source, Options, Result>['validate'],
): Promise<Result> {
  let candidate: unknown;
  try {
    candidate = await driver(source, options);
  } catch {
    throw new ContentPipelineError('v3_execution_failed');
  }

  let validation: ContentPipelineValidatorResult<Result> | undefined;
  try {
    validation = typeof validate === 'function' ? validate(candidate) : undefined;
  } catch {
    throw new ContentPipelineError('v3_result_invalid');
  }

  if (!isValidatedResult<Result>(validation)) {
    throw new ContentPipelineError('v3_result_invalid');
  }

  return validation.content;
}

function readShadowEnqueue(
  queue: ContentPipelineShadowQueue | undefined,
): ((job: ShadowQueueJob) => unknown) | undefined {
  try {
    if (!queue || typeof queue !== 'object') {
      return undefined;
    }

    const enqueue = queue.enqueue;
    if (typeof enqueue !== 'function') {
      return undefined;
    }

    return job => enqueue.call(queue, job);
  } catch {
    return undefined;
  }
}

function createShadowSnapshot<Source, Options>(
  source: Source,
  options: Options,
  snapshot: RunContentPipelineOptions<Source, Options, unknown>['snapshot'],
): ContentPipelineSnapshot<Source, Options> | undefined {
  try {
    const value = (snapshot ?? defaultSnapshot)(source, options);
    if (!value || typeof value !== 'object' || !('source' in value) || !('options' in value)) {
      return undefined;
    }

    return value;
  } catch {
    return undefined;
  }
}

export async function runContentPipeline<Source, Options, Result>(
  params: Readonly<RunContentPipelineOptions<Source, Options, Result>>,
): Promise<Result> {
  const mode = resolveContentPipelineMode(params.requestedMode, {
    contentMode: params.contentMode,
    v3Allowlist: params.v3Allowlist,
  });

  if (mode === 'legacy') {
    return await params.legacy(params.source, params.options) as Result;
  }

  if (mode === 'v3') {
    if (typeof params.v3 !== 'function') {
      throw new ContentPipelineError('v3_driver_missing');
    }

    return runValidatedV3(params.v3, params.source, params.options, params.validate);
  }

  const enqueue = readShadowEnqueue(params.shadowQueue);
  const v3Driver = typeof params.v3 === 'function' ? params.v3 : undefined;
  const shadowSnapshot = enqueue && v3Driver
    ? createShadowSnapshot(params.source, params.options, params.snapshot)
    : undefined;

  const legacyResult = await params.legacy(params.source, params.options) as Result;

  if (!enqueue || !v3Driver || !shadowSnapshot) {
    return legacyResult;
  }

  try {
    enqueue(async () => {
      await runValidatedV3(
        v3Driver,
        shadowSnapshot.source,
        shadowSnapshot.options,
        params.validate,
      );
    });
  } catch {
    // Shadow execution and telemetry must never affect the production result.
  }

  return legacyResult;
}
