// [2026-11-12] 다시 보내기 규칙은 앱 표(model.creditFree)가 아니라 "이번 세션에서 젠스파크 메뉴가 실제로 보여 준 표시"를 따른다.
//   메뉴가 선택한 모델을 'No credit cost'(무제한)로 보여 줬을 때만 실패한 항목을 1회 다시 보내고, 그 밖(크레딧 배수 표시·메뉴를
//   못 읽음)은 같은 요청을 다시 보내지 않는다 — 크레딧 이중 차감 방지. 가짜 runtime·가짜 시계만 사용(실제 접속 없음).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadConfig = vi.hoisted(() => vi.fn(async () => ({}) as Record<string, unknown>));
vi.mock('../configManager.js', () => ({ loadConfig }));
vi.mock('../image/imageUtils.js', () => ({
  writeImageFile: vi.fn(async (_buf: Buffer, ext: string, heading: string) => ({ filePath: `C:/img/${heading}.${ext}`, previewDataUrl: 'data:x' })),
}));
vi.mock('../image/imageHashUtils.js', () => ({
  probeDuplicate: vi.fn(async () => ({ isDuplicate: false, isSimilar: false })),
  commitHashes: vi.fn(),
}));

import { generateWithGenspark, type GensparkEngineHandle, type GensparkRuntime } from '../image/genspark/gensparkGenerator';
import { runGensparkBatch } from '../image/genspark/gensparkBatch';
import { GENSPARK_JOB_FAILED } from '../image/genspark/gensparkErrors';
import { GENSPARK_DEFAULT_BATCH_OPTIONS, gensparkRetryCount, type GensparkBatchDeps, type GensparkBatchOptions } from '../image/genspark/gensparkTypes';

const items = ['첫째 소제목', '둘째 소제목', '셋째 소제목'].map((heading) => ({ heading, prompt: `${heading} 장면` }));

/** 둘째 항목(index 1)의 첫 확인만 실패로 답한다. menuCreditFree 를 주지 않으면 메뉴를 못 읽은 엔진. */
function fakeRuntime(menuCreditFree?: () => boolean): { runtime: GensparkRuntime; submits: number[] } {
  const submits: number[] = [];
  let jobs = 0;
  let failedOnce = false;
  const runtime: GensparkRuntime = {
    withSession: async (_model, fn) => {
      const engine: GensparkEngineHandle = {
        submit: async (req) => {
          submits.push(req.index);
          return { index: req.index, jobId: `job-${++jobs}`, jobUrl: `https://www.genspark.ai/agents?id=job-${jobs}`, submittedAt: Date.now() };
        },
        check: async (job) => {
          if (job.index === 1 && !failedOnce) { failedOnce = true; return { status: 'failed', reason: 'GENSPARK_JOB_FAILED: 시험' }; }
          return { status: 'done', imageUrl: `https://www.genspark.ai/api/files/s/${job.jobId}` };
        },
        fetchImage: async () => ({ buffer: Buffer.from('image-bytes'), mimeType: 'image/jpeg' }),
        ...(menuCreditFree ? { menuCreditFree } : {}),
      };
      return fn(engine);
    },
  };
  return { runtime, submits };
}

describe('gensparkRetryCount — 값 또는 함수', () => {
  const base = { retry: { freeModel: 1, creditModel: 0 } };
  it('boolean 은 그대로, 함수는 부를 때마다 그 시점 값을 본다', () => {
    expect(gensparkRetryCount({ ...base, modelCreditFree: true })).toBe(1);
    expect(gensparkRetryCount({ ...base, modelCreditFree: false })).toBe(0);
    let free = false;
    const options = { ...base, modelCreditFree: () => free };
    expect(gensparkRetryCount(options)).toBe(0);
    free = true;
    expect(gensparkRetryCount(options)).toBe(1);
  });
});

describe('runGensparkBatch — 재시도 한도는 실패하는 순간의 메뉴 표시를 본다', () => {
  function oneFailingBatch(modelCreditFree: GensparkBatchOptions['modelCreditFree']) {
    const sent: number[] = [];
    let t = 0;
    const deps: GensparkBatchDeps = {
      now: () => t,
      sleep: async (ms) => { t += ms; },
      isStopped: () => false,
      log: () => {},
      submit: async (r) => { sent.push(r.index); return { index: r.index, jobId: `j${sent.length}`, jobUrl: 'u', submittedAt: t }; },
      check: async (job) => (job.jobId === 'j1' ? { status: 'failed', reason: 'x' } : { status: 'done', imageUrl: 'https://x/api/files/s/a' }),
      download: async () => ({ filePath: '/tmp/a.jpg', byteSize: 10 }),
    };
    return { sent, run: () => runGensparkBatch([{ index: 0, prompt: 'p', ratio: '1:1' }], deps, { ...GENSPARK_DEFAULT_BATCH_OPTIONS, modelCreditFree }) };
  }

  it('메뉴가 무제한이 아니라고 하면(false) 같은 요청을 다시 보내지 않는다', async () => {
    const b = oneFailingBatch(() => false);
    const out = await b.run();
    expect(b.sent).toEqual([0]);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0].errorCode).toBe(GENSPARK_JOB_FAILED);
  });

  it('메뉴가 무제한이라고 하면(true) 1회 다시 보낸다', async () => {
    const b = oneFailingBatch(() => true);
    const out = await b.run();
    expect(b.sent).toEqual([0, 0]);
    expect(out.failures).toEqual([]);
  });

  it('batch 시작 때가 아니라 실패한 순간의 값을 쓴다(첫 전송에서 메뉴를 읽은 결과가 반영된다)', async () => {
    let menuRead = false; // 첫 submit 에서 메뉴를 읽고 나서야 알 수 있는 값
    const sent: number[] = [];
    let t = 0;
    const deps: GensparkBatchDeps = {
      now: () => t, sleep: async (ms) => { t += ms; }, isStopped: () => false, log: () => {},
      submit: async (r) => { menuRead = true; sent.push(r.index); return { index: r.index, jobId: `j${sent.length}`, jobUrl: 'u', submittedAt: t }; },
      check: async (job) => (job.jobId === 'j1' ? { status: 'failed', reason: 'x' } : { status: 'done', imageUrl: 'https://x/api/files/s/a' }),
      download: async () => ({ filePath: '/tmp/a.jpg', byteSize: 10 }),
    };
    const out = await runGensparkBatch([{ index: 0, prompt: 'p', ratio: '1:1' }], deps, { ...GENSPARK_DEFAULT_BATCH_OPTIONS, modelCreditFree: () => menuRead });
    expect(sent).toEqual([0, 0]);
    expect(out.failures).toEqual([]);
  });
});

describe('generateWithGenspark — 재시도는 엔진이 알려 준 메뉴 표시를 따른다(앱 표 무시)', () => {
  beforeEach(() => { vi.clearAllMocks(); loadConfig.mockResolvedValue({}); });

  it('③ 메뉴를 못 읽은 엔진(알림 없음)이면 기본 모델이라도 실패한 항목을 다시 보내지 않는다', async () => {
    const { runtime, submits } = fakeRuntime();
    await expect(generateWithGenspark(items as never, '글', 'p1', undefined, undefined, runtime)).rejects.toThrow(/IMAGE_BATCH_INCOMPLETE:2\/3/);
    expect(submits.filter((i) => i === 1)).toHaveLength(1);
  });

  it('③ 메뉴가 크레딧 배수를 보여 줬으면(무제한 아님) 다시 보내지 않는다', async () => {
    const { runtime, submits } = fakeRuntime(() => false);
    await expect(generateWithGenspark(items as never, '글', 'p1', undefined, undefined, runtime)).rejects.toThrow(/IMAGE_BATCH_INCOMPLETE:2\/3/);
    expect(submits.filter((i) => i === 1)).toHaveLength(1);
  });

  it("③ 메뉴가 'No credit cost' 를 보여 줬으면 1회 다시 보내 3장을 채운다 — 앱 표가 크레딧 모델이어도", async () => {
    loadConfig.mockResolvedValue({ gensparkImageModel: 'nano-banana-pro' });
    const { runtime, submits } = fakeRuntime(() => true);
    const out = await generateWithGenspark(items as never, '글', 'p1', undefined, undefined, runtime);
    expect(out).toHaveLength(3);
    expect(submits.filter((i) => i === 1)).toHaveLength(2);
  });

  it('화면 안내(경고)는 모델 구분 없이 같다 — 기본 모델도 크레딧 차감 안내가 나온다', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    for (const id of ['gpt-image-2.5', 'z-image-turbo', 'nano-banana-pro']) {
      log.mockClear();
      loadConfig.mockResolvedValue({ gensparkImageModel: id });
      await generateWithGenspark(items.slice(0, 1) as never, '글', 'p1', undefined, undefined, fakeRuntime().runtime);
      const notes = log.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('크레딧이 차감'));
      expect(notes, id).toHaveLength(1);
      expect(notes[0]).toMatch(/^\[젠스파크\] 안내: ".+" 은\(는\) 요금제에 따라 크레딧이 차감됩니다\./);
      expect(notes[0]).not.toMatch(/경고/);
    }
    log.mockRestore();
  });
});
