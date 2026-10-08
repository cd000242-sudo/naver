import { expect, it } from 'vitest';
import { resolveExpectedBlogId } from '../automation/expectedBlogIdentity';
it('uses saved blog identity without requiring an account-management UI visit', () => {
 expect(resolveExpectedBlogId('LOGIN-ID', [{naverId:'login-id',blogId:'custom_blog'}])).toBe('custom_blog');
 expect(resolveExpectedBlogId('login-id', [])).toBe('login-id');
});
it('rejects conflicting or invalid saved destinations', () => {
 expect(()=>resolveExpectedBlogId('one',[{naverId:'one',blogId:'a'},{naverId:'ONE',blogId:'b'}])).toThrow();
 // 2026-10-09: a pasted Naver blog URL is now reduced to its bare id (blogIdNormalization.test.ts); a foreign URL still fails.
 expect(()=>resolveExpectedBlogId('one',[{naverId:'one',blogId:'https://example.com/wrong'}])).toThrow();
 expect(()=>resolveExpectedBlogId('',[])).toThrow();
});
it('normalizes duplicates without silently choosing a different blog', () => {
 expect(resolveExpectedBlogId('one',[{naverId:'ONE',blogId:'BLOG'},{naverId:'one',blogId:'blog'}])).toBe('blog');
});

it('preserves legacy display labels without treating a URL as an identity', () => {
 expect(resolveExpectedBlogId('saved_login',[{naverId:'saved_login',blogId:'연예 이슈'}])).toBe('saved_login');
});
