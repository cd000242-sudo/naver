/**
 * exposurePoller.ts — Tier 1 #1+#4 (SPEC-CONVERSION-001 폐쇄 루프)
 *
 * Closes the gap between publishedPostTracker (records publish meta) and
 * exposureChecker (measures SERP position on demand). Without an automated
 * trigger the two modules sit idle — this module periodically scans for posts
 * past their 24/48/72h window and runs the exposure check, persisting results
 * back to the published-posts.json store.
 *
 * Opt-in via env EXPOSURE_POLLER_ENABLED=true. Default interval 6 hours
 * (EXPOSURE_POLLER_INTERVAL_HOURS override).
 *
 * Safe to import in main process only — uses fs synchronously and triggers
 * outbound HTTP via exposureChecker. Never call from renderer.
 */

import {
  loadPublishedPosts,
  getPostsNeedingExposureCheck,
  recordExposureCheck,
  type PublishedPost,
} from './publishedPostTracker.js';
import { checkBatchExposure } from './exposureChecker.js';

const DEFAULT_INTERVAL_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;
const CHECKPOINTS: ReadonlyArray<24 | 48 | 72> = [24, 48, 72];

let pollerTimer: ReturnType<typeof setInterval> | null = null;
let lastRunAt = 0;

/**
 * One poll cycle. Exported for tests and on-demand manual invocation.
 *
 * Iterates 24/48/72h checkpoints, builds the batch input from posts in window,
 * calls checkBatchExposure, then persists each result via recordExposureCheck.
 *
 * Returns summary so callers can log without re-reading the file.
 */
export async function runExposurePollOnce(userDataPath: string): Promise<{
  checkpoint: number;
  candidates: number;
  recorded: number;
}[]> {
  const summary: { checkpoint: number; candidates: number; recorded: number }[] = [];

  for (const hoursAfter of CHECKPOINTS) {
    try {
      const all: PublishedPost[] = loadPublishedPosts(userDataPath);
      const due = getPostsNeedingExposureCheck(all, hoursAfter);
      if (due.length === 0) {
        summary.push({ checkpoint: hoursAfter, candidates: 0, recorded: 0 });
        continue;
      }

      const batchInput = due
        .filter((p) => p.keyword && p.blogId && p.logNo)
        .map((p) => ({
          id: p.id,
          keyword: p.keyword,
          blogId: p.blogId,
          logNo: p.logNo,
          hoursAfter,
        }));

      if (batchInput.length === 0) {
        summary.push({ checkpoint: hoursAfter, candidates: due.length, recorded: 0 });
        continue;
      }

      const results = await checkBatchExposure(batchInput);
      let recorded = 0;
      for (const r of results) {
        try {
          const ok = recordExposureCheck(userDataPath, r.id, {
            checkedAt: new Date().toISOString(),
            hoursAfter: r.hoursAfter,
            position: r.result.position,
            hasSmartblock: r.result.hasSmartblock,
            notes: r.result.notes,
          } as PublishedPost['exposureChecks'] extends Array<infer C> | undefined ? C : never);
          if (ok) recorded++;
        } catch {
          // single record failure must not abort the batch
        }
      }
      summary.push({ checkpoint: hoursAfter, candidates: batchInput.length, recorded });
    } catch (err) {
      console.warn(`[ExposurePoller] checkpoint ${hoursAfter}h failed:`, (err as Error).message);
      summary.push({ checkpoint: hoursAfter, candidates: 0, recorded: 0 });
    }
  }

  lastRunAt = Date.now();
  return summary;
}

/**
 * Start periodic polling. Idempotent — calling twice without stop is a no-op
 * on the second call (warns to console).
 *
 * intervalHours defaults to EXPOSURE_POLLER_INTERVAL_HOURS env or 6h.
 */
export function startExposurePolling(userDataPath: string, intervalHours?: number): void {
  if (pollerTimer !== null) {
    console.warn('[ExposurePoller] already running — start ignored');
    return;
  }

  const envInterval = parseFloat(process.env.EXPOSURE_POLLER_INTERVAL_HOURS || '');
  const hours = Number.isFinite(intervalHours) && (intervalHours as number) > 0
    ? (intervalHours as number)
    : Number.isFinite(envInterval) && envInterval > 0
      ? envInterval
      : DEFAULT_INTERVAL_HOURS;
  const intervalMs = hours * HOUR_MS;

  console.log(`[ExposurePoller] start (interval=${hours}h, userData=${userDataPath})`);

  // First run after a short delay so app startup is not blocked.
  setTimeout(() => {
    runExposurePollOnce(userDataPath).then((summary) => {
      console.log('[ExposurePoller] initial run:', JSON.stringify(summary));
    }).catch((err) => {
      console.warn('[ExposurePoller] initial run failed:', (err as Error).message);
    });
  }, 60_000); // 60s warm-up

  pollerTimer = setInterval(() => {
    runExposurePollOnce(userDataPath).then((summary) => {
      console.log('[ExposurePoller] cycle:', JSON.stringify(summary));
    }).catch((err) => {
      console.warn('[ExposurePoller] cycle failed:', (err as Error).message);
    });
  }, intervalMs);
}

/**
 * Stop the periodic poll. Idempotent — calling without a running timer is safe.
 */
export function stopExposurePolling(): void {
  if (pollerTimer !== null) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log('[ExposurePoller] stopped');
  }
}

/**
 * Diagnostic — last successful run timestamp (0 if never).
 */
export function getLastPollAt(): number {
  return lastRunAt;
}
