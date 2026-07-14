import { AgentCliError, type AgentGenerateOptions, type AgentProvider } from './types.js';

const MAX_PROMPT_CHARS = 500_000;
const MAX_SCHEMA_BYTES = 200_000;
const MAX_TIMEOUT_MS = 15 * 60_000;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/;

export function requireAgentProvider(value: unknown): AgentProvider {
  if (value === 'codex' || value === 'claude') return value;
  throw new AgentCliError('spawn_failed', 'codex', `Unsupported agent provider: ${String(value)}`);
}

function normalizePrompt(value: unknown, provider: AgentProvider): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AgentCliError('spawn_failed', provider, 'Agent prompt must not be empty.');
  }
  if (value.length > MAX_PROMPT_CHARS) {
    throw new AgentCliError('spawn_failed', provider, 'Agent prompt is too large.');
  }
  return value;
}

export function normalizeAgentModel(value: unknown, provider: AgentProvider): string | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AgentCliError('spawn_failed', provider, 'Agent model must be a string.');
  }
  const model = value.trim();
  if (!MODEL_ID_PATTERN.test(model)) {
    throw new AgentCliError('spawn_failed', provider, `Invalid agent model ID: ${model.slice(0, 80)}`);
  }
  return model;
}

function normalizeTimeout(value: unknown, provider: AgentProvider): number | undefined {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 1_000 || Number(value) > MAX_TIMEOUT_MS) {
    throw new AgentCliError('spawn_failed', provider, 'Agent timeout must be between 1s and 15m.');
  }
  return Number(value);
}

function normalizeSchema(value: unknown, provider: AgentProvider): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AgentCliError('spawn_failed', provider, 'Agent schema must be a JSON object.');
  }
  let serialized = '';
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new AgentCliError('spawn_failed', provider, 'Agent schema must be serializable JSON.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SCHEMA_BYTES) {
    throw new AgentCliError('spawn_failed', provider, 'Agent schema is too large.');
  }
  return { ...(value as Record<string, unknown>) };
}

export function normalizeAgentGenerateOptions(
  value: Record<string, unknown>,
): AgentGenerateOptions {
  const provider = requireAgentProvider(value?.provider);
  const schema = normalizeSchema(value?.schema, provider);
  const model = normalizeAgentModel(value?.model, provider);
  const timeoutMs = normalizeTimeout(value?.timeoutMs, provider);
  return {
    provider,
    prompt: normalizePrompt(value?.prompt, provider),
    ...(schema ? { schema } : {}),
    ...(model ? { model } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(value?.signal instanceof AbortSignal ? { signal: value.signal } : {}),
  };
}
