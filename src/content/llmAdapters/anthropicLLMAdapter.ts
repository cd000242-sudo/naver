/**
 * SPEC-CONVERSION-001 — Anthropic SDK → LLMProvider 어댑터
 *
 * chainedDraftRunner / draftWriter / conversionOptimizer / editorLayer가 사용하는
 * LLMProvider 인터페이스를 Anthropic SDK 호출로 충족.
 *
 * 적용 best practice (claude-api skill):
 *   - 기본 모델: claude-opus-4-7
 *   - thinking: adaptive (Opus 4.7 표준)
 *   - sampling 파라미터(temperature/top_p/top_k) 자동 strip — Opus 4.7에서 400 방지
 *   - max_tokens > 16,000 시 streaming + finalMessage() 자동 사용 (timeout 회피)
 *   - 4xx 에러 → 명시 throw, 5xx/429 → SDK 자동 재시도
 *
 * DI 패턴: client 인스턴스 또는 messages.create 함수를 주입 — 단위 테스트 mock 용이.
 *
 * 메모리 [silent 폴백 금지]: API 실패는 명시 throw.
 * 메모리 [추정 효과 금지]: 모델 성능 약속 X.
 *
 * 파일 한도 250줄 준수.
 */

import type { LLMProvider, LLMCompleteOptions } from '../draftWriter';

const DEFAULT_MODEL = 'claude-opus-4-7';
const DEFAULT_MAX_TOKENS = 16_000;
const STREAM_THRESHOLD = 16_000;

// Opus 4.7에서 sampling 파라미터 제거 필요. 4.6 이하는 허용.
function isOpus47(model: string): boolean {
  return model.startsWith('claude-opus-4-7');
}

export interface AnthropicMessageBlock {
  readonly type: string;
  readonly text?: string;
}

export interface AnthropicMessageResponse {
  readonly content: readonly AnthropicMessageBlock[];
  readonly stop_reason?: string;
  readonly usage?: {
    readonly input_tokens?: number;
    readonly output_tokens?: number;
    readonly cache_read_input_tokens?: number;
    readonly cache_creation_input_tokens?: number;
  };
}

/** create / stream 메서드만 만족하면 됨 — 실 SDK Anthropic 클래스 또는 mock 가능 */
export interface AnthropicMessagesAPI {
  create(params: Record<string, unknown>): Promise<AnthropicMessageResponse>;
  stream?(params: Record<string, unknown>): AnthropicStreamLike;
}

export interface AnthropicStreamLike {
  finalMessage(): Promise<AnthropicMessageResponse>;
}

export interface AnthropicLLMAdapterConfig {
  readonly messagesAPI: AnthropicMessagesAPI;
  readonly defaultModel?: string;
  readonly defaultMaxTokens?: number;
  readonly enableAdaptiveThinking?: boolean;     // 기본 true (Opus 4.7 권장)
  readonly thinkingDisplay?: 'omitted' | 'summarized'; // 기본 'omitted' (4.7 기본값)
}

export interface AnthropicLLMAdapterStats {
  readonly totalCalls: number;
  readonly streamingCalls: number;
  readonly cumulativeInputTokens: number;
  readonly cumulativeOutputTokens: number;
  readonly cacheReadTokens: number;
}

interface MutableStats {
  totalCalls: number;
  streamingCalls: number;
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cacheReadTokens: number;
}

export interface AnthropicLLMAdapter extends LLMProvider {
  readonly type: 'anthropic';
  readonly defaultModel: string;
  stats(): AnthropicLLMAdapterStats;
}

function extractText(response: AnthropicMessageResponse): string {
  const text = (response.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (!text) {
    throw new Error(
      `ANTHROPIC_EMPTY_RESPONSE: stop_reason=${response.stop_reason ?? 'unknown'} — text 블록 없음`,
    );
  }
  return text;
}

function buildMessageParams(
  prompt: string,
  options: LLMCompleteOptions | undefined,
  config: AnthropicLLMAdapterConfig,
): { params: Record<string, unknown>; useStreaming: boolean; model: string } {
  if (!prompt || !prompt.trim()) {
    throw new Error('ANTHROPIC_PROMPT_EMPTY');
  }
  const model = options?.model ?? config.defaultModel ?? DEFAULT_MODEL;
  const maxTokens = Math.max(1, options?.maxTokens ?? config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS);

  const params: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  // Opus 4.7는 sampling 파라미터 받지 않음 — 명시 strip
  if (!isOpus47(model) && typeof options?.temperature === 'number') {
    params.temperature = options.temperature;
  }

  if (config.enableAdaptiveThinking !== false) {
    const thinking: Record<string, unknown> = { type: 'adaptive' };
    if (config.thinkingDisplay) thinking.display = config.thinkingDisplay;
    params.thinking = thinking;
  }

  const useStreaming = maxTokens > STREAM_THRESHOLD;
  return { params, useStreaming, model };
}

export function createAnthropicLLMAdapter(
  config: AnthropicLLMAdapterConfig,
): AnthropicLLMAdapter {
  if (!config.messagesAPI) throw new Error('ANTHROPIC_MESSAGES_API_REQUIRED');
  const stats: MutableStats = {
    totalCalls: 0,
    streamingCalls: 0,
    cumulativeInputTokens: 0,
    cumulativeOutputTokens: 0,
    cacheReadTokens: 0,
  };

  const accumulate = (response: AnthropicMessageResponse): void => {
    const u = response.usage;
    if (!u) return;
    stats.cumulativeInputTokens += u.input_tokens ?? 0;
    stats.cumulativeOutputTokens += u.output_tokens ?? 0;
    stats.cacheReadTokens += u.cache_read_input_tokens ?? 0;
  };

  const complete = async (prompt: string, options?: LLMCompleteOptions): Promise<string> => {
    const { params, useStreaming } = buildMessageParams(prompt, options, config);
    stats.totalCalls++;
    let response: AnthropicMessageResponse;
    try {
      if (useStreaming) {
        if (typeof config.messagesAPI.stream !== 'function') {
          throw new Error('ANTHROPIC_STREAM_NOT_SUPPORTED: max_tokens 16K 초과 시 stream 메서드 필요');
        }
        stats.streamingCalls++;
        const s = config.messagesAPI.stream(params);
        response = await s.finalMessage();
      } else {
        response = await config.messagesAPI.create(params);
      }
    } catch (err) {
      throw new Error(`ANTHROPIC_API_FAILED: ${(err as Error)?.message ?? 'unknown'}`);
    }
    accumulate(response);
    return extractText(response);
  };

  return {
    type: 'anthropic' as const,
    defaultModel: config.defaultModel ?? DEFAULT_MODEL,
    complete,
    stats: () => ({ ...stats }),
  };
}
