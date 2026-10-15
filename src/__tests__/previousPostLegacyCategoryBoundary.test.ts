import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { enforcePreviousPostScope, resolveDuePreviousPost } from '../main/services/previousPostBoundary.js';

async function runBoundary(payload: Record<string, unknown>, categoryResolution: string | Error | undefined = '7') {
  const source = readFileSync('src/main/services/BlogExecutor.ts', 'utf8');
  const start = Math.min(source.indexOf('        const wantsPreviousPost ='), source.indexOf('        const previousScope ='));
  const end = source.indexOf('        // 5. 취소 체크', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const resolveCategory = vi.fn(async () => { if (categoryResolution instanceof Error) throw categoryResolution; return categoryResolution; });
  const fetchCandidates = vi.fn(async () => []);
  const bindings = {
    payload, actualBlogId: 'actual',
    resolveNaverPreviousPostCategoryId: resolveCategory,
    fetchNaverPreviousPostCandidates: fetchCandidates,
    enforcePreviousPostScope, resolveDuePreviousPost,
    sendLog: vi.fn(), sanitizeUserVisibleError: String,
  };
  const body = ts.transpile(`let effectivePayload = payload; ${source.slice(start, end)} return effectivePayload;`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  const result = await new Function(...Object.keys(bindings), `return (async () => {${body}})();`)(...Object.values(bindings));
  return { result, resolveCategory, fetchCandidates };
}

describe('legacy actual category-name backend resolution', () => {
  it('resolves a real name to category ID before authoritative previous-post lookup', async () => {
    const { result, resolveCategory, fetchCandidates } = await runBoundary({ ctaType: 'previous-post', previousPostSelection: 'auto', categoryName: '여행' });
    expect(resolveCategory).toHaveBeenCalledWith({ blogId: 'actual', categoryId: undefined }, '여행');
    expect(fetchCandidates).toHaveBeenCalledWith({ blogId: 'actual', categoryId: '7' });
    expect(result.categoryId).toBe('7');
  });
  it('does not guess an ID after an ambiguous name or lookup failure', async () => {
    for (const resolution of ['', new Error('offline')]) {
      const boundary = await runBoundary({ previousPostSelection: 'auto', categoryName: '여행' }, resolution);
      expect(boundary.fetchCandidates).not.toHaveBeenCalled();
      expect(boundary.result.previousPostUrl).toBeUndefined();
    }
  });
  it('does not fetch categories for a supplied ID or ordinary custom CTA', async () => {
    const known = await runBoundary({ ctaType: 'previous-post', categoryName: '여행', categoryId: '4' });
    expect(known.resolveCategory).not.toHaveBeenCalled();
    expect(known.fetchCandidates).toHaveBeenCalledWith({ blogId: 'actual', categoryId: '4' });
    const custom = await runBoundary({ ctaType: 'custom', categoryName: '여행', ctaLink: 'https://shop.example' });
    expect(custom.resolveCategory).not.toHaveBeenCalled();
    expect(custom.fetchCandidates).not.toHaveBeenCalled();
  });
});
