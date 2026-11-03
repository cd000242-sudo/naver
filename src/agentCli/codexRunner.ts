// codex CLI runner — headless content generation via the user's ChatGPT subscription.
//
// Verified invocation (clean JSON, no context bloat):
//   codex exec --skip-git-repo-check --ignore-user-config --ignore-rules --ephemeral \
//     -m <model> -c model_reasoning_effort=<low|medium> \
//     --output-schema <schema.json> -o <out.txt> -C <tmpdir>   (prompt on stdin, UTF-8)
//
// --ignore-user-config / --ignore-rules block project/global context injection (token diet),
// --output-schema forces JSON, -o writes only the final message to a file we then read.
//
// Because --ignore-user-config skips ~/.codex/config.toml, the user's own model / reasoning effort
// there are NOT applied to app runs. The app therefore names both itself (agentModelDefaults, by tier):
// verified 2026-11-03 that the exec header shows "model: gpt-6.1-terra / reasoning effort: low|medium"
// for `-m ... -c model_reasoning_effort=...`.

import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper.js';
import { classifyExit } from './parse.js';
import { buildCodexSubscriptionEnv } from './subscriptionEnv.js';
import { stageImagesInDir } from './imageStaging.js';
import { AgentCliError } from './types.js';
import { buildAgentFailureMessage, buildModelUnavailableMessage } from './failureMessage.js';
import { resolveAgentRunProfile, type AgentTier } from './agentModelDefaults.js';

export interface CodexRunOptions {
  schema?: Record<string, unknown>;
  /** A named model wins; without one the tier's app default (agentModelDefaults) is used. */
  model?: string;
  /** 'main' (default) = long generation, 'light' = short helper call. Sets the reasoning effort. */
  tier?: AgentTier;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * [2026-08-16 photo mode] Images staged into the run cwd as photo-01.<ext> …
   * and passed natively via `codex exec -i <file>` (verified codex-cli 0.142.2:
   * prompt must arrive on stdin — a positional prompt is swallowed by the
   * variadic -i flag).
   */
  imagePaths?: string[];
}

/** Codex echoes the prompt on stderr before its ERROR line, so the useful part is the tail. */
function failureTail(text: string): string {
  return text.length > 800 ? text.slice(-800) : text;
}

/**
 * Run `codex exec` for a single prompt and return the final message text.
 * Throws AgentCliError (not_installed / not_logged_in / rate_limited / timeout / ...) on failure.
 * A model the subscription refuses surfaces as 'model_unavailable' — another model is never tried.
 */
export async function runCodex(prompt: string, opts: CodexRunOptions = {}): Promise<string> {
  const { schema, timeoutMs, signal, imagePaths } = opts;
  const { model, effort } = resolveAgentRunProfile('codex', { model: opts.model, tier: opts.tier });
  const dir = await mkdtemp(join(tmpdir(), 'agentcli-codex-'));
  const outPath = join(dir, 'out.txt');

  try {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '--ignore-rules',
      '--ephemeral',
      '--color', 'never',
      '-o', outPath,
      '-C', dir,
    ];
    if (model) args.push('-m', model);
    if (effort) args.push('-c', `model_reasoning_effort=${effort}`);

    if (imagePaths && imagePaths.length > 0) {
      const staged = await stageImagesInDir(dir, imagePaths);
      for (const name of staged) {
        args.push('-i', join(dir, name));
      }
    }

    if (schema) {
      const schemaPath = join(dir, 'schema.json');
      await writeFile(schemaPath, JSON.stringify(schema), 'utf8');
      args.push('--output-schema', schemaPath);
    }

    const res = await spawnCollect({
      command: 'codex',
      args,
      provider: 'codex',
      cwd: dir,
      stdin: prompt,
      timeoutMs,
      signal,
      env: buildCodexSubscriptionEnv(),
    });

    if (res.code !== 0) {
      const code = classifyExit('codex', res.stderr, res.stdout);
      const detail = failureTail(res.stderr || res.stdout || '');
      throw new AgentCliError(
        code,
        'codex',
        code === 'model_unavailable'
          ? buildModelUnavailableMessage('codex', model, detail)
          : buildAgentFailureMessage('codex', code, detail),
        detail,
      );
    }

    let text = '';
    try {
      text = (await readFile(outPath, 'utf8')).trim();
    } catch {
      // -o file missing means codex produced no final message
      text = '';
    }
    if (!text) {
      // An exit-0 run can still end on a refusal or a spent quota; say so instead of "empty output".
      const code = classifyExit('codex', res.stderr, '');
      const detail = failureTail(res.stderr || '');
      if (code === 'rate_limited' || code === 'model_unavailable') {
        throw new AgentCliError(
          code,
          'codex',
          code === 'model_unavailable'
            ? buildModelUnavailableMessage('codex', model, detail)
            : buildAgentFailureMessage('codex', code, detail),
          detail,
        );
      }
      throw new AgentCliError(
        'empty_output',
        'codex',
        buildAgentFailureMessage('codex', 'empty_output', res.stderr),
        res.stderr.slice(0, 500),
      );
    }
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
