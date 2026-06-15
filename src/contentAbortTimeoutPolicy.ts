import { normalizeErrorMessage } from './contentErrorDiagnostics';

export function createContentGenerationAbortError(): Error {
  return new Error('사용자가 콘텐츠 생성을 취소했습니다.');
}

export function throwIfContentGenerationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createContentGenerationAbortError();
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
        reject(createContentGenerationAbortError());
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
      onAbort = () => reject(createContentGenerationAbortError());
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
    onExternalAbort = () => abortOnce(createContentGenerationAbortError());
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
      if (externalSignal?.aborted) return createContentGenerationAbortError();

      const message = normalizeErrorMessage(error).toLowerCase();
      if (controller.signal.aborted && (
        message.includes('apiuseraborterror') ||
        message.includes('abort') ||
        message.includes('aborted') ||
        message.includes('ecanceled')
      )) {
        return createContentGenerationAbortError();
      }

      return error instanceof Error ? error : new Error(String(error));
    },
  };
}
