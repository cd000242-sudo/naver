import { AccountExecutionGuardError } from './accountExecutionGuard.js';
const BLOG_ID_PATTERN = /^[a-z0-9_-]{1,100}$/;
const BLOG_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com']);
/**
 * Bare, lowercase blog id from what a user typed: the id itself or a pasted Naver blog address
 * ("https://blog.naver.com/abc", "m.blog.naver.com/abc/2234...", "...PostView.naver?blogId=abc").
 * Returns undefined when no trustworthy id can be extracted (foreign host, credentials in the URL, system page).
 */
export function normalizeBlogId(input: unknown): string | undefined {
 if (typeof input !== 'string') return undefined;
 const raw = input.trim().toLowerCase();
 if (BLOG_ID_PATTERN.test(raw)) return raw;
 if (!raw || /\s/.test(raw)) return undefined;
 let url: URL;
 try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : 'https://' + raw); } catch { return undefined; }
 if (!['http:', 'https:'].includes(url.protocol) || !BLOG_HOSTS.has(url.hostname) || url.username || url.password) return undefined;
 // An explicit ?blogId= wins; otherwise the first path segment is the id. Segments are not percent-decoded.
 const candidate = url.searchParams.has('blogid') ? url.searchParams.get('blogid') : url.pathname.split('/').filter(Boolean)[0];
 return candidate && BLOG_ID_PATTERN.test(candidate) ? candidate : undefined;
}
/** App configuration, never an untrusted page, selects the destination identity. */
export function resolveExpectedBlogId(naverId: string, accounts: ReadonlyArray<{ naverId?: string; blogId: string }>): string {
 const login = naverId.trim().toLowerCase();
 const matches = accounts.filter(a => a.naverId?.trim().toLowerCase() === login);
 const blogs = [...new Set(matches.map(a => {
  const saved = a.blogId.trim().toLowerCase();
  const extracted = normalizeBlogId(saved);
  if (extracted) return extracted;
  // Older account forms stored a Korean display label in this field.
  if (!saved || (/[^a-z0-9_-]/.test(saved) && !/[.:/\\@]/.test(saved))) return login;
  return saved;
 }))];
 const blog = blogs[0] || login;
 if (!/^[a-z0-9_-]+$/.test(blog) || blogs.length > 1) throw new AccountExecutionGuardError('ACCOUNT_MISMATCH', '계정 관리에 등록된 블로그 ID를 확인해주세요.');
 return blog;
}
