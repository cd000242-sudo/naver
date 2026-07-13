import { describe, expect, it } from 'vitest';
import {
  createAppScheduledPost,
  persistAppScheduledPostSafely,
  resolveScheduledPublishAt,
} from '../scheduler/appScheduleQueue';

describe('app schedule queue contract', () => {
  it('combines a separate date and time into the durable local schedule format', () => {
    expect(resolveScheduledPublishAt('2026-07-14', '09:30')).toEqual({
      date: new Date(2026, 6, 14, 9, 30),
      value: '2026-07-14 09:30',
    });
    expect(resolveScheduledPublishAt('2026-07-14T10:40')).toEqual({
      date: new Date(2026, 6, 14, 10, 40),
      value: '2026-07-14 10:40',
    });
  });

  it('creates an idempotent queue entry tied to the generated post id', () => {
    const scheduled = createAppScheduledPost({
      postId: 'post-123',
      title: '예약 발행 테스트',
      scheduleDate: '2026-07-14',
      scheduleTime: '09:30',
      now: new Date('2026-07-13T00:00:00.000Z'),
    });

    expect(scheduled).toMatchObject({
      id: 'app-post-123',
      postId: 'post-123',
      title: '예약 발행 테스트',
      scheduleDate: '2026-07-14 09:30',
      status: 'scheduled',
      publishMode: 'publish',
    });
  });

  it('persists an article-specific recent-post review approval for due-time publishing', () => {
    const scheduled = createAppScheduledPost({
      postId: 'post-reviewed',
      title: '검수 완료 예약 글',
      scheduleDate: '2026-07-14',
      scheduleTime: '09:30',
      contentPolicyManualReviewApproved: true,
      now: new Date('2026-07-13T00:00:00.000Z'),
    });

    expect(scheduled.contentPolicyManualReviewApproved).toBe(true);
  });

  it('binds a queued post to the account selected when it was scheduled', () => {
    const scheduled = createAppScheduledPost({
      postId: 'post-account-bound',
      title: 'Account-bound scheduled post',
      scheduleDate: '2026-07-14',
      scheduleTime: '09:30',
      scheduledAccountId: 'account-record-2',
      scheduledNaverId: 'naver-user-2',
      now: new Date('2026-07-13T00:00:00.000Z'),
    });

    expect(scheduled).toMatchObject({
      scheduledAccountId: 'account-record-2',
      scheduledNaverId: 'naver-user-2',
    });
  });

  it('rejects missing post ids, invalid timestamps, and past schedules', () => {
    expect(() => createAppScheduledPost({
      postId: '',
      title: '제목',
      scheduleDate: '2026-07-14 09:30',
      now: new Date('2026-07-13T00:00:00.000Z'),
    })).toThrow(/APP_SCHEDULE_POST_ID_REQUIRED/);

    expect(() => createAppScheduledPost({
      postId: 'post-1',
      title: '제목',
      scheduleDate: '2026-99-99 09:30',
      now: new Date('2026-07-13T00:00:00.000Z'),
    })).toThrow(/APP_SCHEDULE_DATE_INVALID/);

    expect(() => createAppScheduledPost({
      postId: 'post-1',
      title: '제목',
      scheduleDate: '2026-07-12 09:30',
      now: new Date('2026-07-13T00:00:00.000Z'),
    })).toThrow(/APP_SCHEDULE_DATE_PAST/);
  });

  it('removes a queued post when its policy reservation cannot be recorded', async () => {
    const scheduled = createAppScheduledPost({
      postId: 'post-rollback',
      title: '예약 롤백 테스트',
      scheduleDate: '2026-07-14 09:30',
      now: new Date('2026-07-13T00:00:00.000Z'),
    });
    const calls: string[] = [];

    await expect(persistAppScheduledPostSafely(scheduled, {
      save: async () => { calls.push('save'); },
      reserve: async () => {
        calls.push('reserve');
        throw new Error('ledger unavailable');
      },
      rollback: async () => { calls.push(`rollback:${scheduled.id}`); },
    })).rejects.toThrow(/APP_SCHEDULE_RESERVATION_FAILED:ledger unavailable/);

    expect(calls).toEqual(['save', 'reserve', 'rollback:app-post-rollback']);
  });

  it('surfaces a rollback failure instead of leaving an ambiguous success', async () => {
    const scheduled = createAppScheduledPost({
      postId: 'post-rollback-failure',
      title: '예약 롤백 실패 테스트',
      scheduleDate: '2026-07-14 09:30',
      now: new Date('2026-07-13T00:00:00.000Z'),
    });

    await expect(persistAppScheduledPostSafely(scheduled, {
      save: async () => undefined,
      reserve: async () => { throw new Error('ledger unavailable'); },
      rollback: async () => { throw new Error('queue locked'); },
    })).rejects.toThrow(/APP_SCHEDULE_ROLLBACK_FAILED:queue locked/);
  });
});
