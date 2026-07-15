export type ContentPipelineMode = 'legacy' | 'shadow' | 'v3';

export const DEFAULT_V3_CONTENT_MODE_ALLOWLIST: readonly string[] = Object.freeze([]);

export const EVALUATED_V3_CONTENT_MODES = Object.freeze([
  'seo',
  'homefeed',
  'affiliate',
  'business',
  'mate',
] as const);

export const FORCED_LEGACY_CONTENT_MODES = Object.freeze([
  'image-narrative',
  'traffic-hunter',
] as const);

export interface ContentPipelineModeOptions {
  readonly contentMode?: unknown;
  readonly v3Allowlist?: readonly string[];
}

function isContentPipelineMode(value: unknown): value is ContentPipelineMode {
  return value === 'legacy' || value === 'shadow' || value === 'v3';
}

function isForcedLegacyContentMode(value: unknown): boolean {
  return FORCED_LEGACY_CONTENT_MODES.some(contentMode => contentMode === value);
}

function isEvaluatedV3ContentMode(value: string): boolean {
  return EVALUATED_V3_CONTENT_MODES.some(contentMode => contentMode === value);
}

export function resolveContentPipelineMode(
  requestedMode: unknown,
  options: Readonly<ContentPipelineModeOptions> = {},
): ContentPipelineMode {
  if (!isContentPipelineMode(requestedMode) || requestedMode === 'legacy') {
    return 'legacy';
  }

  if (isForcedLegacyContentMode(options.contentMode)) {
    return 'legacy';
  }

  if (requestedMode === 'shadow') {
    return 'shadow';
  }

  if (typeof options.contentMode !== 'string') {
    return 'legacy';
  }

  const injectedAllowlist = options.v3Allowlist;
  const v3Allowlist = injectedAllowlist === undefined
    ? DEFAULT_V3_CONTENT_MODE_ALLOWLIST
    : Array.isArray(injectedAllowlist)
      && injectedAllowlist.every(item => typeof item === 'string')
      ? injectedAllowlist
      : DEFAULT_V3_CONTENT_MODE_ALLOWLIST;
  return isEvaluatedV3ContentMode(options.contentMode)
    && v3Allowlist.includes(options.contentMode)
    ? 'v3'
    : 'legacy';
}
