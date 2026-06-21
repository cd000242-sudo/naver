// Agent CLI service — public entry point.
//
// Shared by both content paths (contentGenerator + imageNarrative/narrativeBuilder) and by
// the 'agent:generate' IPC handler. Routes a prompt to the user's local codex/claude CLI so
// generation runs inside their subscription quota with zero API token cost.
//
// No silent fallback: a failure throws a typed AgentCliError. Callers decide how to surface it
// (the renderer shows a blocking modal with install/login guidance — never a quiet downgrade).

import { runCodex } from './codexRunner.js';
import { runClaude } from './claudeRunner.js';
import { tryExtractJson } from './parse.js';
import {
  AgentCliError,
  type AgentGenerateOptions,
  type AgentGenerateResult,
  type AgentProvider,
} from './types.js';

export { detectAgent } from './detect.js';
export * from './types.js';

/** True when the value is a provider this service can route to. */
export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'codex' || value === 'claude';
}

/**
 * Generate content through an agent CLI.
 * @throws AgentCliError on missing input, install/login problems, rate limits, timeouts,
 *         or (when a schema is supplied) non-JSON output.
 */
export async function generateWithAgent(opts: AgentGenerateOptions): Promise<AgentGenerateResult> {
  const { provider, prompt, schema, model, timeoutMs, signal } = opts;

  if (!isAgentProvider(provider)) {
    throw new AgentCliError('spawn_failed', 'codex', `지원하지 않는 에이전트 provider입니다: ${String(provider)}`);
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new AgentCliError('spawn_failed', provider, '프롬프트가 비어 있습니다.');
  }

  const started = Date.now();
  const text = provider === 'codex'
    ? await runCodex(prompt, { schema, model, timeoutMs, signal })
    : await runClaude(prompt, { schema, model, timeoutMs, signal });
  const durationMs = Date.now() - started;

  let json: unknown | undefined;
  if (schema) {
    json = tryExtractJson(text);
    if (json === undefined) {
      throw new AgentCliError(
        'bad_json',
        provider,
        '에이전트가 JSON 형식이 아닌 응답을 반환했습니다.',
        text.slice(0, 500),
      );
    }
  }

  return { provider, text, json, durationMs };
}
