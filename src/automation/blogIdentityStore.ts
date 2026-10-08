import { createHash, randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { renameWithRetry } from './safeStateRename.js';
import { WELL_FORMED_BLOG_ID } from './blogIdentityPolicy.js';

const FILE_NAME = 'blog-identity.json';
interface StoredIdentities { schema: 1; learned: Record<string, string> }

export interface BlogIdentityStoreOptions {
  storageDir?: string;
  /** Replaces the atomic file write (tests only). */
  writeFile?: (target: string, text: string) => void;
}

/** Temporary file in the same folder, fsync, then a retried rename: a crash never leaves a half-written map. */
function writeAtomically(target: string, text: string): void {
  const temporary = target + '.' + randomBytes(8).toString('hex') + '.tmp';
  let descriptor: number | undefined;
  try {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, text, 'utf8'); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    renameWithRetry(temporary, target);
  } finally {
    if (descriptor !== undefined) { try { closeSync(descriptor); } catch { /* The write already failed. */ } }
    try { unlinkSync(temporary); } catch { /* Renamed or never created. */ }
  }
}

/**
 * Naver login ID -> the blog address the editor confirmed for it ("learned"). Lives next to the account guard's state under
 * ~/.naver-blog-automation/safety-state, outside the install folder, so it survives app updates. The login ID is stored only
 * as a hash; the blog address is public.
 */
export class BlogIdentityStore {
  private readonly file: string;
  private readonly writeFile: (target: string, text: string) => void;
  /** Values learned in this run: still honoured when the disk write failed. */
  private readonly memory = new Map<string, string>();
  constructor(options: BlogIdentityStoreOptions = {}) {
    this.file = join(options.storageDir || join(homedir(), '.naver-blog-automation', 'safety-state'), FILE_NAME);
    this.writeFile = options.writeFile ?? writeAtomically;
  }
  private key(naverId: string): string { return createHash('sha256').update(String(naverId).trim().toLowerCase()).digest('hex'); }
  /** A missing, corrupt or wrongly shaped file reads as "nothing learned"; entries of the wrong shape are dropped. */
  private readDisk(): Record<string, string> {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as StoredIdentities;
      if (!parsed || parsed.schema !== 1 || !parsed.learned || typeof parsed.learned !== 'object' || Array.isArray(parsed.learned)) return {};
      return Object.fromEntries(Object.entries(parsed.learned).filter(([, blog]) => typeof blog === 'string' && WELL_FORMED_BLOG_ID.test(blog)));
    } catch { return {}; }
  }
  private all(): Record<string, string> { return { ...this.readDisk(), ...Object.fromEntries(this.memory) }; }
  get(naverId: string): string | undefined { return this.all()[this.key(naverId)]; }
  /** True when the blog is learned for a Naver ID other than `naverId`. */
  isLearnedByOther(blogId: string, naverId: string): boolean {
    const own = this.key(naverId); const blog = String(blogId).trim().toLowerCase();
    return Object.entries(this.all()).some(([key, value]) => key !== own && value === blog);
  }
  /** Returns true when the value reached the disk; a failed write keeps it for this run only. */
  learn(naverId: string, blogId: string): boolean {
    const blog = String(blogId).trim().toLowerCase();
    if (!WELL_FORMED_BLOG_ID.test(blog)) return false;
    const key = this.key(naverId);
    this.memory.set(key, blog);
    try {
      const state: StoredIdentities = { schema: 1, learned: { ...this.readDisk(), [key]: blog } };
      this.writeFile(this.file, JSON.stringify(state));
      this.memory.delete(key);
      return true;
    } catch (error) {
      console.warn(`[BlogIdentityStore] ⚠️ 블로그 주소 저장 실패 (이번 실행에서만 기억): ${(error as Error).message}`);
      return false;
    }
  }
}

let singleton: BlogIdentityStore | undefined;
export function getBlogIdentityStore(): BlogIdentityStore { return singleton ||= new BlogIdentityStore(); }
