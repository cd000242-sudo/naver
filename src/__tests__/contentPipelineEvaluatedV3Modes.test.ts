import { describe, expect, it } from 'vitest';
import { CONTENT_QUALITY_V3_STRATA } from '../contentQualityV3/evalCorpus';
import {
  EVALUATED_V3_CONTENT_MODES,
  resolveContentPipelineMode,
} from '../contentPipeline/mode';

describe('evaluated V3 content-mode boundary', () => {
  it('stays synchronized with the exact release-corpus strata', () => {
    expect(EVALUATED_V3_CONTENT_MODES).toEqual(CONTENT_QUALITY_V3_STRATA);
    expect(Object.isFrozen(EVALUATED_V3_CONTENT_MODES)).toBe(true);
  });

  it.each(EVALUATED_V3_CONTENT_MODES)(
    'permits evaluated mode %s only when explicitly injected',
    contentMode => {
      expect(resolveContentPipelineMode('v3', {
        contentMode,
        v3Allowlist: EVALUATED_V3_CONTENT_MODES,
      })).toBe('v3');
    },
  );

  it.each(['custom', 'traffic-hunter', 'image-narrative', 'unknown', 'SEO', ' seo '])(
    'does not promote unevaluated mode %s even when injected',
    contentMode => {
      expect(resolveContentPipelineMode('v3', {
        contentMode,
        v3Allowlist: Object.freeze([...EVALUATED_V3_CONTENT_MODES, contentMode]),
      })).toBe('legacy');
    },
  );

  it('does not let an unevaluated injected entry disable an evaluated opt-in', () => {
    const mixedAllowlist = Object.freeze(['seo', 'custom']);

    expect(resolveContentPipelineMode('v3', {
      contentMode: 'seo',
      v3Allowlist: mixedAllowlist,
    })).toBe('v3');
    expect(resolveContentPipelineMode('v3', {
      contentMode: 'custom',
      v3Allowlist: mixedAllowlist,
    })).toBe('legacy');
  });
});
