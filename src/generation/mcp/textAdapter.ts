import type { GenerationRoute } from '../routeSnapshot.js';
import type { McpRuntimeManager } from './runtime.js';

export type McpTextGenerationErrorCode =
  | 'MCP_TEXT_ROUTE_INVALID'
  | 'MCP_TEXT_PROMPT_INVALID'
  | 'MCP_TEXT_RESULT_EMPTY';

const ERROR_MESSAGES: Readonly<Record<McpTextGenerationErrorCode, string>> = Object.freeze({
  MCP_TEXT_ROUTE_INVALID: '선택한 MCP 글 생성 경로가 올바르지 않습니다. 다른 경로로 자동 전환하지 않습니다.',
  MCP_TEXT_PROMPT_INVALID: 'MCP에 전달할 글 생성 프롬프트가 비어 있거나 너무 큽니다.',
  MCP_TEXT_RESULT_EMPTY: '선택한 MCP 글 생성 도구가 본문을 반환하지 않았습니다. 다른 경로로 자동 전환하지 않습니다.',
});

export class McpTextGenerationError extends Error {
  readonly code: McpTextGenerationErrorCode;

  constructor(code: McpTextGenerationErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'McpTextGenerationError';
    this.code = code;
  }
}

export interface GenerateTextWithMcpInput {
  readonly runtime: McpRuntimeManager;
  readonly route: GenerationRoute;
  /** The already-finalized prompt. It is passed through byte-for-byte. */
  readonly prompt: string;
  readonly mode: string;
  readonly minimumBodyCharacters: number;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

function assertTextRoute(route: GenerationRoute): void {
  if (!route
    || route.mode !== 'mcp'
    || route.capability !== 'text.generate'
    || !route.routeId
    || !route.connectorId
    || !route.toolOrModelId) {
    throw new McpTextGenerationError('MCP_TEXT_ROUTE_INVALID');
  }
}

function assertPrompt(prompt: string): void {
  if (typeof prompt !== 'string'
    || !prompt.trim()
    || Buffer.byteLength(prompt, 'utf8') > 2 * 1024 * 1024) {
    throw new McpTextGenerationError('MCP_TEXT_PROMPT_INVALID');
  }
}

/**
 * Sends one finalized app prompt to one explicitly selected MCP tool.
 * There is deliberately no provider retry or alternate-route lookup here.
 */
export async function generateTextWithMcp(input: GenerateTextWithMcpInput): Promise<string> {
  assertTextRoute(input.route);
  assertPrompt(input.prompt);

  const result = await input.runtime.invokeRoute(
    input.route,
    {
      arguments: {
        prompt: input.prompt,
        responseFormat: 'structured-content-json',
        contentMode: input.mode,
        minimumBodyCharacters: input.minimumBodyCharacters,
      },
    },
    {
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    },
  );

  if (result.structuredContent) {
    return JSON.stringify(result.structuredContent);
  }

  const text = result.text.join('\n').trim();
  if (!text) throw new McpTextGenerationError('MCP_TEXT_RESULT_EMPTY');
  return text;
}
