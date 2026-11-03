import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSelectedEngineRoute } from '../main/ipc/paraphraseAnalysisHandlers.js';

const transport = vi.hoisted(() => ({ agent: vi.fn(), gemini: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('../agentCli/index.js', () => ({ generateWithAgent: transport.agent }));
vi.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: class {
  getGenerativeModel() { return { generateContent: transport.gemini }; }
} }));
const keys = { openaiApiKey: 'fixture', claudeApiKey: 'fixture', perplexityApiKey: 'fixture', geminiApiKey: 'fixture' };
beforeEach(() => { transport.agent.mockReset(); transport.gemini.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('selected engine transport cancellation', () => {
  it.each(['openai', 'claude', 'perplexity'])('aborts the underlying %s fetch', async generator => {
    let actual: AbortSignal | undefined;
    const fetch = vi.fn((_url, options) => {
      actual = options.signal;
      return new Promise((_resolve, reject) => actual!.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
    });
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const pending = resolveSelectedEngineRoute(generator, keys)!.callModel('review', { signal: controller.signal });
    await vi.waitFor(() => expect(actual).toBeDefined());
    controller.abort(); expect(actual!.aborted).toBe(true);
    await expect(pending).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['agent-codex', 'agent-claude', 'agent-gemini'])('forwards cancellation to %s', async generator => {
    transport.agent.mockImplementation(options => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(Error('aborted')), { once: true });
    }));
    const controller = new AbortController();
    const pending = resolveSelectedEngineRoute(generator, keys)!.callModel('review', { signal: controller.signal });
    await vi.waitFor(() => expect(transport.agent).toHaveBeenCalledTimes(1));
    const signal = transport.agent.mock.calls[0][0].signal;
    controller.abort(); expect(signal?.aborted).toBe(true); await expect(pending).rejects.toThrow();
  });
  it('passes the supported SDK signal to Gemini and rejects a late successful result', async () => {
    let resolveLate!: (value: unknown) => void;
    transport.gemini.mockImplementation(() => new Promise(resolve => { resolveLate = resolve; }));
    const controller = new AbortController();
    const pending = resolveSelectedEngineRoute('gemini', keys)!.callModel('review', { signal: controller.signal });
    await vi.waitFor(() => expect(transport.gemini).toHaveBeenCalledTimes(1));
    const signal = transport.gemini.mock.calls[0][1]?.signal;
    controller.abort();
    resolveLate({ response: { text: () => 'late content' } });
    await expect(pending).rejects.toThrow(); expect(signal?.aborted).toBe(true);
  });
  it('rejects before any submission when already cancelled', async () => {
    const controller = new AbortController(); controller.abort(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    for (const generator of ['openai', 'claude', 'perplexity', 'gemini', 'agent-codex']) {
      const pending = resolveSelectedEngineRoute(generator, keys)!.callModel('review', { signal: controller.signal });
      void pending.catch(() => {});
      expect(fetch).not.toHaveBeenCalled(); expect(transport.agent).not.toHaveBeenCalled(); expect(transport.gemini).not.toHaveBeenCalled();
      await expect(pending).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled(); expect(transport.agent).not.toHaveBeenCalled(); expect(transport.gemini).not.toHaveBeenCalled();
  });
  it('aborts an underlying request at its configured timeout without resubmitting', async () => {
    vi.useFakeTimers(); let actual: AbortSignal | undefined;
    const fetch = vi.fn((_url, options) => { actual = options.signal; return new Promise(() => {}); });
    vi.stubGlobal('fetch', fetch);
    const pending = resolveSelectedEngineRoute('openai', keys)!.callModel('review', { timeoutMs: 1000 });
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1001); expect(actual?.aborted).toBe(true); await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('removes its cancellation listener and deadline after a successful response', async () => {
    vi.useFakeTimers(); const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'reviewed' } }] }) })));
    expect(await resolveSelectedEngineRoute('openai', keys)!.callModel('review', { signal: controller.signal })).toBe('reviewed');
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
  });
});
