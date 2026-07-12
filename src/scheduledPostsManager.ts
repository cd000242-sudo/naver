import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { isConcreteNaverBlogPostUrl } from './automation/publishOutcomeResolver.js';
import { classifyPublishFailure } from './automation/publishFailureClassifier.js';
import { sanitizeUserVisibleError } from './runtime/userVisibleError.js';

// ✅ 반복 일정 타입 추가
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';

export interface ScheduledPost {
  id: string;
  postId?: string; // ✅ localStorage의 generatedPosts에서 찾을 때 사용
  title: string;
  scheduleDate: string; // YYYY-MM-DD HH:mm 형식
  createdAt: string; // ISO 형식
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'uncertain' | 'cancelled';
  publishMode?: 'draft' | 'publish' | 'schedule';
  publishedAt?: string; // ✅ 실제 발행 완료 시간
  publishedUrl?: string; // ✅ 발행된 글 URL
  error?: string;
  failureCode?: string;
  publishStartedAt?: string;
  publishRunId?: string;
  // ✅ 반복 일정 필드
  recurrence?: RecurrenceType;
  recurrenceEndDate?: string; // 반복 종료 날짜 (선택사항)
  lastPublished?: string; // 마지막 발행 시간
}

const SCHEDULED_POSTS_FILE = 'scheduled-posts.json';
const SCHEDULE_PROCESS_RUN_ID = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const ACTIVE_PUBLISH_STALE_AFTER_MS = 20 * 60 * 1000;
let scheduledPostsMutationChain: Promise<void> = Promise.resolve();
const volatilePostOverrides = new Map<string, ScheduledPost>();

function applyVolatilePostOverrides(posts: readonly ScheduledPost[]): ScheduledPost[] {
  const seenIds = new Set<string>();
  const merged = posts.map((post) => {
    seenIds.add(post.id);
    return volatilePostOverrides.get(post.id) || post;
  });
  for (const [postId, post] of volatilePostOverrides) {
    if (!seenIds.has(postId)) merged.push(post);
  }
  return merged;
}

function clearPersistedVolatileOverrides(posts: readonly ScheduledPost[]): void {
  for (const post of posts) {
    if (volatilePostOverrides.get(post.id) === post) {
      volatilePostOverrides.delete(post.id);
    }
  }
}

function enqueueScheduledPostsMutation<T>(operation: () => Promise<T>): Promise<T> {
  const next = scheduledPostsMutationChain.then(operation, operation);
  scheduledPostsMutationChain = next.then(() => undefined, () => undefined);
  return next;
}

async function readScheduledPostsFile(filePath: string): Promise<ScheduledPost[]> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(data) as unknown;
    return Array.isArray(parsed) ? parsed as ScheduledPost[] : [];
  } catch {
    return [];
  }
}

async function writeScheduledPostsAtomic(
  filePath: string,
  posts: readonly ScheduledPost[],
): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(posts, null, 2), 'utf-8');
    const retryableRenameCodes = new Set(['EPERM', 'EACCES', 'EBUSY']);
    let lastRenameError: unknown;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await fs.rename(tempPath, filePath);
        return;
      } catch (error) {
        lastRenameError = error;
        const code = error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';
        if (!retryableRenameCodes.has(code) || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 * (2 ** attempt)));
      }
    }
    throw lastRenameError;
  } finally {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

function reconcileInterruptedPublishingPosts(posts: readonly ScheduledPost[]): {
  readonly posts: ScheduledPost[];
  readonly changed: boolean;
} {
  let changed = false;
  const reconciled = posts.map((post) => {
    if (post.status !== 'publishing') return post;
    const publishStartedAtMs = Date.parse(post.publishStartedAt || '');
    const belongsToCurrentRun = post.publishRunId === SCHEDULE_PROCESS_RUN_ID;
    const isWithinDeadline = Number.isFinite(publishStartedAtMs)
      && Date.now() - publishStartedAtMs <= ACTIVE_PUBLISH_STALE_AFTER_MS;
    if (belongsToCurrentRun && isWithinDeadline) return post;
    changed = true;
    return {
      ...post,
      status: 'uncertain' as const,
      error: '이전 실행이 발행 결과를 저장하기 전에 종료되었습니다. 네이버에서 발행 여부를 확인해주세요.',
      failureCode: 'PUBLISH_OUTCOME_UNKNOWN',
      publishStartedAt: undefined,
      publishRunId: undefined,
    };
  });
  return { posts: reconciled, changed };
}

async function readAndReconcileScheduledPosts(filePath: string): Promise<ScheduledPost[]> {
  await scheduledPostsMutationChain;
  const current = applyVolatilePostOverrides(await readScheduledPostsFile(filePath));
  const reconciled = reconcileInterruptedPublishingPosts(current);
  if (reconciled.changed) {
    await enqueueScheduledPostsMutation(async () => {
      const latest = applyVolatilePostOverrides(await readScheduledPostsFile(filePath));
      const latestReconciled = reconcileInterruptedPublishingPosts(latest);
      if (latestReconciled.changed) {
        await writeScheduledPostsAtomic(filePath, latestReconciled.posts);
        clearPersistedVolatileOverrides(latestReconciled.posts);
      }
    });
  }
  return reconciled.posts;
}

export function requireConcreteNaverPostUrl(value: unknown): string {
  const publishedUrl = typeof value === 'string' ? value.trim() : '';
  if (!isConcreteNaverBlogPostUrl(publishedUrl)) {
    throw new Error('PUBLISH_UNCONFIRMED: concrete Naver post URL was not confirmed');
  }
  return publishedUrl;
}

export function createPublishedScheduledPostState(
  post: ScheduledPost,
  publishedUrl: unknown,
  publishedAt = new Date().toISOString(),
): ScheduledPost {
  return {
    ...post,
    status: 'published',
    publishedAt,
    publishedUrl: requireConcreteNaverPostUrl(publishedUrl),
    error: undefined,
    failureCode: undefined,
    publishStartedAt: undefined,
    publishRunId: undefined,
  };
}

export function createPublishingScheduledPostState(
  post: ScheduledPost,
  publishStartedAt = new Date().toISOString(),
): ScheduledPost {
  return {
    ...post,
    status: 'publishing',
    publishStartedAt,
    publishRunId: SCHEDULE_PROCESS_RUN_ID,
    publishedAt: undefined,
    publishedUrl: undefined,
    error: undefined,
    failureCode: undefined,
  };
}

export function createFailedScheduledPostState(
  post: ScheduledPost,
  error: unknown,
): ScheduledPost {
  const rawMessage = error instanceof Error
    ? error.message
    : (typeof error === 'string' ? error : 'Unknown scheduled publish error');
  const explicitCode = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';
  const classifiedCode = classifyPublishFailure(error).code;
  const failureCode = explicitCode === 'PUBLISH_UNCONFIRMED'
    || explicitCode === 'SCHEDULE_PUBLISH_OUTCOME_UNKNOWN'
    || classifiedCode === 'PUBLISH_OUTCOME_UNKNOWN'
    ? 'PUBLISH_OUTCOME_UNKNOWN'
    : (explicitCode || classifiedCode);
  const status: ScheduledPost['status'] = failureCode === 'PUBLISH_OUTCOME_UNKNOWN'
    ? 'uncertain'
    : 'failed';

  return {
    ...post,
    status,
    error: sanitizeUserVisibleError(rawMessage),
    failureCode,
    publishStartedAt: undefined,
    publishRunId: undefined,
    publishedAt: undefined,
    publishedUrl: undefined,
  };
}

/** A confirmed remote publish is monotonic and can never be downgraded locally. */
export function resolveScheduledPostStateAfterError(
  post: ScheduledPost,
  error: unknown,
  confirmedPublishedPost?: ScheduledPost | null,
): ScheduledPost {
  if (confirmedPublishedPost?.status === 'published') {
    return { ...confirmedPublishedPost };
  }
  return createFailedScheduledPostState(post, error);
}

function getScheduledPostsPath(): string {
  return path.join(app.getPath('userData'), SCHEDULED_POSTS_FILE);
}

export async function loadScheduledPosts(): Promise<ScheduledPost[]> {
  try {
    const filePath = getScheduledPostsPath();
    const posts = await readAndReconcileScheduledPosts(filePath);
    return posts.filter(post => post.status === 'scheduled');
  } catch (error) {
    // 파일이 없으면 빈 배열 반환
    return [];
  }
}

export async function saveScheduledPost(post: ScheduledPost): Promise<void> {
  volatilePostOverrides.set(post.id, post);
  try {
    const filePath = getScheduledPostsPath();
    await enqueueScheduledPostsMutation(async () => {
      const posts = applyVolatilePostOverrides(await readScheduledPostsFile(filePath));
      const existingIndex = posts.findIndex(p => p.id === post.id);
      const nextPosts = existingIndex >= 0
        ? posts.map((existingPost, index) => index === existingIndex ? post : existingPost)
        : [...posts, post];
      await writeScheduledPostsAtomic(filePath, nextPosts);
      clearPersistedVolatileOverrides(nextPosts);
    });
  } catch (error) {
    throw new Error(`예약 포스팅 저장 실패: ${(error as Error).message}`);
  }
}

export async function removeScheduledPost(postId: string): Promise<void> {
  try {
    const filePath = getScheduledPostsPath();
    await enqueueScheduledPostsMutation(async () => {
      volatilePostOverrides.delete(postId);
      const posts = applyVolatilePostOverrides(await readScheduledPostsFile(filePath));
      const nextPosts = posts.filter(p => p.id !== postId);
      if (nextPosts.length !== posts.length) {
        await writeScheduledPostsAtomic(filePath, nextPosts);
        clearPersistedVolatileOverrides(nextPosts);
      }
    });
  } catch (error) {
    throw new Error(`예약 포스팅 제거 실패: ${(error as Error).message}`);
  }
}

export async function getAllScheduledPosts(): Promise<ScheduledPost[]> {
  try {
    const filePath = getScheduledPostsPath();
    return await readAndReconcileScheduledPosts(filePath);
  } catch (error) {
    return [];
  }
}

// ✅ 반복 일정 계산 함수
export function calculateNextScheduleDate(post: ScheduledPost): string | null {
  if (!post.recurrence || post.recurrence === 'none') return null;
  
  const lastDate = post.lastPublished ? new Date(post.lastPublished) : new Date(post.scheduleDate);
  let nextDate: Date;
  
  switch (post.recurrence) {
    case 'daily':
      nextDate = new Date(lastDate.getTime() + 24 * 60 * 60 * 1000); // +1일
      break;
    case 'weekly':
      nextDate = new Date(lastDate.getTime() + 7 * 24 * 60 * 60 * 1000); // +7일
      break;
    case 'monthly':
      nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + 1); // +1개월
      break;
    default:
      return null;
  }
  
  // 종료 날짜 체크
  if (post.recurrenceEndDate) {
    const endDate = new Date(post.recurrenceEndDate);
    if (nextDate > endDate) {
      return null; // 종료 날짜 초과
    }
  }
  
  // YYYY-MM-DD HH:mm 형식으로 반환
  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, '0');
  const day = String(nextDate.getDate()).padStart(2, '0');
  const hours = String(nextDate.getHours()).padStart(2, '0');
  const minutes = String(nextDate.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ✅ 반복 일정 포스트 처리 (발행 후 다음 일정 생성)
export async function handleRecurringPost(post: ScheduledPost): Promise<void> {
  if (!post.recurrence || post.recurrence === 'none') return;
  
  const nextScheduleDate = calculateNextScheduleDate(post);
  
  if (nextScheduleDate) {
    // 다음 일정 생성
    const nextPost: ScheduledPost = {
      ...post,
      id: `${post.id}-${Date.now()}`, // 새 ID 생성
      scheduleDate: nextScheduleDate,
      lastPublished: new Date().toISOString(),
      status: 'scheduled',
      publishedAt: undefined,
      publishedUrl: undefined,
      error: undefined,
      failureCode: undefined,
      publishStartedAt: undefined,
      publishRunId: undefined,
    };
    
    await saveScheduledPost(nextPost);
    console.log(`[Scheduler] 반복 일정 생성: ${nextPost.title} - ${nextScheduleDate}`);
  } else {
    console.log(`[Scheduler] 반복 일정 종료: ${post.title}`);
  }
}

// ✅ 예약 시간 변경 함수
export async function rescheduleScheduledPost(postId: string, newScheduleDate: string): Promise<void> {
  try {
    const filePath = getScheduledPostsPath();
    const updatedTitle = await enqueueScheduledPostsMutation(async () => {
      const posts = applyVolatilePostOverrides(await readScheduledPostsFile(filePath));
      const postIndex = posts.findIndex(p => p.id === postId);
      if (postIndex < 0) {
        throw new Error('해당 예약을 찾을 수 없습니다.');
      }

      const nextPosts = posts.map((post, index) => index === postIndex
        ? {
            ...post,
            scheduleDate: newScheduleDate,
            status: 'scheduled' as const,
            error: undefined,
            failureCode: undefined,
            publishStartedAt: undefined,
            publishRunId: undefined,
            publishedAt: undefined,
            publishedUrl: undefined,
          }
        : post);
      volatilePostOverrides.set(postId, nextPosts[postIndex]);
      await writeScheduledPostsAtomic(filePath, nextPosts);
      clearPersistedVolatileOverrides(nextPosts);
      return nextPosts[postIndex].title;
    });
    console.log(`[Scheduler] 예약 시간 변경: ${updatedTitle} → ${newScheduleDate}`);
  } catch (error) {
    throw new Error(`예약 시간 변경 실패: ${(error as Error).message}`);
  }
}

// ✅ 실패한 예약 재시도 (현재 시간 + 1분으로 재스케줄)
export async function retryScheduledPost(postId: string): Promise<void> {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1); // 1분 후 재시도
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const retryDate = `${year}-${month}-${day} ${hours}:${minutes}`;
  
  await rescheduleScheduledPost(postId, retryDate);
  console.log(`[Scheduler] 재시도 예약: ${retryDate}`);
}





