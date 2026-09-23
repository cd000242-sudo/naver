// SPEC-NAVER-IMAGE-2026 V1 §5·§6·§7 — two real photos side by side ("실제 박서함 + 실제 안소희").
// Local sharp only; no model call. Synthetic "people": a skin-tone face disc on a grey background, so
// every check can ask "is the face still in the frame, and above the copy band?".
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ImageRequestItem } from '../image/types';
import { THUMBNAIL_SIZE, composeSquare800 } from '../image/director/thumbnailComposer';
import { MIN_REAL_PHOTO_SIDE, PAIR_HALF_WIDTH, composePair800, pairBandLayout, pairCropPosition } from '../image/director/thumbnailPairComposer';
import { keepUsableRealPhotos } from '../image/director/thumbnailDirectorGate';
import { runThumbnailDirector, type ThumbnailDirectorDeps, type ThumbnailDirectorInput } from '../image/director/thumbnailDirector';

const PARK_TITLE = '소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억';
const FACE = { r: 228, g: 168, b: 128 };
let dir = '';
const file = (name: string) => path.join(dir, name);

/** A grey photo with one face disc (radius r) centred at (cx, cy). */
async function person(name: string, width: number, height: number, cx: number, cy: number, r: number): Promise<string> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#7d7d7d"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgb(${FACE.r},${FACE.g},${FACE.b})"/></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(file(name));
  return file(name);
}

/** Share of face-coloured pixels inside a region of the output. */
async function faceShare(image: string, left: number, top: number, width: number, height: number): Promise<number> {
  const raw = await sharp(image).extract({ left, top, width, height }).removeAlpha().raw().toBuffer();
  let hits = 0;
  for (let i = 0; i < raw.length; i += 3) {
    if (Math.abs(raw[i] - FACE.r) < 30 && Math.abs(raw[i + 1] - FACE.g) < 30 && Math.abs(raw[i + 2] - FACE.b) < 30) hits++;
  }
  return hits / (width * height);
}

const LEFT = (h: number) => [0, 0, PAIR_HALF_WIDTH, h] as const;
const RIGHT = (h: number) => [THUMBNAIL_SIZE - PAIR_HALF_WIDTH, 0, PAIR_HALF_WIDTH, h] as const;

beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-pair-')); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('composePair800 — crop keeps both faces in frame', () => {
  it('portrait + portrait: both faces kept, halves the same size', async () => {
    const a = await person('pp-a.jpg', 900, 1200, 450, 330, 140);
    const b = await person('pp-b.jpg', 900, 1200, 450, 330, 140);
    const out = file('pp.png');
    expect((await composePair800(a, b, out)).width).toBe(THUMBNAIL_SIZE);
    expect(await faceShare(out, ...LEFT(800))).toBeGreaterThan(0.05);
    expect(await faceShare(out, ...RIGHT(800))).toBeGreaterThan(0.05);
  });

  it('landscape with the face off to the side + portrait: the side face is not cut away', async () => {
    const a = await person('lp-a.jpg', 1600, 900, 1260, 330, 150);
    const b = await person('lp-b.jpg', 900, 1200, 450, 330, 140);
    const out = file('lp.png');
    await composePair800(a, b, out);
    expect(await faceShare(out, ...LEFT(800))).toBeGreaterThan(0.05);
    expect(await faceShare(out, ...RIGHT(800))).toBeGreaterThan(0.05);
  });

  it('landscape + landscape with faces on opposite sides', async () => {
    const a = await person('ll-a.jpg', 1600, 900, 300, 300, 150);
    const b = await person('ll-b.jpg', 1600, 900, 1300, 300, 150);
    const out = file('ll.png');
    await composePair800(a, b, out);
    expect(await faceShare(out, ...LEFT(800))).toBeGreaterThan(0.05);
    expect(await faceShare(out, ...RIGHT(800))).toBeGreaterThan(0.05);
  });

  it('a very tall photo keeps its top (the head is never cut off)', async () => {
    expect(pairCropPosition({ width: 600, height: 1600 }, PAIR_HALF_WIDTH, 800)).toBe('north');
    expect(pairCropPosition({ width: 1600, height: 900 }, PAIR_HALF_WIDTH, 800)).toBe('attention');
    const a = await person('tall-a.jpg', 600, 1600, 300, 190, 120);
    const b = await person('tall-b.jpg', 900, 1200, 450, 330, 140);
    const out = file('tall.png');
    await composePair800(a, b, out);
    expect(await faceShare(out, 0, 0, PAIR_HALF_WIDTH, 260)).toBeGreaterThan(0.05);
  });

  it('different resolutions still give two equal halves with both faces', async () => {
    const a = await person('res-a.jpg', 3000, 2000, 1500, 700, 380);
    const b = await person('res-b.jpg', 700, 900, 350, 260, 110);
    const out = file('res.png');
    const result = await composePair800(a, b, out);
    expect([result.width, result.height]).toEqual([THUMBNAIL_SIZE, THUMBNAIL_SIZE]);
    expect(await faceShare(out, ...LEFT(800))).toBeGreaterThan(0.05);
    expect(await faceShare(out, ...RIGHT(800))).toBeGreaterThan(0.05);
  });

  it('with copy: a separate band at the bottom, faces stay above it', async () => {
    const a = await person('band-a.jpg', 900, 1200, 450, 330, 140);
    const b = await person('band-b.jpg', 1600, 900, 800, 300, 150);
    const out = file('band.png');
    const layout = pairBandLayout('소희 양말 신던 중학생이었다');
    const result = await composePair800(a, b, out, { main: '소희 양말 신던 중학생이었다' });
    expect(result.method).toBe('pair-band');
    const photoHeight = THUMBNAIL_SIZE - layout.bandHeight;
    expect(await faceShare(out, ...LEFT(photoHeight))).toBeGreaterThan(0.05);
    expect(await faceShare(out, ...RIGHT(photoHeight))).toBeGreaterThan(0.05);
    expect(await faceShare(out, 0, photoHeight, THUMBNAIL_SIZE, layout.bandHeight)).toBe(0); // no face under the copy
    const [r, g, bl] = [...(await sharp(out).extract({ left: 6, top: THUMBNAIL_SIZE - 6, width: 1, height: 1 }).removeAlpha().raw().toBuffer())];
    expect(Math.max(r, g, bl)).toBeLessThan(40); // dark band
  });

  it('a photo that would need more than 2.2x upscaling is refused (caller keeps one photo)', async () => {
    const small = await person('small.jpg', 250, 330, 125, 110, 60);
    const b = await person('ok.jpg', 900, 1200, 450, 330, 140);
    await expect(composePair800(small, b, file('small-pair.png'))).rejects.toThrow(/too small/);
  });

  it('an unreadable photo rejects the pair (caller keeps one photo)', async () => {
    fs.writeFileSync(file('broken.jpg'), 'not an image');
    const b = await person('ok2.jpg', 900, 1200, 450, 330, 140);
    await expect(composePair800(file('broken.jpg'), b, file('broken-pair.png'))).rejects.toThrow();
  });
});

describe('real photo intake and orientation', () => {
  it('too small or unreadable photos are left out before composing', async () => {
    const ok = await person('keep.jpg', 900, 1200, 450, 330, 140);
    const small = await person('tiny.jpg', 240, 320, 120, 100, 50);
    fs.writeFileSync(file('junk.jpg'), 'junk');
    const logs: string[] = [];
    expect(MIN_REAL_PHOTO_SIDE).toBe(300);
    expect(await keepUsableRealPhotos([small, file('junk.jpg'), ok], (m) => logs.push(m))).toEqual([ok]);
    expect(logs.join(' ')).toContain('너무 작아');
  });

  it('a phone photo stored sideways (EXIF orientation 6) is composed upright', async () => {
    // Stored 400x800: face-coloured top half, grey bottom. Displayed rotated 90° clockwise: 800x400,
    // face colour on the right. Upright handling puts it on the right of the 800x800 card.
    const stored = await sharp({ create: { width: 400, height: 800, channels: 3, background: '#7d7d7d' } })
      .composite([{ input: { create: { width: 400, height: 400, channels: 3, background: FACE } }, left: 0, top: 0 }])
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    fs.writeFileSync(file('sideways.jpg'), stored);
    const out = file('upright.png');
    await composeSquare800(file('sideways.jpg'), out);
    expect(await faceShare(out, 420, 300, 300, 200)).toBeGreaterThan(0.5);
    expect(await faceShare(out, 80, 300, 300, 200)).toBeLessThan(0.1);
  });
});

function input(overrides: Partial<ThumbnailDirectorInput> = {}): ThumbnailDirectorInput {
  return {
    title: PARK_TITLE,
    cardPromise: '',
    item: { heading: '🖼️ 썸네일', prompt: 'x' } as ImageRequestItem,
    textMode: 'auto',
    qualityMode: 'standard',
    kind: 'issue',
    allowBakedText: true,
    engineDrawsText: false,
    realImages: ['C:/p/park.jpg', 'C:/p/an.jpg'],
    realWorkDir: 'C:/work',
    ...overrides,
  };
}

function deps(overrides: Partial<ThumbnailDirectorDeps> = {}): ThumbnailDirectorDeps {
  const compose = (method: string) => vi.fn(async (_i: string, output: string) => ({ filePath: output, width: 800, height: 800, method }));
  return {
    generateBase: vi.fn(async () => null),
    composeSquare: compose('square'),
    composeTight: compose('tight'),
    composeHook: compose('hook'),
    composePair: vi.fn(async (_l: string, _r: string, output: string) => ({ filePath: output, width: 800, height: 800, method: 'pair' })),
    toJudgeImage: vi.fn(async () => ({ base64: 'b64' })),
    judge: vi.fn(async () => ({ pickIndex: 0, source: 'judge' as const, reason: 'ok', scores: [] })),
    isLocalFile: () => true,
    log: () => undefined,
    ...overrides,
  };
}

describe('director: two real photos', () => {
  it('issue story → both people side by side, the phrase in the band; no AI call, no judge', async () => {
    const d = deps();
    const result = await runThumbnailDirector(input(), d);
    expect(d.generateBase).not.toHaveBeenCalled();
    expect(d.judge).not.toHaveBeenCalled();
    expect(result!.winner).toMatchObject({ kind: 'real-pair-hook', real: true, bakedText: true });
    const call = (d.composePair as any).mock.calls[0];
    expect(call.slice(0, 2)).toEqual(['C:/p/park.jpg', 'C:/p/an.jpg']);
    expect(call[3]).toEqual({ main: result!.text.text });
    expect(d.composeHook).not.toHaveBeenCalledWith(expect.stringContaining('pair'), expect.anything(), expect.anything());
  });

  it('text excluded → the plain pair', async () => {
    const result = await runThumbnailDirector(input({ textMode: 'exclude' }), deps());
    expect(result!.winner).toMatchObject({ kind: 'real-pair', bakedText: false });
  });

  it('a comparison title pairs two product photos too', async () => {
    const result = await runThumbnailDirector(input({ kind: 'product', title: 'EV3와 셀토스 실구매가 비교', textMode: 'exclude' }), deps());
    expect(result!.winner.kind).toBe('real-pair');
  });

  it('one photo, or a non-pair story, keeps the single-photo composite', async () => {
    expect((await runThumbnailDirector(input({ realImages: ['C:/p/park.jpg'] }), deps()))!.winner.kind).toBe('real-hook');
    expect((await runThumbnailDirector(input({ kind: 'info', title: '청년월세 20만원 받는 법' }), deps()))!.winner.kind).toBe('real-hook');
  });

  it('a failed pair falls back to one photo — never to nothing', async () => {
    const result = await runThumbnailDirector(input(), deps({ composePair: vi.fn(async () => { throw new Error('decode'); }) }));
    expect(result!.winner).toMatchObject({ kind: 'real-hook', real: true });
  });

  it('when the first photo is the broken one, the second photo still makes the thumbnail', async () => {
    const failFirst = vi.fn(async (source: string, output: string) => {
      if (source.includes('park')) throw new Error('decode');
      return { filePath: output, width: 800, height: 800, method: 'x' };
    });
    const result = await runThumbnailDirector(input(), deps({
      composePair: vi.fn(async () => { throw new Error('decode'); }),
      composeHook: failFirst,
      composeSquare: failFirst,
    }));
    expect(result!.winner).toMatchObject({ kind: 'real-hook', real: true });
    expect(result!.winner.filePath).toContain('text2');
  });

  it('high mode: pair first, then the single photo and its card go to the one judge call', async () => {
    const d = deps();
    const result = await runThumbnailDirector(input({ qualityMode: 'high' }), d);
    expect(result!.candidates.map((c) => c.kind)).toEqual(['real-pair-hook', 'real-square', 'real-hook']);
    expect(d.judge).toHaveBeenCalledTimes(1);
  });
});
