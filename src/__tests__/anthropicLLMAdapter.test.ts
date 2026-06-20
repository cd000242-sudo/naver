/**
 * SPEC-CONVERSION-001 — anthropicLLMAdapter 단위 테스트.
 * Mock messagesAPI로 sampling strip · streaming 임계 · 에러 전파 검증.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createAnthropicLLMAdapter,
  type AnthropicMessagesAPI,
  type AnthropicMessageResponse,
} from '../content/llmAdapters/anthropicLLMAdapter';

function makeResponse(text: string, usage?: AnthropicMessageResponse['usage']): AnthropicMessageResponse {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage,
  };
}

function createMock(response: AnthropicMessageResponse): AnthropicMessagesAPI & {
  createMock: any;
  streamMock: any;
} {
  const createMock = vi.fn(async () => response);
  const finalMessageMock = vi.fn(async () => response);
  const streamMock = vi.fn(() => ({ finalMessage: finalMessageMock }));
  return {
    create: createMock as any,
    stream: streamMock as any,
    createMock,
    streamMock,
  };
}

describe('createAnthropicLLMAdapter — 정상 흐름', () => {
  it('기본 모델 claude-opus-4-8 + adaptive thinking + sampling strip', async () => {
    const api = createMock(makeResponse('hello'));
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    expect(adapter.type).toBe('anthropic');
    expect(adapter.defaultModel).toBe('claude-opus-4-8');

    const r = await adapter.complete('test prompt', { temperature: 0.7 });
    expect(r).toBe('hello');
    expect(api.createMock).toHaveBeenCalledTimes(1);
    const params = api.createMock.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-4-8');
    expect(params.thinking).toEqual({ type: 'adaptive' });
    // Opus 4.8은 temperature strip
    expect(params.temperature).toBeUndefined();
    expect(params.messages[0]).toEqual({ role: 'user', content: 'test prompt' });
  });

  it('Opus 4.6는 temperature 유지', async () => {
    const api = createMock(makeResponse('ok'));
    const adapter = createAnthropicLLMAdapter({
      messagesAPI: api,
      defaultModel: 'claude-opus-4-6',
    });
    await adapter.complete('test', { temperature: 0.5 });
    const params = api.createMock.mock.calls[0][0];
    expect(params.temperature).toBe(0.5);
    expect(params.thinking).toEqual({ type: 'adaptive' });
  });

  it('thinkingDisplay=summarized 설정 반영', async () => {
    const api = createMock(makeResponse('ok'));
    const adapter = createAnthropicLLMAdapter({
      messagesAPI: api,
      thinkingDisplay: 'summarized',
    });
    await adapter.complete('test');
    const params = api.createMock.mock.calls[0][0];
    expect(params.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  it('enableAdaptiveThinking=false 시 thinking 미주입', async () => {
    const api = createMock(makeResponse('ok'));
    const adapter = createAnthropicLLMAdapter({
      messagesAPI: api,
      enableAdaptiveThinking: false,
    });
    await adapter.complete('test');
    const params = api.createMock.mock.calls[0][0];
    expect(params.thinking).toBeUndefined();
  });

  it('options.model로 호출 단위 모델 override', async () => {
    const api = createMock(makeResponse('ok'));
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    await adapter.complete('test', { model: 'claude-haiku-4-5' });
    const params = api.createMock.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-4-5');
  });

  it('stats 누적 (input/output/cache_read 토큰)', async () => {
    const api = createMock(
      makeResponse('ok', { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 30 }),
    );
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    await adapter.complete('test1');
    await adapter.complete('test2');
    const s = adapter.stats();
    expect(s.totalCalls).toBe(2);
    expect(s.cumulativeInputTokens).toBe(200);
    expect(s.cumulativeOutputTokens).toBe(100);
    expect(s.cacheReadTokens).toBe(60);
    expect(s.streamingCalls).toBe(0);
  });
});

describe('createAnthropicLLMAdapter — streaming 임계', () => {
  it('max_tokens > 16,000 시 stream 사용 + finalMessage 호출', async () => {
    const api = createMock(makeResponse('long response'));
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    await adapter.complete('test', { maxTokens: 32_000 });
    expect(api.createMock).not.toHaveBeenCalled();
    expect(api.streamMock).toHaveBeenCalledTimes(1);
    expect(adapter.stats().streamingCalls).toBe(1);
  });

  it('max_tokens ≤ 16,000은 create 사용', async () => {
    const api = createMock(makeResponse('ok'));
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    await adapter.complete('test', { maxTokens: 16_000 });
    expect(api.createMock).toHaveBeenCalledTimes(1);
    expect(api.streamMock).not.toHaveBeenCalled();
  });

  it('stream 메서드 없는 API에서 큰 max_tokens는 명시 throw', async () => {
    const noStream: AnthropicMessagesAPI = {
      create: vi.fn(async () => makeResponse('ok')) as any,
    };
    const adapter = createAnthropicLLMAdapter({ messagesAPI: noStream });
    await expect(adapter.complete('test', { maxTokens: 32_000 })).rejects.toThrow(
      /STREAM_NOT_SUPPORTED/,
    );
  });
});

describe('createAnthropicLLMAdapter — fallback (silent 폴백 X)', () => {
  it('빈 prompt는 명시 throw', async () => {
    const api = createMock(makeResponse('ok'));
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    await expect(adapter.complete('')).rejects.toThrow(/PROMPT_EMPTY/);
    await expect(adapter.complete('   ')).rejects.toThrow(/PROMPT_EMPTY/);
  });

  it('messagesAPI 미주입은 throw', () => {
    expect(() => createAnthropicLLMAdapter({ messagesAPI: null as any })).toThrow(
      /MESSAGES_API_REQUIRED/,
    );
  });

  it('API 실패는 ANTHROPIC_API_FAILED로 wrapping', async () => {
    const failing: AnthropicMessagesAPI = {
      create: vi.fn(async () => {
        throw new Error('rate_limit');
      }) as any,
    };
    const adapter = createAnthropicLLMAdapter({ messagesAPI: failing });
    await expect(adapter.complete('test')).rejects.toThrow(/ANTHROPIC_API_FAILED.*rate_limit/);
  });

  it('text 블록 없는 응답은 EMPTY_RESPONSE throw', async () => {
    const api: AnthropicMessagesAPI = {
      create: vi.fn(async () => ({
        content: [{ type: 'thinking', text: 'internal' }],
        stop_reason: 'end_turn',
      })) as any,
    };
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    await expect(adapter.complete('test')).rejects.toThrow(/EMPTY_RESPONSE/);
  });
});

describe('LLMProvider 인터페이스 호환', () => {
  it('draftWriter·editorLayer 등 LLMProvider 사용처에 그대로 주입 가능', async () => {
    const api = createMock(makeResponse('a'.repeat(1500)));
    const adapter = createAnthropicLLMAdapter({ messagesAPI: api });
    // LLMProvider 인터페이스는 complete만 요구
    expect(typeof adapter.complete).toBe('function');
    const r = await adapter.complete('any');
    expect(typeof r).toBe('string');
  });
});
