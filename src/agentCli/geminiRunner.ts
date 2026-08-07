// agy (Antigravity CLI) runner — headless content generation via the user's Antigravity subscription.
//
// [v2.11.145] Migrated off `gemini` (@google/gemini-cli). Google stopped serving Gemini CLI
// requests for individual accounts on 2026-06-18, so every call failed with
// "IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals".
// agy authenticates the same Google account through the OS keyring instead.
//
// Invocation: agy --print-timeout <n>s   (prompt on stdin, UTF-8)
//   - stdin is a pipe (non-TTY) here, so agy runs in print mode and writes the answer to stdout.
//     Verified against agy 1.1.5: a piped prompt works without -p/--print.
//   - There is NO JSON-envelope flag (agy 1.1.5 --help). stdout IS the answer, so the envelope
//     parsing step that gemini needed no longer exists.
//   - --print-timeout defaults to 5m, SHORTER than the app's 6m agent deadline. Left implicit,
//     agy would cut long posts off before the caller's own timeout ever fired.
//   - --model replaces gemini's -m.
//
// Measured on agy 1.1.5 with the app's real 13,193-char prompt: exit 0, 52.4s, 4,291 chars of
// clean JSON on stdout, empty stderr.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper.js';
import { classifyExit } from './parse.js';
import { buildGeminiSubscriptionEnv } from './subscriptionEnv.js';
import { agentCommandName } from './commandName.js';
import { AgentCliError } from './types.js';
import { buildAgentFailureMessage } from './failureMessage.js';

/** Let agy report its own timeout before spawnCollect SIGKILLs it. */
const PRINT_TIMEOUT_MARGIN_MS = 5_000;
const MIN_PRINT_TIMEOUT_SEC = 30;

export interface GeminiRunOptions {
  /** Provided for API symmetry with codex; agy has no output-schema flag, so it is unused here. */
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function printTimeoutArgs(timeoutMs?: number): string[] {
  if (!timeoutMs || timeoutMs <= 0) return []; // no caller deadline → keep agy's own default
  const seconds = Math.max(
    MIN_PRINT_TIMEOUT_SEC,
    Math.ceil((timeoutMs - PRINT_TIMEOUT_MARGIN_MS) / 1000),
  );
  return ['--print-timeout', `${seconds}s`];
}

/**
 * Run `agy` for a single prompt and return the final response text.
 * Throws AgentCliError on failure (install / login / rate-limit / timeout / empty output).
 */
export async function runGemini(prompt: string, opts: GeminiRunOptions = {}): Promise<string> {
  const { model, timeoutMs, signal } = opts;
  // Throwaway cwd so project context files near the caller's cwd are not auto-discovered.
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-gemini-'));

  try {
    const args = [...printTimeoutArgs(timeoutMs)];
    if (model) args.push('--model', model);

    const res = await spawnCollect({
      command: agentCommandName('gemini'),
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

    const text = (res.stdout ?? '').trim();
    if (!text) {
      throw new AgentCliError(
        'empty_output',
        'gemini',
        buildAgentFailureMessage('gemini', 'empty_output', res.stderr),
        (res.stderr || '').slice(0, 800),
      );
    }
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
