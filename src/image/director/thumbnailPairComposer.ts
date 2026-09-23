/**
 * SPEC-NAVER-IMAGE-2026 V1 §5·§6·§7 — two real photos in one 800x800 thumbnail.
 *
 *   LEFT  photo A | RIGHT photo B   same size, a thin light gap between (two sources, not one fake photo)
 *   BOTTOM        short copy band   only when there is copy; a separate band, so it never covers a face
 *
 * Crop policy without any face analysis: a photo taller than its slot keeps the top (face and upper
 * body); any other photo is cropped sideways on its most salient region (sharp's attention strategy:
 * skin tone, saturation, brightness), which keeps an off-centre subject in frame and falls back to
 * the middle when nothing stands out. A photo that would need more than 2.2x upscaling is refused, so
 * the caller falls back to one photo instead of printing a blurry half.
 */
import sharp from 'sharp';
import fs from 'fs';
import {
  FONT_FAMILY,
  STROKE_PAD,
  THUMBNAIL_SIZE,
  escapeXml,
  readBackResult,
  splitHookLines,
  textEm,
  writeEncoded,
  type ComposeResult,
} from './thumbnailComposer.js';

export const PAIR_GAP = 8;
export const PAIR_HALF_WIDTH = Math.floor((THUMBNAIL_SIZE - PAIR_GAP) / 2);
export const MAX_PAIR_UPSCALE = 2.2;
/** A real photo whose shorter side is below this is not used for a thumbnail at all (over ~2.7x blow-up). */
export const MIN_REAL_PHOTO_SIDE = 300;

const BAND_PADDING = 22;
const BAND_ONE_LINE = 170;
const BAND_TWO_LINES = 230;
const BAND_MAX_FONT = 118;
const BAND_MIN_FONT = 56;
const BAND_ONE_LINE_MIN_FONT = 80;
const BAND_BACKGROUND = '#151515';
const GAP_COLOR = '#f2f2f2';

export interface OrientedSize {
  readonly width: number;
  readonly height: number;
}

/** Width and height as displayed (EXIF orientation 5–8 swaps them); null when the file cannot be read. */
export async function readOrientedSize(filePath: string): Promise<OrientedSize | null> {
  try {
    const meta = await sharp(fs.readFileSync(filePath)).metadata();
    if (!meta.width || !meta.height) return null;
    return (meta.orientation ?? 1) >= 5
      ? { width: meta.height, height: meta.width }
      : { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}

/** 'north' when the photo is taller than the slot (keep the face), 'attention' otherwise. */
export function pairCropPosition(size: OrientedSize, slotWidth: number, slotHeight: number): 'north' | 'attention' {
  return size.width / size.height < slotWidth / slotHeight ? 'north' : 'attention';
}

async function pairHalf(filePath: string, slotHeight: number): Promise<Buffer> {
  const upright = await sharp(fs.readFileSync(filePath)).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  if (!meta.width || !meta.height) throw new Error(`composePair800: unreadable image ${filePath}`);
  const size = { width: meta.width, height: meta.height };
  const upscale = Math.max(PAIR_HALF_WIDTH / size.width, slotHeight / size.height);
  if (upscale > MAX_PAIR_UPSCALE) {
    throw new Error(`composePair800: ${size.width}x${size.height} is too small for half a thumbnail`);
  }
  const position = pairCropPosition(size, PAIR_HALF_WIDTH, slotHeight) === 'north'
    ? sharp.gravity.north
    : sharp.strategy.attention;
  return sharp(upright).resize(PAIR_HALF_WIDTH, slotHeight, { fit: 'cover', position }).toBuffer();
}

export interface BandLayout {
  readonly lines: string[];
  readonly fontSize: number;
  readonly bandHeight: number;
}

/** One line when it stays large enough, otherwise two balanced lines; the font fits width and band. */
export function pairBandLayout(text: string): BandLayout {
  const clean = text.replace(/\s+/gu, ' ').trim();
  const maxWidth = THUMBNAIL_SIZE - 2 * BAND_PADDING - STROKE_PAD;
  const oneLineFont = Math.floor(maxWidth / Math.max(textEm(clean), 1));
  const lines = oneLineFont >= BAND_ONE_LINE_MIN_FONT ? [clean] : splitHookLines(clean, Math.ceil(clean.length / 2));
  const bandHeight = lines.length === 1 ? BAND_ONE_LINE : BAND_TWO_LINES;
  const widthFont = Math.floor(maxWidth / Math.max(...lines.map(textEm), 1));
  const heightFont = Math.floor((bandHeight - 2 * BAND_PADDING) / (lines.length * 1.15));
  const fontSize = Math.max(BAND_MIN_FONT, Math.min(BAND_MAX_FONT, widthFont, heightFont));
  return { lines, fontSize, bandHeight };
}

function bandSvg(layout: BandLayout): string {
  const lineHeight = Math.round(layout.fontSize * 1.15);
  const blockHeight = lineHeight * layout.lines.length;
  const firstBaseline = Math.round((layout.bandHeight - blockHeight) / 2 + layout.fontSize * 0.95);
  const text = layout.lines.map((line, i) => (
    `<text x="50%" y="${firstBaseline + i * lineHeight}" text-anchor="middle" fill="#FFFFFF" font-size="${layout.fontSize}px"`
    + ` font-family="${FONT_FAMILY}" font-weight="900">${escapeXml(line)}</text>`
  )).join('\n');
  return `<svg width="${THUMBNAIL_SIZE}" height="${layout.bandHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${THUMBNAIL_SIZE}" height="${layout.bandHeight}" fill="${BAND_BACKGROUND}" />
    ${text}
  </svg>`;
}

/**
 * Two photos side by side; with `hook`, the photos share the upper part and the copy sits in its own
 * band below them. Throws when a photo cannot be read or is too small — the caller keeps one photo.
 */
export async function composePair800(
  leftPath: string,
  rightPath: string,
  outputPath: string,
  hook?: { main: string },
): Promise<ComposeResult> {
  const main = String(hook?.main || '').trim();
  const layout = main ? pairBandLayout(main) : null;
  const photoHeight = THUMBNAIL_SIZE - (layout?.bandHeight ?? 0);
  const [left, right] = await Promise.all([pairHalf(leftPath, photoHeight), pairHalf(rightPath, photoHeight)]);
  const layers: sharp.OverlayOptions[] = [
    { input: left, left: 0, top: 0 },
    { input: right, left: THUMBNAIL_SIZE - PAIR_HALF_WIDTH, top: 0 },
  ];
  if (layout) layers.push({ input: Buffer.from(bandSvg(layout)), left: 0, top: photoHeight });
  const pipeline = sharp({ create: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, channels: 3, background: GAP_COLOR } })
    .composite(layers);
  await writeEncoded(pipeline, outputPath);
  return readBackResult(outputPath, layout ? 'pair-band' : 'pair');
}
