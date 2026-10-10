// [2026-10-10] 젠스파크 배치 순서 관리 시험 — 가짜 deps + 가짜 시계만 사용(실제 사이트 접속 없음)
import { describe, it, expect } from 'vitest';
import { runGensparkBatch, gensparkFormatIncomplete } from '../image/genspark/gensparkBatch';
import {
  GensparkError,
  GENSPARK_ABORTED,
  GENSPARK_JOB_TIMEOUT,
  GENSPARK_LOGIN_REQUIRED,
  GENSPARK_RATE_LIMITED,
  GENSPARK_SUBMIT_FAILED,
} from '../image/genspark/gensparkErrors';
import {
  GENSPARK_DEFAULT_BATCH_OPTIONS,
  type GensparkBatchDeps,
  type GensparkBatchOptions,
  type GensparkCollectResult,
  type GensparkJob,
  type GensparkSubmitRequest,
} from '../image/genspark/gensparkTypes';

const reqs = (n: number): GensparkSubmitRequest[] =>
  Array.from({ length: n }, (_, i) => ({ index: i, prompt: `p${i}`, ratio: '1:1' }));

const opts = (over: Partial<GensparkBatchOptions> = {}): GensparkBatchOptions => ({
  ...GENSPARK_DEFAULT_BATCH_OPTIONS,
  modelCreditFree: true,
  ...over,
});

interface Fake {
  deps: GensparkBatchDeps;
  submitted: number[];
  logs: string[];
  maxInflight: () => number;
  clock: { t: number };
}

/** readyAt: 요청 번호 → 전송 후 몇 ms 뒤 완성(없으면 30초). 'fail' 이면 실패. */
function makeFake(
  over: {
    readyAfter?: (index: number, attempt: number) => number | 'fail' | 'never';
    submitError?: (index: number, attempt: number) => unknown;
    checkError?: (index: number) => unknown;
    stopWhen?: () => boolean;
  } = {},
): Fake {
  const clock = { t: 0 };
  const submitted: number[] = [];
  const attemptOf = new Map<number, number>();
  const live = new Set<string>();
  let peak = 0;
  const jobMeta = new Map<string, { index: number; attempt: number }>();
  const done = new Set<string>();
  const logs: string[] = [];
  const deps: GensparkBatchDeps = {
    now: () => clock.t,
    sleep: async (ms) => { clock.t += ms; },
    isStopped: () => over.stopWhen?.() ?? false,
    log: (m) => { logs.push(m); },
    submit: async (r) => {
      const attempt = (attemptOf.get(r.index) ?? 0) + 1;
      attemptOf.set(r.index, attempt);
      submitted.push(r.index);
      const err = over.submitError?.(r.index, attempt);
      if (err) throw err;
      const jobId = `job-${r.index}-${attempt}`;
      jobMeta.set(jobId, { index: r.index, attempt });
      live.add(jobId);
      peak = Math.max(peak, live.size);
      return { index: r.index, jobId, jobUrl: `https://x/agents?id=${jobId}`, submittedAt: clock.t } as GensparkJob;
    },
    check: async (job): Promise<GensparkCollectResult> => {
      const err = over.checkError?.(job.index);
      if (err) throw err;
      const meta = jobMeta.get(job.jobId)!;
      const after = over.readyAfter?.(meta.index, meta.attempt) ?? 30_000;
      if (after === 'fail') { live.delete(job.jobId); return { status: 'failed', reason: '거부' }; }
      if (after === 'never' || clock.t - job.submittedAt < after) return { status: 'pending' };
      done.add(job.jobId);
      return { status: 'done', imageUrl: `https://x/api/files/s/${job.jobId}` };
    },
    download: async (job) => {
      live.delete(job.jobId);
      return { filePath: `/tmp/${job.jobId}.jpg`, byteSize: 100 };
    },
  };
  return { deps, submitted, logs, maxInflight: () => peak, clock };
}

describe('runGensparkBatch', () => {
  it('동시 진행은 4개를 넘지 않고 결과 순서가 요청 순서를 따른다', async () => {
    const f = makeFake();
    const out = await runGensparkBatch(reqs(10), f.deps, opts());
    expect(f.maxInflight()).toBeLessThanOrEqual(4);
    expect(f.maxInflight()).toBe(4);
    expect(out.failures).toEqual([]);
    expect(out.results.map((r) => r?.filePath)).toEqual(
      Array.from({ length: 10 }, (_, i) => `/tmp/job-${i}-1.jpg`),
    );
  });

  it('도착 순서가 섞여도 요청 번호가 정확하다', async () => {
    const f = makeFake({ readyAfter: (i) => [50_000, 5_000, 40_000, 1_000][i] ?? 1_000 });
    const seen: Array<[number, string]> = [];
    const out = await runGensparkBatch(reqs(4), f.deps, opts(), (r, idx) => seen.push([idx, r.filePath]));
    expect(seen.map((s) => s[0])).toEqual([3, 1, 2, 0]);
    for (const [idx, path] of seen) expect(path).toBe(`/tmp/job-${idx}-1.jpg`);
    expect(out.results.every(Boolean)).toBe(true);
  });

  it('실패한 항목만 무료 모델에서 1회 다시 보낸다', async () => {
    const f = makeFake({ readyAfter: (i, attempt) => (i === 1 && attempt === 1 ? 'fail' : 30_000) });
    const out = await runGensparkBatch(reqs(3), f.deps, opts());
    expect(f.submitted.filter((i) => i === 1)).toHaveLength(2);
    expect(f.submitted.filter((i) => i !== 1)).toHaveLength(2);
    expect(out.failures).toEqual([]);
    expect(out.results[1]?.filePath).toBe('/tmp/job-1-2.jpg');
  });

  it('재시도 뒤에도 실패하면 더 보내지 않고 실패 목록에 남긴다', async () => {
    const f = makeFake({ readyAfter: (i) => (i === 0 ? 'fail' : 30_000) });
    const out = await runGensparkBatch(reqs(2), f.deps, opts());
    expect(f.submitted.filter((i) => i === 0)).toHaveLength(2);
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0].index).toBe(0);
    expect(out.results[0]).toBeUndefined();
  });

  it('크레딧 모델은 재전송 0회', async () => {
    const f = makeFake({ readyAfter: (i) => (i === 1 ? 'fail' : 30_000) });
    const out = await runGensparkBatch(reqs(3), f.deps, opts({ modelCreditFree: false }));
    expect(f.submitted.filter((i) => i === 1)).toHaveLength(1);
    expect(out.failures.map((x) => x.index)).toEqual([1]);
  });

  it('전체 중단 오류면 즉시 멈추고 더 보내지 않는다', async () => {
    const f = makeFake({
      submitError: (i) => (i === 1 ? new GensparkError(GENSPARK_LOGIN_REQUIRED) : undefined),
    });
    const out = await runGensparkBatch(reqs(6), f.deps, opts());
    expect(out.fatal?.code).toBe(GENSPARK_LOGIN_REQUIRED);
    expect(f.submitted).toEqual([0, 1]);
    expect(out.failures).toEqual([]);
  });

  it('중지되면 새 요청을 보내지 않고 ABORTED', async () => {
    let sent = 0;
    const f = makeFake({ stopWhen: () => sent >= 2 });
    const origSubmit = f.deps.submit;
    f.deps.submit = async (r) => { sent += 1; return origSubmit(r); };
    const out = await runGensparkBatch(reqs(6), f.deps, opts());
    expect(out.fatal?.code).toBe(GENSPARK_ABORTED);
    expect(f.submitted).toEqual([0, 1]);
  });

  it('마감(180초)을 넘기면 시간 초과 실패', async () => {
    const f = makeFake({ readyAfter: () => 'never' });
    const out = await runGensparkBatch(reqs(1), f.deps, opts({ modelCreditFree: false }));
    expect(out.failures[0].errorCode).toBe(GENSPARK_JOB_TIMEOUT);
    expect(f.clock.t).toBeGreaterThanOrEqual(180_000);
    expect(f.clock.t).toBeLessThan(190_000);
  });

  it('제한 문구가 오면 동시 개수를 4→2→1 로 줄이고 기록한다', async () => {
    const f = makeFake({
      submitError: (i, attempt) =>
        i < 3 && attempt === 1 ? new GensparkError(GENSPARK_RATE_LIMITED) : undefined,
    });
    const out = await runGensparkBatch(reqs(5), f.deps, opts());
    expect(out.finalConcurrency).toBe(1);
    expect(f.logs.filter((l) => l.includes('줄입니다'))).toHaveLength(2);
    expect(out.failures).toEqual([]);
    expect(out.results.every(Boolean)).toBe(true);
  });

  it('GensparkError 가 아닌 오류는 그 항목만 실패', async () => {
    const f = makeFake({ submitError: (i) => (i === 0 ? new Error('boom') : undefined) });
    const out = await runGensparkBatch(reqs(2), f.deps, opts({ modelCreditFree: false }));
    expect(out.fatal).toBeUndefined();
    expect(out.failures).toHaveLength(1);
    expect(out.failures[0].message).toContain('[젠스파크]');
    expect(out.results[1]).toBeDefined();
  });
});

describe('gensparkFormatIncomplete', () => {
  it('IMAGE_BATCH_INCOMPLETE:k/n:[번호 사유, …] 형식', () => {
    const msg = gensparkFormatIncomplete(2, 4, [
      { index: 3, errorCode: GENSPARK_SUBMIT_FAILED, message: 'x' },
      { index: 1, errorCode: GENSPARK_JOB_TIMEOUT, message: 'y' },
    ]);
    expect(msg).toBe('IMAGE_BATCH_INCOMPLETE:2/4:[2번 시간 초과, 4번 전송 실패]');
  });
});
