// src/image/codex/codexImageGenerator.ts
// The 'codex-image' engine ("Codex 구독 이미지"): draws with the image_gen tool of the user's ChatGPT subscription
// through the Codex CLI — no API billing, it spends the subscription's usage window.
//
// - The prompts are the ones imageGenerator already built for the item (same prompt builder as every engine).
// - One `codex exec` session draws exactly ONE image, and up to CODEX_IMAGE_CONCURRENCY sessions run at the same time.
//   A session's file comes from its own generated_images/<thread id>/ folder, so a result belongs to its item by
//   construction — it never depends on the order in which sessions finish or on file times across sessions.
// - Shopping: an optional cleaned product photo is attached to EVERY session as image_gen's reference (codexReferenceImage.ts);
//   a result that is only a byte copy of that photo fails its slot. Without it nothing changes.
// - A slot that gets no image is an explicit failure ("N번 이미지를 받지 못함"). No other engine fills it, nothing is
//   retried silently (no automatic fallback) — the subscription limit is the user's, a retry would spend it again.
// - A subscription-level failure (limit reached, logged out, CLI missing, plan inactive...) is the same for every
//   session: no further session is started, the sessions already running finish, and the unstarted slots fail with it.

import type { GeneratedImage, ImageProvider, ImageRequestItem } from '../types.js';
import { AgentCliError, type AgentErrorCode } from '../../agentCli/types.js';
import { resolveAgentImageProfile } from '../../agentCli/agentModelDefaults.js';
import { CODEX_IMAGE_ENGINE } from '../../runtime/codexImagePolicy.js';
import { assertCodexImageReady } from './codexImageReadiness.js';
import { runCodexImageSession, type CodexImageSessionOptions, type CodexImageSessionResult } from './codexImageSession.js';
import { withCodexAspectRatio, withCodexProductReference } from './codexImageInstruction.js';
import { isCodexReferenceCopy, type CodexReferenceImage } from './codexReferenceImage.js';

/** How many single-image sessions run at the same time. */
export const CODEX_IMAGE_CONCURRENCY = 4;
const POLL_MS = 1000;
// Measured 35-56s for one image; this leaves a wide margin for four sessions sharing the subscription.
const SESSION_TIMEOUT_MS = 210_000;
// Failures that repeat for every session of this account — starting more sessions only burns time.
const ACCOUNT_LEVEL_CODES: ReadonlySet<AgentErrorCode> = new Set<AgentErrorCode>([
  'rate_limited', 'not_logged_in', 'not_installed', 'subscription_inactive', 'provider_disabled', 'update_required', 'model_unavailable',
]);

export interface CodexImageRuntime {
  /** Throws a typed, Korean-worded error when Codex is missing, outdated, logged out or out of quota. */
  assertReady(): Promise<void>;
  runSession(prompts: string[], options: CodexImageSessionOptions): Promise<CodexImageSessionResult>;
  /** Copies one result file into the app's image storage (same folder and format as every engine). */
  save(filePath: string, item: ImageRequestItem, postTitle?: string, postId?: string): Promise<GeneratedImage>;
  log(message: string): void;
  /** True when a result file is a byte-identical copy of the reference photo (only asked when a reference is attached). */
  isReferenceCopy(filePath: string, reference: CodexReferenceImage): Promise<boolean>;
}

export interface CodexImageOptions {
  /** Return the images that arrived even when some slots failed (still fails on 0 images). */
  allowPartial?: boolean;
  /**
   * [2026-11-05] Shopping product photo (already cleaned): attached to EVERY session as the reference. Without it the
   * behaviour is exactly the plain one. A result that is only a copy of this photo fails its slot.
   */
  referenceImage?: CodexReferenceImage;
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
      // 2026-11-04: Codex ignores the ratio line most of the time — fit the file to the requested frame (default 1:1).
      const { fitCodexImageToRatio } = await import('./codexImageFrame.js');
      const fitted = await fitCodexImageToRatio(await readFile(filePath), (item as { imageRatio?: unknown }).imageRatio);
      if (fitted.cropped) emitCodexImageLog(`📐 "${item.heading}" ${fitted.from} → ${fitted.to} (${fitted.target}, 가운데 기준 자르기)`);
      const saved = await writeImageFile(fitted.buffer, ext === 'jpeg' || !ext ? 'jpg' : ext, item.heading, postTitle, postId);
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
    async isReferenceCopy(filePath, reference) {
      const { readFile } = await import('fs/promises');
      return isCodexReferenceCopy(await readFile(filePath), reference);
    },
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const seconds = (fromMs: number): number => Math.max(0, Math.round((Date.now() - fromMs) / 1000));

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
  const concurrency = Math.min(CODEX_IMAGE_CONCURRENCY, items.length);
  runtime.log(`🎨 Codex 구독 이미지 ${items.length}장 생성 중 (${resolveAgentImageProfile('codex').model}) · 동시 ${concurrency}개`);
  const reference = options.referenceImage;
  if (reference) runtime.log(`🛒 상품 사진 1장을 참고로 붙여 ${items.length}장 생성`);

  const startedAt = Date.now();
  const abort = new AbortController();
  const watcher = setInterval(() => { if (stopCheck?.()) abort.abort(); }, options.pollMs ?? POLL_MS);
  const images = new Map<number, GeneratedImage>();
  const reasons = new Map<number, string>();
  let fatal: unknown;
  let stopLaunching: unknown; // the account-level error that ended the launching of new sessions
  let nextIndex = 0;

  // Saves run one at a time: the local copy is named <heading>-<millisecond>, two parallel saves could collide.
  let saveQueue: Promise<unknown> = Promise.resolve();
  const saveInTurn = (file: string, item: ImageRequestItem): Promise<GeneratedImage> => {
    const turn = saveQueue.then(() => runtime.save(file, item, postTitle, postId));
    saveQueue = turn.catch(() => undefined);
    return turn;
  };

  const drawOne = async (index: number): Promise<void> => {
    const item = items[index];
    const sessionStartedAt = Date.now();
    try {
      // The product line goes before the ratio line, so the prompt still ends with the ratio line.
      const prompt = withCodexAspectRatio(reference ? withCodexProductReference(item.prompt) : item.prompt, (item as { imageRatio?: unknown }).imageRatio);
      const session = await runtime.runSession([prompt], {
        signal: abort.signal,
        timeoutMs: SESSION_TIMEOUT_MS,
        ...(reference ? { referenceImage: { buffer: reference.buffer, fileName: reference.fileName } } : {}),
      });
      if (session.files.length > 1) {
        runtime.log(`⚠️ Codex 구독 이미지: ${index + 1}번에 1장을 부탁했는데 ${session.files.length}장이 만들어져 첫 장만 씁니다`);
      }
      const file = session.files[0];
      if (!file) { reasons.set(index, ''); return; }
      if (reference) {
        // A file that is only the reference photo handed back is not a new image: the slot fails (no other engine fills it).
        let copied: boolean;
        try { copied = await runtime.isReferenceCopy(file, reference); }
        catch (checkError) { reasons.set(index, `결과 파일을 확인하지 못함: ${describeError(checkError)}`); return; }
        if (copied) { reasons.set(index, '참고 사진을 그대로 복사한 결과라 버렸습니다'); return; }
      }
      try {
        const saved = await saveInTurn(file, item);
        // The engine draws the Korean copy itself: the app never overlays text on its thumbnail.
        const image: GeneratedImage = {
          ...saved,
          provider: CODEX_IMAGE_ENGINE as ImageProvider,
          ...(item.isThumbnail === true ? { isThumbnail: true, disableTextOverlay: true } : {}),
          ...((item as { originalIndex?: number }).originalIndex !== undefined
            ? { originalIndex: (item as { originalIndex?: number }).originalIndex } : {}),
        };
        images.set(index, image);
        runtime.log(`✅ Codex 구독 이미지 ${index + 1}/${items.length} "${String(item.heading ?? '').slice(0, 30)}" — ${seconds(sessionStartedAt)}초`);
        onImageGenerated?.(image, index, items.length);
      } catch (saveError) {
        reasons.set(index, describeError(saveError));
      }
    } catch (error) {
      const stopped = abort.signal.aborted || (error instanceof AgentCliError && error.code === 'aborted');
      if (stopped) return;
      fatal ??= error;
      reasons.set(index, describeError(error));
      if (error instanceof AgentCliError && ACCOUNT_LEVEL_CODES.has(error.code)) stopLaunching ??= error;
    }
  };

  // A fixed number of workers each take the next unstarted item, so the limit holds without a separate scheduler.
  const worker = async (): Promise<void> => {
    while (!stopLaunching && !abort.signal.aborted && nextIndex < items.length) {
      const index = nextIndex++;
      await drawOne(index);
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    clearInterval(watcher);
  }

  // Items that never started because the account stopped them fail with that reason (no other engine takes over).
  if (stopLaunching && !abort.signal.aborted) {
    for (let index = nextIndex; index < items.length; index++) reasons.set(index, describeError(stopLaunching));
  }

  if (images.size > 0) {
    runtime.log(`Codex 구독 이미지: ${images.size}장 동시 ${concurrency}개 · 총 ${seconds(startedAt)}초`);
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
  const lead = stopLaunching ?? fatal; // the account-level reason explains the unstarted slots best
  throw new Error(`${lead ? `${describeError(lead)} ` : ''}${phrases.join(', ')}`);
}
