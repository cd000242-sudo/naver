import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

describe('publish boundary source marker sanitization', () => {
  it('sanitizes reused generated content immediately before multi-account publishing', () => {
    const start = source.indexOf('if (preGenerated)');
    const end = source.indexOf('else if (contentSource', start);
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('sanitizeContentFakeSourcesCopy');
    expect(block).toContain('sanitizePublishableSourceText');
  });

  it('sanitizes scheduled payloads before constructing run options', () => {
    const start = source.indexOf('const runOptions: RunOptions = {', source.indexOf('[Scheduler]'));
    const block = source.slice(Math.max(0, start - 1200), start + 1200);

    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('sanitizeContentFakeSourcesCopy');
    expect(block).toContain('sanitizePublishableSourceText');
  });
});
