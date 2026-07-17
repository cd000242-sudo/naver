/**
 * Production publishing prioritizes a completed user-requested post. The V3
 * quality/provenance validator remains available for explicit internal strict
 * verification, but ordinary production flows must surface its findings as a
 * warning rather than abandon a generated article, image set, or publish run.
 */
export type ContentQualityV3ProductionPublishSafetyMode = 'advisory' | 'strict';

type Environment = Readonly<Record<string, string | undefined>>;
type UnknownRecord = Record<string, unknown>;

const V3_PUBLISH_METADATA_KEYS = new Set([
  '_contentQualityV3PublishOwnerKey',
  '_contentQualityV3PostId',
  '_contentQualityV3Required',
  '_contentQualityV3PublishHandoff',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutV3PublishMetadata(value: UnknownRecord): UnknownRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !V3_PUBLISH_METADATA_KEYS.has(key)),
  );
}

export function resolveContentQualityV3ProductionPublishSafetyMode(
  env: Environment = process.env,
): ContentQualityV3ProductionPublishSafetyMode {
  return env.CONTENT_QUALITY_V3_STRICT_PUBLISH_VERIFICATION === '1'
    ? 'strict'
    : 'advisory';
}

/**
 * Drops only V3 handoff metadata. The article, images, user-supplied FTC
 * disclosure, and every other user option are retained byte-for-byte.
 */
export function stripContentQualityV3PublishMetadata<T extends object>(payload: T): T {
  const source = payload as UnknownRecord;
  const hadStructuredContent = Object.prototype.hasOwnProperty.call(source, 'structuredContent');
  const structuredContent = source.structuredContent;
  const strippedPayload = withoutV3PublishMetadata(source);

  if (!hadStructuredContent || !isRecord(structuredContent)) {
    return strippedPayload as T;
  }

  return {
    ...strippedPayload,
    structuredContent: withoutV3PublishMetadata(structuredContent),
  } as T;
}
