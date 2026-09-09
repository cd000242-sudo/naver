// @vitest-environment happy-dom
/**
 * [2026-09-10] 사진 모드 "추론 중" 중지 — 회귀 방지.
 * - 렌더러 requestId 슬롯(visionInferCancel) 동작
 * - aggregator 가 AbortSignal 을 inferImage 로 넘기고, 중지 뒤 남은 사진은 호출하지 않는다
 * - main/preload 배선 소스 핀 (vision:cancel-infer-and-write, requestId, release)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  beginVisionInferRequest,
  endVisionInferRequest,
  getActiveVisionInferRequestId,
  isVisionInferStale,
  cancelActiveVisionInfer,
} from '../renderer/modules/visionInferCancel';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('visionInferCancel — 렌더러 requestId 슬롯', () => {
  beforeEach(() => {
    (window as any)._activeVisionInferRequestId = '';
    (window as any).api = undefined;
  });

  it('begin 은 고유 id 를 만들고 활성 슬롯에 둔다', () => {
    const a = beginVisionInferRequest();
    const b = beginVisionInferRequest();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^vision-infer-/);
    expect(getActiveVisionInferRequestId()).toBe(b);
    expect(isVisionInferStale(a)).toBe(true);
    expect(isVisionInferStale(b)).toBe(false);
  });

  it('end 는 자기 id 일 때만 슬롯을 비운다', () => {
    const a = beginVisionInferRequest();
    const b = beginVisionInferRequest();
    endVisionInferRequest(a);
    expect(getActiveVisionInferRequestId()).toBe(b);
    endVisionInferRequest(b);
    expect(getActiveVisionInferRequestId()).toBe('');
  });

  it('cancel 은 IPC 를 requestId 로 호출하고 슬롯을 먼저 비운다(늦은 응답 = stale)', async () => {
    const cancelInferAndWrite = vi.fn(async () => ({ success: true, aborted: 1 }));
    (window as any).api = { cancelInferAndWrite };
    const id = beginVisionInferRequest();
    await expect(cancelActiveVisionInfer('test')).resolves.toBe(true);
    expect(cancelInferAndWrite).toHaveBeenCalledWith({ requestId: id, reason: 'test' });
    expect(isVisionInferStale(id)).toBe(true);
  });

  it('활성 추론이 없으면 IPC 를 부르지 않는다', async () => {
    const cancelInferAndWrite = vi.fn();
    (window as any).api = { cancelInferAndWrite };
    await expect(cancelActiveVisionInfer('test')).resolves.toBe(false);
    expect(cancelInferAndWrite).not.toHaveBeenCalled();
  });

  it('IPC 실패는 false 로 삼키고 예외를 내지 않는다', async () => {
    (window as any).api = { cancelInferAndWrite: vi.fn(async () => { throw new Error('ipc down'); }) };
    beginVisionInferRequest();
    await expect(cancelActiveVisionInfer('test')).resolves.toBe(false);
  });
});

describe('aggregateInferences — AbortSignal 전달', () => {
  it('signal 을 inferImage 옵션으로 넘기고, abort 뒤 남은 사진은 호출하지 않는다', async () => {
    vi.resetModules();
    const seen: Array<AbortSignal | undefined> = [];
    const controller = new AbortController();
    vi.doMock('../imageNarrative/visionInference/visionRouter', () => ({
      inferImage: vi.fn(async (ctx: any, options: any) => {
        seen.push(options.signal);
        if (seen.length === 1) controller.abort('stop');
        if (options.signal?.aborted) throw new Error('aborted by user');
        return {
          imageId: ctx.imageId, provider: 'gemini', latencyMs: 1,
          result: { scene_type: 'travel', location_hint: '', food_items: [], mood_keywords: [], description_ko: 'x', confidence: 0.9 },
        };
      }),
    }));
    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');
    const images = ['a', 'b', 'c', 'd'].map((id) => ({ imageId: id, buffer: Buffer.from(id), mimeType: 'image/jpeg' }));
    await expect(
      aggregateInferences(images, { provider: 'gemini', mode: 'travel', signal: controller.signal }),
    ).rejects.toThrow();
    // gemini concurrency=1: first call aborts; no further Vision call is paid for.
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(controller.signal);
    vi.doUnmock('../imageNarrative/visionInference/visionRouter');
  });
});

describe('main/preload 배선 소스 핀', () => {
  const main = read('main.ts');
  const preload = read('preload.ts');
  const aggregator = read('imageNarrative/inferenceAggregator/aggregator.ts');

  it("main 에 'vision:cancel-infer-and-write' 핸들러와 vision-infer 레지스트리가 있다", () => {
    expect(main).toMatch(/ipcMain\.handle\('vision:cancel-infer-and-write'/);
    expect(main).toMatch(/new ScopedAbortRegistry\('vision-infer'\)/);
  });

  it('infer-and-write 는 begin → signal 전달 → finally release 계약을 지킨다', () => {
    const start = main.indexOf("ipcMain.handle('vision:infer-and-write'");
    const end = main.indexOf("ipcMain.handle('vision:cancel-infer-and-write'");
    const handler = main.slice(start, end);
    expect(handler).toMatch(/visionInferAbortRegistry\.begin\(/);
    expect(handler.match(/signal: inferSignal/g)?.length).toBeGreaterThanOrEqual(3);
    expect(handler).toMatch(/finally \{\s*visionInferAbortRegistry\.release\(/);
    expect(handler).toMatch(/cancelled: true/);
  });

  it('preload 가 requestId 를 실어 보내고 cancelInferAndWrite 를 노출한다', () => {
    expect(preload).toMatch(/cancelInferAndWrite:/);
    expect(preload).toMatch(/ipcRenderer\.invoke\('vision:cancel-infer-and-write', payload\)/);
  });

  it('aggregator 옵션에 signal 이 있고 inferImage 로 전달된다', () => {
    expect(aggregator).toMatch(/readonly signal\?: AbortSignal;/);
    expect(aggregator).toMatch(/signal: options\.signal,/);
  });
});
