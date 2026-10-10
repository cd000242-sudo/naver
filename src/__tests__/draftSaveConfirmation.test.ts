/**
 * [2026-10-10 사장님] "임시저장하고 나면 저장됐는데도 멍때린다" — 임시저장은 페이지 이동이 없어서
 * 이동만 기다리면 저장이 끝난 뒤에도 제한 시간(10초)을 다 채웠다. "임시저장된 글 N개"가 늘면 바로 끝낸다.
 */
import { describe, expect, it } from 'vitest';
import {
  DRAFT_SAVE_WAIT_MS,
  isDraftCountIncreased,
  waitForDraftSaveSignal,
  type DraftSaveWaitDeps,
} from '../automation/draftSaveConfirmation';

/** A fake clock: delay() advances time instantly so the poll loop runs without real waiting. */
function fakeDeps(counts: Array<number | null>, navigation: 'never' | 'resolve' | 'reject-now' = 'never') {
  let clock = 0;
  let reads = 0;
  const deps: DraftSaveWaitDeps = {
    readCount: async () => counts[Math.min(reads++, counts.length - 1)],
    waitNavigation: (ms) => {
      if (navigation === 'resolve') return Promise.resolve();
      if (navigation === 'reject-now') return Promise.reject(new Error('Navigating frame was detached'));
      return new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}`)), 50));
    },
    delay: async (ms) => { clock += ms; },
    now: () => clock,
  };
  return { deps, elapsed: () => clock, reads: () => reads };
}

describe('isDraftCountIncreased', () => {
  it('늘었을 때만 저장 확인으로 본다', () => {
    expect(isDraftCountIncreased(0, 1)).toBe(true);
    expect(isDraftCountIncreased(2, 2)).toBe(false);
    expect(isDraftCountIncreased(null, 1)).toBe(false);
    expect(isDraftCountIncreased(0, null)).toBe(false);
  });
});

describe('waitForDraftSaveSignal', () => {
  it('임시저장 개수가 늘면 제한 시간을 채우지 않고 바로 끝낸다', async () => {
    const f = fakeDeps([0, 0, 1]);
    expect(await waitForDraftSaveSignal(0, f.deps)).toBe('count');
    expect(f.elapsed()).toBeLessThan(DRAFT_SAVE_WAIT_MS);
  });

  it('개수가 그대로면(기존 초안 덮어쓰기) 지금처럼 제한 시간까지만 기다린다', async () => {
    const f = fakeDeps([3]);
    expect(await waitForDraftSaveSignal(3, f.deps)).toBe('timeout');
    expect(f.elapsed()).toBeGreaterThanOrEqual(DRAFT_SAVE_WAIT_MS);
    expect(f.elapsed()).toBeLessThan(DRAFT_SAVE_WAIT_MS + 1_000);
  });

  it('페이지가 이동하면 그때 끝낸다', async () => {
    const f = fakeDeps([0], 'resolve');
    expect(await waitForDraftSaveSignal(0, f.deps)).toBe('navigation');
  });

  it('저장 직후 창이 떠나 프레임이 끊기면 기다리지 않고 끝낸다', async () => {
    const f = fakeDeps([null], 'reject-now');
    expect(await waitForDraftSaveSignal(0, f.deps)).toBe('navigation');
  });

  it('개수를 처음부터 못 읽으면 이동/제한 시간만 본다(개수를 묻지 않는다)', async () => {
    const f = fakeDeps([5]);
    expect(await waitForDraftSaveSignal(null, f.deps, 100)).toBe('timeout');
    expect(f.reads()).toBe(0);
  });
});
