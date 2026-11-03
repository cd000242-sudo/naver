// claude CLI runner — headless content generation via the user's Claude subscription.
//
// Invocation: claude -p --output-format json   (prompt on stdin, UTF-8)
//   -p / --print            : non-interactive single response
//   --output-format json    : print a JSON envelope ({ result, is_error, ... }) to stdout
//   --permission-mode default : answer the prompt directly.
//
// NOT 'plan'. Measured 2026-08-08 with the real article prompt: in plan mode the CLI replies
// with a plan ("실제 최종 JSON 산출물은 계획 승인 후 별도 턴에서 작성") and never emits the
// JSON, so every claude generation failed while codex (which runs `exec`) worked. It exits 0
// with is_error:false, so it surfaced as "글생성이 안 된다" rather than an error.
//   plan        -> 143 chars, JSON parse FAILED
//   default     -> 2,885 chars, 5 headings, JSON OK
// Permission prompts cannot appear here anyway: -p is headless and --disallowedTools '*'
// blocks every tool. 'default' is passed explicitly so a change to the CLI's own default
// cannot silently put us back in a non-answering mode.
//
// We run in a throwaway temp cwd so CLAUDE.md auto-discovery does not inject project context.
// We do NOT use --bare: it forces ANTHROPIC_API_KEY auth and ignores the subscription OAuth,
// which would defeat the "no API token cost" goal.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper.js';
import { classifyExit, extractClaudeEnvelopeError, parseClaudeEnvelope } from './parse.js';
import {
  buildClaudeSubscriptionEnv,
  CLAUDE_SUBSCRIPTION_ISOLATION_ARGS,
  CLAUDE_SUBSCRIPTION_IMAGE_READ_ARGS,
} from './subscriptionEnv.js';
import { stageImagesInDir } from './imageStaging.js';
import { AgentCliError } from './types.js';
import { buildAgentFailureMessage, buildModelUnavailableMessage } from './failureMessage.js';
import { resolveAgentRunProfile, type AgentTier } from './agentModelDefaults.js';

export interface ClaudeRunOptions {
  /** Provided for API symmetry with codex; claude has no --output-schema, so it is unused here. */
  schema?: Record<string, unknown>;
  /** A named model wins; without one the app default (agentModelDefaults) is used. */
  model?: string;
  /** Both tiers use the same Sonnet model today; accepted so callers can say what the call is. */
  tier?: AgentTier;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * [2026-08-16 photo mode] Image files to stage into the run cwd as
   * photo-01.<ext> … (input order). When present, the wildcard tool ban is
   * swapped for the Read-only allowlist so the model can actually view them.
   * The prompt should reference the staged names (stagedImageName()).
   */
  imagePaths?: string[];
}

/**
 * Run `claude -p` for a single prompt and return the final message text.
 * Throws AgentCliError on failure (install / login / rate-limit / timeout / bad output).
 * A model the subscription refuses surfaces as 'model_unavailable' — another model is never tried.
 */
export async function runClaude(prompt: string, opts: ClaudeRunOptions = {}): Promise<string> {
  const { timeoutMs, signal, imagePaths } = opts;
  const { model } = resolveAgentRunProfile('claude', { model: opts.model, tier: opts.tier });
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-claude-'));

  try {
    const withImages = !!imagePaths && imagePaths.length > 0;
    if (withImages) {
      await stageImagesInDir(dir, imagePaths);
    }
    const args = [
      '-p',
      '--output-format', 'json',
      '--permission-mode', 'default',
      ...(withImages ? CLAUDE_SUBSCRIPTION_IMAGE_READ_ARGS : CLAUDE_SUBSCRIPTION_ISOLATION_ARGS),
    ];
    if (model) args.push('--model', model);

    const res = await spawnCollect({
      command: 'claude',
      args,
      provider: 'claude',
      cwd: dir,
      stdin: prompt,
      timeoutMs,
      signal,
      env: buildClaudeSubscriptionEnv(),
    });

    if (res.code !== 0) {
      // [2026-09-22] Prefer the envelope's own error text ("API Error: 529 Overloaded…") over the
      // raw JSON blob — the blob truncates to usage/cost fields and hid the real cause.
      const envelopeError = extractClaudeEnvelopeError(res.stdout);
      const detail = envelopeError || res.stderr || res.stdout || '';
      const code = classifyExit('claude', res.stderr, envelopeError || res.stdout);
      throw new AgentCliError(
        code,
        'claude',
        code === 'model_unavailable'
          ? buildModelUnavailableMessage('claude', model, detail)
          : buildAgentFailureMessage('claude', code, detail),
        detail.slice(0, 800),
      );
    }

    // claude prints the JSON envelope on stdout even on success.
    try {
      return parseClaudeEnvelope(res.stdout);
    } catch (error) {
      // An exit-0 envelope can still carry the refusal (is_error:true).
      if (error instanceof AgentCliError && error.code === 'model_unavailable') {
        throw new AgentCliError('model_unavailable', 'claude', buildModelUnavailableMessage('claude', model, error.message), error.message.slice(0, 800));
      }
      throw error;
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
