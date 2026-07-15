/**
 * Source-review release switch data. This file is deliberately excluded from
 * the candidate-runtime fingerprint to avoid a digest self-reference cycle.
 */
export const CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST = Object.freeze({
  schemaVersion: 1 as const,
  evidenceArtifactSha256: null as string | null,
  candidateRuntimeSha256: null as string | null,
  contentModes: Object.freeze([] as string[]),
});
