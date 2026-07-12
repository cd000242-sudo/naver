import { describe, expect, it, vi } from 'vitest';
import {
  createContentGenerationAbortError,
  createProviderTimeoutSignal,
  sleepWithAbort,
  throwIfContentGenerationAborted,
  withProviderTimeout,
} from '../contentAbortTimeoutPolicy';

describe('content abort and timeout policy', () => {
  it('uses one consistent user-cancel error across provider waits', () => {
    const error = createContentGenerationAbortError();

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('사용자가 콘텐츠 생성을 취소했습니다');
  });

  it('throws immediately when an external signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => throwIfContentGenerationAborted(controller.signal)).toThrow(
      '사용자가 콘텐츠 생성을 취소했습니다',
    );
  });

  it('resolves non-positive sleeps without installing timers', async () => {
    await expect(sleepWithAbort(0)).resolves.toBeUndefined();
    await expect(sleepWithAbort(-10)).resolves.toBeUndefined();
  });

  it('cancels abort-aware sleep with the shared cancel error', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const sleep = sleepWithAbort(10_000, controller.signal);

    controller.abort();

    await expect(sleep).rejects.toThrow('사용자가 콘텐츠 생성을 취소했습니다');
    vi.useRealTimers();
  });

  it('rejects provider calls when the timeout wins', async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => undefined);
    const wrapped = withProviderTimeout(never, 500, 'provider timeout');
    const assertion = expect(wrapped).rejects.toThrow('provider timeout');

    await vi.advanceTimersByTimeAsync(500);

    await assertion;
    vi.useRealTimers();
  });

  it('normalizes provider abort errors back to the timeout label when timeout fired', () => {
    vi.useFakeTimers();
    const timeout = createProviderTimeoutSignal(250, 'OpenAI timeout');

    vi.advanceTimersByTime(250);

    expect(timeout.didTimeout()).toBe(true);
    expect(timeout.normalizeError(new Error('ApiUserAbortError'))).toEqual(new Error('OpenAI timeout'));
    timeout.dispose();
    vi.useRealTimers();
  });

  it('normalizes external aborts as user cancellations, not provider errors', () => {
    const external = new AbortController();
    const timeout = createProviderTimeoutSignal(10_000, 'Gemini timeout', external.signal);

    external.abort();

    expect(timeout.normalizeError(new Error('AbortError'))).toEqual(
      new Error('사용자가 콘텐츠 생성을 취소했습니다.'),
    );
    timeout.dispose();
  });

  it('does not blame the user for a renderer response timeout', () => {
    const controller = new AbortController();
    controller.abort('renderer API timeout');

    expect(() => throwIfContentGenerationAborted(controller.signal)).toThrow(
      '콘텐츠 생성 응답 대기 시간이 초과되어 해당 요청을 중단했습니다.',
    );
  });
});
