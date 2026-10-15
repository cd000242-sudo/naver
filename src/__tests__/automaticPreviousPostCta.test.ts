// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { markAutomaticPreviousPostCta, readManualCtaLink, isAutomaticPreviousPostCtaInput, resolveRendererPreviousPostPayload } from '../renderer/utils/previousPostScope';

describe('auto-filled previous CTA provenance', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('refreshes auto A to the latest B instead of retaining A as custom CTA', () => {
    const input = document.createElement('input');
    markAutomaticPreviousPostCta(input, 'https://blog.naver.com/myblog/100');
    expect(readManualCtaLink(input)).toBe('');
    const previous = { title: 'B', publishedUrl: 'https://blog.naver.com/myblog/101', publishedBlogId: 'myblog', publishedCategoryId: '12', publishMode: 'publish', publishedAt: '2026-01-02T00:00:00Z' };
    const result = resolveRendererPreviousPostPayload({ blogId: 'myblog', categoryId: '12', ctaType: 'previous-post', previousPostSelection: 'auto', ctaLink: readManualCtaLink(input), ctas: [] }, () => [previous]);
    expect(result.ctaLink).toBe(previous.publishedUrl);
    expect(JSON.stringify(result)).not.toContain('/100');
  });
  it('cannot carry the old auto-filled link across a category switch', () => {
    const input = document.createElement('input');
    markAutomaticPreviousPostCta(input, 'https://blog.naver.com/myblog/100');
    const result = resolveRendererPreviousPostPayload({ blogId: 'myblog', categoryId: '99', ctaType: 'previous-post', previousPostSelection: 'auto', ctaLink: readManualCtaLink(input), ctas: [] }, () => []);
    expect(result.ctaLink).toBeUndefined();
    expect(result.previousPostUrl).toBeUndefined();
  });
  it('preserves explicit user edits, including retyping the same URL', () => {
    const input = document.createElement('input');
    markAutomaticPreviousPostCta(input, 'https://blog.naver.com/myblog/100');
    input.dispatchEvent(new Event('input'));
    expect(isAutomaticPreviousPostCtaInput(input)).toBe(false);
    expect(readManualCtaLink(input)).toBe('https://blog.naver.com/myblog/100');
    markAutomaticPreviousPostCta(input, 'https://blog.naver.com/myblog/100');
    input.value = 'https://example.com/custom';
    expect(readManualCtaLink(input)).toBe('https://example.com/custom');
  });
});

function loadSourceFunction(path: string, start: string, end: string, bindings: Record<string, unknown>) {
  const source = readFileSync(path, 'utf8');
  const fragment = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).replace(/^export /, '');
  const code = ts.transpileModule(fragment, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const name = fragment.match(/function (\w+)/)![1];
  return new Function(...Object.keys(bindings), `${code}; return ${name};`)(...Object.values(bindings));
}

describe('actual CTA generation and UI collection wiring', () => {
  it('auto-fill is excluded from custom rows and becomes custom only after a user edit', () => {
    document.body.innerHTML = '<input id="unified-cta-text"><input id="unified-cta-link"><div id="unified-cta-items-container"></div>';
    const autoGenerate = loadSourceFunction('src/renderer/modules/contentGeneration.ts', 'export function autoGenerateCTA(', '// ✅ 불러오기/백업 복원 시 CTA 자동 채움', {
      document, generateAutoCTA: () => ({ ctaText: '이전 글 A', ctaLink: 'https://blog.naver.com/myblog/100' }), appendLog: () => {}, markAutomaticPreviousPostCta,
    });
    const readCtas = loadSourceFunction('src/renderer/renderer.ts', 'function readUnifiedCtasFromUi()', '// RendererAutomationPayload 타입은', { document, isAutomaticPreviousPostCtaInput, readManualCtaLink });
    autoGenerate({ selectedTitle: '다음 글' });
    expect(readCtas()).toEqual([]);
    const input = document.getElementById('unified-cta-link') as HTMLInputElement;
    input.value = 'https://example.com/custom';
    input.dispatchEvent(new Event('input'));
    expect(readCtas()).toEqual([{ text: '이전 글 A', link: 'https://example.com/custom' }]);
  });
});
