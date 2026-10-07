import { AccountExecutionGuardError } from './accountExecutionGuard.js';
/** App configuration, never an untrusted page, selects the destination identity. */
export function resolveExpectedBlogId(naverId: string, accounts: ReadonlyArray<{ naverId?: string; blogId: string }>): string {
 const login = naverId.trim().toLowerCase();
 const matches = accounts.filter(a => a.naverId?.trim().toLowerCase() === login);
 const blogs = [...new Set(matches.map(a => {
  const saved = a.blogId.trim().toLowerCase();
  // Older account forms stored a Korean display label in this field.
  if (!saved || (/[^a-z0-9_-]/.test(saved) && !/[.:/\\@]/.test(saved))) return login;
  return saved;
 }))];
 const blog = blogs[0] || login;
 if (!/^[a-z0-9_-]+$/.test(blog) || blogs.length > 1) throw new AccountExecutionGuardError('ACCOUNT_MISMATCH', '계정 관리에 등록된 블로그 ID를 확인해주세요.');
 return blog;
}
