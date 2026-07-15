import { afterEach, describe, expect, it, vi } from 'vitest';

const APPROVED_EVIDENCE = 'a'.repeat(64);
const UNAPPROVED_EVIDENCE = 'c'.repeat(64);
const CURRENT_RUNTIME = 'b'.repeat(64);
const STALE_RUNTIME = 'd'.repeat(64);

interface SourceManifestOverrides {
  readonly schemaVersion?: unknown;
  readonly evidenceArtifactSha256?: unknown;
  readonly candidateRuntimeSha256?: unknown;
  readonly contentModes?: unknown;
}

async function loadReleaseActivation(overrides: SourceManifestOverrides = {}) {
  vi.resetModules();
  const sourceManifest = Object.freeze({
    schemaVersion: 1,
    evidenceArtifactSha256: APPROVED_EVIDENCE,
    candidateRuntimeSha256: CURRENT_RUNTIME,
    contentModes: Object.freeze(['seo']),
    ...overrides,
  });
  vi.doMock('../contentQualityV3/releaseActivationManifest.js', () => ({
    CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST: sourceManifest,
  }));
  vi.doMock('../contentQualityV3/candidateRuntimeFingerprint.js', () => ({
    CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256: CURRENT_RUNTIME,
  }));
  vi.doMock('../contentQualityV3/evidenceAttestation.js', () => ({
    APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256: Object.freeze([
      APPROVED_EVIDENCE,
    ]),
  }));
  return import('../contentQualityV3/releaseActivation');
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('../contentQualityV3/releaseActivationManifest.js');
  vi.doUnmock('../contentQualityV3/candidateRuntimeFingerprint.js');
  vi.doUnmock('../contentQualityV3/evidenceAttestation.js');
});

describe('source-controlled Content Quality V3 activation selection', () => {
  it('selects V3 only for an exact activated mode on the exact Gemini provider', async () => {
    const { resolveProductionContentQualityV3Activation } = await loadReleaseActivation();

    expect(resolveProductionContentQualityV3Activation('seo', 'gemini')).toEqual({
      requestedMode: 'v3',
      v3Allowlist: ['seo'],
    });
    expect(resolveProductionContentQualityV3Activation('homefeed', 'gemini')).toEqual({
      requestedMode: 'legacy',
      v3Allowlist: [],
    });
    expect(resolveProductionContentQualityV3Activation('seo', 'openai')).toEqual({
      requestedMode: 'legacy',
      v3Allowlist: [],
    });
    expect(resolveProductionContentQualityV3Activation('seo', 'agent-codex')).toEqual({
      requestedMode: 'legacy',
      v3Allowlist: [],
    });
  });

  it.each([
    ['unapproved evidence', { evidenceArtifactSha256: UNAPPROVED_EVIDENCE }],
    ['stale candidate runtime', { candidateRuntimeSha256: STALE_RUNTIME }],
    ['invalid schema', { schemaVersion: 2 }],
    ['unevaluated mode', { contentModes: Object.freeze(['custom']) }],
  ] as const)('fails closed for a source manifest with %s', async (_label, overrides) => {
    const { resolveProductionContentQualityV3Activation } = await loadReleaseActivation(overrides);

    expect(resolveProductionContentQualityV3Activation('seo', 'gemini')).toEqual({
      requestedMode: 'legacy',
      v3Allowlist: [],
    });
  });
});
