import { describe, expect, it } from 'vitest';
import {
  DEFAULT_V3_CONTENT_MODE_ALLOWLIST,
  FORCED_LEGACY_CONTENT_MODES,
  resolveContentPipelineMode,
} from '../contentPipeline/mode';

describe('resolveContentPipelineMode', () => {
  it.each([
    undefined,
    null,
    '',
    ' ',
    ' v3',
    'v3 ',
    'V3',
    'Shadow',
    'unknown',
    3,
    false,
    {},
    [],
  ])('fails closed to legacy for %j', requestedMode => {
    expect(resolveContentPipelineMode(requestedMode)).toBe('legacy');
  });

  it('accepts the exact legacy and shadow pipeline modes', () => {
    expect(resolveContentPipelineMode('legacy')).toBe('legacy');
    expect(resolveContentPipelineMode('shadow', { contentMode: 'seo' })).toBe('shadow');
  });

  it('keeps v3 disabled when no allowlist is injected', () => {
    expect(resolveContentPipelineMode('v3', { contentMode: 'seo' })).toBe('legacy');
    expect(DEFAULT_V3_CONTENT_MODE_ALLOWLIST).toEqual([]);
  });

  it.each([
    null,
    'seo',
    1,
    {},
    ['seo', 1],
  ])('fails closed when the injected v3 allowlist is invalid (%j)', v3Allowlist => {
    expect(resolveContentPipelineMode('v3', {
      contentMode: 'seo',
      v3Allowlist: v3Allowlist as never,
    })).toBe('legacy');
  });

  it('allows v3 only for an exact content-mode match in the injected allowlist', () => {
    const allowlist = Object.freeze(['seo', 'business']);

    expect(resolveContentPipelineMode('v3', { contentMode: 'seo', v3Allowlist: allowlist })).toBe('v3');
    expect(resolveContentPipelineMode('v3', { contentMode: 'SEO', v3Allowlist: allowlist })).toBe('legacy');
    expect(resolveContentPipelineMode('v3', { contentMode: ' seo ', v3Allowlist: allowlist })).toBe('legacy');
    expect(resolveContentPipelineMode('v3', { v3Allowlist: allowlist })).toBe('legacy');
    expect(allowlist).toEqual(['seo', 'business']);
  });

  it.each(FORCED_LEGACY_CONTENT_MODES)(
    'forces the %s content mode to legacy for shadow and v3',
    contentMode => {
      const v3Allowlist = Object.freeze([contentMode]);

      expect(resolveContentPipelineMode('shadow', { contentMode, v3Allowlist })).toBe('legacy');
      expect(resolveContentPipelineMode('v3', { contentMode, v3Allowlist })).toBe('legacy');
    },
  );

  it('does not read ambient feature flags or environment configuration', () => {
    const previousValue = process.env.CONTENT_PIPELINE_MODE;
    process.env.CONTENT_PIPELINE_MODE = 'v3';

    try {
      expect(resolveContentPipelineMode(undefined, { contentMode: 'seo' })).toBe('legacy');
      expect(resolveContentPipelineMode('v3', { contentMode: 'seo' })).toBe('legacy');
    } finally {
      if (previousValue === undefined) {
        delete process.env.CONTENT_PIPELINE_MODE;
      } else {
        process.env.CONTENT_PIPELINE_MODE = previousValue;
      }
    }
  });
});
