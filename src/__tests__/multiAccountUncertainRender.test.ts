import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('multi-account interrupted queue rendering', () => {
  it('renders normalized uncertain items before the empty-snapshot early return', () => {
    const source = readFileSync(
      new URL('../renderer/modules/multiAccountManager.ts', import.meta.url),
      'utf8',
    );
    const normalizationIndex = source.indexOf("item.pipelineStatus === 'publishing'");
    const emptyIndex = source.indexOf('if (queueSnapshot.length === 0)', normalizationIndex);
    const returnIndex = source.indexOf('return;', emptyIndex);
    const earlyReturnBlock = source.slice(emptyIndex, returnIndex);

    expect(normalizationIndex).toBeGreaterThanOrEqual(0);
    expect(emptyIndex).toBeGreaterThan(normalizationIndex);
    expect(earlyReturnBlock).toContain('renderQueue()');
  });
});
