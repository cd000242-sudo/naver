// Deterministic thumbnail variant composer for the NAVER blog image pipeline.
// One source image (AI or real photo) in, cheap non-generative 800x800
// variants out. A separate judge picks the winner — no AI calls here.
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export const THUMBNAIL_SIZE = 800;

export interface ComposeResult { readonly filePath: string; readonly width: number; readonly height: number; readonly method: string; }

const FONT_FAMILY = 'Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, sans-serif';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function ensureOutputDir(outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Write via a temp path, then copy into place — never write to the same
// path that was read as input. Windows keeps a handle open on path-based
// reads/writes, so an in-place overwrite fails (see thumbnailService.ts).
async function writeEncoded(pipeline: sharp.Sharp, outputPath: string): Promise<void> {
  ensureOutputDir(outputPath);
  const ext = path.extname(outputPath).toLowerCase();
  const encoded = ext === '.jpg' || ext === '.jpeg' ? pipeline.jpeg({ quality: 90 }) : pipeline.png();
  const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
  await encoded.toFile(tempPath);
  fs.copyFileSync(tempPath, outputPath);
  fs.unlinkSync(tempPath);
}

async function readBackResult(outputPath: string, method: string): Promise<ComposeResult> {
  const metadata = await sharp(fs.readFileSync(outputPath)).metadata();
  return { filePath: outputPath, width: metadata.width || 0, height: metadata.height || 0, method };
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Near-square sources are attention-cropped to 800x800 ('cover'). Everything
 * else gets a blurred/darkened background extension — no generative fill.
 */
export async function composeSquare800(inputPath: string, outputPath: string): Promise<ComposeResult> {
  const inputBuffer = fs.readFileSync(inputPath);
  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width || THUMBNAIL_SIZE;
  const height = metadata.height || THUMBNAIL_SIZE;
  const ratio = width / height;

  if (ratio >= 0.8 && ratio <= 1.25) {
    const pipeline = sharp(inputBuffer).resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', position: sharp.strategy.attention });
    await writeEncoded(pipeline, outputPath);
    return readBackResult(outputPath, 'cover');
  }

  const backgroundBuffer = await sharp(inputBuffer)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', position: sharp.strategy.attention })
    .blur(24)
    .modulate({ brightness: 0.55 })
    .toBuffer();

  const foregroundBuffer = await sharp(inputBuffer).resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside' }).toBuffer();
  const foregroundMeta = await sharp(foregroundBuffer).metadata();
  const fgWidth = foregroundMeta.width || THUMBNAIL_SIZE;
  const fgHeight = foregroundMeta.height || THUMBNAIL_SIZE;

  const pipeline = sharp(backgroundBuffer).composite([{
    input: foregroundBuffer,
    left: Math.round((THUMBNAIL_SIZE - fgWidth) / 2),
    top: Math.round((THUMBNAIL_SIZE - fgHeight) / 2),
  }]);
  await writeEncoded(pipeline, outputPath);
  return readBackResult(outputPath, 'extend');
}

/**
 * Zoomed-in 800x800 crop so the subject reads at the ~200px width a NAVER
 * mobile feed actually renders thumbnails at. zoom is clamped to [1.05, 1.8].
 */
export async function composeTightCrop800(inputPath: string, outputPath: string, zoom = 1.3): Promise<ComposeResult> {
  const clampedZoom = clamp(zoom, 1.05, 1.8);
  const inputBuffer = fs.readFileSync(inputPath);
  const scaledSize = Math.round(THUMBNAIL_SIZE * clampedZoom);
  const offset = Math.round((scaledSize - THUMBNAIL_SIZE) / 2);

  const scaledBuffer = await sharp(inputBuffer)
    .resize(scaledSize, scaledSize, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer();

  const pipeline = sharp(scaledBuffer).extract({ left: offset, top: offset, width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE });
  await writeEncoded(pipeline, outputPath);
  return readBackResult(outputPath, 'tight');
}

const PAIR_GAP = 8;

/**
 * Two real photos side by side (V1 §6·§7: the real person + the real counterpart). Each half is
 * attention-cropped to the same size so both subjects read at the same scale, and a thin light gap
 * keeps the two sources visibly separate instead of faking one photo. EXIF orientation is applied.
 */
export async function composePair800(leftPath: string, rightPath: string, outputPath: string): Promise<ComposeResult> {
  const halfWidth = Math.floor((THUMBNAIL_SIZE - PAIR_GAP) / 2);
  const half = (file: string) => sharp(fs.readFileSync(file))
    .rotate()
    .resize(halfWidth, THUMBNAIL_SIZE, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer();
  const [left, right] = await Promise.all([half(leftPath), half(rightPath)]);
  const pipeline = sharp({ create: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, channels: 3, background: '#f2f2f2' } })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: THUMBNAIL_SIZE - halfWidth, top: 0 },
    ]);
  await writeEncoded(pipeline, outputPath);
  return readBackResult(outputPath, 'pair');
}

// ---- hook card text layout ----

const MIN_FONT = 72;
const MAX_FONT = 150;
const SAFE_WIDTH_RATIO = 0.88;
const STROKE_PAD = 12; // the outline widens every line slightly
const SUB_FONT_SIZE = 48; // within the required 40-56px range

/**
 * Glyph advance in em. A flat 0.62 em per character made "징역 10년 구형" 150px tall and wider than the
 * card (live render): Hangul is about a full em, digits and Latin about 0.6, a space about 0.3.
 */
function glyphEm(ch: string): number {
  if (/[ᄀ-ᇿ㄰-㆏가-힯぀-ヿ一-鿿]/u.test(ch)) return 1;
  if (ch === ' ') return 0.3;
  if (/[0-9A-Za-z]/u.test(ch)) return 0.6;
  return 0.5;
}

function textEm(text: string): number {
  return [...text].reduce((sum, ch) => sum + glyphEm(ch), 0);
}

function estimateTextWidth(text: string, fontSize: number): number {
  return textEm(text) * fontSize + STROKE_PAD;
}

/** Largest font size (clamped) at which every line fits the safe width. */
function fitFontSize(lines: readonly string[], maxWidth: number): number {
  const widestEm = Math.max(...lines.map(textEm), 1);
  return Math.max(MIN_FONT, Math.min(MAX_FONT, Math.floor((maxWidth - STROKE_PAD) / widestEm)));
}

/**
 * Pure line splitter for the hook headline. Returns 1 or 2 lines. Never
 * breaks a word in the middle unless the text has no spaces at all and is
 * too long to fit, in which case it splits at the midpoint character.
 */
export function splitHookLines(text: string, maxCharsPerLine: number): string[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length <= maxCharsPerLine) return [trimmed];

  const spaceIndices: number[] = [];
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] === ' ') spaceIndices.push(i);
  }
  if (spaceIndices.length === 0) {
    const mid = Math.ceil(trimmed.length / 2);
    return [trimmed.slice(0, mid), trimmed.slice(mid)];
  }

  const middle = trimmed.length / 2;
  let bestIndex = spaceIndices[0];
  let bestDistance = Math.abs(bestIndex - middle);
  for (const index of spaceIndices) {
    const distance = Math.abs(index - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  const first = trimmed.slice(0, bestIndex).trim();
  const second = trimmed.slice(bestIndex + 1).trim();
  return first && second ? [first, second] : [trimmed];
}

function buildMainLines(mainText: string): { lines: string[]; fontSize: number } {
  const maxWidth = THUMBNAIL_SIZE * SAFE_WIDTH_RATIO;
  if (estimateTextWidth(mainText, MIN_FONT) > maxWidth) {
    // Too long for one line even at the minimum size: split near the middle, then fit the longer line.
    const lines = splitHookLines(mainText, Math.ceil(mainText.trim().length / 2));
    return { lines, fontSize: fitFontSize(lines, maxWidth) };
  }
  return { lines: [mainText], fontSize: fitFontSize([mainText], maxWidth) };
}

type HookLine = { text: string; fontSize: number; color: string; stroke: boolean };

function buildHookCardSvg(mainText: string, subText?: string): string {
  const { lines: mainLines, fontSize: mainFontSize } = buildMainLines(mainText);
  const trimmedSub = subText?.trim();

  const layers: HookLine[] = [];
  if (trimmedSub) {
    layers.push({ text: trimmedSub, fontSize: SUB_FONT_SIZE, color: '#FFD84D', stroke: false });
  }
  for (const line of mainLines) {
    layers.push({ text: line, fontSize: mainFontSize, color: '#FFFFFF', stroke: true });
  }

  const bottomPadding = 56;
  const lineGap = 14;
  const ys: number[] = new Array(layers.length);
  let cursor = THUMBNAIL_SIZE - bottomPadding;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    ys[i] = cursor;
    cursor -= Math.round(layers[i].fontSize * 1.15) + lineGap;
  }

  const textElements = layers.map((layer, i) => {
    const strokeAttrs = layer.stroke ? ' stroke="#000000" stroke-width="10" stroke-linejoin="round" paint-order="stroke"' : '';
    return `<text x="50%" y="${ys[i]}" text-anchor="middle" fill="${layer.color}"${strokeAttrs} font-size="${layer.fontSize}px" font-family="${FONT_FAMILY}" font-weight="900">${escapeXml(layer.text)}</text>`;
  }).join('\n');

  const gradientTop = Math.round(THUMBNAIL_SIZE * 0.45);
  const gradientHeight = THUMBNAIL_SIZE - gradientTop;
  return `<svg width="${THUMBNAIL_SIZE}" height="${THUMBNAIL_SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="hookGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.8" />
    </linearGradient></defs>
    <rect x="0" y="${gradientTop}" width="${THUMBNAIL_SIZE}" height="${gradientHeight}" fill="url(#hookGradient)" />
    ${textElements}
  </svg>`;
}

/**
 * 800x800 attention-cropped cover with a bottom gradient and a bold hook
 * headline (+ optional sub line) overlaid. Empty/whitespace main throws.
 */
export async function composeHookCard800(
  inputPath: string,
  outputPath: string,
  hook: { main: string; sub?: string },
): Promise<ComposeResult> {
  const mainText = (hook.main || '').trim();
  if (!mainText) {
    throw new Error('composeHookCard800: hook.main must not be empty');
  }

  const inputBuffer = fs.readFileSync(inputPath);
  const coverBuffer = await sharp(inputBuffer)
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', position: sharp.strategy.attention })
    .toBuffer();

  const svgOverlay = buildHookCardSvg(mainText, hook.sub);
  const pipeline = sharp(coverBuffer).composite([{ input: Buffer.from(svgOverlay), left: 0, top: 0 }]);
  await writeEncoded(pipeline, outputPath);
  return readBackResult(outputPath, 'hook');
}
