// [2026-10-10] 젠스파크 세션 시험 — 직렬 잠금·중지 epoch·작업 겹침 방지·닫기. 실제 브라우저는 쓰지 않는다(가짜 컨텍스트).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  enqueueGensparkGeneration,
  getGensparkGenerationEpoch,
  abortGensparkGenerations,
  isGensparkGenerationAborted,
  tryBeginGensparkGeneration,
  endGensparkGeneration,
  tryBeginGensparkLogin,
  endGensparkLogin,
  tryBeginGensparkCheck,
  endGensparkCheck,
  getGensparkOperationState,
  setGensparkCached,
  clearGensparkCached,
  getGensparkCachedContext,
  getGensparkCachedPage,
  trackGensparkContext,
  hasTrackedGensparkContexts,
  closeAllGensparkContexts,
  closeGensparkBrowserCache,
  GensparkCleanupIncompleteError,
} from '../image/genspark/gensparkSession';

function fakeContext(closeImpl?: () => Promise<void>) {
  const state = { closed: 0 };
  return {
    state,
    close: closeImpl ?? (async () => { state.closed += 1; }),
  };
}

async function resetAll() {
  await closeAllGensparkContexts().catch(() => undefined);
  clearGensparkCached();
  while (getGensparkOperationState().pendingGenerations > 0) endGensparkGeneration();
  endGensparkLogin();
  endGensparkCheck();
}

describe('gensparkSession', () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  it('직렬 잠금: 작업이 겹치지 않고 들어온 순서대로 실행된다', async () => {
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const mk = (name: string, ms: number) => enqueueGensparkGeneration(async () => {
      running += 1; maxRunning = Math.max(maxRunning, running);
      log.push(`start:${name}`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`end:${name}`);
      running -= 1;
      return name;
    });
    const res = await Promise.all([mk('a', 20), mk('b', 1), mk('c', 1)]);
    expect(res).toEqual(['a', 'b', 'c']);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  });

  it('직렬 잠금: 앞 작업이 실패해도 뒤 작업은 실행되고 오류는 자기 호출자에게만 간다', async () => {
    const first = enqueueGensparkGeneration(async () => { throw new Error('boom'); });
    const second = enqueueGensparkGeneration(async () => 'ok');
    await expect(first).rejects.toThrow('boom');
    await expect(second).resolves.toBe('ok');
  });

  it('중지 epoch: abort 하면 이전에 잡은 epoch 는 무효가 되고 새로 잡은 것은 유효하다', () => {
    const captured = getGensparkGenerationEpoch();
    expect(isGensparkGenerationAborted(captured)).toBe(false);
    const next = abortGensparkGenerations();
    expect(next).toBe(captured + 1);
    expect(isGensparkGenerationAborted(captured)).toBe(true);
    expect(isGensparkGenerationAborted(getGensparkGenerationEpoch())).toBe(false);
  });

  it('겹침 방지: 생성 중에는 로그인·확인이 거부된다', () => {
    expect(tryBeginGensparkGeneration()).toBe(true);
    expect(tryBeginGensparkLogin()).toBe(false);
    expect(tryBeginGensparkCheck()).toBe(false);
    endGensparkGeneration();
    expect(tryBeginGensparkLogin()).toBe(true);
    endGensparkLogin();
  });

  it('겹침 방지: 로그인·확인 중에는 생성이 거부되고 서로도 막는다', () => {
    expect(tryBeginGensparkLogin()).toBe(true);
    expect(tryBeginGensparkGeneration()).toBe(false);
    expect(tryBeginGensparkCheck()).toBe(false);
    expect(tryBeginGensparkLogin()).toBe(false);
    endGensparkLogin();
    expect(tryBeginGensparkCheck()).toBe(true);
    expect(tryBeginGensparkGeneration()).toBe(false);
    endGensparkCheck();
    expect(tryBeginGensparkGeneration()).toBe(true);
    expect(getGensparkOperationState().pendingGenerations).toBe(1);
    endGensparkGeneration();
    endGensparkGeneration(); // 0 아래로 내려가지 않는다
    expect(getGensparkOperationState().pendingGenerations).toBe(0);
  });

  it('캐시: 보관하면 추적되고, 닫으면 캐시가 비워진다', async () => {
    const ctx = fakeContext();
    const page = { id: 'p' };
    setGensparkCached(ctx, page);
    expect(getGensparkCachedContext()).toBe(ctx);
    expect(getGensparkCachedPage()).toBe(page);
    expect(hasTrackedGensparkContexts()).toBe(true);
    await closeGensparkBrowserCache();
    expect(ctx.state.closed).toBe(1);
    expect(getGensparkCachedContext()).toBeNull();
    expect(hasTrackedGensparkContexts()).toBe(false);
  });

  it('closeAll: keepLoginWindows 면 로그인용 창은 남기고 생성용만 닫는다', async () => {
    const gen = fakeContext();
    const login = fakeContext();
    setGensparkCached(gen, {});
    trackGensparkContext(login, 'login');
    await closeAllGensparkContexts({ keepLoginWindows: true });
    expect(gen.state.closed).toBe(1);
    expect(login.state.closed).toBe(0);
    expect(hasTrackedGensparkContexts()).toBe(true);
    await closeAllGensparkContexts();
    expect(login.state.closed).toBe(1);
    expect(hasTrackedGensparkContexts()).toBe(false);
  });

  it('로그인용 창을 setGensparkCached 로 넘겨 받으면 생성용으로 승격되어 keepLoginWindows 에도 닫힌다', async () => {
    const ctx = fakeContext();
    trackGensparkContext(ctx, 'login');
    setGensparkCached(ctx, {});
    await closeAllGensparkContexts({ keepLoginWindows: true });
    expect(ctx.state.closed).toBe(1);
  });

  it('닫기 실패: 소유권을 유지하고 정리 미완료 오류를 던진다(캐시 보존)', async () => {
    const stuck = fakeContext(async () => { throw new Error('stuck'); });
    setGensparkCached(stuck, {});
    await expect(closeGensparkBrowserCache()).rejects.toBeInstanceOf(GensparkCleanupIncompleteError);
    expect(getGensparkCachedContext()).toBe(stuck);
    expect(hasTrackedGensparkContexts()).toBe(true);
    await expect(closeAllGensparkContexts()).rejects.toBeInstanceOf(GensparkCleanupIncompleteError);
    // 정리용: 테스트 끝에서 강제 해제
    clearGensparkCached();
    (stuck as { close: () => Promise<void> }).close = async () => undefined;
    await closeAllGensparkContexts();
    expect(hasTrackedGensparkContexts()).toBe(false);
  });
});
