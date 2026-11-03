// src/image/codex/codexImageSession.ts
// One `codex exec` run that draws N images through the image_gen tool of the user's ChatGPT subscription.
//   codex exec --skip-git-repo-check --ignore-user-config -m gpt-6-luna -c model_reasoning_effort=low --json -C <tmp>
//   (instruction on stdin — `-i` is variadic and swallows a positional prompt, see codexRunner)
// The files appear in <CODEX_HOME>/generated_images/<thread id>/; the thread id comes from the `thread.started` event.
// Reuses the agentCli spawn path, subscription env, exit classifier and failure messages — no spawn path of its own.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect, type SpawnArgs, type SpawnResult } from '../../agentCli/spawnHelper.js';
import { classifyExit } from '../../agentCli/parse.js';
import { buildCodexSubscriptionEnv } from '../../agentCli/subscriptionEnv.js';
import { AgentCliError, type AgentErrorCode } from '../../agentCli/types.js';
import { buildAgentFailureMessage, buildModelUnavailableMessage } from '../../agentCli/failureMessage.js';
import { resolveAgentImageProfile } from '../../agentCli/agentModelDefaults.js';
import { buildCodexImageInstruction } from './codexImageInstruction.js';
import { extractCodexErrorText, listGeneratedImages, parseCodexThreadId, resolveCodexHome } from './codexImageFiles.js';

export interface CodexImageSessionDeps {
  spawn(args: SpawnArgs): Promise<SpawnResult>;
  env(): NodeJS.ProcessEnv;
  now(): number;
}

export interface CodexImageSessionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** A named model wins over the app's image default (agentModelDefaults). */
  model?: string;
}

export interface CodexImageSessionResult {
  threadId: string;
  /** Absolute paths, in the order the tool drew them. */
  files: string[];
}

const defaultDeps: CodexImageSessionDeps = {
  spawn: spawnCollect,
  env: () => buildCodexSubscriptionEnv(),
  now: () => Date.now(),
};

// Clock skew between this process and the file system timestamps.
const FILE_TIME_SLACK_MS = 2_000;

function tail(text: string): string {
  return text.length > 800 ? text.slice(-800) : text;
}

function failure(code: AgentErrorCode, detail: string, model: string | undefined): AgentCliError {
  const message = code === 'model_unavailable'
    ? buildModelUnavailableMessage('codex', model, detail)
    : buildAgentFailureMessage('codex', code, detail);
  return new AgentCliError(code, 'codex', message, detail);
}

export async function runCodexImageSession(
  prompts: readonly string[],
  options: CodexImageSessionOptions = {},
  deps: CodexImageSessionDeps = defaultDeps,
): Promise<CodexImageSessionResult> {
  const { model, effort } = resolveAgentImageProfile('codex', options.model);
  const instruction = buildCodexImageInstruction(prompts);
  const env = deps.env();
  const startedAt = deps.now();
  const cwd = await mkdtemp(join(tmpdir(), 'agentcli-codex-image-'));
  try {
    const args = ['exec', '--skip-git-repo-check', '--ignore-user-config', '-m', model];
    if (effort) args.push('-c', `model_reasoning_effort=${effort}`);
    args.push('--json', '-C', cwd);

    const res = await deps.spawn({
      command: 'codex', args, provider: 'codex', cwd, stdin: instruction,
      timeoutMs: options.timeoutMs, signal: options.signal, env,
    });
    const errorText = extractCodexErrorText(res.stdout);
    if (res.code !== 0) {
      const detail = tail(res.stderr || errorText || res.stdout || '');
      throw failure(classifyExit('codex', res.stderr, errorText || res.stdout), detail, model);
    }

    const threadId = parseCodexThreadId(res.stdout);
    const files = threadId
      ? await listGeneratedImages(join(resolveCodexHome(env), 'generated_images', threadId), startedAt - FILE_TIME_SLACK_MS)
      : [];
    if (files.length === 0 && errorText) {
      throw failure(classifyExit('codex', res.stderr, errorText), tail(errorText), model);
    }
    if (!threadId) {
      throw new AgentCliError(
        'empty_output', 'codex',
        'Codex 구독 이미지: 실행 결과에서 thread id 를 읽지 못해 이미지 폴더를 찾을 수 없습니다. 다른 이미지 엔진으로 바꾸지 않았고 같은 요청은 다시 보내지 않았습니다.',
        tail(res.stdout),
      );
    }
    return { threadId, files };
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
