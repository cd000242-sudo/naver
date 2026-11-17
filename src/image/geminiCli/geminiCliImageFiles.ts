// src/image/geminiCli/geminiCliImageFiles.ts
// Reading what `agy --output-format stream-json` leaves behind. stdout is NDJSON (one JSON object per line):
//   {"event":"init","conversation_id":"<uuid>",...}
//   {"event":"step_update","step_update":{...,"step_type":"subagent","subagent_info":{"subagents":[{"type_name":"image-generator","conversation_id":"<child>"}]}}}
//   {"event":"result","result":{"conversation_id":"<uuid>","status":"SUCCESS","response":"<file name>\n",...}}
// The picture itself is a file under <user home>/.gemini/antigravity-cli/brain/<parent conversation id>/ (measured on
// agy 1.5.9, 2026-11-17); the response text is NOT trusted for the path — the folder is read directly.
// Listing the image files is shared with the Codex engine (listGeneratedImages in ../codex/codexImageFiles.ts).

import { homedir } from 'os';
import { join } from 'path';

// A conversation id becomes a folder name: only letters, digits and dashes, so it can never walk out of brain/.
const SAFE_CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{6,63}$/;
const IMAGE_GENERATOR_TYPE = 'image-generator';

type EventRecord = Record<string, unknown>;

export interface GeminiCliResult {
  status?: string;
  response?: string;
}

function asRecord(value: unknown): EventRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as EventRecord) : undefined;
}

function parseLine(line: string): EventRecord | undefined {
  const text = line.trim();
  if (!text.startsWith('{')) return undefined;
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined; // a half-written or non-JSON line is not an event
  }
}

function forEachEvent(stdout: string, visit: (event: EventRecord) => void): void {
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const event = parseLine(line);
    if (event) visit(event);
  }
}

export function isSafeGeminiCliConversationId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_CONVERSATION_ID.test(value);
}

/** The id of the first `init` event, or undefined when it is missing or not a safe folder name. */
export function parseGeminiCliConversationId(stdout: string): string | undefined {
  let decided = false;
  let found: string | undefined;
  forEachEvent(stdout, (event) => {
    if (decided || event.event !== 'init') return;
    decided = true; // the first init decides: a later one never replaces an unsafe first id
    if (isSafeGeminiCliConversationId(event.conversation_id)) found = event.conversation_id;
  });
  return found;
}

/** status / response of the last `result` event; a missing field stays absent. */
export function parseGeminiCliResult(stdout: string): GeminiCliResult {
  let last: GeminiCliResult = {};
  forEachEvent(stdout, (event) => {
    const body = event.event === 'result' ? asRecord(event.result) : undefined;
    if (!body) return;
    last = {
      ...(typeof body.status === 'string' ? { status: body.status } : {}),
      ...(typeof body.response === 'string' ? { response: body.response } : {}),
    };
  });
  return last;
}

/**
 * Child conversation ids of the image-generator sub-agent steps, in order, without duplicates.
 * The sub-agent info is read from step_update.subagent_info (an event-level subagent_info is accepted as well).
 */
export function parseGeminiCliSubagentIds(stdout: string): string[] {
  const ids: string[] = [];
  forEachEvent(stdout, (event) => {
    const info = asRecord(asRecord(event.step_update)?.subagent_info) ?? asRecord(event.subagent_info);
    const raw = info?.subagents;
    for (const entry of Array.isArray(raw) ? raw : []) {
      const sub = asRecord(entry);
      if (!sub || sub.type_name !== IMAGE_GENERATOR_TYPE) continue;
      const id = sub.conversation_id;
      if (isSafeGeminiCliConversationId(id) && !ids.includes(id)) ids.push(id);
    }
  });
  return ids;
}

/**
 * stdout without the `user_input` steps. That step echoes the prompt the app sent (it carries text that came from the
 * blog post), so classifying it would read an ordinary word like "quota" in a prompt as a usage limit.
 */
export function extractGeminiCliDiagnosticText(stdout: string): string {
  const kept: string[] = [];
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const text = line.trim();
    if (!text) continue;
    const step = asRecord(parseLine(text)?.step_update);
    if (step?.step_type === 'user_input') continue;
    kept.push(text);
  }
  return kept.join('\n');
}

/** <user profile>\.gemini\antigravity-cli\brain\<conversation id> — refuses an id that is not a safe folder name. */
export function resolveGeminiCliBrainDir(env: NodeJS.ProcessEnv, conversationId: string): string {
  if (!isSafeGeminiCliConversationId(conversationId)) {
    throw new Error('Gemini 구독 이미지: 대화 id 가 폴더 이름으로 안전하지 않아 이미지 폴더를 읽지 않습니다.');
  }
  const home = String(env.USERPROFILE || env.HOME || '').trim() || homedir();
  return join(home, '.gemini', 'antigravity-cli', 'brain', conversationId);
}

/**
 * The picture to use, first. The image tool may refine its own result inside one request (measured 2026-11-17:
 * v1, v2, final — v1 carried text the prompt forbade) and the reply names the one it settled on. Without a usable
 * name in the reply, the newest file is that one. The earlier drafts stay in the list after it.
 */
export function orderGeminiCliResultFiles(files: readonly string[], response: string | undefined): string[] {
  if (files.length < 2) return [...files];
  const reply = String(response ?? '').toLowerCase();
  const baseName = (file: string): string => (file.split(/[\\/]/).pop() ?? '').toLowerCase();
  const named = [...files].reverse().find((file) => baseName(file) !== '' && reply.includes(baseName(file)));
  const chosen = named ?? files[files.length - 1];
  return [chosen, ...files.filter((file) => file !== chosen)];
}
