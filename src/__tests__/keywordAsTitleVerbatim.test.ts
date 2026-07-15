import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Regression guards for "키워드 그대로 제목으로 사용" (useKeywordAsTitle) — 2026-06-23.
 *
 * Symptom: user checks "use keyword verbatim as title" + enters "종합소득세 환급일 지연 이유",
 * but the title comes out "종합소득세 환급일 지연 이유, 들어오지? (2026년 최신)". The seo/homefeed/
 * affiliate title-quality PATCH block regenerated the title (click-bait / forced keyword-prefix)
 * WITHOUT checking useKeywordAsTitle, overriding the verbatim intent.
 *
 * Fix: when useKeywordAsTitle is on, force the title to the keyword verbatim and SKIP all title
 * patch/regeneration blocks. finalizeStructuredContent already returns early for verbatim, so the
 * downstream cleanup never mangles it.
 */
describe('keyword-as-title verbatim', () => {
  const gen = read('contentGenerator.ts');

  it('computes a verbatim flag from source.useKeywordAsTitle', () => {
    expect(gen).toMatch(/const _useKwTitle = !!source\.useKeywordAsTitle/);
  });

  it('forces the title to the keyword verbatim when the flag is on', () => {
    expect(gen).toMatch(/if \(_useKwTitle\)\s*{[\s\S]*?const _kw = resolveKeywordAsTitleValue\(source\)/);
    expect(gen).toMatch(/if \(_kw\)\s*{[\s\S]*?applyKeywordAsTitleLock\(parsed as any, _kw\)/);
  });

  it('skips the seo title patch block under verbatim mode', () => {
    expect(gen).toMatch(
      /if\s*\(\s*allowLegacyPostDraftLlm\s*&&\s*!_useKwTitle\s*&&\s*\(mode\s*===\s*'seo'\s*\|\|\s*mode\s*===\s*'mate'\)\s*\)/,
    );
  });

  it('skips the homefeed title patch block under verbatim mode', () => {
    expect(gen).toMatch(
      /if\s*\(\s*allowLegacyPostDraftLlm\s*&&\s*!_useKwTitle\s*&&\s*mode\s*===\s*'homefeed'\s*\)/,
    );
  });

  it('skips the affiliate/shopping title patch block under verbatim mode', () => {
    expect(gen).toMatch(
      /if\s*\(\s*allowLegacyPostDraftLlm\s*&&\s*!_useKwTitle\s*&&\s*\(isShoppingConnectMode\s*\|\|\s*mode\s*===\s*'affiliate'\)\s*\)/,
    );
  });

  it('finalizeStructuredContent returns early for verbatim (no downstream title cleanup)', () => {
    // The verbatim branch (finalizeStructuredContent) must return before reaching the generic
    // title cleanup, so the keyword title is never re-mangled. Check that a `return finalContent;`
    // appears shortly after the verbatim branch comment.
    const verbatimIdx = gen.indexOf('키워드를 제목으로 그대로 사용');
    expect(verbatimIdx).toBeGreaterThan(-1);
    const branch = gen.slice(verbatimIdx, verbatimIdx + 3000);
    expect(branch).toContain('return finalContent;');
    // and that return must come before the verbatim branch hands off to the generic cleanup
    expect(branch.indexOf('return finalContent;')).toBeLessThan(
      branch.includes('cleanupTrailingTitleTokens')
        ? branch.indexOf('cleanupTrailingTitleTokens')
        : 3000,
    );
  });
});
