export interface OpenAiSearchResponseParamsInput {
  model: string;
  system?: string;
  user: string;
  maxOutputTokens: number;
}

export interface OpenAiResponseUsage {
  inputTokens: number;
  outputTokens: number;
}

export function buildOpenAiSearchResponseParams(
  input: OpenAiSearchResponseParamsInput,
): Record<string, unknown> {
  return {
    model: input.model,
    ...(input.system ? { instructions: input.system } : {}),
    input: input.user,
    tools: [{ type: 'web_search' }],
    max_output_tokens: input.maxOutputTokens,
    reasoning: { effort: 'medium' },
    /*
     * [2026-09-01 라이브 로그] JSON 모드를 함께 보내 400 으로 거절당하고 있었다.
     *
     *   원본 오류: Web Search cannot be used with JSON mode.
     *
     * tools: web_search 와 text.format: json_object 는 같이 못 쓴다.
     * 이 기능은 한 번도 동작한 적이 없다 — 화면에는 선택지로 떠 있었고 고르면 매번 400 이었다.
     *
     * JSON 모드를 뺀다. 프롬프트가 이미 JSON 을 요구하고, 다른 엔진들도 응답 텍스트에서
     * JSON 을 파싱해 쓴다. 구조화 강제를 서버에서 클라이언트로 옮기는 셈이다.
     */
    store: false,
  };
}

export function extractOpenAiResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const envelope = payload as Record<string, unknown>;
  if (typeof envelope.output_text === 'string') return envelope.output_text.trim();
  if (!Array.isArray(envelope.output)) return '';

  const parts: string[] = [];
  for (const item of envelope.output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const record = part as Record<string, unknown>;
      if (record.type === 'output_text' && typeof record.text === 'string') {
        parts.push(record.text);
      }
    }
  }
  return parts.join('\n').trim();
}

export function readOpenAiResponseUsage(payload: unknown): OpenAiResponseUsage {
  const usage = payload && typeof payload === 'object'
    ? (payload as Record<string, any>).usage
    : undefined;
  return {
    inputTokens: Number(usage?.input_tokens || 0),
    outputTokens: Number(usage?.output_tokens || 0),
  };
}
