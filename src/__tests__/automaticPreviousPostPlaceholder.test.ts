import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { applyPreviousPostPolicy } from '../shared/previousPostPolicy';
import { planEditorTail } from '../automation/editorTailPlan';
import { readManualCtaText } from '../renderer/utils/previousPostScope';

function runAutoCta(candidate: any = null): { ctaText: string; ctaLink: string } {
  const source = readFileSync('src/renderer/renderer.ts', 'utf8');
  const start = source.indexOf('function generateAutoCTA(');
  const end = source.indexOf('// 풀오토 발행 처리', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const body = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  return new Function('selectPreviousPost', 'loadGeneratedPosts', 'resolveRendererPublicationScope', 'currentPostId', `${body}; return generateAutoCTA('Title', '');`)(() => candidate, () => [], () => ({}), 'current');
}

function runHandlerCta(mode: 'full' | 'semi', manualText = '', manualLink = '', auto = { ctaText: '📖 관련 글 더 보기', ctaLink: '' }, legacyTextInput: any = { value: '', dataset: {} }) {
  const source = readFileSync('src/renderer/modules/publishingHandlers.ts', 'utf8');
  const first = source.indexOf("let finalCtaText = '';");
  const start = mode === 'full' ? first : source.indexOf("let finalCtaText = '';", first + 1);
  const end = source.indexOf('// ✅ CTA 위치 고정', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const bindings = {
    skipCta: false, structuredContent: { selectedTitle: 'Title' }, title: 'Title', keywords: '',
    generateAutoCTA: () => auto, ctasUi: manualText || manualLink ? [{ text: manualText, link: manualLink }] : [],
    document: { getElementById: (id: string) => id === 'unified-cta-text' ? legacyTextInput : ({ value: '', dataset: {} }) }, readManualCtaText, readManualCtaLink: () => '', appendLog: vi.fn(),
  };
  const body = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  return new Function(...Object.keys(bindings), `${body}; return { ctaText: finalCtaText, ctaLink: finalCtaLink };`)(...Object.values(bindings));
}

const candidate = {
  id: 'prior', title: 'Earlier published article', publishedUrl: 'https://blog.naver.com/my_blog/222',
  publishedBlogId: 'my_blog', publishedCategoryId: '12', publishedAt: '2025-01-01T00:00:00Z', publishMode: 'publish', isPublished: true,
};

describe('automatic CTA without a local previous post', () => {
  it('returns no placeholder text when local history has no eligible post', () => {
    expect(runAutoCta()).toEqual({ ctaText: '', ctaLink: '' });
  });
  it('retains a valid automatic CTA when its linked post is known', () => {
    expect(runAutoCta(candidate)).toEqual({ ctaText: `📖 ${candidate.title}`, ctaLink: candidate.publishedUrl });
  });
  it.each(['full', 'semi'] as const)('%s handler ignores automatic text with no link', mode => {
    expect(runHandlerCta(mode)).toEqual({ ctaText: '', ctaLink: '' });
  });
  it.each(['full', 'semi'] as const)('%s handler preserves intentional user text without a link', mode => {
    expect(runHandlerCta(mode, '궁금한 점은 댓글로 남겨 주세요.')).toEqual({ ctaText: '궁금한 점은 댓글로 남겨 주세요.', ctaLink: '' });
    expect(runHandlerCta(mode, '📖 관련 글 더 보기')).toEqual({ ctaText: '📖 관련 글 더 보기', ctaLink: '' });
  });
  it.each(['full', 'semi'] as const)('%s handler leaves exactly one previous-post card after backend lookup', mode => {
    const generated = runHandlerCta(mode, '', '', runAutoCta());
    const resolved = applyPreviousPostPolicy({
      ctaType: 'previous-post', previousPostSelection: 'auto',
      ctas: generated.ctaText ? [{ text: generated.ctaText, link: generated.ctaLink || undefined }] : [],
    }, [candidate], { blogId: 'my_blog', categoryId: '12' });
    const plan = planEditorTail(resolved);
    expect(plan.bottomCtas).toEqual([]);
    expect(plan.previousPost).toMatchObject({ url: candidate.publishedUrl, shouldInsert: true });
  });
});

describe('category switch after automatic text was filled', () => {
  it.each(['full', 'semi'] as const)('%s handler excludes the stale automatic title when new category has no candidate', mode => {
    const legacyTextInput = { value: '자동 이전 글 A', dataset: { autoPreviousPostText: '자동 이전 글 A' } };
    expect(runHandlerCta(mode, '', '', { ctaText: '', ctaLink: '' }, legacyTextInput)).toEqual({ ctaText: '', ctaLink: '' });
  });
});