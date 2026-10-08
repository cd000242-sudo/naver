import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { BlogIdentityStore } from '../../automation/blogIdentityStore';

const created: string[] = [];
let registered = false;

/**
 * Points the session manager's learned-blog store at a throw-away folder. A probe that confirms a blog no account names
 * LEARNS it (written to ~/.naver-blog-automation), so every test that probes through the singleton must call this.
 */
export function isolateBlogIdentity(manager: unknown): BlogIdentityStore {
  if (!registered) {
    registered = true;
    afterAll(() => { for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  }
  const storageDir = mkdtempSync(join(tmpdir(), 'blog-identity-test-'));
  created.push(storageDir);
  const store = new BlogIdentityStore({ storageDir });
  (manager as { identityStore: BlogIdentityStore }).identityStore = store;
  return store;
}
