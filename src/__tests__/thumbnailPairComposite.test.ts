// SPEC-NAVER-IMAGE-2026 V1 §6·§7 — two real photos side by side ("실제 박서함 + 실제 안소희").
// Local sharp only; no model call. The director prefers the pair for issue stories and comparisons.
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ImageRequestItem } from '../image/types';
import { THUMBNAIL_SIZE, composePair800 } from '../image/director/thumbnailComposer';
import { runThumbnailDirector, type ThumbnailDirectorDeps, type ThumbnailDirectorInput } from '../image/director/thumbnailDirector';

const PARK_TITLE = '소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억';
let dir = '';
let left = '';
let right = '';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-pair-'));
  left = path.join(dir, 'left.jpg');
  right = path.join(dir, 'right.png');
  await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 220, g: 40, b: 40 } } }).jpeg().toFile(left);
  await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 40, g: 40, b: 220 } } }).png().toFile(right);
});
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

async function pixel(file: string, x: number, y: number): Promise<number[]> {
  const raw = await sharp(file).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
  return [raw[0], raw[1], raw[2]];
}

describe('composePair800', () => {
  it('800x800, left photo on the left half, right photo on the right half, a light gap between', async () => {
    const out = path.join(dir, 'pair.png');
    const result = await composePair800(left, right, out);
    expect([result.width, result.height]).toEqual([THUMBNAIL_SIZE, THUMBNAIL_SIZE]);
    const [lr, , lb] = await pixel(out, 150, 400);
    const [rr, , rb] = await pixel(out, 650, 400);
    expect(lr).toBeGreaterThan(180);
    expect(lb).toBeLessThan(90);
    expect(rb).toBeGreaterThan(180);
    expect(rr).toBeLessThan(90);
    const gap = await pixel(out, 399, 400);
    expect(Math.min(...gap)).toBeGreaterThan(220);
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
  it('issue story → both people side by side with the short phrase; no AI call, no judge', async () => {
    const d = deps();
    const result = await runThumbnailDirector(input(), d);
    expect(d.generateBase).not.toHaveBeenCalled();
    expect(d.judge).not.toHaveBeenCalled();
    expect(result!.winner).toMatchObject({ kind: 'real-pair-hook', real: true, bakedText: true });
    expect((d.composePair as any).mock.calls[0].slice(0, 2)).toEqual(['C:/p/park.jpg', 'C:/p/an.jpg']);
    // the phrase goes on the pair, not on one photo
    const pairOut = (d.composePair as any).mock.calls[0][2];
    expect((d.composeHook as any).mock.calls[0][0]).toBe(pairOut);
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

  it('a failed pair falls back to the single photo — never to nothing', async () => {
    const result = await runThumbnailDirector(input(), deps({ composePair: vi.fn(async () => { throw new Error('decode'); }) }));
    expect(result!.winner).toMatchObject({ kind: 'real-hook', real: true });
  });

  it('high mode: pair first, then the single photo and its card go to the one judge call', async () => {
    const d = deps();
    const result = await runThumbnailDirector(input({ qualityMode: 'high' }), d);
    expect(result!.candidates.map((c) => c.kind)).toEqual(['real-pair-hook', 'real-square', 'real-hook']);
    expect(d.judge).toHaveBeenCalledTimes(1);
  });
});
