import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('image insertion integrity', () => {
  const source = readFileSync(new URL('../automation/imageHelpers.ts', import.meta.url), 'utf8');

  it('aggregates per-image insertion failures and fails the publish path', () => {
    const fnStart = source.indexOf('export async function insertImagesAtCurrentCursor');
    expect(fnStart).toBeGreaterThan(-1);

    const nextFnStart = source.indexOf('export async function setImageSizeAndAttachLink', fnStart);
    expect(nextFnStart).toBeGreaterThan(fnStart);

    const fn = source.slice(fnStart, nextFnStart);
    expect(fn).toContain('const failures: string[] = []');
    expect(fn).toContain('IMAGE_INSERTION_FAILED');
    expect(fn).toMatch(/failures\.push/);
    expect(fn).toMatch(/throw new Error\(`IMAGE_INSERTION_FAILED:/);
  });
});
