import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPreviousPostPolicy } from '../shared/previousPostPolicy';

const continuous = readFileSync(resolve(__dirname, '../renderer/modules/continuousPublishing.ts'), 'utf8');
const multi = readFileSync(resolve(__dirname, '../renderer/modules/multiAccountManager.ts'), 'utf8');

describe('queue previous-post destination wiring', () => {
  it('captures continuous actual destination before generation and validates the final payload', () => {
    const capture = continuous.indexOf('const itemPublicationScope = resolveRendererPublicationScope(');
    expect(capture).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(continuous.indexOf('const savedPostId = saveGeneratedPostFromData('));
    expect(continuous).toContain('blogId: itemPublicationScope.blogId');
    expect(continuous).toContain('categoryId: itemPublicationScope.categoryId');
    expect(continuous).toContain('applyPreviousPostPolicy(formData, loadAllGeneratedPosts(), itemPublicationScope)');
  });
  it('never writes a completed post URL into another queue item', () => {
    expect(continuous).not.toContain('continuousQueueV2[nextPendingIdx].previousPostUrl =');
    expect(multi).not.toContain('nextItem.previousPostUrl =');
  });
  it('persists actual multi-account category IDs for new, edited and restored settings', () => {
    expect(multi.match(/\brealCategoryId,/g)?.length).toBeGreaterThanOrEqual(3);
    expect(multi).toContain('last.realCategoryId');
    expect(multi).toContain('item.realCategoryId');
    expect(multi).toContain('categoryId: normalizePreviousPostCategoryId(queueItem.realCategoryId)');
  });
  it('validates multi-account final outgoing CTA after nested formData overrides', () => {
    const policy = multi.indexOf('const scopedPublishOptions = applyPreviousPostPolicy(publishOptions, loadGeneratedPosts(), publicationScope);');
    expect(policy).toBeGreaterThan(multi.indexOf('const publishOptions = {'));
    expect(multi).toContain('multiAccountPublish([queueItem.accountId], scopedPublishOptions)');
    expect(multi).not.toContain('normPCat.includes(normCat)');
    expect(multi).not.toContain('!p.naverId || p.naverId === ctaAcctNaverId');
    expect(multi).toContain('ctaType: queueItem.ctaType');
  });
  it('records only the backend-confirmed publication destination', () => {
    expect(multi).toContain('const publicationDestination = result.results?.[0]?.publicationDestination;');
    expect(multi).toContain('updatePostAfterPublish(generatedPostId, publishedUrl, queueItem.publishMode, publicationDestination)');
    expect(multi).toContain('updatePostAfterPublish(matchingPost.id, publishedUrl, queueItem.publishMode, publicationDestination)');
  });
  it('publishing account identity uses real blog IDs and is cleared in direct input mode', () => {
    expect(multi).toContain('blogId: publicationAccount?.blogId');
    expect(multi).toContain('window.currentMainAccountPublicationScope = { blogId: selected.blogId, naverId: credentials.credentials.naverId };');
    expect(multi).toContain('window.currentMainAccountPublicationScope = null;');
  });
});

// Execute the production handoff statements with a history store, without starting a real browser.
const previousHandoff = (mode: 'continuous' | 'multi', payload: Record<string, any>, posts: any[], scope: Record<string, any>) => {
  const source = mode === 'continuous' ? continuous : multi;
  const statement = source.match(mode === 'continuous'
    ? /const scopedFormData = applyPreviousPostPolicy\([^;]+;/
    : /const scopedPublishOptions = applyPreviousPostPolicy\([^;]+;/)?.[0];
  expect(Boolean(statement)).toBe(true);
  const keys = mode === 'continuous'
    ? ['formData', 'loadAllGeneratedPosts', 'itemPublicationScope']
    : ['publishOptions', 'loadGeneratedPosts', 'publicationScope'];
  const output = mode === 'continuous' ? 'scopedFormData' : 'scopedPublishOptions';
  return new Function('applyPreviousPostPolicy', ...keys, statement + ' return ' + output)(applyPreviousPostPolicy, payload, () => posts, scope);
};
const confirmed = (id: string, blogId: string, categoryId: string, publishedAt: string, extra = {}) => ({
  id, title: id, publishedUrl: 'https://blog.naver.com/' + blogId + '/' + id,
  publishedBlogId: blogId, publishedCategoryId: categoryId, publishedAt,
  publishMode: 'publish', isPublished: true, ...extra,
});
describe.each(['continuous', 'multi'] as const)('%s queue destination behavior', mode => {
  const scope = { blogId: 'blog_a', categoryId: '12' };
  it('interleaved categories and blogs resolve the newest confirmed post in their own scope', () => {
    const history = [confirmed('100', 'blog_a', '12', '2025-01-01')];
    const first = previousHandoff(mode, { ctaType: 'previous-post' }, history, scope);
    expect(first.previousPostUrl).toBe(history[0].publishedUrl);
    const updated = [...history, confirmed('101', 'blog_a', '12', '2025-01-02'), confirmed('102', 'blog_a', '13', '2025-01-03'), confirmed('103', 'blog_b', '12', '2025-01-04')];
    expect(previousHandoff(mode, { ctaType: 'previous-post' }, updated, scope).previousPostUrl).toBe(updated[1].publishedUrl);
    expect(previousHandoff(mode, { ctaType: 'previous-post' }, updated, { ...scope, categoryId: '13' }).previousPostUrl).toBe(updated[2].publishedUrl);
    expect(previousHandoff(mode, { ctaType: 'previous-post' }, updated, { ...scope, blogId: 'blog_b' }).previousPostUrl).toBe(updated[3].publishedUrl);
  });
  it('does not promote drafts, server reservations or old unverified records into history', () => {
    const posts = [confirmed('100', 'blog_a', '12', '2025-01-01'), confirmed('101', 'blog_a', '12', '2025-01-02', { publishMode: 'draft' }), confirmed('102', 'blog_a', '12', '2025-01-03', { publishMode: 'schedule' }), confirmed('103', 'blog_a', '12', '2025-01-04', { publishedCategoryId: undefined })];
    expect(previousHandoff(mode, { ctaType: 'previous-post' }, posts, scope).previousPostUrl).toBe(posts[0].publishedUrl);
  });
  it('preserves an explicit same-scope choice and rejects a different category without replacing the choice', () => {
    const posts = [confirmed('100', 'blog_a', '12', '2025-01-01'), confirmed('101', 'blog_a', '12', '2025-01-02'), confirmed('102', 'blog_a', '13', '2025-01-03')];
    const selected = { ctaType: 'previous-post', previousPostUrl: posts[0].publishedUrl };
    expect(previousHandoff(mode, selected, posts, scope).previousPostUrl).toBe(posts[0].publishedUrl);
    expect(previousHandoff(mode, { ...selected, previousPostUrl: posts[2].publishedUrl }, posts, scope).previousPostUrl).toBeUndefined();
    expect(selected.previousPostUrl).toBe(posts[0].publishedUrl);
  });
  it('keeps user custom CTA while skipping unknown destinations', () => {
    const payload = { ctaType: 'custom', ctaLink: 'https://example.com', ctaText: '제품 보기', ctas: [{ link: 'https://example.com', text: '제품 보기' }] };
    const result = previousHandoff(mode, payload, [confirmed('100', 'blog_a', '12', '2025-01-01')], { blogId: 'blog_a' });
    expect(result.ctaLink).toBe(payload.ctaLink);
    expect(result.ctas).toEqual(payload.ctas);
    expect(result.previousPostUrl).toBeUndefined();
  });
});

describe('multi-account automatic previous-post option', () => {
  it('leaves the URL empty until publishing and never pins the locally newest post', () => {
    const source = multi.replace(/\r\n/g, '\n');
    const handler = source.match(/ctaTypeSelect\.addEventListener\('change', \(\) => \{([\s\S]+?)\n {12}\}\);/)?.[1];
    expect(Boolean(handler)).toBe(true);
    const ctaUrlInput = { value: 'https://blog.naver.com/blog_a/100' };
    const ctaTextInput = { value: 'Older local post' };
    new Function('ctaTypeSelect', 'ctaUrlInput', 'ctaTextInput', 'toastManager', 'modal', 'categorySelectForCta', 'loadGeneratedPosts', handler!)(
      { value: 'previous-post' }, ctaUrlInput, ctaTextInput, { info() {}, success() {} },
      { dataset: { isJabBlog: '0' } }, { value: 'news' },
      () => [{ ...confirmed('100', 'blog_a', '12', '2025-01-01'), category: 'news' }],
    );
    expect(ctaUrlInput.value).toBe('');
    expect(ctaTextInput.value).toBe('');
    const scope = { blogId: 'blog_a', categoryId: '12' };
    const localA = confirmed('100', 'blog_a', '12', '2025-01-01');
    const publicB = confirmed('101', 'blog_a', '12', '2025-01-02');
    const outgoing = previousHandoff('multi', { ctaType: 'previous-post', ctaUrl: ctaUrlInput.value }, [localA], scope);
    expect(outgoing.previousPostSelection).toBe('auto');
    expect(applyPreviousPostPolicy(outgoing, [localA, publicB], scope).previousPostUrl).toBe(publicB.publishedUrl);
  });
  it('keeps an explicitly selected URL manual even when a newer public post is available', () => {
    const scope = { blogId: 'blog_a', categoryId: '12' };
    const localA = confirmed('100', 'blog_a', '12', '2025-01-01');
    const publicB = confirmed('101', 'blog_a', '12', '2025-01-02');
    const outgoing = previousHandoff('multi', { ctaType: 'previous-post', ctaUrl: localA.publishedUrl }, [localA], scope);
    expect(outgoing.previousPostSelection).toBe('manual');
    expect(applyPreviousPostPolicy(outgoing, [localA, publicB], scope).previousPostUrl).toBe(localA.publishedUrl);
  });
});
