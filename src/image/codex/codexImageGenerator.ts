// src/image/codex/codexImageGenerator.ts
// The 'codex-image' engine ("Codex 구독 이미지"): draws with the image_gen tool of the user's ChatGPT subscription
// through the Codex CLI — no API billing, it spends the subscription's usage window.
//
// - The prompts are the ones imageGenerator already built for the item (same prompt builder as every engine).
// - One `codex exec` session draws up to 4 images in order; more than 4 split into two parallel sessions (never more
//   than two at once). The files of a session map to its items by drawing time.
// - A slot that gets no image is an explicit failure ("N번 이미지를 받지 못함"). No other engine fills it, nothing is
//   retried silently (no automatic fallback) — the subscription limit is the user's, a retry would spend it again.

import type { GeneratedImage, ImageProvider, ImageRequestItem } from '../types.js';
import { AgentCliError } from '../../agentCli/types.js';
import { resolveAgentImageProfile } from '../../agentCli/agentModelDefaults.js';
import { CODEX_IMAGE_ENGINE } from '../../runtime/codexImagePolicy.js';
import { assertCodexImageReady } from './codexImageReadiness.js';
import { runCodexImageSession, type CodexImageSessionOptions, type CodexImageSessionResult } from './codexImageSession.js';
import { withCodexAspectRatio } from './codexImageInstruction.js';

export const CODEX_IMAGE_MAX_PER_SESSION = 4;
const POLL_MS = 1000;

export interface CodexImageRuntime {
  /** Throws a typed, Korean-worded error when Codex is missing, outdated, logged out or out of quota. */
  assertReady(): Promise<void>;
  runSession(prompts: string[], options: CodexImageSessionOptions): Promise<CodexImageSessionResult>;
  /** Copies one result file into the app's image storage (same folder and format as every engine). */
  save(filePath: string, item: ImageRequestItem, postTitle?: string, postId?: string): Promise<GeneratedImage>;
  log(message: string): void;
}

export interface CodexImageOptions {
  /** Return the images that arrived even when some slots failed (still fails on 0 images). */
  allowPartial?: boolean;
  /** How often the stop request is polled; tests shorten it. */
  pollMs?: number;
}

let codexImageLogSink: ((message: string) => void) | null = null;
/** main registers its renderer log sender here, so the progress lines reach the progress log / modal. */
export function setCodexImageLogSink(sink: ((message: string) => void) | null): void { codexImageLogSink = sink; }
export function emitCodexImageLog(message: string): void {
  console.log(message);
  try { codexImageLogSink?.(message); } catch { /* the progress log is display only */ }
}

/** Contiguous index groups: one session up to 4 images, otherwise two sessions (first gets the larger half). */
export function splitIntoSessions(count: number): number[][] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const indexes = Array.from({ length: count }, (_, i) => i);
  if (count <= CODEX_IMAGE_MAX_PER_SESSION) return [indexes];
  const firstSize = Math.ceil(count / 2);
  return [indexes.slice(0, firstSize), indexes.slice(firstSize)];
}

// Measured 35s for one image and ~18s for each further one in the same session; this leaves a wide margin.
function sessionTimeoutMs(imageCount: number): number {
  return Math.min(600_000, 150_000 + 60_000 * imageCount);
}

function defaultRuntime(): CodexImageRuntime {
  return {
    assertReady: () => assertCodexImageReady(),
    async runSession(prompts, options) {
      try {
        const result = await runCodexImageSession(prompts, options);
        try { (await import('../../agentCli/usageTracker.js')).recordAgentCall('codex'); } catch { /* usage visibility is best-effort */ }
        return result;
      } catch (error) {
        if (error instanceof AgentCliError) {
          const { clearAgentDetectionCache } = await import('../../agentCli/detect.js');
          if (['not_logged_in', 'subscription_inactive', 'rate_limited'].includes(error.code)) clearAgentDetectionCache('codex');
          if (error.code === 'rate_limited') {
            try { (await import('../../agentCli/usageTracker.js')).recordAgentRateLimit('codex', `${error.detail ?? ''} ${error.message}`); } catch { /* best-effort */ }
          }
        }
        throw error;
      }
    },
    async save(filePath, item, postTitle, postId) {
      const [{ readFile }, { extname }, { writeImageFile }] = await Promise.all([
        import('fs/promises'), import('path'), import('../imageUtils.js'),
      ]);
      const ext = extname(filePath).slice(1).toLowerCase();
      const saved = await writeImageFile(await readFile(filePath), ext === 'jpeg' || !ext ? 'jpg' : ext, item.heading, postTitle, postId);
      return {
        heading: item.heading,
        filePath: saved.savedToLocal || saved.filePath,
        previewDataUrl: saved.previewDataUrl,
        provider: CODEX_IMAGE_ENGINE as ImageProvider,
        savedToLocal: saved.savedToLocal,
        blobId: saved.blobId,
        mimeType: saved.mimeType,
        width: saved.width,
        height: saved.height,
        byteSize: saved.byteSize,
        sha256: saved.sha256,
        createdAt: saved.createdAt,
      };
    },
    log: emitCodexImageLog,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function generateWithCodexImage(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  stopCheck?: () => boolean,
  onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
  options: CodexImageOptions = {},
  runtime: CodexImageRuntime = defaultRuntime(),
): Promise<GeneratedImage[]> {
  if (items.length === 0 || stopCheck?.()) return [];
  await runtime.assertReady();
  runtime.log(`🎨 Codex 구독 이미지 ${items.length}장 생성 중 (${resolveAgentImageProfile('codex').model})`);

  const abort = new AbortController();
  const watcher = setInterval(() => { if (stopCheck?.()) abort.abort(); }, options.pollMs ?? POLL_MS);
  const images = new Map<number, GeneratedImage>();
  const reasons = new Map<number, string>();
  let fatal: unknown;
  try {
    await Promise.all(splitIntoSessions(items.length).map(async (group) => {
      try {
        const prompts = group.map((index) => withCodexAspectRatio(items[index].prompt, (items[index] as { imageRatio?: unknown }).imageRatio));
        const session = await runtime.runSession(prompts, {
          signal: abort.signal, timeoutMs: sessionTimeoutMs(group.length),
        });
        if (session.files.length > group.length) {
          runtime.log(`⚠️ Codex 구독 이미지: ${group.length}장을 부탁했는데 ${session.files.length}장이 만들어져 앞의 ${group.length}장만 씁니다`);
        }
        for (let slot = 0; slot < group.length; slot++) {
          const index = group[slot];
          const file = session.files[slot];
          if (!file) { reasons.set(index, ''); continue; }
          try {
            const item = items[index];
            const saved = await runtime.save(file, item, postTitle, postId);
            // The engine draws the Korean copy itself: the app never overlays text on its thumbnail.
            const image: GeneratedImage = {
              ...saved,
              provider: CODEX_IMAGE_ENGINE as ImageProvider,
              ...(item.isThumbnail === true ? { isThumbnail: true, disableTextOverlay: true } : {}),
              ...((item as { originalIndex?: number }).originalIndex !== undefined
                ? { originalIndex: (item as { originalIndex?: number }).originalIndex } : {}),
            };
            images.set(index, image);
            onImageGenerated?.(image, index, items.length);
          } catch (saveError) {
            reasons.set(index, describeError(saveError));
          }
        }
      } catch (error) {
        const stopped = abort.signal.aborted || (error instanceof AgentCliError && error.code === 'aborted');
        if (stopped) return;
        fatal ??= error;
        for (const index of group) reasons.set(index, describeError(error));
      }
    }));
  } finally {
    clearInterval(watcher);
  }

  const ordered = [...images.entries()].sort((a, b) => a[0] - b[0]).map(([, image]) => image);
  if (abort.signal.aborted) {
    runtime.log('⛔ 중지 요청으로 Codex 구독 이미지 생성을 멈췄습니다.');
    return ordered;
  }
  const missing = items.map((_, index) => index).filter((index) => !images.has(index));
  if (missing.length === 0) return ordered;

  const phrases = missing.map((index) => `${index + 1}번 이미지를 받지 못함`);
  for (const index of missing) {
    const reason = reasons.get(index);
    runtime.log(`⚠️ Codex 구독 이미지: ${index + 1}번 이미지를 받지 못함${reason ? ` (${reason.slice(0, 160)})` : ''} — 다른 엔진으로 채우지 않았습니다`);
  }
  if (options.allowPartial && ordered.length > 0) return ordered;
  throw new Error(`${fatal ? `${describeError(fatal)} ` : ''}${phrases.join(', ')}`);
}
