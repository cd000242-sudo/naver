import type { DailyPublishingJob } from '../../scheduler/dailyPublishingTypes.js';

/** Jobs that ended as "reservation time passed" and were not announced yet. Marks them as seen. */
export function collectNewMissedJobs(runs: readonly DailyPublishingJob[], seen: Set<string>): DailyPublishingJob[] {
  const fresh = runs.filter(run => run.reason === 'deadline_missed'
    && (run.status === 'cancelled' || run.status === 'needs_review') && !seen.has(run.key));
  for (const run of fresh) seen.add(run.key);
  return fresh;
}

/** Marks everything already recorded as announced (a restart must not replay old misses). */
export function markMissedJobsSeen(runs: readonly DailyPublishingJob[], seen: Set<string>): void {
  for (const run of runs) if (run.reason === 'deadline_missed') seen.add(run.key);
}

/** One desktop notification for a missed slot, with the reason the owner can act on. */
export function missedNoticeText(jobs: readonly DailyPublishingJob[], laneWasBusy: boolean): { title: string; body: string } {
  const times = [...new Set(jobs.map(job => job.time))].sort().join(', ');
  const reason = laneWasBusy
    ? '다른 발행이 오래 이어졌습니다'
    : '예약 시각이 지나 발행하지 못했습니다';
  return {
    title: '매일 자동발행 글을 놓쳤습니다',
    body: `매일 자동발행 ${times} 글을 놓쳤습니다 — ${reason}. 매일 발행 화면에서 기록을 확인해 주세요.`,
  };
}
