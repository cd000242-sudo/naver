// gemini CLI runner — headless content generation via the user's Google (Antigravity) subscription.
//
// Invocation: gemini --output-format json   (prompt on stdin, UTF-8)
//   --output-format json    : print a JSON envelope ({ response, stats, ... }) to stdout
//   -m <model>               : optional model override (omit to use the CLI default)
//
// gemini has no --output-schema flag, so structured output relies on a prompt instruction
// (same approach as claude). We run in a throwaway temp cwd so any project-level context
// files near the caller's cwd are not auto-discovered.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper.js';
import { classifyExit, parseGeminiEnvelope } from './parse.js';
import { buildGeminiSubscriptionEnv } from './subscriptionEnv.js';
import { AgentCliError } from './types.js';
import { buildAgentFailureMessage } from './failureMessage.js';

export interface GeminiRunOptions {
  /** Provided for API symmetry with codex/claude; gemini has no --output-schema, so it is unused here. */
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Run `gemini` for a single prompt and return the final response text.
 * Throws AgentCliError on failure (install / login / rate-limit / timeout / bad output).
 */
export async function runGemini(prompt: string, opts: GeminiRunOptions = {}): Promise<string> {
  const { model, timeoutMs, signal } = opts;
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-gemini-'));

  try {
    const args = [
      '--output-format', 'json',
    ];
    if (model) args.push('-m', model);

    const res = await spawnCollect({
      command: 'gemini',
      args,
      provider: 'gemini',
      cwd: dir,
      stdin: prompt,
      timeoutMs,
      signal,
      env: buildGeminiSubscriptionEnv(),
    });

    if (res.code !== 0) {
      const code = classifyExit('gemini', res.stderr, res.stdout);
      throw new AgentCliError(
        code,
        'gemini',
        buildAgentFailureMessage('gemini', code, res.stderr || res.stdout),
        (res.stderr || res.stdout || '').slice(0, 800),
      );
    }

    // gemini prints the JSON envelope on stdout even on success.
    return parseGeminiEnvelope(res.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
