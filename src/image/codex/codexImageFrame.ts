// src/image/codex/codexImageFrame.ts
// [2026-11-04] Codex image_gen takes no size argument and mostly ignores the ratio line: measured 1672x941 x6,
// 940x1672 x1, 1254x1254 x1 for "square 1:1" requests. Naver wants 1:1, so the saved file is centre-cropped to the
// requested frame (default 1:1). The instruction asks for the subject and all text inside the central square, so the
// crop keeps them. Anything sharp cannot read is passed through unchanged (the image is never lost over its frame).
import sharp from 'sharp';

const RATIOS: Readonly<Record<string, number>> = Object.freeze({ '1:1': 1, '16:9': 16 / 9, '9:16': 9 / 16, '4:3': 4 / 3, '3:4': 3 / 4 });
const TOLERANCE = 0.02;

export function codexTargetRatio(ratio: unknown): { key: string; value: number } {
  const key = Object.prototype.hasOwnProperty.call(RATIOS, String(ratio ?? '')) ? String(ratio) : '1:1';
  return { key, value: RATIOS[key] };
}

/** The largest centred box with the target ratio, or null when the image is already within 2% of it. */
export function centerCropBox(width: number, height: number, target: number): { left: number; top: number; width: number; height: number } | null {
  if (!(width > 0 && height > 0 && target > 0)) return null;
  if (Math.abs(width / height - target) / target <= TOLERANCE) return null;
  const cropWidth = Math.min(width, Math.round(height * target));
  const cropHeight = Math.min(height, Math.round(width / target));
  return { left: Math.floor((width - cropWidth) / 2), top: Math.floor((height - cropHeight) / 2), width: cropWidth, height: cropHeight };
}

export async function fitCodexImageToRatio(buffer: Buffer, ratio: unknown): Promise<{ buffer: Buffer; cropped: boolean; from: string; to: string; target: string }> {
  const { key, value } = codexTargetRatio(ratio);
  try {
    const meta = await sharp(buffer).metadata();
    const from = `${meta.width}x${meta.height}`;
    const box = centerCropBox(Number(meta.width), Number(meta.height), value);
    if (!box) return { buffer, cropped: false, from, to: from, target: key };
    const out = await sharp(buffer).extract(box).toBuffer();
    return { buffer: out, cropped: true, from, to: `${box.width}x${box.height}`, target: key };
  } catch {
    return { buffer, cropped: false, from: 'unknown', to: 'unknown', target: key };
  }
}
