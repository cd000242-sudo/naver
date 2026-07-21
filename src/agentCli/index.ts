// Agent CLI service — public entry point.
//
// Shared by both content paths (contentGenerator + imageNarrative/narrativeBuilder) and by
// the 'agent:generate' IPC handler. Routes a prompt to the user's local codex/claude/gemini CLI
// so generation uses the applicable subscription usage pool without a separate API key.
//
// No silent fallback: a failure throws a typed AgentCliError. Callers decide how to surface it
// (the renderer shows a blocking modal with install/login guidance — never a quiet downgrade).

import { runCodex } from './codexRunner.js';
import { runClaude } from './claudeRunner.js';
import { runGemini } from './geminiRunner.js';
import { clearAgentDetectionCache, detectAgent } from './detect.js';
import { tryExtractJson } from './parse.js';
import {
  AgentCliError,
  type AgentGenerateOptions,
  type AgentGenerateResult,
  type AgentProvider,
} from './types.js';
import { normalizeAgentGenerateOptions } from './validation.js';
import {
  assertResolvedContentGeneratorProviderAllowed,
  type AgentProductPolicyContext,
} from './productPolicy.js';
import { buildAgentFailureMessage } from './failureMessage.js';

export { clearAgentDetectionCache, detectAgent } from './detect.js';
export * from './types.js';

/** True when the value is a provider this service can route to. */
export function isAgentProvider(value: unknown): value is AgentProvider {
  return value === 'codex' || value === 'claude' || value === 'gemini';
}

/**
 * Generate content through an agent CLI.
 * @throws AgentCliError on missing input, install/login problems, rate limits, timeouts,
 *         or (when a schema is supplied) non-JSON output.
 */
export async function generateWithAgent(
  opts: AgentGenerateOptions,
  productPolicyContext?: AgentProductPolicyContext,
): Promise<AgentGenerateResult> {
  const normalized = normalizeAgentGenerateOptions(
    opts as unknown as Record<string, unknown>,
  );
  const { provider, prompt, schema, model, timeoutMs, signal } = normalized;

  // Final execution boundary: a new call site cannot silently bypass packaged-app policy.
  assertResolvedContentGeneratorProviderAllowed(
    provider === 'claude' ? 'agent-claude' : provider === 'gemini' ? 'agent-gemini' : 'agent-codex',
    productPolicyContext,
  );

  // Protect every caller, including background flows that never pass through the renderer.
  // UI badges may use the short status cache, but the final execution boundary must observe
  // external logout/auth-route changes before a request can consume subscription or API usage.
  const status = await detectAgent(provider, { forceRefresh: true });
  if (!status.installed) {
    throw new AgentCliError('not_installed', provider, `${provider} CLI가 설치되어 있지 않습니다.`);
  }
  if (!status.loggedIn) {
    throw new AgentCliError('not_logged_in', provider, `${provider} 구독 로그인이 필요합니다.`, status.detail);
  }
  if (!status.available) {
    const code = status.errorCode ?? 'nonzero_exit';
    const message = code === 'subscription_inactive'
      ? `${provider} 구독 인증이 만료되었거나 API 과금 방식으로 로그인되어 있습니다. 구독 계정으로 다시 로그인해주세요.`
      : code === 'rate_limited'
        ? `${provider} 구독 사용 한도가 소진되었습니다. 한도 초기화 후 다시 시도해주세요.`
        : status.detail || `${provider} 에이전트를 현재 사용할 수 없습니다.`;
    throw new AgentCliError(code, provider, message, status.detail);
  }

  const started = Date.now();
  let text = '';
  let json: unknown | undefined;

  // [v2.11.135] bad_json / empty_output / timeout get ONE automatic retry.
  // These are transient output-shape failures, the CLI runs on the user's
  // subscription (a retry costs no API money), and a single flake previously
  // killed the whole post (every agent error was terminal upstream).
  // Auth/quota/spawn errors stay single-shot as before.
  const RETRY_ONCE_CODES = ['bad_json', 'empty_output', 'timeout'];
  for (let attempt = 1; ; attempt++) {
    try {
      text = provider === 'codex'
        ? await runCodex(prompt, { schema, model, timeoutMs, signal })
        : provider === 'gemini'
          ? await runGemini(prompt, { schema, model, timeoutMs, signal })
          : await runClaude(prompt, { schema, model, timeoutMs, signal });

      // Quota is consumed once the CLI answered, even if JSON parsing below
      // fails — record here, not after validation.
      try {
        const { recordAgentCall } = await import('./usageTracker.js');
        recordAgentCall(provider);
      } catch { /* best-effort */ }

      if (schema) {
        json = tryExtractJson(text);
        if (json === undefined) {
          throw new AgentCliError(
            'bad_json',
            provider,
            buildAgentFailureMessage(provider, 'bad_json'),
            text.slice(0, 500),
          );
        }
      }
      break;
    } catch (error) {
      if (error instanceof AgentCliError
          && ['not_logged_in', 'subscription_inactive', 'rate_limited'].includes(error.code)) {
        clearAgentDetectionCache(provider);
      }
      // [v2.11.135] Remember the CLI-reported reset moment so the status card
      // can show when the quota window reopens. Best-effort only.
      if (error instanceof AgentCliError && error.code === 'rate_limited') {
        try {
          const { recordAgentRateLimit } = await import('./usageTracker.js');
          recordAgentRateLimit(provider, `${error.detail ?? ''} ${error.message}`);
        } catch { /* usage visibility must never mask the real error */ }
      }
      const retryable = error instanceof AgentCliError
        && RETRY_ONCE_CODES.includes(error.code)
        && attempt === 1
        && signal?.aborted !== true;
      if (retryable) {
        console.warn(`[AgentCli] ${provider} ${(error as AgentCliError).code} — 구독 CLI 1회 자동 재시도 (추가 과금 없음)`);
        continue;
      }
      throw error;
    }
  }
  const durationMs = Date.now() - started;

  return { provider, text, json, durationMs };
}
