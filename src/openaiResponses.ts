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
    reasoning: { effort: 'high' },
    text: { format: { type: 'json_object' } },
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
