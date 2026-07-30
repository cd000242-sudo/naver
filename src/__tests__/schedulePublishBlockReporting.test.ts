import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  isOnlyRecentPostManualReviewReasons,
  recentPostManualReviewReasons,
} from '../contentPolicy/manualReview';
import { partitionPublishGuardReasons } from '../contentPolicy/publishGuard';
import { resolveScheduledPublishAt } from '../scheduler/appScheduleQueue';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-30] 예약발행이 "최근 발행 글 비교 자료가 충분하지 않아 직접 검수가
 * 필요합니다"로 막히던 오보고 버그.
 *
 * 구조적 증명:
 *   - allowed=false는 guardReasons(발행 가드/예약 날짜/상태 저장 실패)에서만 나온다.
 *   - guardReasons에는 최근 글 사유(BLOCK_INSUFFICIENT_RECENT_POSTS 등)가 절대
 *     포함되지 않는다 → manualReviewReasons는 항상 빈 배열.
 *   - 반면 manualReviewRequired는 저장된 최근 글이 20건 미만이면 advisory로
 *     상시 true → 이 플래그로 분기하면 모든 차단이 검수 메시지로 위장된다.
 */
describe('schedule publish block reporting', () => {
  it('발행 가드 사유에는 최근 글 검수 사유가 섞이지 않는다 (오보고의 구조적 원인)', () => {
    const guardReasons = [
      'BLOCK_INVALID_SCHEDULE_DATE',
      'BLOCK_MIN_PUBLISH_INTERVAL',
      'BLOCK_DAILY_PUBLISH_CAP',
      'BLOCK_PUBLISH_PAUSED',
      'BLOCK_PUBLICATION_STATE_UNAVAILABLE',
      'BLOCK_INVALID_PUBLICATION_HISTORY',
      'BLOCK_POLICY_DECISION',
      'BLOCK_POLICY_PUBLICATION',
    ];
    const { blockingReasons } = partitionPublishGuardReasons(guardReasons);
    expect(blockingReasons.length).toBe(guardReasons.length); // 전부 하드 차단
    // 이 사유들로 만든 manualReviewReasons는 언제나 비어 있다
    expect(recentPostManualReviewReasons(blockingReasons)).toEqual([]);
    // 그런데 advisory 쪽(최근 글 부족)만 보면 플래그는 true가 된다 → 위장 발생
    expect(isOnlyRecentPostManualReviewReasons(['BLOCK_INSUFFICIENT_RECENT_POSTS'])).toBe(true);
  });

  it('BlogExecutor는 플래그가 아니라 실제 검수 사유 개수로 분기한다', () => {
    const executor = read('main/services/BlogExecutor.ts');
    expect(executor).toContain('if (preparedPolicy.manualReviewReasons.length > 0) {');
    // 플래그 분기 재도입 금지 (이 조건이 돌아오면 오보고가 재발한다)
    expect(executor).not.toContain('if (preparedPolicy.manualReviewRequired) {');
  });

  it('예약 시간이 비면 스케줄 해석이 실패해 하드 차단이 된다', () => {
    expect(resolveScheduledPublishAt(undefined, undefined)).toBeNull();
    expect(resolveScheduledPublishAt('', '')).toBeNull();
    expect(resolveScheduledPublishAt('2026-08-01', '')).toBeNull(); // 시간 없음
    // 정상 입력은 해석된다
    const ok = resolveScheduledPublishAt('2026-08-01 14:30', '14:30');
    expect(ok).not.toBeNull();
    expect(ok?.value).toBe('2026-08-01 14:30');
  });

  it('반자동 발행은 예약 시간 미입력을 파이프라인 진입 전에 차단한다', () => {
    const handlers = read('renderer/modules/publishingHandlers.ts');
    expect(handlers).toMatch(/if \(publishMode === 'schedule' && !scheduleDate\) \{[\s\S]{0,240}return;/);
    expect(handlers).toContain('예약 시간이 비어 있습니다');
  });
});
