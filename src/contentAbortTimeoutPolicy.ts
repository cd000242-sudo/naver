import { normalizeErrorMessage } from './contentErrorDiagnostics';

export function createContentGenerationAbortError(signal?: AbortSignal): Error {
  const reason = signal?.reason;
  const reasonText = reason instanceof Error ? reason.message : String(reason || '');
  if (/renderer api timeout|response timeout|응답.*시간.*초과/i.test(reasonText)) {
    return new Error('콘텐츠 생성 응답 대기 시간이 초과되어 해당 요청을 중단했습니다.');
  }
  return new Error('사용자가 콘텐츠 생성을 취소했습니다.');
}

export function throwIfContentGenerationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createContentGenerationAbortError(signal);
  }
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  throwIfContentGenerationAborted(signal);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  return new Promise<void>((resolve, reject) => {
    timer = setTimeout(resolve, ms);
    if (signal) {
      onAbort = () => {
        if (timer) clearTimeout(timer);
        reject(createContentGenerationAbortError(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  });
}

export function withProviderTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  return new Promise<T>((resolve, reject) => {
    try {
      throwIfContentGenerationAborted(signal);
    } catch (error) {
      reject(error);
      return;
    }

    timer = setTimeout(() => reject(new Error(label)), timeoutMs);
    if (signal) {
      onAbort = () => reject(createContentGenerationAbortError(signal));
      signal.addEventListener('abort', onAbort, { once: true });
    }

    promise.then(resolve, reject);
  }).finally(() => {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  });
}

export function createProviderTimeoutSignal(
  timeoutMs: number,
  label: string,
  externalSignal?: AbortSignal,
): {
  signal: AbortSignal;
  didTimeout: () => boolean;
  dispose: () => void;
  normalizeError: (error: unknown) => Error;
} {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onExternalAbort: (() => void) | undefined;

  const abortOnce = (reason: Error): void => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  timer = setTimeout(() => {
    timedOut = true;
    abortOnce(new Error(label));
  }, timeoutMs);

  if (externalSignal) {
    onExternalAbort = () => abortOnce(createContentGenerationAbortError(externalSignal));
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      if (timer) clearTimeout(timer);
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    },
    normalizeError: (error: unknown) => {
      if (timedOut) return new Error(label);
      if (externalSignal?.aborted) return createContentGenerationAbortError(externalSignal);

      const message = normalizeErrorMessage(error).toLowerCase();
      if (controller.signal.aborted && (
        message.includes('apiuseraborterror') ||
        message.includes('abort') ||
        message.includes('aborted') ||
        message.includes('ecanceled')
      )) {
        return createContentGenerationAbortError(externalSignal);
      }

      return error instanceof Error ? error : new Error(String(error));
    },
  };
}
