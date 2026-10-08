// src/crawler/issueHarness/watermarkCheck.ts
//
// Free pixel-level check for burned-in text/logo overlays (press credits, broadcaster bugs,
// caption bars). URL substrings cannot see these and the Vision gate is off by default, so
// this runs on every fetched candidate with no network or model call.
//
// How it works (all on the ORIGINAL fetched bytes, downscaled only to a 960px working width):
//   1. Overlay strokes are thin, pure white or pure black, and hard-edged. A pixel is a
//      "stroke pixel" when it is near-white/near-black AND differs from its blurred
//      surroundings by a lot (difference of Gaussians).
//   2. Only elongated strokes count: a stroke pixel must continue in some direction on both
//      sides. Sparkles, bokeh and specular dots are blobs and drop out; glyph strokes stay.
//   3. Stroke pixels are counted per ~1%-wide cell. A cell is "inked" when >= 4% of its
//      pixels are stroke pixels.
//   4. Windows (22% wide x 14% tall) slide along the top and bottom edges. In each window we
//      look for a horizontal band of rows (a text line) much inkier than the rest of the
//      window AND than the image's own interior baseline. Score = best (band - reference).
//
// Calibrated on clean AI images (max score ~0.09) versus synthetic press overlays (min ~0.22);
// see issueWatermarkCheck.test.ts. Translucent marks below ~70% opacity on bright
// backgrounds are not caught — an honest limitation, shown in the UI note.
//
// Never throws: any analysis failure is logged and treated as "not suspected".

import sharp from 'sharp';

const LOG = '[IssueWatermark]';

const WORK_WIDTH = 960;
const MIN_WIDTH = 160;
const MIN_HEIGHT = 120;
const BLUR_SIGMA = 3;
const STROKE_CONTRAST = 40;
const WHITE_MIN = 233;
const BLACK_MAX = 22;
const REACH = 4;
const CELL_INK_FRACTION = 0.04;
const WINDOW_W = 0.22;
const WINDOW_H = 0.14;
const BAND_MAX_FRAC = 0.07;
const GRID_COLUMNS = 96;

/** Suspect at or above this score. Clean AI images stay below ~0.09, overlays start at ~0.22. */
export const WATERMARK_SCORE_THRESHOLD = 0.18;

export type WatermarkRegion =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface WatermarkVerdict {
  suspected: boolean;
  /** Where the overlay sits. null when nothing is suspected. */
  region: WatermarkRegion | null;
  /** 0..1 — how much a text-line band stands out from its surroundings. */
  score: number;
}

const NOT_SUSPECTED: WatermarkVerdict = { suspected: false, region: null, score: 0 };

/** Stroke mask: near-white/near-black, high local contrast. */
function strokeMask(grey: Buffer, blurred: Buffer): Uint8Array {
  const mask = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) {
    const v = grey[i];
    let d = v - blurred[i];
    if (d < 0) d = -d;
    if (d >= STROKE_CONTRAST && (v >= WHITE_MIN || v <= BLACK_MAX)) mask[i] = 1;
  }
  return mask;
}

/** Inked-cell flags (1/0) per grid cell, counting only elongated stroke pixels. */
function inkedCells(mask: Uint8Array, w: number, h: number, cell: number, cw: number, ch: number): Uint8Array {
  const counts = new Uint16Array(cw * ch);
  const r = REACH;
  const yEnd = Math.min(ch * cell, h - r);
  const xEnd = Math.min(cw * cell, w - r);
  for (let y = r; y < yEnd; y++) {
    const rowBase = Math.floor(y / cell) * cw;
    for (let x = r; x < xEnd; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const elongated = (mask[i - r] && mask[i + r])
        || (mask[i - r * w] && mask[i + r * w])
        || (mask[i - r * w - r] && mask[i + r * w + r])
        || (mask[i - r * w + r] && mask[i + r * w - r]);
      if (elongated) counts[rowBase + Math.floor(x / cell)]++;
    }
  }
  const minPixels = CELL_INK_FRACTION * cell * cell;
  const flags = new Uint8Array(cw * ch);
  for (let i = 0; i < flags.length; i++) flags[i] = counts[i] >= minPixels ? 1 : 0;
  return flags;
}

/** Share of inked cells in the central 60% x 60% — the image's own texture baseline. */
function interiorBaseline(flags: Uint8Array, cw: number, ch: number): number {
  const x0 = Math.round(cw * 0.2);
  const x1 = Math.round(cw * 0.8);
  const y0 = Math.round(ch * 0.2);
  const y1 = Math.round(ch * 0.8);
  let sum = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += flags[y * cw + x];
  return sum / Math.max(1, (x1 - x0) * (y1 - y0));
}

/** Best text-line band in one window: band density minus max(rest of window, interior baseline). */
function windowScore(flags: Uint8Array, cw: number, x0: number, y0: number, winW: number, winH: number, bandMax: number, baseline: number): number {
  const rows: number[] = [];
  let total = 0;
  for (let y = y0; y < y0 + winH; y++) {
    let s = 0;
    for (let x = x0; x < x0 + winW; x++) s += flags[y * cw + x];
    rows.push(s / winW);
    total += s / winW;
  }
  let best = 0;
  for (let k = 2; k <= bandMax; k++) {
    for (let start = 0; start + k <= winH; start++) {
      let sum = 0;
      for (let i = start; i < start + k; i++) sum += rows[i];
      const rest = winH > k ? (total - sum) / (winH - k) : 0;
      best = Math.max(best, sum / k - Math.max(rest, baseline));
    }
  }
  return best;
}

function regionLabel(top: boolean, centerX: number): WatermarkRegion {
  const side = centerX < 0.33 ? 'left' : centerX > 0.67 ? 'right' : 'center';
  return `${top ? 'top' : 'bottom'}-${side}` as WatermarkRegion;
}

async function analyse(buffer: Buffer): Promise<WatermarkVerdict> {
  const meta = await sharp(buffer, { failOn: 'none' }).metadata();
  if ((meta.width ?? 0) < MIN_WIDTH || (meta.height ?? 0) < MIN_HEIGHT) return NOT_SUSPECTED;

  const base = sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({ width: WORK_WIDTH, withoutEnlargement: true })
    .greyscale();
  const [sharpPart, blurPart] = await Promise.all([
    base.clone().raw().toBuffer({ resolveWithObject: true }),
    base.clone().blur(BLUR_SIGMA).raw().toBuffer(),
  ]);
  const { width: w, height: h } = sharpPart.info;

  const cell = Math.max(6, Math.round(w / GRID_COLUMNS));
  const cw = Math.floor(w / cell);
  const ch = Math.floor(h / cell);
  const flags = inkedCells(strokeMask(sharpPart.data, blurPart), w, h, cell, cw, ch);
  const baseline = interiorBaseline(flags, cw, ch);

  const winW = Math.max(4, Math.round(cw * WINDOW_W));
  const winH = Math.max(3, Math.round(ch * WINDOW_H));
  const bandMax = Math.max(3, Math.round(ch * BAND_MAX_FRAC));
  const step = Math.max(1, Math.round(cw * 0.04));

  let best = { score: 0, region: null as WatermarkRegion | null };
  for (const top of [true, false]) {
    const y0 = top ? 0 : ch - winH;
    for (let x0 = 0; x0 + winW <= cw; x0 += step) {
      const score = windowScore(flags, cw, x0, y0, winW, winH, bandMax, baseline);
      if (score > best.score) best = { score, region: regionLabel(top, (x0 + winW / 2) / cw) };
    }
  }
  const suspected = best.score >= WATERMARK_SCORE_THRESHOLD;
  return { suspected, region: suspected ? best.region : null, score: Math.round(best.score * 1000) / 1000 };
}

/**
 * Detect a burned-in text/logo overlay in the corners or top/bottom strips.
 * Free, local, and safe to call on every candidate: errors never escape.
 */
export async function detectWatermark(buffer: Buffer): Promise<WatermarkVerdict> {
  try {
    return await analyse(buffer);
  } catch (error) {
    console.warn(`${LOG} 분석 실패 — 의심 없음으로 처리: ${(error as Error).message}`);
    return NOT_SUSPECTED;
  }
}
