import { describe, expect, it, vi } from 'vitest';
import { gstopBuildRecord, gstopResumeSummary } from '../generationStop/resumeRecord';
import {
  multiAccountStopResumeBusy,
  multiAccountStopResumeContext,
  multiAccountStopResumeRegister,
  multiAccountStopResumeRestore,
  multiAccountStopResumeSnapshot,
  multiAccountStopResumeStart,
  multiAccountStopResumeStatusOf,
  multiAccountStopResumeTakeArticle,
} from '../renderer/modules/multiAccountStopResume';

const info = { stage: 'image', cause: 'limit', engine: 'codex-image', detail: 'x' } as const;
const CREDENTIAL_KEY = /password|passwd|cookie|token|secret|api[_-]?key|credential/i;

function collectKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) { value.forEach((v) => collectKeys(v, out)); return out; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.push(k); collectKeys(v, out); }
  }
  return out;
}

const queue = (): any[] => [
  { id: 'q1', accountId: 'account_1', accountName: '하나', sourceKeyword: '봄 여행', pipelineStatus: 'completed' },
  {
    id: 'q2', accountId: 'account_2', accountName: '둘', sourceKeyword: '김치찌개', pipelineStatus: 'processing',
    contentMode: 'business', businessInfo: { name: '가게', phone: '010', apiKey: 'leak', nested: { sessionToken: 't' } },
    naverPassword: 'pw', password: 'pw', cookies: [{ name: 'NID_AUT' }], accessToken: 'tok', geminiApiKey: 'k', clientSecret: 's',
    manualThumbnail: { filePath: 'data:image/png;base64,' + 'A'.repeat(5000) },
    structuredContent: { huge: 'x' }, _maStopLedger: { fake: true }, _maStopArticle: { selectedTitle: 'T' },
    __maHeadingImageMode: 'all',
  },
  { id: 'q3', accountId: 'account_3', accountName: '셋', sourceUrl: 'https://a.b', pipelineStatus: 'pending' },
  { id: 'q4', accountId: 'account_1', accountName: '하나', pipelineStatus: 'uncertain' },
  { id: 'q5', accountId: 'account_2', accountName: '둘', pipelineStatus: 'publishing' },
  { id: 'q6', accountId: 'account_3', accountName: '셋', pipelineStatus: 'failed', failureCode: 'X' },
];

describe('다중계정 이어 가기: 대기열 사본', () => {
  it('비밀번호·쿠키·토큰·키 칸은 어느 깊이에도 남지 않는다', () => {
    const snap = multiAccountStopResumeSnapshot(queue());
    const keys = collectKeys(snap);
    expect(keys.filter((k) => CREDENTIAL_KEY.test(k))).toEqual([]);
    expect(snap[1]).not.toHaveProperty('structuredContent');
    expect(snap[1]).not.toHaveProperty('_maStopLedger');
    expect(snap[1]).not.toHaveProperty('_maStopArticle');
    expect(snap[1]).not.toHaveProperty('manualThumbnail');
    expect(snap[1]).toMatchObject({ manualThumbnailDropped: true, sourceKeyword: '김치찌개', accountId: 'account_2', accountName: '둘' });
    expect((snap[1] as any).businessInfo).toEqual({ name: '가게', phone: '010', nested: {} });
  });

  it('pipelineStatus 를 카드용 status 로 옮기고 원래 값은 따로 둔다', () => {
    const snap = multiAccountStopResumeSnapshot(queue());
    expect(snap.map((s) => s.status)).toEqual(['completed', 'pending', 'pending', 'uncertain', 'uncertain', 'failed']);
    expect(snap.map((s) => (s as any).maPipelineStatus)).toEqual(['completed', 'processing', 'pending', 'uncertain', 'publishing', 'failed']);
    expect(gstopResumeSummary({ queue: snap, stoppedItemId: 'q2' })).toBe('완료 1 · 멈춤 1 · 남음 2');
  });

  it('상태 옮기기 규칙', () => {
    expect(multiAccountStopResumeStatusOf('completed')).toBe('completed');
    expect(multiAccountStopResumeStatusOf('image-review')).toBe('pending');
    expect(multiAccountStopResumeStatusOf(undefined)).toBe('pending');
    expect(multiAccountStopResumeStatusOf('failed')).toBe('failed');
    expect(multiAccountStopResumeStatusOf('publishing')).toBe('uncertain');
  });
});

describe('다중계정 이어 가기: 멈춤 문맥', () => {
  it('기록 id 는 항목마다 고정, 장부는 항목에 붙어 다음 시도로 이어진다', () => {
    const q = queue();
    const ctx = multiAccountStopResumeContext(q[2], () => q, () => null, '3/6번째 글');
    expect(ctx).toMatchObject({ kind: 'multi', recordId: 'multi-q3', stoppedItemId: 'q3', label: '셋' });
    expect(ctx.noRecord).toBeUndefined();
    expect(ctx.article!()).toBeUndefined(); // no article yet at the writing stage
    ctx.ledger!.set('k', { filePath: '/a.png' });
    const again = multiAccountStopResumeContext(q[2], () => q, () => ({ selectedTitle: 'T' }), '3/6');
    expect(again.ledger!.get('k')).toEqual({ filePath: '/a.png' });
    expect(again.article!()).toEqual({ selectedTitle: 'T' });
    expect(collectKeys(ctx.queue!()).filter((k) => CREDENTIAL_KEY.test(k))).toEqual([]);
  });
});

function recordOf(q: any[], stoppedItemId: string, extra: Record<string, unknown> = {}) {
  return gstopBuildRecord({ kind: 'multi', info, label: 'x', id: `multi-${stoppedItemId}`, now: 1,
    queue: multiAccountStopResumeSnapshot(q), stoppedItemId, ...extra } as any);
}

describe('다중계정 이어 가기: 되살리기', () => {
  const accounts = new Set(['account_1', 'account_2', 'account_3']);

  it('완료는 완료로, 멈춘 항목은 pending, 미확정·발행 중은 다시 발행하지 않는다. 글·장부를 넘긴다', () => {
    const record = recordOf(queue(), 'q2', { article: { selectedTitle: 'T' }, ledger: [{ key: 'k', image: { filePath: '/a.png' } }] });
    const result = multiAccountStopResumeRestore([], record, accounts);
    expect(result.queue.map((i) => [i.id, i.pipelineStatus])).toEqual([
      ['q1', 'completed'], ['q2', 'pending'], ['q3', 'pending'], ['q4', 'uncertain'], ['q5', 'uncertain'], ['q6', 'failed'],
    ]);
    expect(result.resumable).toBe(3);
    const stopped = result.queue[1] as any;
    expect(stopped).not.toHaveProperty('status');
    expect(stopped).not.toHaveProperty('maPipelineStatus');
    expect(multiAccountStopResumeTakeArticle(stopped)).toEqual({ selectedTitle: 'T' });
    expect(multiAccountStopResumeTakeArticle(stopped)).toBeUndefined(); // handed over once
    expect(multiAccountStopResumeContext(stopped, () => result.queue, () => null, '').ledger!.get('k')).toEqual({ filePath: '/a.png' });
    expect(result.thumbnailDropped).toEqual(['둘']);
  });

  it('지금 없는 계정의 항목은 대기열에 넣지 않고 알린다', () => {
    const record = recordOf(queue(), 'q2');
    const result = multiAccountStopResumeRestore([], record, new Set(['account_1', 'account_2']));
    expect(result.queue.map((i) => i.id)).not.toContain('q3');
    expect(result.queue.map((i) => i.id)).not.toContain('q6');
    expect(result.missingAccounts).toEqual(['셋']);
  });

  it('같은 세션의 대기열 항목은 원본(모든 칸)을 살리고, 기록에 없는 항목은 뒤에 남긴다', () => {
    const live = queue();
    const record = recordOf(live, 'q2');
    const extra = { id: 'new', accountId: 'account_1', accountName: '하나', pipelineStatus: 'pending' };
    const result = multiAccountStopResumeRestore([...live.map((i) => ({ ...i, pipelineStatus: 'pending' })), extra], record, accounts);
    expect((result.queue[1] as any).manualThumbnail).toBeDefined();
    expect(result.queue[0].pipelineStatus).toBe('completed');
    expect(result.queue.at(-1)).toEqual(extra);
    expect(live[1].pipelineStatus).toBe('processing'); // input never mutated
  });

  it('대기열이 없는 기록은 아무것도 되살리지 않는다', () => {
    const record = gstopBuildRecord({ kind: 'multi', info, label: 'x', id: 'r', now: 1 });
    expect(multiAccountStopResumeRestore([], record, accounts).resumable).toBe(0);
  });
});

describe('다중계정 이어 가기: 시작', () => {
  it('창이 초기화되기 전(등록 전)에는 false 와 안내', async () => {
    const notify = vi.fn();
    expect(multiAccountStopResumeBusy()).toBe(false);
    expect(await multiAccountStopResumeStart(recordOf(queue(), 'q2'), { notify })).toBe(false);
    expect(notify.mock.calls[0][0]).toContain('다중계정');
  });

  it('등록 뒤: 대기열을 넣고 시작 단추 경로를 부른 뒤, 시작되면 곧바로 true', async () => {
    let live: any[] = [];
    let running = false;
    const render = vi.fn();
    const notify = vi.fn();
    const start = vi.fn(() => { running = true; return new Promise<void>(() => undefined); });
    multiAccountStopResumeRegister({
      getQueue: () => live, setQueue: (items) => { live = items; }, render, start,
      isRunning: () => running, hasStarted: () => running,
      listAccounts: async () => [{ id: 'account_1' }, { id: 'account_2' }, { id: 'account_3' }],
    });
    expect(await multiAccountStopResumeStart(recordOf(queue(), 'q2'), { notify, pollMs: 1 })).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalled();
    expect(live.find((i) => i.id === 'q2').pipelineStatus).toBe('pending');
    expect(multiAccountStopResumeBusy()).toBe(true);
    expect(await multiAccountStopResumeStart(recordOf(queue(), 'q2'), { notify, pollMs: 1 })).toBe(false); // already running
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('시작 경로가 시작하지 않고 끝나면 false', async () => {
    let live: any[] = [];
    const notify = vi.fn();
    multiAccountStopResumeRegister({
      getQueue: () => live, setQueue: (items) => { live = items; }, render: () => undefined,
      start: async () => undefined, isRunning: () => false, hasStarted: () => false,
      listAccounts: async () => [{ id: 'account_2' }],
    });
    expect(await multiAccountStopResumeStart(recordOf(queue(), 'q2'), { notify, pollMs: 1 })).toBe(false);
    expect(notify).toHaveBeenCalled();
  });

  it('이어 갈 항목이 없으면 시작 경로를 부르지 않는다', async () => {
    const start = vi.fn(async () => undefined);
    multiAccountStopResumeRegister({
      getQueue: () => [], setQueue: () => undefined, render: () => undefined, start,
      isRunning: () => false, hasStarted: () => false, listAccounts: async () => [],
    });
    expect(await multiAccountStopResumeStart(recordOf(queue(), 'q2'), { notify: vi.fn(), pollMs: 1 })).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });
});
