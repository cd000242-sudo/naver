// codex CLI runner — headless content generation via the user's ChatGPT subscription.
//
// Verified invocation (clean JSON, no context bloat):
//   codex exec --skip-git-repo-check --ignore-user-config --ignore-rules --ephemeral \
//     --output-schema <schema.json> -o <out.txt> -C <tmpdir>   (prompt on stdin, UTF-8)
//
// --ignore-user-config / --ignore-rules block project/global context injection (token diet),
// --output-schema forces JSON, -o writes only the final message to a file we then read.

import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper.js';
import { classifyExit } from './parse.js';
import { buildCodexSubscriptionEnv } from './subscriptionEnv.js';
import { AgentCliError } from './types.js';

export interface CodexRunOptions {
  schema?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Run `codex exec` for a single prompt and return the final message text.
 * Throws AgentCliError (not_installed / not_logged_in / rate_limited / timeout / ...) on failure.
 */
export async function runCodex(prompt: string, opts: CodexRunOptions = {}): Promise<string> {
  const { schema, model, timeoutMs, signal } = opts;
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
      throw new AgentCliError(
        classifyExit('codex', res.stderr, res.stdout),
        'codex',
        `codex가 비정상 종료했습니다 (code ${res.code}).`,
        (res.stderr || res.stdout || '').slice(0, 800),
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
      throw new AgentCliError('empty_output', 'codex', 'codex가 빈 응답을 반환했습니다.', res.stderr.slice(0, 500));
    }
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
