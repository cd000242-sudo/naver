/**
 * The blog id field is typed by hand, so users paste whole blog URLs ("https://blog.naver.com/abc"). A saved URL used to
 * make every run stop with ACCOUNT_MISMATCH. The bare id is now extracted when accounts are saved and, defensively,
 * when the expected identity is resolved. Only values that truly cannot be an id still raise the Korean error.
 */
import { describe, expect, it } from 'vitest';
import { normalizeBlogId, resolveExpectedBlogId } from '../automation/expectedBlogIdentity';
import { BlogAccountManager } from '../account/blogAccountManager';

describe('normalizeBlogId', () => {
  it.each([
    ['abc', 'abc'],
    ['  ABC_def-1  ', 'abc_def-1'],
    ['https://blog.naver.com/abc', 'abc'],
    ['https://blog.naver.com/Abc/', 'abc'],
    ['http://blog.naver.com/abc', 'abc'],
    ['blog.naver.com/abc', 'abc'],
    ['m.blog.naver.com/abc/223456789012', 'abc'],
    ['https://m.blog.naver.com/ABC/223456789012?fromRss=true', 'abc'],
    ['https://blog.naver.com/PostView.naver?blogId=Abc&logNo=223456789012', 'abc'],
    ['https://blog.naver.com/PostList.naver?blogId=abc&categoryNo=3', 'abc'],
    ['https://blog.naver.com/abc?Redirect=Write', 'abc'],
    ['https://blog.naver.com/GoBlogWrite.naver?blogId=abc', 'abc'],
    ['blog.naver.com/abc#comment', 'abc'],
  ])('extracts the bare id from %j', (input, expected) => {
    expect(normalizeBlogId(input)).toBe(expected);
  });

  it.each([
    '', '   ',
    'https://blog.naver.com/', 'blog.naver.com', 'https://blog.naver.com/PostList.naver',
    'https://example.com/abc', 'https://blog.naver.com.evil.example/abc', 'https://evil.example/?blogId=abc',
    'https://user:pw@blog.naver.com/abc', 'javascript:alert(1)', 'ftp://blog.naver.com/abc',
    'https://blog.naver.com/PostView.naver?blogId=bad%2Fid',
    'https://blog.naver.com/a%2Fb',
    'a b', 'bad/id', 'abc@naver.com', 'a.b', '연예 이슈', 'x'.repeat(101),
  ])('refuses %j', input => {
    expect(normalizeBlogId(input)).toBeUndefined();
  });

  it('refuses non-string input', () => {
    expect(normalizeBlogId(undefined as unknown as string)).toBeUndefined();
    expect(normalizeBlogId(42 as unknown as string)).toBeUndefined();
  });
});

describe('resolveExpectedBlogId with pasted URLs', () => {
  const account = (blogId: string) => [{ naverId: 'login', blogId }];
  it.each([
    'https://blog.naver.com/Abc', 'blog.naver.com/abc', 'm.blog.naver.com/abc/223456789012',
    'https://blog.naver.com/PostView.naver?blogId=abc&logNo=1',
  ])('resolves %j to the bare id', blogId => {
    expect(resolveExpectedBlogId('login', account(blogId))).toBe('abc');
  });
  it('treats a URL and a bare id of the same blog as one destination', () => {
    expect(resolveExpectedBlogId('login', [{ naverId: 'login', blogId: 'abc' }, { naverId: 'LOGIN', blogId: 'https://blog.naver.com/ABC' }])).toBe('abc');
  });
  it('still rejects two different destinations', () => {
    expect(() => resolveExpectedBlogId('login', [{ naverId: 'login', blogId: 'abc' }, { naverId: 'login', blogId: 'https://blog.naver.com/def' }])).toThrow();
  });
  it.each(['https://example.com/abc', 'https://blog.naver.com/', 'abc@naver.com', 'a.b', 'bad/id'])('keeps the Korean error for %j', blogId => {
    expect(() => resolveExpectedBlogId('login', account(blogId))).toThrow('블로그 ID를 확인해주세요');
  });
  it('keeps legacy display labels falling back to the login id', () => {
    expect(resolveExpectedBlogId('login', account('연예 이슈'))).toBe('login');
  });
});

describe('BlogAccountManager saves the bare blog id', () => {
  it('normalises a pasted URL when an account is added', () => {
    const manager = new BlogAccountManager();
    expect(manager.addAccount('별명', 'https://blog.naver.com/Abc', 'naver-a').blogId).toBe('abc');
    expect(manager.addAccount('별명', 'm.blog.naver.com/xyz/223456789012', 'naver-b').blogId).toBe('xyz');
  });
  it('lowercases a bare id and leaves a legacy label and an unrecognised value as typed', () => {
    const manager = new BlogAccountManager();
    expect(manager.addAccount('별명', ' Blog-A ').blogId).toBe('blog-a');
    expect(manager.addAccount('별명', '연예 이슈').blogId).toBe('연예 이슈');
    expect(manager.addAccount('별명', 'https://example.com/abc').blogId).toBe('https://example.com/abc');
  });
  it('normalises blogId on update and leaves other updates alone', () => {
    const manager = new BlogAccountManager();
    const account = manager.addAccount('별명', 'old-id', 'naver-a');
    manager.updateAccount(account.id, { name: '새 이름' });
    expect(manager.getAccount(account.id)).toMatchObject({ name: '새 이름', blogId: 'old-id' });
    manager.updateAccount(account.id, { blogId: 'https://blog.naver.com/New-Id/' });
    expect(manager.getAccount(account.id)?.blogId).toBe('new-id');
  });
});
