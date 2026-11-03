/**
 * 블로그별 초기 설정 저장소(2026-10-21) — {userData}/blog-profiles.json.
 *   · 키는 account.id(블로그 계정마다 한 번 만들어지는 안정 ID). 라이선스 사용자별 settings_*.json · localStorage 와 분리한다.
 *   · 저장 당시 블로그 ID(boundBlogId)와 지금 계정의 블로그 ID가 다르면 프로필을 쓰지 않는다(다른 블로그에 섞이지 않게).
 *   · 파일이 없으면 프로필 없음 = 지금까지와 같은 동작. 기존 계정 · 원고 · 예약 설정은 건드리지 않는다(opt-in).
 *   · 저장은 임시 파일 → fsync → rename(원자적). 버전을 모르는 파일 · 깨진 파일은 덮어쓰지 않고 실패한다.
 *   · profileVersion 은 저장마다 1 증가하고, 화면이 본 버전과 다르면 저장을 거절한다(두 창 동시 수정 · 재분석 경합).
 */
import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from '../automation/safeStateRename.js';
import { normalizeBlogId } from '../automation/expectedBlogIdentity.js';
import { normalizeBlogProfileInput, BlogProfileError, type BlogProfile } from './blogProfile.js';

interface StoredProfiles { version: 1; revision: number; profiles: Record<string, BlogProfile> }
export interface ProfileAccount { readonly id: string; readonly blogId?: string; readonly naverId?: string }
export interface ResolvedBlogProfile { readonly profile: BlogProfile | null; readonly warning?: 'BLOG_PROFILE_BINDING_MISMATCH' | 'BLOG_PROFILE_BLOG_UNKNOWN' }

const MAX_BYTES = 4_000_000;
const ACCOUNT_ID = /^[\w-]{1,120}$/;

async function readStore(file: string): Promise<StoredProfiles | null> {
  let content: string;
  try { content = await readFile(file, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new BlogProfileError('BLOG_PROFILE_UNREADABLE', '블로그 설정 파일을 읽지 못했습니다');
  }
  if (Buffer.byteLength(content) > MAX_BYTES) throw new BlogProfileError('BLOG_PROFILE_UNREADABLE', '블로그 설정 파일이 너무 큽니다');
  let parsed: StoredProfiles;
  try { parsed = JSON.parse(content.replace(/^﻿/, '')); } catch { throw new BlogProfileError('BLOG_PROFILE_UNREADABLE', '블로그 설정 파일이 깨졌습니다'); }
  if (!parsed || parsed.version !== 1 || !parsed.profiles || typeof parsed.profiles !== 'object' || Array.isArray(parsed.profiles)) {
    throw new BlogProfileError('BLOG_PROFILE_UNREADABLE', '알 수 없는 블로그 설정 파일 버전입니다');
  }
  return parsed;
}

async function writeStore(file: string, value: StoredProfiles): Promise<void> {
  const encoded = JSON.stringify(value, null, 1);
  if (Buffer.byteLength(encoded) > MAX_BYTES) throw new BlogProfileError('BLOG_PROFILE_TOO_LARGE', '블로그 설정이 너무 큽니다');
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(encoded, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
    renameWithRetry(temporary, file);
  } finally { await handle?.close(); await unlink(temporary).catch(() => {}); }
}

/**
 * 계정이 가리키는 실제 블로그 ID — 주소를 붙여 넣은 값도 ID 로 바꾼다. 알 수 없으면 undefined.
 * 로그인 아이디로 대신하지 않는다: 로그인 아이디와 블로그 주소가 다른 계정이 실제로 있다(2026-10-21 실측).
 * 블로그 칸에 "연예 이슈" 같은 이름만 있으면 계정 관리에서 블로그 주소를 넣어야 설정 · 성과를 연결한다.
 */
export function profileBlogIdOf(account: ProfileAccount): string | undefined {
  return normalizeBlogId(account.blogId);
}

export function createBlogProfileStore(file: string) {
  // 같은 프로세스 안의 저장끼리는 줄 세워 하나씩(읽기-수정-쓰기 경합 방지)
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job);
    tail = result.catch(() => undefined);
    return result;
  };
  const checkId = (accountId: string) => { if (!ACCOUNT_ID.test(accountId)) throw new BlogProfileError('BLOG_PROFILE_INVALID', '계정 ID가 올바르지 않습니다'); };

  return {
    /** 생성 · 검수 시작 시 한 번 읽어 고정한다. 블로그 ID가 바뀌었으면 쓰지 않는다. */
    async resolve(account: ProfileAccount): Promise<ResolvedBlogProfile> {
      checkId(account.id);
      const stored = await readStore(file);
      const profile = stored?.profiles[account.id];
      if (!profile) return { profile: null };
      const blogId = profileBlogIdOf(account);
      if (!blogId) return { profile: null, warning: 'BLOG_PROFILE_BLOG_UNKNOWN' };
      if (profile.boundBlogId !== blogId) return { profile: null, warning: 'BLOG_PROFILE_BINDING_MISMATCH' };
      return { profile };
    },

    /** expectedVersion — 화면이 열 때 본 profileVersion(새 프로필이면 0). 다르면 다른 곳에서 먼저 바꾼 것. */
    save(account: ProfileAccount, input: unknown, expectedVersion: number): Promise<BlogProfile> {
      return serial(async () => {
        checkId(account.id);
        const blogId = profileBlogIdOf(account);
        if (!blogId) throw new BlogProfileError('BLOG_PROFILE_BLOG_UNKNOWN', '계정의 블로그 주소가 비어 있거나 이름만 있습니다. [수정]에서 blog.naver.com/아이디 주소를 넣은 뒤 저장해 주세요');
        const content = normalizeBlogProfileInput(input);
        const stored = await readStore(file) || { version: 1 as const, revision: 0, profiles: {} };
        const current = stored.profiles[account.id];
        if ((current?.profileVersion || 0) !== expectedVersion) {
          throw new BlogProfileError('BLOG_PROFILE_VERSION_CONFLICT', '다른 곳에서 먼저 바뀐 설정입니다. 다시 열어 확인해 주세요');
        }
        const now = new Date().toISOString();
        const next: BlogProfile = {
          ...content,
          accountId: account.id,
          boundBlogId: blogId,
          profileVersion: (current?.profileVersion || 0) + 1,
          createdAt: current?.createdAt || now,
          updatedAt: now,
        };
        await writeStore(file, { version: 1, revision: stored.revision + 1, profiles: { ...stored.profiles, [account.id]: next } });
        return next;
      });
    },

    async exportProfile(accountId: string): Promise<BlogProfile | null> {
      checkId(accountId);
      const stored = await readStore(file);
      const profile = stored?.profiles[accountId];
      return profile ? JSON.parse(JSON.stringify(profile)) : null;
    },

    remove(accountId: string): Promise<boolean> {
      return serial(async () => {
        checkId(accountId);
        const stored = await readStore(file);
        if (!stored?.profiles[accountId]) return false;
        const { [accountId]: _removed, ...rest } = stored.profiles;
        await writeStore(file, { version: 1, revision: stored.revision + 1, profiles: rest });
        return true;
      });
    },
  };
}

export type BlogProfileStore = ReturnType<typeof createBlogProfileStore>;
