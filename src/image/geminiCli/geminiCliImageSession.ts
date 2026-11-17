// src/image/geminiCli/geminiCliImageSession.ts
// One `agy` run that draws ONE image through the image-generator sub-agent of the user's Antigravity subscription.
//   agy --output-format stream-json --model <model> --print-timeout <n>s   (instruction on stdin)
// Never `--print` / `-p` (it swallows the next option as the prompt, exit 2) and never `--dangerously-skip-permissions`
// (the prompt carries text from the blog post, so tools must not be auto-approved) — measured on agy 1.5.9.
// The file appears in <home>/.gemini/antigravity-cli/brain/<parent conversation id>/ (or the sub-agent's own folder).
// Reuses the agentCli spawn path, subscription env, exit classifier and failure messages — no spawn path of its own.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnCollect, type SpawnArgs, type SpawnResult } from '../../agentCli/spawnHelper.js';
import { classifyExit } from '../../agentCli/parse.js';
import { buildGeminiSubscriptionEnv } from '../../agentCli/subscriptionEnv.js';
import { agentCommandName } from '../../agentCli/commandName.js';
import { AgentCliError, type AgentErrorCode } from '../../agentCli/types.js';
import { buildAgentFailureMessage, buildModelUnavailableMessage } from '../../agentCli/failureMessage.js';
import { resolveAgentImageProfile } from '../../agentCli/agentModelDefaults.js';
import { listGeneratedImages } from '../codex/codexImageFiles.js';
import { buildGeminiCliImageInstruction } from './geminiCliImageInstruction.js';
import {
  extractGeminiCliDiagnosticText, orderGeminiCliResultFiles, parseGeminiCliConversationId, parseGeminiCliResult,
  parseGeminiCliSubagentIds, resolveGeminiCliBrainDir,
} from './geminiCliImageFiles.js';

export interface GeminiCliImageSessionDeps {
  spawn(args: SpawnArgs): Promise<SpawnResult>;
  env(): NodeJS.ProcessEnv;
  now(): number;
  /** Image files in a folder written at or after sinceMs, oldest first. Injected so tests can replace it. */
  listImages(dir: string, sinceMs: number): Promise<string[]>;
}

export interface GeminiCliImageSessionOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** A named model wins over the app's image default (agentModelDefaults). */
  model?: string;
}

export interface GeminiCliImageSessionResult {
  conversationId: string;
  /** Absolute paths. The first one is the picture to use (the one the reply names, else the newest); drafts follow. */
  files: string[];
}

const defaultDeps: GeminiCliImageSessionDeps = {
  spawn: spawnCollect,
  env: () => buildGeminiSubscriptionEnv(),
  now: () => Date.now(),
  listImages: listGeneratedImages,
};

// Clock skew between this process and the file system timestamps.
const FILE_TIME_SLACK_MS = 2_000;
// Let agy report its own timeout before spawnCollect kills it (same margins as geminiRunner).
const PRINT_TIMEOUT_MARGIN_MS = 5_000;
const MIN_PRINT_TIMEOUT_SEC = 30;
const NOT_SWITCHED = '다른 이미지 엔진으로 바꾸지 않았고 같은 요청은 다시 보내지 않았습니다.';

function printTimeoutArgs(timeoutMs?: number): string[] {
  if (!timeoutMs || timeoutMs <= 0) return [];
  return ['--print-timeout', `${Math.max(MIN_PRINT_TIMEOUT_SEC, Math.ceil((timeoutMs - PRINT_TIMEOUT_MARGIN_MS) / 1000))}s`];
}

function tail(text: string): string {
  return text.length > 800 ? text.slice(-800) : text;
}

function failure(code: AgentErrorCode, detail: string, model: string): AgentCliError {
  const message = code === 'model_unavailable'
    ? buildModelUnavailableMessage('gemini', model, detail)
    : buildAgentFailureMessage('gemini', code, detail);
  return new AgentCliError(code, 'gemini', message, detail);
}

/** The parent conversation's folder first; only when it holds nothing new, the image-generator sub-conversations'. */
async function findImages(
  env: NodeJS.ProcessEnv, parentId: string, childIds: readonly string[], sinceMs: number, listImages: GeminiCliImageSessionDeps['listImages'],
): Promise<string[]> {
  const parentFiles = await listImages(resolveGeminiCliBrainDir(env, parentId), sinceMs);
  if (parentFiles.length > 0) return parentFiles;
  const files: string[] = [];
  for (const id of childIds.filter((childId) => childId !== parentId)) {
    for (const file of await listImages(resolveGeminiCliBrainDir(env, id), sinceMs)) {
      if (!files.includes(file)) files.push(file);
    }
  }
  return files;
}

export async function runGeminiCliImageSession(
  prompt: string,
  options: GeminiCliImageSessionOptions = {},
  deps: GeminiCliImageSessionDeps = defaultDeps,
): Promise<GeminiCliImageSessionResult> {
  // Checks the prompt before any work folder exists.
  const instruction = buildGeminiCliImageInstruction(prompt);
  const { model } = resolveAgentImageProfile('gemini', options.model);
  const env = deps.env();
  const startedAt = deps.now();
  const cwd = await mkdtemp(join(tmpdir(), 'agentcli-gemini-image-'));
  try {
    const res = await deps.spawn({
      command: agentCommandName('gemini'),
      args: ['--output-format', 'stream-json', '--model', model, ...printTimeoutArgs(options.timeoutMs)],
      provider: 'gemini', cwd, stdin: instruction,
      timeoutMs: options.timeoutMs, signal: options.signal, env,
    });
    const stderr = res.stderr ?? '';
    const diagnostic = extractGeminiCliDiagnosticText(res.stdout);
    if (res.code !== 0) {
      throw failure(classifyExit('gemini', stderr, diagnostic), tail(stderr || diagnostic), model);
    }

    const conversationId = parseGeminiCliConversationId(res.stdout);
    if (!conversationId) {
      throw new AgentCliError(
        'empty_output', 'gemini',
        `Gemini 구독 이미지: 실행 결과에서 대화 id 를 읽지 못해 이미지 폴더를 찾을 수 없습니다. ${NOT_SWITCHED}`,
        tail(diagnostic),
      );
    }
    const outcome = parseGeminiCliResult(res.stdout);
    if (outcome.status !== 'SUCCESS') {
      // Unmeasured: what a limit / logout looks like in stream-json. The reply text and stderr go to the same classifier.
      const reason = (outcome.response ?? '').trim() || stderr.trim();
      const head = outcome.status ? `status=${outcome.status}` : 'result 이벤트 없음';
      throw failure(classifyExit('gemini', stderr, outcome.response ?? ''), tail([head, reason].filter(Boolean).join(' · ')), model);
    }

    const found = await findImages(env, conversationId, parseGeminiCliSubagentIds(res.stdout), startedAt - FILE_TIME_SLACK_MS, deps.listImages);
    const files = orderGeminiCliResultFiles(found, outcome.response);
    if (files.length === 0) {
      throw new AgentCliError(
        'empty_output', 'gemini', `Gemini 구독 이미지: 그림 파일을 받지 못했습니다. ${NOT_SWITCHED}`, tail(outcome.response ?? ''),
      );
    }
    return { conversationId, files };
  } finally {
    // Only the throwaway work folder: the brain folder belongs to the user's CLI and is never removed.
    await rm(cwd, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
