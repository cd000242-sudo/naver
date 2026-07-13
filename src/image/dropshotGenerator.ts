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
import { extractReferenceImageUrl } from './referenceImagePolicy.js';

const MAX_DEDUP_ATTEMPTS = 3;

export function assertCompleteDropshotBatch<T>(
  results: readonly T[],
  expectedCount: number,
  lastFailure?: string,
): void {
  if (results.length === expectedCount) return;
  const detail = lastFailure || 'Dropshot returned an incomplete image batch';
  throw new Error(`IMAGE_BATCH_INCOMPLETE:${results.length}/${expectedCount}:${detail}`);
}
export function normalizeDropshotReferenceUrl(value: unknown): string {
  return extractReferenceImageUrl(value);
}

function collectDropshotReferenceUrls(...sources: unknown[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) add(item);
      return;
    }
    const url = normalizeDropshotReferenceUrl(value);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  for (const source of sources) add(source);
  return urls;
}

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
  isShoppingConnect: boolean = false,
  stopCheck?: () => boolean,
  onImageGenerated?: (
    img: GeneratedImage,
    i: number,
    total: number,
  ) => void,
): Promise<GeneratedImage[]> {
  const results: GeneratedImage[] = [];
  let lastFailure = '';
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

    // i2i: collect URL references. Shopping crawlers sometimes place the
    // official representative image into referenceImagePath even when it is a URL.
    const refUrls = collectDropshotReferenceUrls(
      item.referenceImageList,
      item.referenceImageUrl,
      item.referenceImagePath,
    ).slice(0, 4);
    const hasRef = refUrls.length > 0;
    if (isShoppingConnect && !hasRef) {
      throw new Error('SHOPPING_REFERENCE_IMAGE_REQUIRED: 리더스 나노바나나프로 무제한에 전달할 대표 상품 이미지가 없습니다.');
    }

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
        {
          ...(hasRef ? { referenceImageList: refUrls } : {}),
          requireReferenceImage: isShoppingConnect,
        },
        onLog,
      );

      if (!result.ok || !result.dataUrl) {
        lastFailure = result.error || 'Dropshot image generation failed';
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

      // 마지막 시도까지 반드시 검사한다. 최종 중복을 성공으로 저장하면 이후
      // 발행 단계에서는 복구할 방법이 없으므로 부분 결과로 처리해 상위에서 중단한다.
      const probe = await probeDuplicate(buffer, usedSha256, usedAHashes);
      if (probe.isDuplicate || probe.isSimilar) {
        if (dedupAttempt < MAX_DEDUP_ATTEMPTS - 1) {
          console.log(
            `[리더스 나노바나나] [${idx + 1}] 중복 감지 → 재생성 (시도 ${dedupAttempt + 1})`,
          );
          continue;
        }
        lastFailure = `IMAGE_DUPLICATE_EXHAUSTED: "${item.heading}" 이미지가 ${MAX_DEDUP_ATTEMPTS}회 모두 기존 결과와 중복되었습니다.`;
        console.warn(`[리더스 나노바나나] ${lastFailure}`);
        break;
      }
      // Commit hashes so subsequent items can also dedup against this one
      commitHashes(probe, usedSha256, usedAHashes);

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

  assertCompleteDropshotBatch(results, items.length, lastFailure);

  return results;
}
