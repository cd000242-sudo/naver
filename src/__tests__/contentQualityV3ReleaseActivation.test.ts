import { describe, expect, it, vi } from 'vitest';

const digests = vi.hoisted(() => ({
  approvedEvidence: 'a'.repeat(64),
  currentRuntime: 'b'.repeat(64),
  unapprovedEvidence: 'c'.repeat(64),
  staleRuntime: 'd'.repeat(64),
}));

vi.mock('../contentQualityV3/evidenceAttestation.js', () => ({
  APPROVED_CONTENT_QUALITY_V3_EVIDENCE_ARTIFACT_SHA256: Object.freeze([
    digests.approvedEvidence,
  ]),
}));

vi.mock('../contentQualityV3/candidateRuntimeFingerprint.js', () => ({
  CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256: digests.currentRuntime,
}));

import {
  CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST,
  evaluateContentQualityV3ReleaseActivation,
  resolveProductionContentQualityV3PipelineMode,
} from '../contentQualityV3/releaseActivation';

function manifest(overrides: Readonly<Record<string, unknown>> = {}): unknown {
  return {
    schemaVersion: 1,
    evidenceArtifactSha256: digests.approvedEvidence,
    candidateRuntimeSha256: digests.currentRuntime,
    contentModes: ['seo'],
    ...overrides,
  };
}

describe('Content Quality V3 release activation', () => {
  it('keeps the source-controlled release manifest deliberately dormant', () => {
    expect(CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST).toEqual({
      schemaVersion: 1,
      evidenceArtifactSha256: null,
      candidateRuntimeSha256: null,
      contentModes: [],
    });
    expect(Object.isFrozen(CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST)).toBe(true);
    expect(Object.isFrozen(CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST.contentModes)).toBe(true);
    expect(evaluateContentQualityV3ReleaseActivation(
      CONTENT_QUALITY_V3_RELEASE_ACTIVATION_MANIFEST,
    )).toEqual({ status: 'INACTIVE', contentModes: [] });
  });

  it('activates only an approved evidence digest bound to the current candidate runtime', () => {
    const result = evaluateContentQualityV3ReleaseActivation(manifest({
      contentModes: ['seo', 'homefeed', 'affiliate', 'business', 'mate'],
    }));

    expect(result).toEqual({
      status: 'ACTIVE',
      contentModes: ['seo', 'homefeed', 'affiliate', 'business', 'mate'],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.contentModes)).toBe(true);
  });

  it('fails closed for unapproved evidence and a stale candidate runtime', () => {
    expect(evaluateContentQualityV3ReleaseActivation(manifest({
      evidenceArtifactSha256: digests.unapprovedEvidence,
    }))).toEqual({ status: 'UNAPPROVED', contentModes: [] });

    expect(evaluateContentQualityV3ReleaseActivation(manifest({
      candidateRuntimeSha256: digests.staleRuntime,
    }))).toEqual({ status: 'STALE_RUNTIME', contentModes: [] });
  });

  it.each([
    null,
    {},
    manifest({ schemaVersion: 2 }),
    manifest({ evidenceArtifactSha256: 'not-a-sha' }),
    manifest({ candidateRuntimeSha256: 'not-a-sha' }),
    manifest({ contentModes: 'seo' }),
    manifest({ contentModes: ['seo', 'seo'] }),
    manifest({ contentModes: ['seo', 'custom'] }),
    manifest({ contentModes: ['SEO'] }),
    { ...manifest() as object, extra: true },
  ])('rejects malformed or non-exact release manifests', value => {
    expect(evaluateContentQualityV3ReleaseActivation(value)).toEqual({
      status: 'INVALID',
      contentModes: [],
    });
  });

  it('does not execute accessors or proxies while validating a release manifest', () => {
    const getter = vi.fn(() => digests.approvedEvidence);
    const withAccessor = Object.defineProperty({
      schemaVersion: 1,
      candidateRuntimeSha256: digests.currentRuntime,
      contentModes: ['seo'],
    }, 'evidenceArtifactSha256', { enumerable: true, get: getter });
    const proxied = new Proxy(manifest() as object, {
      ownKeys: () => {
        throw new Error('untrusted proxy trap');
      },
    });

    expect(evaluateContentQualityV3ReleaseActivation(withAccessor)).toEqual({
      status: 'INVALID',
      contentModes: [],
    });
    expect(getter).not.toHaveBeenCalled();
    expect(evaluateContentQualityV3ReleaseActivation(proxied)).toEqual({
      status: 'INVALID',
      contentModes: [],
    });
  });

  it.each(['custom', 'traffic-hunter', 'image-narrative', 'unknown', 'SEO', ' seo '])(
    'never accepts unevaluated mode %s in an activation manifest',
    contentMode => {
      expect(evaluateContentQualityV3ReleaseActivation(manifest({
        contentModes: [contentMode],
      }))).toEqual({ status: 'INVALID', contentModes: [] });
    },
  );

  it('lets only the immutable source manifest select the production pipeline', () => {
    for (const contentMode of ['seo', 'homefeed', 'affiliate', 'business', 'mate']) {
      expect(resolveProductionContentQualityV3PipelineMode(contentMode, 'gemini')).toBe('legacy');
    }
    expect(resolveProductionContentQualityV3PipelineMode('custom', 'gemini')).toBe('legacy');
  });

  it.each(['openai', 'claude', 'agent-codex', 'agent-claude', undefined])(
    'preserves legacy for non-Gemini provider %s',
    provider => {
      expect(resolveProductionContentQualityV3PipelineMode('seo', provider)).toBe('legacy');
    },
  );
});
