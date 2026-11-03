interface Route {
  readonly engine: string;
  readonly subscription?: boolean;
  readonly callModel: (prompt: string, options: { maxTokens: number; timeoutMs: number; signal: AbortSignal }) => Promise<string>;
}
interface CallOptions { readonly signal?: AbortSignal; readonly maxOutputTokens?: number; readonly stage?: string }
type Resolve = (generator: string, config: Record<string, unknown>, options: { tier: 'quality' }) => Route | null;

/** Editorial calls use the exact chosen writer and never fall back to another vendor. */
export async function createDailyEditorialCaller(
  generator: string, config: Record<string, unknown>, signal?: AbortSignal, deps: { resolve?: Resolve } = {},
) {
  if (signal?.aborted) throw Error('DAILY_CANCELLED');
  const resolve = deps.resolve || (await import('../ipc/paraphraseAnalysisHandlers.js')).resolveSelectedEngineRoute;
  const route = resolve(generator, config, { tier: 'quality' });
  if (!route) throw Error('DAILY_EDITORIAL_ENGINE_REQUIRED: 선택한 작성 엔진 연결을 확인해 주세요.');
  const timeoutMs = route.subscription ? 190_000 : 100_000;
  return { engine: route.engine, timeoutMs,
    async complete(prompt: string, options: CallOptions = {}): Promise<string> {
      const signals = [...new Set([signal, options.signal].filter((s): s is AbortSignal => !!s))];
      if (signals.some(s => s.aborted)) throw Error('DAILY_CANCELLED');
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 100_000) throw Error('DAILY_EDITORIAL_INPUT_LIMIT');
      const requested = options.maxOutputTokens ?? 10_000;
      const maxTokens = Number.isFinite(requested) ? Math.max(2_000, Math.min(12_000, Math.floor(requested))) : 10_000;
      const controller = new AbortController();
      let rejectCancelled: (reason: Error) => void = () => {};
      const cancelled = new Promise<never>((_resolve, reject) => { rejectCancelled = reject; });
      const stop = (reason: Error) => { controller.abort(reason); rejectCancelled(reason); };
      const abort = () => stop(Error('DAILY_CANCELLED'));
      for (const s of signals) s.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(() => stop(Error('DAILY_EDITORIAL_TIMEOUT')), timeoutMs);
      try {
        if (signals.some(s => s.aborted)) throw Error('DAILY_CANCELLED');
        const result = await Promise.race([Promise.resolve().then(() => {
          controller.signal.throwIfAborted();
          return route.callModel(prompt, { maxTokens, timeoutMs: route.subscription ? 180_000 : 90_000, signal: controller.signal });
        }), cancelled]);
        if (signals.some(s => s.aborted)) throw Error('DAILY_CANCELLED');
        if (typeof result !== 'string' || !result.trim() || result.length > 128_000) throw Error('DAILY_EDITORIAL_RESPONSE_INVALID');
        return result;
      } finally {
        clearTimeout(timer); for (const s of signals) s.removeEventListener('abort', abort);
      }
    },
  };
}
