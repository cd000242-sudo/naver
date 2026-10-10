// [2026-10-10] 젠스파크 생성기 — 미리보기 순서·일부만 돌려주기(발행 "미리 한꺼번에" 요청용). 가짜 창만 쓴다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../configManager.js', () => ({ loadConfig: vi.fn(async () => ({})) }));
vi.mock('../image/imageUtils.js', () => ({
  writeImageFile: vi.fn(async (_buf: Buffer, ext: string, heading: string) => ({ filePath: `C:/img/${heading}.${ext}`, previewDataUrl: 'data:x' })),
}));
vi.mock('../image/imageHashUtils.js', () => ({
  probeDuplicate: vi.fn(async () => ({ isDuplicate: false, isSimilar: false })),
  commitHashes: vi.fn(),
}));

import { generateWithGenspark, type GensparkRuntime } from '../image/genspark/gensparkGenerator';

const items = ['첫째 소제목', '둘째 소제목', '셋째 소제목'].map((heading) => ({ heading, prompt: `${heading} 장면` }));

/** pendingOnce: 처음 한 번은 '진행 중'으로 답하는 번호, failAlways: 늘 실패로 답하는 번호 */
function fakeRuntime(opts: { pendingOnce?: number[]; failAlways?: number[] } = {}): GensparkRuntime {
  const pendingLeft = new Set(opts.pendingOnce ?? []);
  let jobs = 0;
  return {
    withSession: async (_model, fn) => fn({
      submit: async (req) => ({ index: req.index, jobId: `job-${++jobs}`, jobUrl: `https://www.genspark.ai/agents?id=job-${jobs}`, submittedAt: Date.now() }),
      check: async (job) => {
        if ((opts.failAlways ?? []).includes(job.index)) return { status: 'failed', reason: 'GENSPARK_JOB_FAILED: 시험' };
        if (pendingLeft.delete(job.index)) return { status: 'pending' };
        return { status: 'done', imageUrl: `https://www.genspark.ai/api/files/s/${job.jobId}` };
      },
      fetchImage: async () => ({ buffer: Buffer.from('image-bytes'), mimeType: 'image/jpeg' }),
    }),
  };
}

describe('generateWithGenspark — 미리보기 순서·일부만 돌려주기', () => {
  beforeEach(() => vi.clearAllMocks());

  it('끝나는 순서가 뒤섞여도 미리보기는 요청 순서(0,1,2)로 내보낸다 — 0번이 늦게 와서 화면을 비우지 않게', async () => {
    const seen: number[] = [];
    const out = await generateWithGenspark(items as never, '글', 'p1', undefined, (_img, index) => seen.push(index), fakeRuntime({ pendingOnce: [0] }));
    expect(seen).toEqual([0, 1, 2]);
    expect(out.map((img) => img.heading)).toEqual(['첫째 소제목', '둘째 소제목', '셋째 소제목']);
  });

  it('일부 실패는 기본으로 지금처럼 실패 처리(IMAGE_BATCH_INCOMPLETE)', async () => {
    await expect(generateWithGenspark(items as never, '글', 'p1', undefined, undefined, fakeRuntime({ failAlways: [1] })))
      .rejects.toThrow(/IMAGE_BATCH_INCOMPLETE:2\/3/);
  });

  it('allowPartial 이면 받은 것만 돌려주고, 미리보기도 받은 것만 순서대로 내보낸다', async () => {
    const seen: number[] = [];
    const out = await generateWithGenspark(items as never, '글', 'p1', undefined, (_img, index) => seen.push(index), fakeRuntime({ failAlways: [1] }), { allowPartial: true });
    expect(out.map((img) => img.heading)).toEqual(['첫째 소제목', '셋째 소제목']);
    expect(seen).toEqual([0, 2]);
  });

  it('allowPartial 이어도 하나도 못 받으면 실패로 던진다', async () => {
    await expect(generateWithGenspark(items as never, '글', 'p1', undefined, undefined, fakeRuntime({ failAlways: [0, 1, 2] }), { allowPartial: true }))
      .rejects.toThrow(/IMAGE_BATCH_INCOMPLETE:0\/3/);
  });
});
