import type { ScheduledPost } from '../scheduledPostsManager.js';
import { parseScheduledDate } from './scheduledPostLookupPolicy.js';

export interface AppScheduleInput {
  postId?: string;
  title?: string;
  scheduleDate?: string;
  scheduleTime?: string;
  contentPolicyManualReviewApproved?: boolean;
  scheduledAccountId?: string;
  scheduledNaverId?: string;
  now?: Date;
}

export interface ResolvedScheduledPublishAt {
  date: Date;
  value: string;
}

export interface AppSchedulePersistence {
  save: (post: ScheduledPost) => Promise<void>;
  reserve: () => Promise<void>;
  rollback: () => Promise<void>;
}

function formatLocalMinute(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function resolveScheduledPublishAt(
  scheduleDate: unknown,
  scheduleTime?: unknown,
): ResolvedScheduledPublishAt | null {
  const rawDate = String(scheduleDate || '').trim();
  const rawTime = String(scheduleTime || '').trim();
  if (!rawDate) return null;

  const datePart = rawDate.split(/[ T]/, 1)[0];
  const embeddedTime = rawDate.match(/[ T](\d{2}:\d{2})(?::\d{2})?$/)?.[1] || '';
  const timePart = rawTime || embeddedTime;
  if (!datePart || !timePart) return null;

  const parsed = parseScheduledDate(`${datePart} ${timePart}`);
  return parsed ? { date: parsed, value: formatLocalMinute(parsed) } : null;
}

function stableScheduleId(postId: string): string {
  const safe = postId.replace(/[^\p{L}\p{N}_.-]+/gu, '_').replace(/^_+|_+$/g, '');
  return `app-${safe || 'post'}`;
}

export function createAppScheduledPost(input: AppScheduleInput): ScheduledPost {
  const postId = String(input.postId || '').trim();
  if (!postId) throw new Error('APP_SCHEDULE_POST_ID_REQUIRED');

  const resolved = resolveScheduledPublishAt(input.scheduleDate, input.scheduleTime);
  if (!resolved) throw new Error('APP_SCHEDULE_DATE_INVALID');

  const now = input.now || new Date();
  if (!Number.isFinite(now.getTime()) || resolved.date.getTime() <= now.getTime()) {
    throw new Error('APP_SCHEDULE_DATE_PAST');
  }

  const title = String(input.title || '').trim();
  if (!title) throw new Error('APP_SCHEDULE_TITLE_REQUIRED');

  return {
    id: stableScheduleId(postId),
    postId,
    title,
    scheduleDate: resolved.value,
    createdAt: now.toISOString(),
    status: 'scheduled',
    publishMode: 'publish',
    contentPolicyManualReviewApproved: input.contentPolicyManualReviewApproved === true,
    scheduledAccountId: String(input.scheduledAccountId || '').trim() || undefined,
    scheduledNaverId: String(input.scheduledNaverId || '').trim() || undefined,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

export async function persistAppScheduledPostSafely(
  post: ScheduledPost,
  persistence: AppSchedulePersistence,
): Promise<void> {
  await persistence.save(post);
  try {
    await persistence.reserve();
  } catch (reservationError) {
    try {
      await persistence.rollback();
    } catch (rollbackError) {
      throw new Error(
        `APP_SCHEDULE_RESERVATION_FAILED:${errorMessage(reservationError)};`
        + `APP_SCHEDULE_ROLLBACK_FAILED:${errorMessage(rollbackError)}`,
      );
    }
    throw new Error(`APP_SCHEDULE_RESERVATION_FAILED:${errorMessage(reservationError)}`);
  }
}
