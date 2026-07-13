import { describe, expect, it } from 'vitest';
import { assertCompleteDropshotBatch } from '../image/dropshotGenerator';

describe('Dropshot batch completeness', () => {
  it('accepts only a complete requested batch', () => {
    expect(() => assertCompleteDropshotBatch([1, 2], 2)).not.toThrow();
  });

  it('rejects partial success so publishing cannot continue with missing sections', () => {
    expect(() => assertCompleteDropshotBatch(
      [{ heading: '첫 번째' }],
      3,
      'IMAGE_DUPLICATE_EXHAUSTED:두 번째',
    )).toThrow(/IMAGE_BATCH_INCOMPLETE:1\/3:IMAGE_DUPLICATE_EXHAUSTED/);
  });
});
