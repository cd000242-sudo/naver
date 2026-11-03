/**
 * 블로그 설정을 실제 생성 입력에 붙이는 곳(2026-10-21) — 수동 작성 · 다중계정 · 데일리 모두 같은 함수를 쓴다.
 *   · 프로필이 있으면 본문 작성 지시(contentPolicyPrompt) 뒤에 [블로그 설정] 블록을 붙이고, 소재 · 제목 심사용 짧은 자료를 돌려준다.
 *   · 프로필이 없거나, 블로그 주소가 바뀌었거나, 저장소를 못 읽으면 source 를 그대로 둔다(지금까지와 같은 생성).
 *   · 읽기는 생성 시작 때 한 번 — 이후 사용자가 설정을 바꿔도 진행 중인 글의 버전은 바뀌지 않는다.
 */
import { blogProfileForEditorial, buildBlogProfilePrompt, type BlogProfile } from './blogProfile.js';
import { profileBlogIdOf, type ProfileAccount, type ResolvedBlogProfile } from './blogProfileStore.js';
import type { PostObservation } from '../analytics/blogPerformance.js';
import { buildPerformancePrompt, summarizeBlogPerformance, type PerformanceDigest } from '../analytics/blogPerformanceDigest.js';

export interface AttachedBlogProfile {
  readonly profileVersion?: number;
  readonly warning?: string;
  readonly editorial?: ReturnType<typeof blogProfileForEditorial>;
  /** 스냅샷을 썼을 때 지금 저장된 버전 — 다르면 소재를 고른 뒤 설정이 바뀐 것(기록용). */
  readonly currentVersion?: number;
}

/** 소재를 고를 때 쓴 설정을 작성 단계까지 그대로 들고 가는 고정본(2026-10-21) — 사이에 설정이 바뀌어도 한 글은 한 버전. */
export interface BlogProfileSnapshot {
  readonly profileVersion: number;
  readonly boundBlogId: string;
  readonly editorial: ReturnType<typeof blogProfileForEditorial>;
  readonly prompt: string;
}
export function snapshotBlogProfile(profile: BlogProfile): BlogProfileSnapshot {
  return Object.freeze({ profileVersion: profile.profileVersion, boundBlogId: profile.boundBlogId,
    editorial: blogProfileForEditorial(profile), prompt: buildBlogProfilePrompt(profile) });
}

/** account.id 또는 로그인 아이디로 등록 계정을 찾는다. 둘 이상이 같은 로그인 아이디면 추측하지 않는다. */
export function findProfileAccount<T extends ProfileAccount>(accounts: readonly T[], hint: unknown): T | undefined {
  const wanted = typeof hint === 'string' ? hint.trim() : '';
  if (!wanted) return undefined;
  const byId = accounts.find(a => a.id === wanted);
  if (byId) return byId;
  const login = wanted.toLowerCase();
  const matches = accounts.filter(a => a.naverId?.trim().toLowerCase() === login);
  return matches.length === 1 ? matches[0] : undefined;
}

export async function attachBlogProfile(args: {
  store: { resolve: (account: ProfileAccount) => Promise<ResolvedBlogProfile> };
  account: ProfileAccount | undefined;
  source: { contentPolicyPrompt?: string; profileBlogId?: string };
  /** 소재 선정 때 고정한 설정 — 있으면 저장소를 다시 읽어 쓰지 않는다(같은 블로그일 때만). */
  snapshot?: BlogProfileSnapshot;
}): Promise<AttachedBlogProfile> {
  if (!args.account) return {};
  // 이 글을 쓰는 블로그 — 노출 성공 사례 등 블로그별 기록을 고를 때 쓴다(프로필이 없어도)
  const blogId = profileBlogIdOf(args.account);
  if (blogId) args.source.profileBlogId = blogId;
  let resolved: ResolvedBlogProfile;
  try { resolved = await args.store.resolve(args.account); } catch { return { warning: 'BLOG_PROFILE_UNREADABLE' }; }
  const snapshot = args.snapshot;
  if (snapshot && blogId && snapshot.boundBlogId === blogId) {
    args.source.contentPolicyPrompt = [args.source.contentPolicyPrompt, snapshot.prompt].filter(text => typeof text === 'string' && text.trim()).join('\n\n');
    return { profileVersion: snapshot.profileVersion, editorial: snapshot.editorial, currentVersion: resolved.profile?.profileVersion };
  }
  if (!resolved.profile) return resolved.warning ? { warning: resolved.warning } : {};
  const block = buildBlogProfilePrompt(resolved.profile);
  args.source.contentPolicyPrompt = [args.source.contentPolicyPrompt, block].filter(text => typeof text === 'string' && text.trim()).join('\n\n');
  return { profileVersion: resolved.profile.profileVersion, editorial: blogProfileForEditorial(resolved.profile) };
}

/**
 * 이 블로그의 실제 성과 관측을 다음 글 입력에 붙인다(2026-10-21). 계정 · 블로그 ID가 맞는 글만 읽는다.
 * 측정된 글이 없거나 파일을 못 읽으면 source 를 그대로 둔다 — 성과가 없다고 글쓰기를 막지 않는다.
 */
export async function attachBlogPerformance(args: {
  store: { list: (accountId: string, blogId: string) => Promise<PostObservation[]> };
  account: ProfileAccount | undefined;
  source: { contentPolicyPrompt?: string };
}): Promise<{ digest?: PerformanceDigest; warning?: string }> {
  const blogId = args.account ? profileBlogIdOf(args.account) : undefined;
  if (!args.account || !blogId) return {};
  let observations: PostObservation[];
  try { observations = await args.store.list(args.account.id, blogId); } catch { return { warning: 'PERFORMANCE_UNREADABLE' }; }
  const digest = summarizeBlogPerformance(observations);
  const block = buildPerformancePrompt(digest);
  if (!block) return {};
  args.source.contentPolicyPrompt = [args.source.contentPolicyPrompt, block].filter(text => typeof text === 'string' && text.trim()).join('\n\n');
  return { digest };
}
