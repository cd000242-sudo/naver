// src/image/codex/codexImageFiles.ts
// Reading what `codex exec --json` leaves behind: the thread id, the error events, and the image files the
// image_gen tool wrote to <CODEX_HOME>/generated_images/<thread id>/exec-<uuid>.png.
// Verified on this PC (2026-11-03): each generated_images folder name equals the session id in the matching
// sessions/**/rollout-*-<id>.jsonl. File names are random uuids, so the order of drawing is the file time, not the name.

import { readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

// A thread id becomes a folder name: only letters, digits and dashes, so it can never walk out of generated_images.
const SAFE_THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9-]{6,63}$/;
const IMAGE_FILE = /\.(png|jpe?g|webp)$/i;

function forEachEvent(stdout: string, visit: (event: Record<string, unknown>) => void): void {
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const text = line.trim();
    if (!text.startsWith('{')) continue;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object') visit(parsed as Record<string, unknown>);
    } catch { /* a half-written or non-JSON line is not an event */ }
  }
}

/** The thread id from the `thread.started` event, or undefined when it is missing or not a safe folder name. */
export function parseCodexThreadId(stdout: string): string | undefined {
  let found: string | undefined;
  forEachEvent(stdout, (event) => {
    if (found || event.type !== 'thread.started') return;
    const id = event.thread_id ?? event.threadId ?? event.id;
    if (typeof id === 'string' && SAFE_THREAD_ID.test(id)) found = id;
  });
  return found;
}

function messageOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message;
  }
  return '';
}

/**
 * Text of the error / turn.failed events only. The whole stdout also echoes the prompt and the model's own words,
 * so classifying it would read an ordinary word like "quota" in a prompt as a usage limit.
 */
export function extractCodexErrorText(stdout: string): string {
  const parts: string[] = [];
  forEachEvent(stdout, (event) => {
    if (event.type === 'error') parts.push(messageOf(event.message) || messageOf(event.error));
    else if (event.type === 'turn.failed') parts.push(messageOf(event.error) || messageOf(event.message));
    else if (event.type === 'item.completed' && (event.item as { type?: unknown } | undefined)?.type === 'error') {
      parts.push(messageOf((event.item as { message?: unknown }).message));
    }
  });
  return parts.filter(Boolean).join('\n');
}

/** %CODEX_HOME% when set (the app passes it through), otherwise <user profile>\.codex. */
export function resolveCodexHome(env: NodeJS.ProcessEnv): string {
  const named = String(env.CODEX_HOME ?? '').trim();
  if (named) return named;
  return join(String(env.USERPROFILE ?? env.HOME ?? '').trim() || homedir(), '.codex');
}

/** Image files in dir written at or after sinceMs, oldest first (= the order the tool drew them). */
export async function listGeneratedImages(dir: string, sinceMs: number): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const entries: Array<{ path: string; at: number; name: string }> = [];
  for (const name of names) {
    if (!IMAGE_FILE.test(name)) continue;
    const path = join(dir, name);
    try {
      const info = await stat(path);
      if (info.isFile() && info.mtimeMs >= sinceMs) entries.push({ path, at: info.mtimeMs, name });
    } catch { /* removed while listing */ }
  }
  return entries
    .sort((a, b) => a.at - b.at || a.name.localeCompare(b.name))
    .map((entry) => entry.path);
}
