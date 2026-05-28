/**
 * Image resizer for Vision API calls.
 *
 * Vision providers (Gemini, OpenAI, Claude) tile or downscale large images
 * internally. Sending a 4032×3024 phone photo wastes input tokens because
 * the model effectively analyzes a downscaled tile anyway. Resizing to
 * MAX_EDGE_PX upstream typically reduces input tokens by 30–50% with no
 * perceptible loss in inference quality (Phase 6 — cost reduction target).
 *
 * The resizer preserves the source format when possible:
 * - JPEG and HEIC inputs become JPEG at JPEG_QUALITY.
 * - PNG inputs stay PNG to retain alpha.
 * - WebP inputs stay WebP.
 * Anything else is normalized to JPEG.
 *
 * Images already at or below MAX_EDGE_PX pass through with skipped=true so
 * callers can tell when the resizer did real work.
 */

import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_EDGE_PX = 1024;
const JPEG_QUALITY = 85;

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface ResizeResult {
  /** Resized image as base64 (or original if no resize was needed). */
  readonly base64: string;
  /** MIME type of the output. May differ from the input when normalized. */
  readonly mimeType: string;
  /** Byte size of the source base64 (before resize). */
  readonly originalBytes: number;
  /** Byte size of the output base64. */
  readonly resizedBytes: number;
  /** True when the input was already small enough and no resize ran. */
  readonly skipped: boolean;
}

// ---------------------------------------------------------------------------
// Format selection
// ---------------------------------------------------------------------------

function pickOutputFormat(mimeType: string): {
  format: 'jpeg' | 'png' | 'webp';
  outMime: string;
} {
  const lower = mimeType.toLowerCase();
  if (lower.includes('png')) {
    return { format: 'png', outMime: 'image/png' };
  }
  if (lower.includes('webp')) {
    return { format: 'webp', outMime: 'image/webp' };
  }
  // jpeg, heic, heif, and unknown all collapse to jpeg
  return { format: 'jpeg', outMime: 'image/jpeg' };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resizes an image so its longest edge does not exceed MAX_EDGE_PX.
 *
 * If the input is already small enough, returns the original payload with
 * skipped=true. EXIF orientation is auto-applied so the output is upright,
 * but other metadata is stripped to reduce payload size.
 *
 * @throws {Error} If sharp cannot decode the image (corrupt or unsupported).
 */
export async function resizeForVision(
  imageBase64: string,
  mimeType: string,
): Promise<ResizeResult> {
  const inputBuffer = Buffer.from(imageBase64, 'base64');
  const originalBytes = inputBuffer.byteLength;

  // Probe metadata first so we can short-circuit small images
  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const longestEdge = Math.max(width, height);

  if (longestEdge > 0 && longestEdge <= MAX_EDGE_PX) {
    return {
      base64: imageBase64,
      mimeType,
      originalBytes,
      resizedBytes: originalBytes,
      skipped: true,
    };
  }

  const { format, outMime } = pickOutputFormat(mimeType);

  const pipeline = sharp(inputBuffer)
    .rotate()
    .resize({
      width: MAX_EDGE_PX,
      height: MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    });

  let outputBuffer: Buffer;
  switch (format) {
    case 'png':
      outputBuffer = await pipeline.png().toBuffer();
      break;
    case 'webp':
      outputBuffer = await pipeline.webp({ quality: JPEG_QUALITY }).toBuffer();
      break;
    case 'jpeg':
    default:
      outputBuffer = await pipeline
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      break;
  }

  return {
    base64: outputBuffer.toString('base64'),
    mimeType: outMime,
    originalBytes,
    resizedBytes: outputBuffer.byteLength,
    skipped: false,
  };
}

/**
 * Convenience helper that returns the byte-savings ratio of a ResizeResult.
 * Returns 0 when no resize ran or the input was empty.
 */
export function savingsRatio(result: ResizeResult): number {
  if (result.skipped || result.originalBytes === 0) return 0;
  const saved = result.originalBytes - result.resizedBytes;
  return saved <= 0 ? 0 : saved / result.originalBytes;
}
