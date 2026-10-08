/**
 * [2026-10-09] Slow image upload inserted twice.
 *
 * insertBase64ImageAtCursor waited a fixed 5 s after the FileChooser accepted the file, read the
 * image count ONCE, and on "no growth" threw into the Base64 fallback — which pasted the same image
 * again while the first upload was still in flight. insertImagesAtCurrentCursor then re-checked
 * after 1.5 s and retried up to 3 times, so a slow upload could land three times.
 *
 * These tests drive the REAL functions with a fake page/frame on a virtual clock; the "editor" image
 * count is a function of virtual time, so an upload simply lands later on a slow PC.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { insertBase64ImageAtCursor, insertImagesAtCurrentCursor } from '../automation/imageHelpers.js';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let workDir = '';
let imagePath = '';
beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'image-late-arrival-'));
  imagePath = join(workDir, 'photo.png');
  writeFileSync(imagePath, PNG_1X1);
});
afterAll(() => { rmSync(workDir, { recursive: true, force: true }); });
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); });

interface Rig {
  self: any;
  landings: number[];
  startMs: number;
  /** Images in the editor right now (landed by the current virtual time). */
  count: () => number;
  fallbackCalls: () => number;
  setFileChooserFails: (fails: boolean) => void;
  /** Virtual time at which the FileChooser step was reached (real file I/O before it is not counted). */
  chooserAt: () => number;
}

/**
 * `uploadLandsAfterMs`: virtual ms after the FileChooser accepted the file until the image shows up
 * (undefined = the upload never lands). The Base64 fallback lands its image immediately.
 */
function makeRig(options: { uploadLandsAfterMs?: number; startImages?: number } = {}): Rig {
  const startMs = Date.now();
  const landings: number[] = Array.from({ length: options.startImages ?? 0 }, () => startMs - 1);
  let fileChooserFails = false;
  let fallbackCalls = 0;
  let chooserAt = 0;
  const count = (): number => landings.filter((t) => t <= Date.now()).length;

  const button = { click: async () => undefined };
  const frame: any = {
    $$eval: async (_selector: string, fn: (imgs: unknown[]) => unknown) => fn(new Array(count())),
    $: async (selector: string) => (selector.includes('data-name="image"') ? button : null),
    waitForSelector: async () => null,
    evaluate: async () => undefined,
  };
  const page: any = {
    keyboard: { press: async () => undefined },
    waitForFileChooser: async () => {
      chooserAt = Date.now();
      if (fileChooserFails) throw new Error('Waiting for `FileChooser` failed: 5000ms exceeded');
      return {
        accept: async () => {
          if (options.uploadLandsAfterMs !== undefined) landings.push(Date.now() + options.uploadLandsAfterMs);
        },
      };
    },
  };
  const self: any = {
    log: vi.fn(),
    delay: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    getAttachedFrame: async () => frame,
    ensurePage: () => page,
    ensureNotCancelled: vi.fn(),
    normalizeSpacingAfterLastImage: async () => undefined,
    insertImageViaBase64: vi.fn(async () => {
      fallbackCalls += 1;
      landings.push(Date.now());
    }),
  };
  return {
    self, landings, startMs, count,
    fallbackCalls: () => fallbackCalls,
    chooserAt: () => chooserAt,
    setFileChooserFails: (fails) => { fileChooserFails = fails; },
  };
}

const logged = (rig: Rig): string => rig.self.log.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

async function drive<T>(promise: Promise<T>, maxMs = 180_000): Promise<{ value: T; finishedAt: number }> {
  let settled = false;
  const tracked = promise.then(() => undefined, () => undefined).finally(() => { settled = true; });
  void tracked;
  let elapsedMs = 0;
  while (!settled && elapsedMs < maxMs) {
    await vi.advanceTimersByTimeAsync(50);
    elapsedMs += 50;
  }
  return { value: await promise, finishedAt: Date.now() };
}

describe('FileChooser upload (insertBase64ImageAtCursor)', () => {
  it('upload that lands after 8 s -> no Base64 fallback, exactly one image', async () => {
    const rig = makeRig({ uploadLandsAfterMs: 8000 });
    await drive(insertBase64ImageAtCursor(rig.self, imagePath));

    expect(rig.fallbackCalls()).toBe(0);
    expect(rig.count()).toBe(1);
    // Caught by the count polling itself, not by the last-chance re-check.
    expect(logged(rig)).toContain('증가를 기다립니다');
    expect(logged(rig)).not.toContain('늦게 도착한 업로드 확인');
  });

  it('upload that lands around the end of the polling window is still caught before the fallback', async () => {
    const rig = makeRig({ uploadLandsAfterMs: 20_000 });
    await drive(insertBase64ImageAtCursor(rig.self, imagePath));

    expect(rig.fallbackCalls()).toBe(0);
    expect(rig.count()).toBe(1);
    // The polling window had closed; the settle re-check before the fallback found the image.
    expect(logged(rig)).toContain('늦게 도착한 업로드 확인');
  });

  it('a normal fast upload keeps its timing (no extra wait on success)', async () => {
    const rig = makeRig({ uploadLandsAfterMs: 1000 });
    const { finishedAt } = await drive(insertBase64ImageAtCursor(rig.self, imagePath));

    expect(rig.fallbackCalls()).toBe(0);
    expect(rig.count()).toBe(1);
    // 5 s upload wait + popup closing + size step, as before (drive steps add up to 50 ms of slack).
    expect(finishedAt - rig.chooserAt()).toBeLessThan(8000);
  });

  it('upload that never lands -> falls back to Base64 once, as before', async () => {
    const rig = makeRig({});
    const { finishedAt } = await drive(insertBase64ImageAtCursor(rig.self, imagePath));

    expect(rig.fallbackCalls()).toBe(1);
    expect(rig.count()).toBe(1);
    // Patience is bounded: 5 s wait + ~14 s growth watch + short settle, then the fallback.
    expect(finishedAt - rig.chooserAt()).toBeLessThan(24_000);
  });

  it('FileChooser never opens -> immediate fallback without the upload patience', async () => {
    const rig = makeRig({});
    rig.setFileChooserFails(true);
    const { finishedAt } = await drive(insertBase64ImageAtCursor(rig.self, imagePath));

    expect(rig.fallbackCalls()).toBe(1);
    expect(rig.count()).toBe(1);
    expect(finishedAt - rig.chooserAt()).toBeLessThan(1500);
  });

  it('keeps tagging the late image with provenance like the on-time path', async () => {
    const rig = makeRig({ uploadLandsAfterMs: 8000, startImages: 2 });
    await drive(insertBase64ImageAtCursor(rig.self, imagePath, { provider: 'nano-banana' }));

    expect(rig.count()).toBe(3);
    const { readImageProvenance } = await import('../automation/imageProvenance.js');
    expect(readImageProvenance(rig.self, 2)).toMatchObject({ ai: '1' });
  });
});

describe('per-image retry loop (insertImagesAtCurrentCursor)', () => {
  const image = { filePath: 'data:image/png;base64,AAAA', heading: 'h' };

  it('image that appears 4 s after the call returns -> one insertion, no retry', async () => {
    const rig = makeRig({});
    rig.self.insertBase64ImageAtCursor = vi.fn(async () => { rig.landings.push(Date.now() + 4000); });
    await drive(insertImagesAtCurrentCursor(rig.self, [image]));

    expect(rig.self.insertBase64ImageAtCursor).toHaveBeenCalledTimes(1);
    expect(rig.count()).toBe(1);
  });

  it('insertion that throws but whose image lands a moment later -> treated as success, no second insertion', async () => {
    const rig = makeRig({});
    rig.self.insertBase64ImageAtCursor = vi.fn(async () => {
      rig.landings.push(Date.now() + 1000);
      throw new Error('FileChooser 방식 실패');
    });
    await drive(insertImagesAtCurrentCursor(rig.self, [image]));

    expect(rig.self.insertBase64ImageAtCursor).toHaveBeenCalledTimes(1);
    expect(rig.count()).toBe(1);
  });

  it('first attempt truly fails -> the retry still happens and lands one image', async () => {
    const rig = makeRig({});
    let call = 0;
    rig.self.insertBase64ImageAtCursor = vi.fn(async () => {
      call += 1;
      if (call === 2) rig.landings.push(Date.now());
    });
    await drive(insertImagesAtCurrentCursor(rig.self, [image]));

    expect(rig.self.insertBase64ImageAtCursor).toHaveBeenCalledTimes(2);
    expect(rig.count()).toBe(1);
  });

  it('an image that lands on time costs no extra wait', async () => {
    const rig = makeRig({});
    rig.self.insertBase64ImageAtCursor = vi.fn(async () => { rig.landings.push(Date.now()); });
    const startedAt = Date.now();
    const { finishedAt } = await drive(insertImagesAtCurrentCursor(rig.self, [image]));

    expect(rig.self.insertBase64ImageAtCursor).toHaveBeenCalledTimes(1);
    expect(finishedAt - startedAt).toBeLessThan(6000);
  });
});
