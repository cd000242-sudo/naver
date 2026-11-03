import { describe, expect, it } from 'vitest';
import { normalizeImageStudioPreferences, resolveImageStudioSource } from '../runtime/imageStudioPreferences';

describe('image studio defaults and removed options', () => {
  it('uses Duck Tape for unset or obsolete selections, independent of HTML option order', () => {
    expect(resolveImageStudioSource(null, null, ['dropshot', 'openai-image'])).toBe('openai-image');
    expect(resolveImageStudioSource('undefined', 'removed-engine', ['dropshot', 'openai-image'])).toBe('openai-image');
  });
  it('preserves explicit current selections and falls through invalid stale values', () => {
    expect(resolveImageStudioSource('flow', 'dropshot', ['flow', 'dropshot', 'openai-image'])).toBe('dropshot');
    expect(resolveImageStudioSource('openai-image', 'flow', ['flow', 'openai-image'])).toBe('flow');
    expect(resolveImageStudioSource('dropshot', 'removed', ['dropshot', 'openai-image'])).toBe('dropshot');
    expect(resolveImageStudioSource(null, 'dropshot', ['dropshot', 'openai-image'])).toBe('dropshot');
    expect(resolveImageStudioSource('removed', 'flow', ['flow', 'openai-image'])).toBe('flow');
  });
  it('retires hidden multi-generation, heading text and editorial flags without changing other preferences', () => {
    const original = Object.freeze({ thumbnailQualityMode: 'high', headingImageTextInclude: true, imageLook: 'editorial', aiMarkAllImages: true, openaiApiKey: 'fixture-only' });
    expect(normalizeImageStudioPreferences(original)).toEqual({ ...original, thumbnailQualityMode: 'standard', headingImageTextInclude: false, imageLook: 'stock', imageStudioPreferencesVersion: 1 });
    expect(original.thumbnailQualityMode).toBe('high');
  });
  it('is idempotent and preserves later explicit settings after the migration marker', () => {
    const migrated = normalizeImageStudioPreferences({});
    expect(normalizeImageStudioPreferences(migrated)).toEqual(migrated);
    const later = { ...migrated, thumbnailQualityMode: 'high' };
    expect(normalizeImageStudioPreferences(later)).toEqual(later);
  });
});
