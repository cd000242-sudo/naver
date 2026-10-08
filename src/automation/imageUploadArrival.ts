/**
 * imageUploadArrival.ts
 *
 * Growth polling for the editor's image count.
 *
 * Why this exists: a Naver image upload can take far longer than one fixed wait on a slow PC. Judging
 * the upload by a single count read turned "not there YET" into "failed", so the Base64 fallback (or
 * the per-image retry) inserted the same picture again and the late upload landed as a duplicate.
 * Everything here judges by growth over time instead, and never swallows cancellation: `delay` is the
 * caller's cancellation-aware delay and its rejection propagates.
 */

/** How long to keep watching for a slow upload after the first "no growth" read. */
export const IMAGE_UPLOAD_GROWTH_TIMEOUT_MS = 14000;
/** Shorter watch for the per-image retry loop (the inner upload already waited). */
export const IMAGE_ROUND_GROWTH_TIMEOUT_MS = 10000;
/** Short settle used right before a fallback / retry would insert the image again. */
export const IMAGE_UPLOAD_SETTLE_MS = 1500;
export const IMAGE_UPLOAD_POLL_MS = 500;

export interface WaitForImageCountGrowthOptions {
  /** Reads the current number of images in the editor (failures should resolve to 0). */
  readCount: () => Promise<number>;
  /** Image count before the upload started; growth is measured against it. */
  baseline: number;
  /** Cancellation-aware delay (self.delay). Its rejection is not swallowed. */
  delay: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
}

/**
 * Returns the first count greater than `baseline`, or the last count read once the timeout passes.
 * The first read happens immediately, so an upload that already landed costs no wait.
 */
export async function waitForImageCountGrowth(options: WaitForImageCountGrowthOptions): Promise<number> {
  const {
    readCount,
    baseline,
    delay,
    now = () => Date.now(),
    timeoutMs = IMAGE_UPLOAD_GROWTH_TIMEOUT_MS,
    intervalMs = IMAGE_UPLOAD_POLL_MS,
  } = options;

  // The wall clock decides on a real PC (slow reads shorten the watch). The poll cap keeps the loop
  // finite when `delay` returns at once (mocked delays in tests), where the clock would never advance.
  const maxPolls = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  const start = now();
  let count = await readCount();
  for (let polls = 0; count <= baseline && polls < maxPolls && now() - start < timeoutMs; polls += 1) {
    await delay(intervalMs);
    count = await readCount();
  }
  return count;
}
