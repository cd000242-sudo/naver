// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { markAutomaticPreviousPostCta, readManualCtaText, readManualCtaLink, isAutomaticPreviousPostCtaInput, resolveRendererPreviousPostPayload } from '../renderer/utils/previousPostScope';

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
    const readCtas = loadSourceFunction('src/renderer/renderer.ts', 'function readUnifiedCtasFromUi()', '// RendererAutomationPayload 타입은', { document, isAutomaticPreviousPostCtaInput, readManualCtaText, readManualCtaLink });
    autoGenerate({ selectedTitle: '다음 글' });
    expect(readCtas()).toEqual([]);
    const input = document.getElementById('unified-cta-link') as HTMLInputElement;
    input.value = 'https://example.com/custom';
    input.dispatchEvent(new Event('input'));
    expect(readCtas()).toEqual([{ text: '이전 글 A', link: 'https://example.com/custom' }]);
  });
});

describe('automatic previous-post text provenance', () => {
  function fillAutomaticInputs() {
    document.body.innerHTML = '<input id="unified-cta-text"><input id="unified-cta-link"><div id="unified-cta-items-container"></div>';
    const autoGenerate = loadSourceFunction('src/renderer/modules/contentGeneration.ts', 'export function autoGenerateCTA(', '// ✅ 불러오기/백업 복원 시 CTA 자동 채움', {
      document, generateAutoCTA: () => ({ ctaText: '자동 이전 글 A', ctaLink: 'https://blog.naver.com/myblog/100' }), appendLog: () => {}, markAutomaticPreviousPostCta,
    });
    autoGenerate({ selectedTitle: '다음 글' });
    return {
      textInput: document.getElementById('unified-cta-text') as HTMLInputElement,
      linkInput: document.getElementById('unified-cta-link') as HTMLInputElement,
      readCtas: loadSourceFunction('src/renderer/renderer.ts', 'function readUnifiedCtasFromUi()', '// RendererAutomationPayload 타입은', { document, isAutomaticPreviousPostCtaInput, readManualCtaText, readManualCtaLink }),
    };
  }
  it('does not treat an auto-filled title as manual text after its URL is cleared programmatically', () => {
    const { textInput, linkInput, readCtas } = fillAutomaticInputs();
    expect(readManualCtaText(textInput, linkInput)).toBe('');
    linkInput.value = '';
    expect(readManualCtaText(textInput, linkInput)).toBe('');
    expect(readCtas()).toEqual([]);
  });
  it('preserves an explicit text edit even while the old URL is still automatic', () => {
    const { textInput, linkInput, readCtas } = fillAutomaticInputs();
    textInput.value = '댓글로 의견을 남겨 주세요.';
    textInput.dispatchEvent(new Event('input'));
    expect(readManualCtaText(textInput, linkInput)).toBe(textInput.value);
    expect(readCtas()).toEqual([{ text: textInput.value, link: undefined }]);
  });
  it('preserves retyping the same automatic words as an intentional text-only CTA', () => {
    const { textInput, linkInput, readCtas } = fillAutomaticInputs();
    textInput.dispatchEvent(new Event('input'));
    linkInput.value = '';
    expect(readManualCtaText(textInput, linkInput)).toBe('자동 이전 글 A');
    expect(readCtas()).toEqual([{ text: '자동 이전 글 A', link: undefined }]);
  });
  it('preserves the label when the user clears or replaces the link', () => {
    const { textInput, linkInput, readCtas } = fillAutomaticInputs();
    linkInput.value = '';
    linkInput.dispatchEvent(new Event('input'));
    expect(readManualCtaText(textInput, linkInput)).toBe('자동 이전 글 A');
    expect(readCtas()).toEqual([{ text: '자동 이전 글 A', link: undefined }]);
  });
});

describe('automatic CTA rows', () => {
  it('omits automatic row text until the user edits it, then retains a text-only row', () => {
    document.body.innerHTML = '<div id="unified-cta-items-container"><div class="unified-cta-item"><input class="unified-cta-text"><input class="unified-cta-link"></div></div>';
    const textInput = document.querySelector('.unified-cta-text') as HTMLInputElement;
    const linkInput = document.querySelector('.unified-cta-link') as HTMLInputElement;
    markAutomaticPreviousPostCta(linkInput, 'https://blog.naver.com/myblog/100', textInput, '자동 이전 글 A');
    const readCtas = loadSourceFunction('src/renderer/renderer.ts', 'function readUnifiedCtasFromUi()', '// RendererAutomationPayload 타입은', { document, isAutomaticPreviousPostCtaInput, readManualCtaText, readManualCtaLink });
    expect(readCtas()).toEqual([]);
    textInput.value = '직접 입력한 안내';
    textInput.dispatchEvent(new Event('change'));
    expect(readCtas()).toEqual([{ text: '직접 입력한 안내', link: undefined, position: undefined }]);
  });
});
