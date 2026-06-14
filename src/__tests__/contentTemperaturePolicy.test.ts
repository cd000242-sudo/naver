import { describe, expect, it } from 'vitest';

import { resolvePromptTemperature } from '../contentTemperaturePolicy.js';

describe('contentTemperaturePolicy', () => {
  it('keeps the mode-specific writing temperature contract stable', () => {
    expect(resolvePromptTemperature('seo')).toBe(0.5);
    expect(resolvePromptTemperature('mate')).toBe(0.45);
    expect(resolvePromptTemperature('homefeed')).toBe(0.7);
    expect(resolvePromptTemperature('traffic-hunter')).toBe(0.9);
    expect(resolvePromptTemperature('affiliate')).toBe(0.5);
    expect(resolvePromptTemperature('custom')).toBe(0.7);
    expect(resolvePromptTemperature('business')).toBe(0.6);
  });

  it('falls back to the conservative default for unknown modes', () => {
    expect(resolvePromptTemperature('unknown')).toBe(0.5);
    expect(resolvePromptTemperature(undefined)).toBe(0.5);
  });
});
