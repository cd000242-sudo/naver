/**
 * [2026-11-03] The renderer inline bundle (scripts/copy-static.mjs) rewrites `exports.X = {` to `const X = {`, but it
 * drops `exports.X = Object.freeze(...)` whose value refers to other exports. RETIRED_API_TEXT_MODEL_IDS was written that
 * way and vanished from the bundle while migrateRetiredApiTextModelId still read it (ReferenceError in the renderer).
 * Also: the two side calls that moved from gpt-4.1-mini to gpt-6-luna (a reasoning model) send reasoning_effort low.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETIRED_API_TEXT_MODEL_IDS, migrateRetiredApiTextModelId } from '../runtime/textModelConstants.js';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

describe('model constants survive the renderer inline bundle', () => {
  it('textModelConstants exports plain object literals, never Object.freeze(...)', () => {
    const src = read('runtime/textModelConstants.ts');
    expect(src).not.toMatch(/export const \w+[^=\n]*=\s*Object\.freeze\(/);
    expect(src).toMatch(/export const RETIRED_API_TEXT_MODEL_IDS: Readonly<Record<string, string>> = \{/);
  });

  it('the retired table still maps the old saved IDs', () => {
    expect(migrateRetiredApiTextModelId('gpt-5.6-terra')).toBe('gpt-6.1-terra');
    expect(migrateRetiredApiTextModelId('claude-sonnet-5')).toBe('claude-sonnet-5-5');
    expect(Object.keys(RETIRED_API_TEXT_MODEL_IDS)).toContain('gpt-4.1-mini');
  });
});

describe('side calls on gpt-6-luna keep their answer budget', () => {
  it('fact check and paraphrase analysis send reasoning_effort low to reasoning models', () => {
    for (const file of ['factCheckRouter.ts', 'main/ipc/paraphraseAnalysisHandlers.ts']) {
      const src = read(file);
      expect(src).toContain("import { isOpenAiReasoningModel } from");
      expect(src).toMatch(/isOpenAiReasoningModel\([^)]*\) \? \{ reasoning_effort: 'low' \} : \{\}/);
    }
  });
});
