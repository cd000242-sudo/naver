// Test helper: builds synthetic press-style watermark variants on top of clean images.
// The overlays mimic what news agencies and broadcasters burn into photos (credit text,
// logo boxes, caption bars). Sizes are relative to the image so any fixture resolution works.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'watermark');

export function loadCleanBases(): Array<{ name: string; buffer: Buffer }> {
  return [1, 2, 3].map((n) => ({
    name: `clean-base-${n}`,
    buffer: readFileSync(join(FIXTURE_DIR, `clean-base-${n}.jpg`)),
  }));
}

const FONT = 'Malgun Gothic, Arial, sans-serif';

interface TextOpts {
  size: number;
  fill: string;
  opacity?: number;
  bold?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  halo?: string;
  haloOpacity?: number;
}

function text(label: string, x: number, y: number, o: TextOpts): string {
  const halo = o.halo ? ` stroke="${o.halo}" stroke-width="${Math.max(1, o.size / 14)}" paint-order="stroke" stroke-opacity="${o.haloOpacity ?? 1}"` : '';
  return `<text x="${Math.round(x)}" y="${Math.round(y)}" font-family="${FONT}" font-size="${Math.round(o.size)}"`
    + ` font-weight="${o.bold ? 'bold' : 'normal'}" text-anchor="${o.anchor ?? 'start'}" fill="${o.fill}"`
    + ` fill-opacity="${o.opacity ?? 1}"${halo}>${label}</text>`;
}

function rect(x: number, y: number, w: number, h: number, fill: string, opacity = 1): string {
  return `<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${Math.round(w)}" height="${Math.round(h)}"`
    + ` fill="${fill}" fill-opacity="${opacity}"/>`;
}

export interface WatermarkVariant {
  name: string;
  body: (w: number, h: number) => string;
}

export const WATERMARK_VARIANTS: WatermarkVariant[] = [
  {
    name: 'top-right white credit "ⓒ 연합뉴스"',
    body: (w, h) => text('ⓒ 연합뉴스', w * 0.97, h * 0.075, { size: w * 0.04, fill: '#fff', bold: true, anchor: 'end', halo: '#000' }),
  },
  {
    name: 'bottom-right red logo box "YTN"',
    body: (w, h) => rect(w * 0.78, h * 0.88, w * 0.17, h * 0.085, '#d6001c')
      + text('YTN', w * 0.865, h * 0.948, { size: w * 0.05, fill: '#fff', bold: true, anchor: 'middle' }),
  },
  {
    name: 'bottom-left 50% black plate with white "news1"',
    body: (w, h) => rect(w * 0.03, h * 0.9, w * 0.17, h * 0.075, '#000', 0.5)
      + text('news1', w * 0.045, h * 0.95, { size: w * 0.045, fill: '#fff', bold: true }),
  },
  {
    name: 'bottom-right white "© Getty Images"',
    body: (w, h) => text('© Getty Images', w * 0.97, h * 0.955, { size: w * 0.04, fill: '#fff', anchor: 'end', halo: '#000' }),
  },
  {
    name: 'top-left blue logo box "KBS"',
    body: (w, h) => rect(w * 0.03, h * 0.03, w * 0.13, h * 0.08, '#0a3d91')
      + text('KBS', w * 0.095, h * 0.092, { size: w * 0.05, fill: '#fff', bold: true, anchor: 'middle' }),
  },
  {
    name: 'bottom strip caption bar "사진=연합뉴스"',
    body: (w, h) => rect(0, h * 0.9, w, h * 0.1, '#000', 0.55)
      + text('사진=연합뉴스 / 뉴시스 제공', w * 0.03, h * 0.9675, { size: w * 0.038, fill: '#fff' }),
  },
  {
    name: 'top-left black "OSEN" with light halo',
    body: (w, h) => text('OSEN', w * 0.03, h * 0.08, { size: w * 0.05, fill: '#111', bold: true, halo: '#fff' }),
  },
  {
    name: 'bottom-right 90% white "ⓒ SPOTV NEWS" with dark outline',
    body: (w, h) => text('ⓒ SPOTV NEWS', w * 0.97, h * 0.955, { size: w * 0.04, fill: '#fff', opacity: 0.9, bold: true, anchor: 'end', halo: '#000', haloOpacity: 0.85 }),
  },
  {
    name: 'bottom-center small white credit "ⓒ 스타뉴스"',
    body: (w, h) => text('ⓒ 스타뉴스', w * 0.5, h * 0.96, { size: w * 0.035, fill: '#fff', bold: true, anchor: 'middle', halo: '#000' }),
  },
];

/** Burns the variant onto the image and re-encodes as JPEG, as a publisher would. */
export async function applyVariant(base: Buffer, variant: WatermarkVariant): Promise<Buffer> {
  const meta = await sharp(base).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${variant.body(w, h)}</svg>`;
  return sharp(base).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 82 }).toBuffer();
}

/** Clean-image stress variants that must NOT be flagged: sensor grain and heavy recompression. */
export async function grainy(base: Buffer, sigma = 22): Promise<Buffer> {
  const meta = await sharp(base).metadata();
  const noise = await sharp({
    create: { width: meta.width ?? 1, height: meta.height ?? 1, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma } },
  }).png().toBuffer();
  return sharp(base).composite([{ input: noise, blend: 'overlay' }]).jpeg({ quality: 85 }).toBuffer();
}

export async function recompressed(base: Buffer, quality = 45): Promise<Buffer> {
  return sharp(base).jpeg({ quality }).toBuffer();
}
