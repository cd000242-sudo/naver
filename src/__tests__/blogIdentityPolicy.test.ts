/**
 * [2026-10-09 고객 신고] A Naver login ID may differ from the blog address (tnqls6550- -> leader_248). The expected
 * blog is "configured" only when a registered account names it; otherwise the login ID is just a fallback and the
 * first blog the editor confirms is learned. These tests pin the pure decision rules.
 */
import { describe, expect, it } from 'vitest';
import { decideBlogIdentity, type BlogIdentityContext } from '../automation/blogIdentityPolicy';
import { blogMismatchStopMessage, describeBlogMismatch, findAccountsNamingBlog, resolveExpectedBlog, resolveExpectedBlogId } from '../automation/expectedBlogIdentity';

const ctx = (over: Partial<BlogIdentityContext> = {}): BlogIdentityContext => ({
  observed: 'leader_248', allowRelearn: false, claimedByOther: () => false, ...over,
});

describe('decideBlogIdentity: fallback only (no registered blog, nothing learned)', () => {
  it('learns the first well-formed blog the editor confirms (login ID differs from blog address)', () => {
    expect(decideBlogIdentity(ctx())).toEqual({ outcome: 'learn', blogId: 'leader_248' });
  });
  it('learns a blog that equals the login ID too, so a different blog is a mismatch afterwards', () => {
    expect(decideBlogIdentity(ctx({ observed: 'TNQLS6550-' }))).toEqual({ outcome: 'learn', blogId: 'tnqls6550-' });
  });
  it('does not learn a blog that another Naver ID already owns: positive evidence of another account', () => {
    expect(decideBlogIdentity(ctx({ claimedByOther: () => true }))).toEqual({ outcome: 'mismatch', observed: 'leader_248', expected: undefined });
  });
  it('asks the conflict check about the lower-cased observed blog', () => {
    const asked: string[] = [];
    decideBlogIdentity(ctx({ observed: 'Leader_248', claimedByOther: id => { asked.push(id); return false; } }));
    expect(asked).toEqual(['leader_248']);
  });
});

describe('decideBlogIdentity: learned blog', () => {
  it('matches the learned blog case-insensitively', () => {
    expect(decideBlogIdentity(ctx({ learned: 'leader_248', observed: 'LEADER_248' }))).toEqual({ outcome: 'match' });
  });
  it('a different well-formed blog later is a real mismatch naming both blogs', () => {
    expect(decideBlogIdentity(ctx({ learned: 'leader_248', observed: 'someone_else' })))
      .toEqual({ outcome: 'mismatch', observed: 'someone_else', expected: 'leader_248' });
  });
  it('a user-initiated verification may re-learn the observed blog', () => {
    expect(decideBlogIdentity(ctx({ learned: 'leader_248', observed: 'new_blog', allowRelearn: true })))
      .toEqual({ outcome: 'learn', blogId: 'new_blog', replaced: 'leader_248' });
  });
  it('re-learning never violates the conflict guard', () => {
    expect(decideBlogIdentity(ctx({ learned: 'leader_248', observed: 'new_blog', allowRelearn: true, claimedByOther: () => true })))
      .toEqual({ outcome: 'mismatch', observed: 'new_blog', expected: 'leader_248' });
  });
});

describe('decideBlogIdentity: configured blog stays strict', () => {
  it('matches the configured blog', () => {
    expect(decideBlogIdentity(ctx({ configured: 'My_Blog', observed: 'MY_BLOG' }))).toEqual({ outcome: 'match' });
  });
  it('a different blog is a mismatch even when a learned value or a user verification exists', () => {
    for (const allowRelearn of [false, true]) {
      expect(decideBlogIdentity(ctx({ configured: 'my_blog', learned: 'leader_248', observed: 'leader_248', allowRelearn })))
        .toEqual({ outcome: 'mismatch', observed: 'leader_248', expected: 'my_blog' });
    }
  });
});

describe('decideBlogIdentity: unreadable identity', () => {
  it.each([undefined, '', 'bad/blog', 'a b', 'x'.repeat(101)])('%j is unreadable, never learned and never a confirmed other account', observed => {
    expect(decideBlogIdentity(ctx({ observed: observed as string | undefined }))).toEqual({ outcome: 'unreadable' });
    expect(decideBlogIdentity(ctx({ observed: observed as string | undefined, learned: 'leader_248' }))).toEqual({ outcome: 'unreadable' });
    expect(decideBlogIdentity(ctx({ observed: observed as string | undefined, configured: 'my_blog' }))).toEqual({ outcome: 'unreadable' });
  });
});

describe('resolveExpectedBlog: configured vs fallback', () => {
  it('a login ID with no registered account is only a fallback', () => {
    expect(resolveExpectedBlog('TNQLS6550-', [])).toEqual({ blogId: 'tnqls6550-', configured: false });
  });
  it('a registered account that names the blog makes it configured', () => {
    expect(resolveExpectedBlog('login-id', [{ naverId: 'LOGIN-ID', blogId: 'Leader_248' }])).toEqual({ blogId: 'leader_248', configured: true });
  });
  it('a pasted blog address counts as an explicit blog', () => {
    expect(resolveExpectedBlog('login-id', [{ naverId: 'login-id', blogId: 'https://blog.naver.com/Leader_248' }])).toEqual({ blogId: 'leader_248', configured: true });
  });
  it('a legacy display label or an empty value does not name a blog', () => {
    expect(resolveExpectedBlog('login-id', [{ naverId: 'login-id', blogId: '연예 이슈' }])).toEqual({ blogId: 'login-id', configured: false });
    expect(resolveExpectedBlog('login-id', [{ naverId: 'login-id', blogId: '  ' }])).toEqual({ blogId: 'login-id', configured: false });
  });
  it('an account of another Naver ID is ignored', () => {
    expect(resolveExpectedBlog('login-id', [{ naverId: 'other', blogId: 'x' }])).toEqual({ blogId: 'login-id', configured: false });
  });
  it('resolveExpectedBlogId keeps returning the bare blog id', () => {
    expect(resolveExpectedBlogId('login-id', [{ naverId: 'login-id', blogId: 'leader_248' }])).toBe('leader_248');
    expect(resolveExpectedBlogId('login-id', [])).toBe('login-id');
  });
});

describe('describeBlogMismatch', () => {
  it('names both blogs', () => {
    expect(describeBlogMismatch('xxx', 'yyy')).toBe('이 창은 다른 블로그(xxx)로 로그인돼 있습니다 (이 계정의 블로그: yyy).');
  });
  it('names only the observed blog when this account has no known blog', () => {
    expect(describeBlogMismatch('xxx')).toBe('이 창의 블로그(xxx)는 다른 계정에 등록된 블로그입니다.');
  });
});

describe('blogMismatchStopMessage', () => {
  it('names both blogs and the on-screen [확인 후 재개]', () => {
    const text = blogMismatchStopMessage({ observedBlogId: 'xxx', expectedBlogId: 'yyy' })!;
    expect(text).toContain(describeBlogMismatch('xxx', 'yyy'));
    expect(text).toContain('화면의 안내 창(또는 계정 관리)의 [확인 후 재개]');
  });
  it('is undefined when the verdict carries no blog', () => {
    expect(blogMismatchStopMessage({})).toBeUndefined();
    expect(blogMismatchStopMessage(undefined)).toBeUndefined();
  });
});

describe('findAccountsNamingBlog', () => {
  const accounts = [{ naverId: 'A', blogId: 'blog_a' }, { naverId: 'b', blogId: 'https://blog.naver.com/Blog_B' }, { blogId: 'blog_c' }, { naverId: 'd', blogId: '연예 이슈' }];
  it('lists the Naver IDs of registered accounts that name the blog', () => {
    expect(findAccountsNamingBlog('BLOG_A', accounts)).toEqual(['a']);
    expect(findAccountsNamingBlog('blog_b', accounts)).toEqual(['b']);
  });
  it('ignores accounts without a Naver ID, labels and unknown blogs', () => {
    expect(findAccountsNamingBlog('blog_c', accounts)).toEqual([]);
    expect(findAccountsNamingBlog('연예 이슈', accounts)).toEqual([]);
    expect(findAccountsNamingBlog('nobody', accounts)).toEqual([]);
  });
});
