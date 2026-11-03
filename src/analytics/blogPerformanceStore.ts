/**
 * 블로그 글 성과 저장소(2026-10-21) — {userData}/blog-performance-v1.json, 블로그 계정(account.id)마다 따로.
 *   · 같은 글 · 같은 관측 구간(24h/72h/7d/기간)은 새로 가져온 값으로 바꾼다(중복 쌓지 않음).
 *   · 계정의 블로그 ID와 다른 글은 받지 않는다. 버전을 모르는 파일 · 깨진 파일은 덮어쓰지 않고 실패한다.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from '../automation/safeStateRename.js';
import type { PostObservation } from './blogPerformance.js';

interface Stored { version: 1; revision: number; accounts: Record<string, PostObservation[]> }
const MAX_BYTES = 8_000_000;
const MAX_PER_ACCOUNT = 20_000;
const ACCOUNT_ID = /^[\w-]{1,120}$/;

async function readStored(file: string): Promise<Stored | null> {
  let content: string;
  try { content = await readFile(file, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('PERFORMANCE_UNREADABLE: 성과 기록 파일을 읽지 못했습니다.');
  }
  if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('PERFORMANCE_UNREADABLE: 성과 기록 파일이 너무 큽니다.');
  let parsed: Stored;
  try { parsed = JSON.parse(content); } catch { throw new Error('PERFORMANCE_UNREADABLE: 성과 기록 파일이 깨졌습니다.'); }
  if (!parsed || parsed.version !== 1 || !parsed.accounts || typeof parsed.accounts !== 'object' || Array.isArray(parsed.accounts)) {
    throw new Error('PERFORMANCE_UNREADABLE: 알 수 없는 성과 기록 파일 버전입니다.');
  }
  return parsed;
}

async function writeStored(file: string, value: Stored): Promise<void> {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > MAX_BYTES) throw new Error('PERFORMANCE_TOO_LARGE: 성과 기록이 너무 큽니다.');
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(encoded, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
    renameWithRetry(temporary, file);
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
}

const obsKey = (o: PostObservation) => `${o.postId}|${o.window}|${o.range?.start || ''}|${o.range?.end || ''}`;

export function createBlogPerformanceStore(file: string) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(job: () => Promise<T>): Promise<T> => { const r = tail.then(job); tail = r.catch(() => undefined); return r; };
  const check = (accountId: string, blogId: string) => {
    if (!ACCOUNT_ID.test(accountId)) throw new Error('PERFORMANCE_INVALID: 계정 ID가 올바르지 않습니다.');
    if (!/^[a-z0-9_-]{1,100}$/.test(blogId)) throw new Error('PERFORMANCE_BLOG_UNKNOWN: 계정의 블로그 ID가 필요합니다.');
  };
  return {
    add(accountId: string, blogId: string, observations: readonly PostObservation[]): Promise<{ added: number; replaced: number }> {
      return serial(async () => {
        check(accountId, blogId);
        if (observations.some(o => o.blogId !== blogId)) throw new Error('PERFORMANCE_OTHER_BLOG: 다른 블로그의 성과는 이 계정에 넣을 수 없습니다.');
        const stored = await readStored(file) || { version: 1 as const, revision: 0, accounts: {} };
        const current = (stored.accounts[accountId] || []).filter(o => o.blogId === blogId);
        const byKey = new Map(current.map(o => [obsKey(o), o]));
        let replaced = 0;
        for (const o of observations) { if (byKey.has(obsKey(o))) replaced++; byKey.set(obsKey(o), o); }
        const next = [...byKey.values()];
        if (next.length > MAX_PER_ACCOUNT) throw new Error('PERFORMANCE_TOO_LARGE: 계정당 성과 기록이 너무 많습니다.');
        await writeStored(file, { version: 1, revision: stored.revision + 1, accounts: { ...stored.accounts, [accountId]: next } });
        return { added: observations.length - replaced, replaced };
      });
    },
    /** 이 계정 · 이 블로그 글만 — 블로그 주소가 바뀐 뒤 옛 블로그 성과가 섞이지 않게. */
    async list(accountId: string, blogId: string): Promise<PostObservation[]> {
      check(accountId, blogId);
      const stored = await readStored(file);
      return (stored?.accounts[accountId] || []).filter(o => o.blogId === blogId);
    },
  };
}

export type BlogPerformanceStore = ReturnType<typeof createBlogPerformanceStore>;
