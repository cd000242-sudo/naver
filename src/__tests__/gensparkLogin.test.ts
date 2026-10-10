// [2026-10-10] 젠스파크 로그인 시험 — 가짜 브라우저·가짜 대기. 실제 크롬·사이트 접속 없음.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  gensparkClassifySignals,
  checkGensparkLogin,
  openGensparkLoginWindow,
  prepareGensparkGenerationPage,
} from '../image/genspark/gensparkLogin';
import { buildGensparkLaunchArgs, isGensparkProfileLockError } from '../image/genspark/gensparkBrowser';
import {
  closeAllGensparkContexts,
  clearGensparkCached,
  getGensparkCachedContext,
  tryBeginGensparkGeneration,
  endGensparkGeneration,
  getGensparkOperationState,
  trackGensparkContext,
} from '../image/genspark/gensparkSession';
import { GensparkError } from '../image/genspark/gensparkErrors';

const base = { url: 'https://www.genspark.ai/ai_image', hasComposer: false, loginRequired: false, challenge: false, rateLimited: false, failed: false };

/** 신호 시나리오를 차례로 돌려주는 가짜 탭 */
function fakePage(signals: Array<Partial<typeof base>>) {
  let i = 0;
  const page = {
    gotoCount: 0,
    frontCount: 0,
    goto: async () => { page.gotoCount += 1; },
    url: () => base.url,
    evaluate: async () => ({ ...base, ...signals[Math.min(i++, signals.length - 1)] }),
    bringToFront: async () => { page.frontCount += 1; },
    isClosed: () => false,
    context: () => ctxRef,
  };
  let ctxRef: unknown = null;
  return { page, bind: (c: unknown) => { ctxRef = c; } };
}

function fakeCtx(page: unknown) {
  const ctx = {
    closed: 0,
    pages: () => [page],
    newPage: async () => page,
    on: () => undefined,
    close: async () => { ctx.closed += 1; },
  };
  return ctx;
}

const noSleep = async () => undefined;

async function reset() {
  await closeAllGensparkContexts().catch(() => undefined);
  clearGensparkCached();
  while (getGensparkOperationState().pendingGenerations > 0) endGensparkGeneration();
}

describe('gensparkClassifySignals', () => {
  it('입력창 있음 → logged-in, 로그인 필요 → logged-out, 보안 확인·신호 없음 → unknown', () => {
    expect(gensparkClassifySignals({ ...base, hasComposer: true })).toBe('logged-in');
    expect(gensparkClassifySignals({ ...base, loginRequired: true })).toBe('logged-out');
    expect(gensparkClassifySignals({ ...base, challenge: true, hasComposer: true })).toBe('unknown');
    expect(gensparkClassifySignals(base)).toBe('unknown');
    expect(gensparkClassifySignals(null)).toBe('unknown');
  });
});

describe('gensparkBrowser 순수 함수', () => {
  it('숨김 창은 화면 밖 위치 인자, 보이는 창·headless 는 위치 인자 없음', () => {
    expect(buildGensparkLaunchArgs({ visible: false })).toContain('--window-position=-32000,-32000');
    expect(buildGensparkLaunchArgs({ visible: true }).some((a) => a.startsWith('--window-position'))).toBe(false);
    expect(buildGensparkLaunchArgs({ hideMode: 'headless' }).some((a) => a.startsWith('--window-position'))).toBe(false);
  });
  it('프로필 잠김 오류 판정', () => {
    expect(isGensparkProfileLockError(new Error('ProcessSingleton lock'))).toBe(true);
    expect(isGensparkProfileLockError(new Error('network down'))).toBe(false);
  });
});

describe('로그인 흐름(가짜 브라우저)', () => {
  beforeEach(reset);
  afterEach(reset);

  it('확인: 로그인 상태면 숨긴 창을 생성용으로 이어 받는다', async () => {
    const { page, bind } = fakePage([{ hasComposer: true }]);
    const ctx = fakeCtx(page); bind(ctx); trackGensparkContext(ctx);
    // launch 가 추적까지 하도록 흉내
    const res = await checkGensparkLogin({
      launch: async () => { trackGensparkContext(ctx); return ctx; }, sleep: noSleep,
    });
    expect(res.state).toBe('logged-in');
    expect(getGensparkCachedContext()).toBe(ctx);
    expect(ctx.closed).toBe(0);
  });

  it('확인: 로그아웃이면 숨긴 창을 닫고 캐시를 남기지 않는다', async () => {
    const { page, bind } = fakePage([{ loginRequired: true }]);
    const ctx = fakeCtx(page); bind(ctx);
    const res = await checkGensparkLogin({ launch: async () => { trackGensparkContext(ctx); return ctx; }, sleep: noSleep });
    expect(res.state).toBe('logged-out');
    expect(ctx.closed).toBe(1);
    expect(getGensparkCachedContext()).toBeNull();
  });

  it('확인: 생성 중이면 BUSY 로 미룬다', async () => {
    expect(tryBeginGensparkGeneration()).toBe(true);
    const res = await checkGensparkLogin({ launch: async () => { throw new Error('호출되면 안 됨'); } });
    expect(res.code).toBe('BUSY');
  });

  it('로그인 창: 사람이 로그인하면 숨겨서 생성용으로 이어 받고 비밀번호 입력은 없다', async () => {
    // 1) 기존 확인용 숨김 창: 로그아웃  2) 보이는 창: 대기 2번 뒤 로그인
    const hidden = fakePage([{ loginRequired: true }]);
    const hiddenCtx = fakeCtx(hidden.page); hidden.bind(hiddenCtx);
    const visible = fakePage([{ loginRequired: true }, { loginRequired: true }, { hasComposer: true }]);
    const visibleCtx = fakeCtx(visible.page); visible.bind(visibleCtx);
    const launches: boolean[] = [];
    let hid = 0;
    const res = await openGensparkLoginWindow({
      launch: async (o) => {
        launches.push(o.visible);
        const c = o.visible ? visibleCtx : hiddenCtx;
        trackGensparkContext(c, o.visible ? 'login' : 'generation');
        return c;
      },
      hide: async () => { hid += 1; return true; },
      sleep: noSleep,
    });
    expect(res.state).toBe('logged-in');
    expect(launches).toEqual([false, true]);
    expect(hiddenCtx.closed).toBe(1);
    expect(hid).toBe(1);
    expect(getGensparkCachedContext()).toBe(visibleCtx);
    expect(visibleCtx.closed).toBe(0);
    expect(getGensparkOperationState().loginActive).toBe(false);
  });

  it('로그인 창: 시간이 지나도 로그인이 없으면 창을 닫고 LOGIN_TIMEOUT', async () => {
    const hidden = fakePage([{ loginRequired: true }]);
    const hiddenCtx = fakeCtx(hidden.page); hidden.bind(hiddenCtx);
    const vis = fakePage([{ loginRequired: true }]);
    const visCtx = fakeCtx(vis.page); vis.bind(visCtx);
    const res = await openGensparkLoginWindow({
      launch: async (o) => { const c = o.visible ? visCtx : hiddenCtx; trackGensparkContext(c); return c; },
      hide: async () => true, sleep: noSleep, maxWaitMs: 9_000,
    });
    expect(res.code).toBe('LOGIN_TIMEOUT');
    expect(visCtx.closed).toBe(1);
    expect(getGensparkCachedContext()).toBeNull();
  });

  it('로그인 창: 숨기기 실패면 창을 닫고 HIDE_FAILED(로그인은 인정)', async () => {
    const hidden = fakePage([{ loginRequired: true }]);
    const hc = fakeCtx(hidden.page); hidden.bind(hc);
    const vis = fakePage([{ hasComposer: true }]);
    const vc = fakeCtx(vis.page); vis.bind(vc);
    const res = await openGensparkLoginWindow({
      launch: async (o) => { const c = o.visible ? vc : hc; trackGensparkContext(c); return c; },
      hide: async () => false, sleep: noSleep,
    });
    expect(res.code).toBe('HIDE_FAILED');
    expect(res.state).toBe('logged-in');
    expect(vc.closed).toBe(1);
  });

  it('생성 준비: 로그인 풀림이면 로그인 창 없이 GENSPARK_LOGIN_REQUIRED', async () => {
    const { page, bind } = fakePage([{ loginRequired: true }]);
    const ctx = fakeCtx(page); bind(ctx);
    const launches: boolean[] = [];
    await expect(prepareGensparkGenerationPage({
      launch: async (o) => { launches.push(o.visible); trackGensparkContext(ctx); return ctx; }, sleep: noSleep,
    })).rejects.toMatchObject({ code: 'GENSPARK_LOGIN_REQUIRED' });
    expect(launches).toEqual([false]);
    expect(page.frontCount).toBe(1);
  });

  it('생성 준비: 보안 확인은 CHALLENGE, 정상이면 탭을 돌려주고 다음 호출은 같은 탭을 재사용', async () => {
    const bad = fakePage([{ challenge: true }]);
    const badCtx = fakeCtx(bad.page); bad.bind(badCtx);
    await expect(prepareGensparkGenerationPage({
      launch: async () => { trackGensparkContext(badCtx); return badCtx; }, sleep: noSleep,
    })).rejects.toBeInstanceOf(GensparkError);
    await reset();

    const ok = fakePage([{ hasComposer: true }]);
    const okCtx = fakeCtx(ok.page); ok.bind(okCtx);
    let launched = 0;
    const deps = { launch: async () => { launched += 1; trackGensparkContext(okCtx); return okCtx; }, sleep: noSleep };
    expect(await prepareGensparkGenerationPage(deps)).toBe(ok.page);
    expect(await prepareGensparkGenerationPage(deps)).toBe(ok.page);
    expect(launched).toBe(1);
  });
});
