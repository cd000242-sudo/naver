// claude CLI runner — headless content generation via the user's Claude subscription.
//
// Invocation: claude -p --output-format json   (prompt on stdin, UTF-8)
//   -p / --print            : non-interactive single response
//   --output-format json    : print a JSON envelope ({ result, is_error, ... }) to stdout
//   --dangerously-skip-permissions : never block on a permission prompt (headless safety)
//
// We run in a throwaway temp cwd so CLAUDE.md auto-discovery does not inject project context.
// We do NOT use --bare: it forces ANTHROPIC_API_KEY auth and ignores the subscription OAuth,
// which would defeat the "no API token cost" goal.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper.js';
import { classifyExit, parseClaudeEnvelope } from './parse.js';
import { AgentCliError } from './types.js';

export interface ClaudeRunOptions {
  /** Provided for API symmetry with codex; claude has no --output-schema, so it is unused here. */
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Run `claude -p` for a single prompt and return the final message text.
 * Throws AgentCliError on failure (install / login / rate-limit / timeout / bad output).
 */
export async function runClaude(prompt: string, opts: ClaudeRunOptions = {}): Promise<string> {
  const { model, timeoutMs, signal } = opts;
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-claude-'));

  try {
    const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions'];
    if (model) args.push('--model', model);

    const res = await spawnCollect({
      command: 'claude',
      args,
      provider: 'claude',
      cwd: dir,
      stdin: prompt,
      timeoutMs,
      signal,
    });

    if (res.code !== 0) {
      throw new AgentCliError(
        classifyExit('claude', res.stderr, res.stdout),
        'claude',
        `claude가 비정상 종료했습니다 (code ${res.code}).`,
        (res.stderr || res.stdout || '').slice(0, 800),
      );
    }

    // claude prints the JSON envelope on stdout even on success.
    return parseClaudeEnvelope(res.stdout);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
