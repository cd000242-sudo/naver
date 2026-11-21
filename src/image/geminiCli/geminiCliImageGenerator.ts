// src/image/geminiCli/geminiCliImageGenerator.ts
// The 'gemini-cli-image' engine ("Gemini 구독 이미지"): draws with the image generation tool of the user's Antigravity
// (agy / Gemini CLI) subscription — no API billing, it spends the subscription's usage window.
// A reduced copy of generateWithCodexImage: only ONE kind of reference photo (the shopping product photo), no user photos.
//
// - The prompts are the ones imageGenerator already built for the item; only the aspect ratio line is appended.
// - One `agy` session draws exactly ONE image, and up to GEMINI_CLI_IMAGE_CONCURRENCY sessions run at the same time.
//   A session's file comes from its own conversation folder, so a result belongs to its item by construction.
// - [2026-11-21] Shopping: an optional cleaned product photo (geminiCliReferenceInput.ts) is written into EVERY session's work
//   folder as reference-01.png and named in the CLI instruction; a result that is only a byte copy of that photo fails its
//   slot. Without it nothing changes.
// - A slot that gets no image is an explicit failure ("N번 이미지를 받지 못함"). No other engine fills it, nothing is
//   retried silently (no automatic fallback) — the subscription limit is the user's, a retry would spend it again.
// - A subscription-level failure (limit reached, logged out, CLI missing, plan inactive...) is the same for every
//   session: no further session is started, the sessions already running finish, and the unstarted slots fail with it.

import type { GeneratedImage, ImageProvider, ImageRequestItem } from '../types.js';
import { AgentCliError, type AgentErrorCode } from '../../agentCli/types.js';
import { resolveAgentImageProfile } from '../../agentCli/agentModelDefaults.js';
import { GEMINI_CLI_IMAGE_ENGINE } from '../../runtime/geminiCliImagePolicy.js';
import { withCodexAspectRatio } from '../codex/codexImageInstruction.js';
import { isCodexReferenceCopy, type CodexReferenceImage } from '../codex/codexReferenceImage.js';
import { assertGeminiCliImageReady } from './geminiCliImageReadiness.js';
import { runGeminiCliImageSession, type GeminiCliImageSessionOptions, type GeminiCliImageSessionResult } from './geminiCliImageSession.js';

/**
 * How many single-image sessions run at the same time. NOT measured yet (only single runs were): kept conservative
 * until the concurrent-session limit of the subscription is measured.
 */
export const GEMINI_CLI_IMAGE_CONCURRENCY = 2;
// Measured 56-60s for one image; this leaves a wide margin for two sessions sharing the subscription.
export const GEMINI_CLI_IMAGE_SESSION_TIMEOUT_MS = 240_000;
const POLL_MS = 1000;
// Failures that repeat for every session of this account — starting more sessions only burns time.
const ACCOUNT_LEVEL_CODES: ReadonlySet<AgentErrorCode> = new Set<AgentErrorCode>([
  'rate_limited', 'not_logged_in', 'not_installed', 'subscription_inactive', 'provider_disabled', 'update_required', 'model_unavailable',
]);
const PROVIDER = GEMINI_CLI_IMAGE_ENGINE as ImageProvider;

export interface GeminiCliImageRuntime {
  /** Throws a typed, Korean-worded error when the Gemini CLI is missing, outdated, logged out or out of quota. */
  assertReady(): Promise<void>;
  /** The prompt is the drawing prompt (ratio line included); the session wraps it into the CLI instruction. */
  runSession(prompt: string, options: GeminiCliImageSessionOptions): Promise<GeminiCliImageSessionResult>;
  /** Copies one result file into the app's image storage (same folder and format as every engine). */
  save(filePath: string, item: ImageRequestItem, postTitle?: string, postId?: string): Promise<GeneratedImage>;
  log(message: string): void;
  /** True when a result file is a byte-identical copy of the reference photo (only asked when a reference is attached). */
  isReferenceCopy(filePath: string, reference: CodexReferenceImage): Promise<boolean>;
}

export interface GeminiCliImageOptions {
  /** Return the images that arrived even when some slots failed (still fails on 0 images). */
  allowPartial?: boolean;
  /**
   * [2026-11-21] Shopping product photo (already cleaned): attached to EVERY session as the reference. Without it the
   * behaviour is exactly the plain one. A result that is only a copy of this photo fails its slot.
   */
  referenceImage?: CodexReferenceImage;
  /** How often the stop request is polled; tests shorten it. */
  pollMs?: number;
}

let geminiCliImageLogSink: ((message: string) => void) | null = null;
/** main registers its renderer log sender here, so the progress lines reach the progress log / modal. */
export function setGeminiCliImageLogSink(sink: ((message: string) => void) | null): void { geminiCliImageLogSink = sink; }
export function emitGeminiCliImageLog(message: string): void {
  console.log(message);
  try { geminiCliImageLogSink?.(message); } catch { /* the progress log is display only */ }
}

function defaultRuntime(): GeminiCliImageRuntime {
  return {
    assertReady: () => assertGeminiCliImageReady(),
    async runSession(prompt, options) {
      try {
        const result = await runGeminiCliImageSession(prompt, options);
        try { (await import('../../agentCli/usageTracker.js')).recordAgentCall('gemini'); } catch { /* usage visibility is best-effort */ }
        return result;
      } catch (error) {
        if (error instanceof AgentCliError) {
          const { clearAgentDetectionCache } = await import('../../agentCli/detect.js');
          if (['not_logged_in', 'subscription_inactive', 'rate_limited'].includes(error.code)) clearAgentDetectionCache('gemini');
          if (error.code === 'rate_limited') {
            try { (await import('../../agentCli/usageTracker.js')).recordAgentRateLimit('gemini', `${error.detail ?? ''} ${error.message}`); } catch { /* best-effort */ }
          }
        }
        throw error;
      }
    },
    async save(filePath, item, postTitle, postId) {
      const [{ readFile }, { extname }, { writeImageFile }, { fitCodexImageToRatio }] = await Promise.all([
        import('fs/promises'), import('path'), import('../imageUtils.js'), import('../codex/codexImageFrame.js'),
      ]);
      const ext = extname(filePath).slice(1).toLowerCase();
      // The model may ignore the ratio line — fit the file to the requested frame (default 1:1), as the Codex engine does.
      const fitted = await fitCodexImageToRatio(await readFile(filePath), (item as { imageRatio?: unknown }).imageRatio);
      if (fitted.cropped) emitGeminiCliImageLog(`📐 "${item.heading}" ${fitted.from} → ${fitted.to} (${fitted.target}, 가운데 기준 자르기)`);
      const saved = await writeImageFile(fitted.buffer, ext === 'jpeg' || !ext ? 'jpg' : ext, item.heading, postTitle, postId);
      return {
        heading: item.heading,
        filePath: saved.savedToLocal || saved.filePath,
        previewDataUrl: saved.previewDataUrl,
        provider: PROVIDER,
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
    log: emitGeminiCliImageLog,
    async isReferenceCopy(filePath, reference) {
      const { readFile } = await import('fs/promises');
      return isCodexReferenceCopy(await readFile(filePath), reference);
    },
  };
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const secondsSince = (fromMs: number): number => Math.max(0, Math.round((Date.now() - fromMs) / 1000));

/** Everything one generate call shares: the workers fill the maps and move nextIndex / the stop markers. */
interface RunContext {
  items: ImageRequestItem[];
  runtime: GeminiCliImageRuntime;
  abort: AbortController;
  reference?: CodexReferenceImage;
  onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void;
  saveInTurn(file: string, item: ImageRequestItem): Promise<GeneratedImage>;
  images: Map<number, GeneratedImage>;
  reasons: Map<number, string>;
  state: { fatal: unknown; stopLaunching: unknown; nextIndex: number };
}

async function drawOne(ctx: RunContext, index: number): Promise<void> {
  const { items, runtime, abort, images, reasons, state } = ctx;
  const item = items[index];
  const sessionStartedAt = Date.now();
  try {
    const prompt = withCodexAspectRatio(item.prompt, (item as { imageRatio?: unknown }).imageRatio);
    const { reference } = ctx;
    const session = await runtime.runSession(prompt, {
      signal: abort.signal,
      timeoutMs: GEMINI_CLI_IMAGE_SESSION_TIMEOUT_MS,
      ...(reference ? { referenceImage: { buffer: reference.buffer, fileName: reference.fileName } } : {}),
    });
    if (session.files.length > 1) {
      // The tool refines its own picture now and then (measured: 3 files in one request); files[0] is the one it settled on.
      runtime.log(`ℹ️ Gemini 구독 이미지: ${index + 1}번은 도구가 ${session.files.length}번 그려 다듬었습니다 — 최종본을 씁니다`);
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
      const saved = await ctx.saveInTurn(file, item);
      // The engine draws the Korean copy itself: the app never overlays text on its thumbnail.
      const image: GeneratedImage = {
        ...saved,
        provider: PROVIDER,
        ...(item.isThumbnail === true ? { isThumbnail: true, disableTextOverlay: true } : {}),
        ...((item as { originalIndex?: number }).originalIndex !== undefined
          ? { originalIndex: (item as { originalIndex?: number }).originalIndex } : {}),
      };
      images.set(index, image);
      runtime.log(`✅ Gemini 구독 이미지 ${index + 1}/${items.length} "${String(item.heading ?? '').slice(0, 30)}" — ${secondsSince(sessionStartedAt)}초`);
      ctx.onImageGenerated?.(image, index, items.length);
    } catch (saveError) {
      reasons.set(index, describeError(saveError));
    }
  } catch (error) {
    if (abort.signal.aborted || (error instanceof AgentCliError && error.code === 'aborted')) return;
    state.fatal ??= error;
    reasons.set(index, describeError(error));
    if (error instanceof AgentCliError && ACCOUNT_LEVEL_CODES.has(error.code)) state.stopLaunching ??= error;
  }
}

/** The result once every worker is done: ordered images, or the explicit failure for the slots that got nothing. */
function conclude(ctx: RunContext, concurrency: number, startedAt: number, allowPartial: boolean): GeneratedImage[] {
  const { items, runtime, abort, images, reasons, state } = ctx;
  // Items that never started because the account stopped them fail with that reason (no other engine takes over).
  if (state.stopLaunching && !abort.signal.aborted) {
    for (let index = state.nextIndex; index < items.length; index++) reasons.set(index, describeError(state.stopLaunching));
  }
  if (images.size > 0) runtime.log(`Gemini 구독 이미지: ${images.size}장 동시 ${concurrency}개 · 총 ${secondsSince(startedAt)}초`);
  const ordered = [...images.entries()].sort((a, b) => a[0] - b[0]).map(([, image]) => image);
  if (abort.signal.aborted) {
    runtime.log('⛔ 중지 요청으로 Gemini 구독 이미지 생성을 멈췄습니다.');
    return ordered;
  }
  const missing = items.map((_, index) => index).filter((index) => !images.has(index));
  if (missing.length === 0) return ordered;
  for (const index of missing) {
    const reason = reasons.get(index);
    runtime.log(`⚠️ Gemini 구독 이미지: ${index + 1}번 이미지를 받지 못함${reason ? ` (${reason.slice(0, 160)})` : ''} — 다른 엔진으로 채우지 않았습니다`);
  }
  if (allowPartial && ordered.length > 0) return ordered;
  const lead = state.stopLaunching ?? state.fatal; // the account-level reason explains the unstarted slots best
  throw new Error(`${lead ? `${describeError(lead)} ` : ''}${missing.map((index) => `${index + 1}번 이미지를 받지 못함`).join(', ')}`);
}

export async function generateWithGeminiCliImage(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  stopCheck?: () => boolean,
  onImageGenerated?: (image: GeneratedImage, index: number, total: number) => void,
  options: GeminiCliImageOptions = {},
  runtime: GeminiCliImageRuntime = defaultRuntime(),
): Promise<GeneratedImage[]> {
  if (items.length === 0 || stopCheck?.()) return [];
  await runtime.assertReady();
  const concurrency = Math.min(GEMINI_CLI_IMAGE_CONCURRENCY, items.length);
  runtime.log(`🎨 Gemini 구독 이미지 ${items.length}장 생성 중 (${resolveAgentImageProfile('gemini').model}) · 동시 ${concurrency}개`);
  if (options.referenceImage) runtime.log(`🛒 상품 사진 1장을 참고로 붙여 ${items.length}장 생성`);

  // Saves run one at a time: the local copy is named <heading>-<millisecond>, two parallel saves could collide.
  let saveQueue: Promise<unknown> = Promise.resolve();
  const ctx: RunContext = {
    items, runtime, onImageGenerated,
    reference: options.referenceImage,
    abort: new AbortController(),
    images: new Map(), reasons: new Map(),
    state: { fatal: undefined, stopLaunching: undefined, nextIndex: 0 },
    saveInTurn: (file, item) => {
      const turn = saveQueue.then(() => runtime.save(file, item, postTitle, postId));
      saveQueue = turn.catch(() => undefined);
      return turn;
    },
  };
  const startedAt = Date.now();
  const watcher = setInterval(() => { if (stopCheck?.()) ctx.abort.abort(); }, options.pollMs ?? POLL_MS);
  // A fixed number of workers each take the next unstarted item, so the limit holds without a separate scheduler.
  const worker = async (): Promise<void> => {
    while (!ctx.state.stopLaunching && !ctx.abort.signal.aborted && ctx.state.nextIndex < items.length) {
      await drawOne(ctx, ctx.state.nextIndex++);
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    clearInterval(watcher);
  }
  return conclude(ctx, concurrency, startedAt, options.allowPartial === true);
}
