/**
 * 🍌 리더스 나노바나나 무제한 — adapter for generateImages dispatcher
 *
 * Wraps dropshotCore.makeDropshotImage with:
 * - §12.1 generation mutex (serial queue via _generationChain)
 * - §12.2 ensureDropshotControls per call
 * - §12.3 Korean enhance + variation hint
 * - duplicate detection via imageHashUtils
 * - i2i: referenceImageUrl / referenceImagePath → referenceImageList
 *
 * User-facing label: 🍌 리더스 나노바나나 무제한
 * Internal provider id: dropshot
 * Cost note: 구독자 무제한 · 이미지당 추가비용 0원
 */

import type { ImageRequestItem, GeneratedImage } from './types.js';
import { writeImageFile } from './imageUtils.js';
import {
  probeDuplicate,
  commitHashes,
  applyDiversityHint,
} from './imageHashUtils.js';
import { buildDropshotPrompt } from './dropshotCore.js';
import { makeDropshotImage } from './dropshotCapture.js';

const MAX_DEDUP_ATTEMPTS = 3;

/**
 * generateWithDropshot — dispatcher adapter.
 *
 * Signature matches other generator exports (generateWithFlow, generateWithImageFx etc.).
 */
export async function generateWithDropshot(
  items: ImageRequestItem[],
  postTitle?: string,
  postId?: string,
  _isFullAuto?: boolean,
  _isShoppingConnect?: boolean,
  stopCheck?: () => boolean,
  onImageGenerated?: (
    img: GeneratedImage,
    i: number,
    total: number,
  ) => void,
): Promise<GeneratedImage[]> {
  const results: GeneratedImage[] = [];
  // Per-batch dedup tracking sets (shared across items within one call)
  const usedSha256 = new Set<string>();
  const usedAHashes: bigint[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    if (stopCheck?.()) {
      console.log('[리더스 나노바나나] 중지 요청 감지 → 이미지 생성 중단');
      break;
    }

    const item = items[idx];

    // §12.3 Korean enhance + variation hint
    const enhancedPrompt = buildDropshotPrompt(item.prompt);

    // i2i: collect reference URLs
    const refUrls: string[] = [];
    if (item.referenceImageUrl) refUrls.push(item.referenceImageUrl);
    // Note: referenceImagePath (local path) is skipped — URL-based only for dropshot UI upload
    const hasRef = refUrls.length > 0;

    const onLog = (m: string) => console.log(m);

    // Dedup loop (max MAX_DEDUP_ATTEMPTS)
    let generatedImage: GeneratedImage | null = null;

    for (let dedupAttempt = 0; dedupAttempt < MAX_DEDUP_ATTEMPTS; dedupAttempt++) {
      const promptForAttempt =
        dedupAttempt > 0
          ? applyDiversityHint(enhancedPrompt, dedupAttempt)
          : enhancedPrompt;

      const result = await makeDropshotImage(
        promptForAttempt,
        hasRef ? { referenceImageList: refUrls } : {},
        onLog,
      );

      if (!result.ok || !result.dataUrl) {
        console.warn(
          `[리더스 나노바나나] [${idx + 1}/${items.length}] 생성 실패: ${result.error}`,
        );
        break;
      }

      // Extract base64 payload
      const match = /^data:image\/(\w+);base64,(.+)$/.exec(result.dataUrl);
      if (!match) {
        console.warn('[리더스 나노바나나] dataUrl 파싱 실패');
        break;
      }

      const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
      const buffer = Buffer.from(match[2], 'base64');

      // Duplicate check via probeDuplicate (buffer-based, flowGenerator pattern)
      if (dedupAttempt < MAX_DEDUP_ATTEMPTS - 1) {
        const probe = await probeDuplicate(buffer, usedSha256, usedAHashes);
        if (probe.isDuplicate || probe.isSimilar) {
          console.log(
            `[리더스 나노바나나] [${idx + 1}] 중복 감지 → 재생성 (시도 ${dedupAttempt + 1})`,
          );
          continue;
        }
        // Commit hashes so subsequent items can also dedup against this one
        commitHashes(probe, usedSha256, usedAHashes);
      }

      // Write to disk
      const saved = await writeImageFile(
        buffer,
        ext,
        item.heading,
        postTitle,
        postId,
      );

      const sourceLabel = hasRef
        ? `리더스 나노바나나 무제한 (i2i ${refUrls.length}장)`
        : '리더스 나노바나나 무제한';
      console.log(
        `[리더스 나노바나나] [${idx + 1}/${items.length}] 저장 완료 (${sourceLabel})`,
      );

      generatedImage = {
        heading: item.heading,
        filePath: saved.savedToLocal || saved.filePath,
        previewDataUrl: saved.previewDataUrl,
        provider: 'dropshot' as import('./types.js').ImageProvider,
        savedToLocal: saved.savedToLocal,
        originalIndex: (item as unknown as { originalIndex?: number }).originalIndex,
        sourceUrl: sourceLabel,
        // blob store fields (Phase 2 dual-write)
        blobId: saved.blobId,
        mimeType: saved.mimeType,
        width: saved.width,
        height: saved.height,
        byteSize: saved.byteSize,
        sha256: saved.sha256,
        createdAt: saved.createdAt,
      };
      break;
    }

    if (generatedImage) {
      results.push(generatedImage);
      onImageGenerated?.(generatedImage, idx, items.length);
    }
  }

  return results;
}
