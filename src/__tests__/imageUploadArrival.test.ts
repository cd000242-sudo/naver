import { describe, expect, it } from 'vitest';
import {
  IMAGE_UPLOAD_GROWTH_TIMEOUT_MS,
  waitForImageCountGrowth,
} from '../automation/imageUploadArrival.js';

/** Virtual clock: delay advances time; the image count is a function of virtual time. */
function makeClock() {
  let t = 0;
  const delays: number[] = [];
  return {
    now: () => t,
    delay: async (ms: number) => { delays.push(ms); t += ms; },
    time: () => t,
    delays,
  };
}

describe('waitForImageCountGrowth', () => {
  it('returns at once when the count already grew (fast upload costs no wait)', async () => {
    const clock = makeClock();
    const count = await waitForImageCountGrowth({
      readCount: async () => 3, baseline: 2, delay: clock.delay, now: clock.now,
    });
    expect(count).toBe(3);
    expect(clock.time()).toBe(0);
  });

  it('polls until a slow upload lands and returns the grown count', async () => {
    const clock = makeClock();
    const count = await waitForImageCountGrowth({
      readCount: async () => (clock.time() >= 9000 ? 3 : 2), baseline: 2, delay: clock.delay, now: clock.now,
    });
    expect(count).toBe(3);
    expect(clock.time()).toBe(9000); // 500 ms steps
    expect(new Set(clock.delays)).toEqual(new Set([500]));
  });

  it('gives up at the timeout and reports the unchanged count', async () => {
    const clock = makeClock();
    const count = await waitForImageCountGrowth({
      readCount: async () => 2, baseline: 2, delay: clock.delay, now: clock.now,
    });
    expect(count).toBe(2);
    expect(clock.time()).toBeGreaterThanOrEqual(IMAGE_UPLOAD_GROWTH_TIMEOUT_MS);
    expect(clock.time()).toBeLessThan(IMAGE_UPLOAD_GROWTH_TIMEOUT_MS + 1000);
  });

  it('honours a custom timeout', async () => {
    const clock = makeClock();
    await waitForImageCountGrowth({
      readCount: async () => 0, baseline: 0, delay: clock.delay, now: clock.now, timeoutMs: 1500,
    });
    expect(clock.time()).toBe(1500);
  });

  it('propagates cancellation thrown by the delay', async () => {
    const clock = makeClock();
    let calls = 0;
    const delay = async (ms: number) => {
      calls += 1;
      if (calls === 3) throw new Error('사용자가 자동화를 취소했습니다.');
      await clock.delay(ms);
    };
    await expect(waitForImageCountGrowth({
      readCount: async () => 0, baseline: 0, delay, now: clock.now,
    })).rejects.toThrow('취소');
    expect(calls).toBe(3);
  });

  it('stays finite when a mocked delay returns at once and the clock never advances', async () => {
    // Regression: nestedEditorPublishAcceptance mocks self.delay as a no-op; a wall-clock-only loop
    // spun until the heap ran out.
    let reads = 0;
    const count = await waitForImageCountGrowth({
      readCount: async () => { reads += 1; return 0; },
      baseline: 0,
      delay: async () => undefined,
      now: () => 0,
    });
    expect(count).toBe(0);
    expect(reads).toBeLessThanOrEqual(Math.ceil(IMAGE_UPLOAD_GROWTH_TIMEOUT_MS / 500) + 1);
  });

  it('measures the timeout in real elapsed time, so slow reads shorten the number of polls', async () => {
    const clock = makeClock();
    let reads = 0;
    await waitForImageCountGrowth({
      readCount: async () => { reads += 1; clock.delay(0); return 0; },
      baseline: 0,
      delay: async (ms) => { await clock.delay(ms + 700); }, // each poll really costs 1.2 s on a slow PC
      now: clock.now,
      timeoutMs: 6000,
    });
    expect(reads).toBeLessThan(8);
    expect(clock.time()).toBeGreaterThanOrEqual(6000);
  });
});
