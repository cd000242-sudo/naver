// [2026-10-11 사장님 승인] 로그인 필요·다른 계정 멈춤 — 열린 네이버 창을 지켜보다 로그인이 끝나면 자동 재개.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOGIN_WATCH_INTERVAL_MS,
  LOGIN_WATCH_MAX_MS,
  isWatchingLoginForAutoResume,
  loginAutoResumeTick,
  stopLoginAutoResumeWatch,
  watchLoginForAutoResume,
  type LoginAutoResumeDeps,
} from '../main/loginAutoResume';

function deps(over: Partial<LoginAutoResumeDeps> = {}): LoginAutoResumeDeps & { resume: ReturnType<typeof vi.fn> } {
  const resume = vi.fn(async () => false);
  return {
    status: () => ({ paused: true, code: 'LOGIN_REQUIRED', busy: false }),
    peek: async () => ({ open: true, onLoginPage: false, fingerprint: 'https://www.naver.com/|aaa' }),
    resume,
    now: () => 1_000,
    ...over,
  } as never;
}

describe('loginAutoResumeTick', () => {
  it('로그인 화면에 있는 동안은 아무것도 하지 않는다(입력 중 방해 없음)', async () => {
    const d = deps({ peek: async () => ({ open: true, onLoginPage: true, fingerprint: 'login|none' }) });
    expect(await loginAutoResumeTick('a', d, { startedAt: 1_000, lastTried: '' })).toBe('continue');
    expect(d.resume).not.toHaveBeenCalled();
  });

  it('로그인 화면을 벗어나면 [확인 후 재개]와 같은 확인을 한 번 하고, 풀리면 resumed', async () => {
    const d = deps();
    d.resume.mockResolvedValueOnce(true);
    expect(await loginAutoResumeTick('a', d, { startedAt: 1_000, lastTried: '' })).toBe('resumed');
    expect(d.resume).toHaveBeenCalledTimes(1);
  });

  it('확인이 실패하면 창이 바뀔 때까지 다시 시도하지 않는다(같은 창으로 반복 확인 금지)', async () => {
    const d = deps();
    const watch = { startedAt: 1_000, lastTried: '' };
    expect(await loginAutoResumeTick('a', d, watch)).toBe('continue');
    expect(await loginAutoResumeTick('a', d, watch)).toBe('continue');
    expect(d.resume).toHaveBeenCalledTimes(1);
    const changed = deps({ peek: async () => ({ open: true, onLoginPage: false, fingerprint: 'https://www.naver.com/|bbb' }) });
    await loginAutoResumeTick('a', changed, watch);
    expect(changed.resume).toHaveBeenCalledTimes(1);
  });

  it('본인확인·보호조치·연결 확인·발행 결과 확인 멈춤은 자동으로 풀지 않는다', async () => {
    for (const code of ['LOGIN_CHALLENGE', 'ACCOUNT_PROTECTED', 'NETWORK_WAIT', 'PUBLISH_OUTCOME_UNKNOWN']) {
      const d = deps({ status: () => ({ paused: true, code, busy: false }) });
      expect(await loginAutoResumeTick('a', d, { startedAt: 1_000, lastTried: '' })).toBe('stop');
      expect(d.resume).not.toHaveBeenCalled();
    }
  });

  it('멈춤이 풀렸거나, 창이 닫혔거나, 15분이 지나면 그만 지켜본다', async () => {
    expect(await loginAutoResumeTick('a', deps({ status: () => ({ paused: false, busy: false }) }), { startedAt: 1_000, lastTried: '' })).toBe('stop');
    expect(await loginAutoResumeTick('a', deps({ peek: async () => ({ open: false, onLoginPage: false, fingerprint: '' }) }), { startedAt: 1_000, lastTried: '' })).toBe('stop');
    const late = deps({ now: () => 1_000 + LOGIN_WATCH_MAX_MS + 1 });
    expect(await loginAutoResumeTick('a', late, { startedAt: 1_000, lastTried: '' })).toBe('stop');
    expect(late.resume).not.toHaveBeenCalled();
  });

  it('다른 작업이 계정을 쓰는 중이거나 창을 읽지 못하면 기다린다', async () => {
    const busy = deps({ status: () => ({ paused: true, code: 'ACCOUNT_MISMATCH', busy: true }) });
    expect(await loginAutoResumeTick('a', busy, { startedAt: 1_000, lastTried: '' })).toBe('continue');
    const unreadable = deps({ peek: async () => { throw new Error('closed'); } });
    expect(await loginAutoResumeTick('a', unreadable, { startedAt: 1_000, lastTried: '' })).toBe('continue');
    expect(busy.resume).not.toHaveBeenCalled();
    expect(unreadable.resume).not.toHaveBeenCalled();
  });
});

describe('watchLoginForAutoResume', () => {
  afterEach(() => { stopLoginAutoResumeWatch(); vi.useRealTimers(); });

  it('4초마다 지켜보다 풀리면 멈추고, 같은 계정은 한 번만 지켜본다', async () => {
    vi.useFakeTimers();
    let page = { open: true, onLoginPage: true, fingerprint: 'login|none' };
    const d = deps({ peek: async () => page, now: () => Date.now() });
    d.resume.mockResolvedValue(true);
    watchLoginForAutoResume('ABC', d);
    watchLoginForAutoResume('abc', d);
    expect(isWatchingLoginForAutoResume('abc')).toBe(true);
    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_INTERVAL_MS * 2);
    expect(d.resume).not.toHaveBeenCalled();
    page = { open: true, onLoginPage: false, fingerprint: 'https://www.naver.com/|new' };
    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_INTERVAL_MS);
    expect(d.resume).toHaveBeenCalledTimes(1);
    expect(isWatchingLoginForAutoResume('abc')).toBe(false);
  });
});
