export interface ContentGenerationSnapshotOptions {
  readonly signal?: AbortSignal;
  readonly v3Allowlist?: readonly string[];
}

export interface ContentGenerationSnapshot<Source, Options> {
  readonly source: Source;
  readonly options: Options;
}

/**
 * Clone mutable generation data for shadow work without corrupting AbortSignal.
 * Node's structuredClone turns AbortSignal into a plain inert object.
 */
export function snapshotContentGenerationInput<
  Source,
  Options extends ContentGenerationSnapshotOptions,
>(
  source: Source,
  options: Options,
): Readonly<ContentGenerationSnapshot<Source, Options>> {
  const { signal, v3Allowlist, ...cloneableOptions } = options;
  const clonedOptions = structuredClone(cloneableOptions);
  const safeAllowlist = Array.isArray(v3Allowlist)
    ? Object.freeze([...v3Allowlist])
    : v3Allowlist;

  const snapshotOptions = Object.freeze({
    ...clonedOptions,
    ...(safeAllowlist !== undefined ? { v3Allowlist: safeAllowlist } : {}),
    ...(signal !== undefined ? { signal } : {}),
  }) as Options;

  return Object.freeze({
    source: structuredClone(source),
    options: snapshotOptions,
  });
}
