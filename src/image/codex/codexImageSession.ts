// src/image/codex/codexImageSession.ts
// One `codex exec` run that draws N images through the image_gen tool of the user's ChatGPT subscription.
//   codex exec --skip-git-repo-check --ignore-user-config -m gpt-6-luna -c model_reasoning_effort=low --json -C <tmp>
//   (instruction on stdin — `-i` is variadic and swallows a positional prompt, see codexRunner)
// The files appear in <CODEX_HOME>/generated_images/<thread id>/; the thread id comes from the `thread.started` event.
// Reuses the agentCli spawn path, subscription env, exit classifier and failure messages — no spawn path of its own.

import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect, type SpawnArgs, type SpawnResult } from '../../agentCli/spawnHelper.js';
import { classifyExit } from '../../agentCli/parse.js';
import { buildCodexSubscriptionEnv } from '../../agentCli/subscriptionEnv.js';
import { AgentCliError, type AgentErrorCode } from '../../agentCli/types.js';
import { buildAgentFailureMessage, buildModelUnavailableMessage } from '../../agentCli/failureMessage.js';
import { resolveAgentImageProfile } from '../../agentCli/agentModelDefaults.js';
import { buildCodexImageInstruction, CODEX_MAX_REFERENCES } from './codexImageInstruction.js';
import { extractCodexErrorText, listGeneratedImages, parseCodexThreadId, resolveCodexHome } from './codexImageFiles.js';

export interface CodexImageSessionDeps {
  spawn(args: SpawnArgs): Promise<SpawnResult>;
  env(): NodeJS.ProcessEnv;
  now(): number;
}

export interface CodexSessionReferenceFile {
  buffer: Buffer;
  fileName: string;
}

export interface CodexImageSessionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** A named model wins over the app's image default (agentModelDefaults). */
  model?: string;
  /**
   * [2026-11-05] Shopping product photo. Written into this session's work folder (removed with it) and passed to the
   * image tool as its reference. Only a one-image session can carry it.
   */
  referenceImage?: CodexSessionReferenceFile;
  /**
   * [2026-11-11] The user's reference photos (1 to 3, file names reference-01.png ... in order). Same rules as
   * referenceImage; one photo behaves exactly like referenceImage. Not combinable with referenceImage.
   */
  referenceImages?: readonly CodexSessionReferenceFile[];
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

/** The reference files of this session, checked before any work folder exists. */
function collectReferences(options: CodexImageSessionOptions): CodexSessionReferenceFile[] {
  const list = options.referenceImages ?? [];
  if (options.referenceImage && list.length > 0) throw new Error('Codex 구독 이미지: 참고 사진은 한 가지 방식으로만 넘길 수 있습니다.');
  const references = options.referenceImage ? [options.referenceImage] : [...list];
  if (references.length > CODEX_MAX_REFERENCES) throw new Error(`Codex 구독 이미지: 참고 사진은 최대 ${CODEX_MAX_REFERENCES}장까지 붙일 수 있습니다.`);
  const seen = new Set<string>();
  for (const { fileName } of references) {
    // The reference file name becomes a path inside the work folder: a plain file name only, never a path.
    if (!fileName || /[\\/]|^\.+$/.test(fileName)) throw new Error('Codex 구독 이미지: 참고 사진 파일 이름이 올바르지 않습니다.');
    if (seen.has(fileName.toLowerCase())) throw new Error('Codex 구독 이미지: 참고 사진 파일 이름이 겹칩니다.');
    seen.add(fileName.toLowerCase());
  }
  return references;
}

export async function runCodexImageSession(
  prompts: readonly string[],
  options: CodexImageSessionOptions = {},
  deps: CodexImageSessionDeps = defaultDeps,
): Promise<CodexImageSessionResult> {
  const { model, effort } = resolveAgentImageProfile('codex', options.model);
  const references = collectReferences(options);
  // Checks the prompts (and the one-image-only rule of a reference) before any work folder exists.
  let instruction = buildCodexImageInstruction(prompts, references.length > 0 ? references.map((reference) => reference.fileName) : undefined);
  const env = deps.env();
  const startedAt = deps.now();
  const cwd = await mkdtemp(join(tmpdir(), 'agentcli-codex-image-'));
  try {
    if (references.length > 0) {
      const referenceFiles = references.map((reference) => join(cwd, reference.fileName));
      await Promise.all(references.map((reference, index) => writeFile(referenceFiles[index], reference.buffer)));
      instruction = buildCodexImageInstruction(prompts, referenceFiles);
    }
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
