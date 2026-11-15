// @vitest-environment happy-dom
/**
 * [2026-11-15] Photo check choice window: when the photo-check engine (subscription limit / login) cannot run,
 * the user picks how to go on. Pure option builder, the blocking window in the DOM, and the retry loop.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askPhotoCheckChoice,
  buildPhotoCheckOptions,
  buildPhotoCheckReason,
  photoCheckModeLabel,
  photoCheckRetryLoop,
} from '../renderer/modules/photoCheckChoice.js';

const ALL_CONNECTED = { claude: 'connected', codex: 'connected' } as const;
const picks = (vendor: string, tried: any[] = [], connection: any = ALL_CONNECTED) =>
  buildPhotoCheckOptions({ vendor, connection, tried }).map((o) => o.pick);
const find = (vendor: string, pick: string, tried: any[] = [], connection: any = ALL_CONNECTED) =>
  buildPhotoCheckOptions({ vendor, connection, tried }).find((o) => o.pick === pick)!;

describe('buildPhotoCheckOptions', () => {
  it('claude subscription failed -> only Codex is offered, then free check and manual', () => {
    expect(picks('agent-claude')).toEqual(['agent-codex', 'caption', 'manual']);
    expect(find('agent-claude', 'agent-codex').label).toBe('Codex 구독으로 이어서');
  });

  it('codex subscription failed -> only Claude is offered', () => {
    expect(picks('agent-codex')).toEqual(['agent-claude', 'caption', 'manual']);
    expect(find('agent-codex', 'agent-claude').label).toBe('Claude 구독으로 이어서');
  });

  it('an API engine failed -> both subscriptions are offered', () => {
    for (const vendor of ['gemini', 'openai', 'claude']) {
      expect(picks(vendor)).toEqual(['agent-codex', 'agent-claude', 'caption', 'manual']);
    }
  });

  it('connected -> "연결됨" and enabled; not connected -> "연결 안 됨" and disabled', () => {
    const on = find('gemini', 'agent-codex');
    expect(on.note).toBe('연결됨');
    expect(on.disabled).toBe(false);
    const off = find('gemini', 'agent-claude', [], { claude: 'disconnected', codex: 'connected' });
    expect(off.note).toBe('연결 안 됨');
    expect(off.disabled).toBe(true);
  });

  it('status unknown (lookup failed or slow) -> "연결 확인 못 함" and still clickable', () => {
    const unknown = find('gemini', 'agent-codex', [], { claude: 'unknown', codex: 'unknown' });
    expect(unknown.note).toBe('연결 확인 못 함');
    expect(unknown.disabled).toBe(false);
  });

  it('a subscription already tried and blocked again is disabled with "방금 안 됐어요"', () => {
    const tried = find('agent-claude', 'agent-codex', ['agent-codex']);
    expect(tried.note).toBe('방금 안 됐어요');
    expect(tried.disabled).toBe(true);
  });

  it('free check and manual are always there, enabled, with one-line notes', () => {
    const gone = { claude: 'disconnected', codex: 'disconnected' };
    const caption = find('agent-claude', 'caption', ['agent-codex'], gone);
    const manual = find('agent-claude', 'manual', ['agent-codex'], gone);
    expect(caption.label).toBe('무료 판정으로 계속');
    expect(caption.note).toBe('사진 설명 글만 보고 고릅니다. 정확도가 떨어져요.');
    expect(caption.disabled).toBe(false);
    expect(manual.label).toBe('직접 고를게요');
    expect(manual.note).toBe('지금은 멈춥니다.');
    expect(manual.disabled).toBe(false);
  });
});

describe('reason line and labels', () => {
  it('names the engine for subscription limits and logins', () => {
    expect(buildPhotoCheckReason({ reason: 'rate_limit', vendor: 'agent-claude' })).toBe('Claude 구독 사용 한도가 소진됐어요.');
    expect(buildPhotoCheckReason({ reason: 'rate_limit', vendor: 'agent-codex' })).toBe('Codex 구독 사용 한도가 소진됐어요.');
    expect(buildPhotoCheckReason({ reason: 'login', vendor: 'agent-codex' })).toBe('Codex 구독 로그인이 풀렸어요.');
  });

  it('an API engine shows the first sentence of the received message', () => {
    const message = 'Gemini 사용량이 모자라 사진 검사를 못 했어요. 키를 확인한 뒤 다시 하세요.';
    expect(buildPhotoCheckReason({ reason: 'rate_limit', vendor: 'gemini', message })).toBe('Gemini 사용량이 모자라 사진 검사를 못 했어요.');
  });

  it('log labels for the three ways to go on', () => {
    expect(photoCheckModeLabel('agent-codex')).toBe('Codex 구독');
    expect(photoCheckModeLabel('agent-claude')).toBe('Claude 구독');
    expect(photoCheckModeLabel('caption')).toBe('무료 판정');
  });
});

describe('askPhotoCheckChoice window', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; delete (window as any).api; });
  const failure = { reason: 'rate_limit' as const, vendor: 'agent-claude', message: '' };
  const connect = (status: (v: string) => Promise<any>) => { (window as any).api = { agentStatus: vi.fn(status) }; };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const buttons = () => [...document.querySelectorAll('.nv-scrim button')] as HTMLButtonElement[];
  const byText = (t: string) => buttons().find((b) => (b.textContent || '').includes(t))!;

  it('shows title, reason, question and the options; clicking one resolves with it', async () => {
    connect(async (v) => ({ success: true, status: { available: v === 'codex', loggedIn: true } }));
    const pending = askPhotoCheckChoice(failure, []);
    await flush();
    const overlay = document.querySelector('.nv-scrim') as HTMLElement;
    expect(overlay.className).toContain('nv-scrim');
    expect(overlay.querySelector('.nv-modal')).toBeTruthy();
    const text = overlay.textContent || '';
    expect(text).toContain('사진 검사를 못 했어요');
    expect(text).toContain('Claude 구독 사용 한도가 소진됐어요.');
    expect(text).toContain('어떻게 할까요?');
    expect(text).toContain('연결됨');
    expect(overlay.outerHTML).not.toMatch(/(background|color)\s*:\s*#/i);
    byText('Codex 구독으로 이어서').click();
    await expect(pending).resolves.toBe('agent-codex');
    expect(document.querySelector('.nv-scrim')).toBeNull();
  });

  it('a disabled option does not resolve', async () => {
    connect(async () => ({ success: true, status: { available: false, loggedIn: false } }));
    const pending = askPhotoCheckChoice(failure, []);
    await flush();
    const codex = byText('Codex 구독으로 이어서');
    expect(codex.disabled).toBe(true);
    expect(codex.parentElement!.textContent).toContain('연결 안 됨');
    byText('무료 판정으로 계속').click();
    await expect(pending).resolves.toBe('caption');
  });

  it('Escape and a click outside the card both mean "직접 고를게요"', async () => {
    connect(async () => ({ success: true, status: { available: true, loggedIn: true } }));
    const first = askPhotoCheckChoice(failure, []);
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(first).resolves.toBe('manual');
    const second = askPhotoCheckChoice(failure, []);
    await flush();
    (document.querySelector('.nv-scrim') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(second).resolves.toBe('manual');
  });

  it('a status lookup that fails or takes over 3 seconds shows "연결 확인 못 함" with the button usable', async () => {
    vi.useFakeTimers();
    connect((v) => (v === 'claude' ? Promise.reject(new Error('boom')) : new Promise(() => undefined)));
    const pending = askPhotoCheckChoice({ ...failure, vendor: 'gemini' }, []);
    await vi.advanceTimersByTimeAsync(3100);
    const codex = byText('Codex 구독으로 이어서');
    expect(codex.disabled).toBe(false);
    expect(document.querySelector('.nv-scrim')!.textContent).toContain('연결 확인 못 함');
    codex.click();
    await expect(pending).resolves.toBe('agent-codex');
  });
});

describe('photoCheckRetryLoop', () => {
  const blocked = (vendor = 'agent-claude') => ({ success: false, code: 'VISION_ENGINE_UNAVAILABLE', message: 'm', visionUnavailable: { reason: 'rate_limit', vendor } });
  const ok = { success: true, images: [1] };

  it('a result that is not this failure goes straight back, no window', async () => {
    const ask = vi.fn(); const rerun = vi.fn();
    await expect(photoCheckRetryLoop(ok, rerun, () => undefined, ask)).resolves.toBe(ok);
    await expect(photoCheckRetryLoop({ success: false, message: 'x' }, rerun, () => undefined, ask)).resolves.toMatchObject({ message: 'x' });
    expect(ask).not.toHaveBeenCalled(); expect(rerun).not.toHaveBeenCalled();
  });

  it('a pick re-runs with that photoCheckMode and logs the way', async () => {
    const ask = vi.fn(async () => 'agent-codex'); const rerun = vi.fn(async () => ok); const log = vi.fn();
    await expect(photoCheckRetryLoop(blocked(), rerun, log, ask as any)).resolves.toBe(ok);
    expect(rerun).toHaveBeenCalledWith('agent-codex');
    expect(log).toHaveBeenCalledWith('🔁 Codex 구독으로 처음부터 다시 찾습니다 (1~3분)');
    expect(ask).toHaveBeenCalledWith({ reason: 'rate_limit', vendor: 'agent-claude', message: 'm' }, ['agent-claude']);
  });

  it('"manual" does not call again and gives back the original failure', async () => {
    const first = blocked(); const rerun = vi.fn();
    await expect(photoCheckRetryLoop(first, rerun, () => undefined, (async () => 'manual') as any)).resolves.toBe(first);
    expect(rerun).not.toHaveBeenCalled();
  });

  it('stops after 3 windows and remembers what already failed', async () => {
    const seen: string[][] = [];
    const ask = vi.fn(async (_f: any, tried: string[]) => { seen.push(tried); return 'agent-codex'; });
    const rerun = vi.fn(async () => blocked('agent-codex'));
    const last = await photoCheckRetryLoop(blocked(), rerun, () => undefined, ask as any);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(rerun).toHaveBeenCalledTimes(3);
    expect(seen[1]).toContain('agent-codex');
    expect(last.success).toBe(false);
  });
});
