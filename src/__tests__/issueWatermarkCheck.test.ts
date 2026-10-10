/**
 * Free pixel-level watermark/logo check (2026-10-08). Calibrated on the clean AI images the
 * owner generated (LDB Image Ultra) with synthetic press-style overlays burned on top.
 * Requirement: every variant detected, every clean base — and its grain/recompression
 * stress copies — NOT flagged.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { detectWatermark, WATERMARK_SCORE_THRESHOLD } from '../crawler/issueHarness/watermarkCheck';
import {
  WATERMARK_VARIANTS,
  applyVariant,
  grainy,
  loadCleanBases,
  recompressed,
} from './helpers/watermarkVariants';

const bases = loadCleanBases();

/** The owner's original clean images — used for extra calibration when present locally. */
const LDB_DIR = 'C:/Users/박성현/Downloads/LDB Image Ultra';

describe('clean images are not flagged', () => {
  it.each(bases.map((b) => [b.name, b.buffer] as const))('%s', async (_name, buffer) => {
    const v = await detectWatermark(buffer);
    expect(v.suspected).toBe(false);
    expect(v.score).toBeLessThan(WATERMARK_SCORE_THRESHOLD);
  });

  it.each(bases.map((b) => [b.name, b.buffer] as const))('%s with sensor grain', async (_name, buffer) => {
    const v = await detectWatermark(await grainy(buffer));
    expect(v.suspected).toBe(false);
  });

  it.each(bases.map((b) => [b.name, b.buffer] as const))('%s recompressed at q45', async (_name, buffer) => {
    const v = await detectWatermark(await recompressed(buffer));
    expect(v.suspected).toBe(false);
  });

  // [2026-10-10] Opt-in only (LDB_CLEAN_CALIBRATION=1): it scans whatever is in the owner's Downloads folder, and newer
  //   LDB output carries a "leadernam" corner signature and dense on-image text — correctly flagged, not a clean base.
  //   A release gate must not depend on that folder's current contents; the pinned bases above stay mandatory.
  it.skipIf(!existsSync(LDB_DIR) || process.env.LDB_CLEAN_CALIBRATION !== '1')('all original LDB clean images (full resolution)', async () => {
    const files = readdirSync(LDB_DIR)
      .map((d) => join(LDB_DIR, d))
      .filter((p) => statSync(p).isDirectory())
      .flatMap((d) => readdirSync(d).filter((f) => /\.jpe?g$/i.test(f)).map((f) => join(d, f)));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const v = await detectWatermark(readFileSync(file));
      expect(v.suspected, file).toBe(false);
    }
  });
});

describe('press-style overlays are detected', () => {
  const cases = bases.flatMap((b) => WATERMARK_VARIANTS.map((variant) => ({ base: b, variant })));

  it.each(cases.map((c) => [`${c.base.name} + ${c.variant.name}`, c] as const))('%s', async (_label, c) => {
    const marked = await applyVariant(c.base.buffer, c.variant);
    const v = await detectWatermark(marked);
    expect(v.suspected).toBe(true);
    expect(v.region).not.toBeNull();
    expect(v.score).toBeGreaterThanOrEqual(WATERMARK_SCORE_THRESHOLD);
  });

  it('every overlay scores clearly above every clean image (margin check)', async () => {
    let cleanMax = 0;
    for (const b of bases) cleanMax = Math.max(cleanMax, (await detectWatermark(b.buffer)).score);
    let markedMin = Infinity;
    for (const b of bases) {
      for (const variant of WATERMARK_VARIANTS) {
        markedMin = Math.min(markedMin, (await detectWatermark(await applyVariant(b.buffer, variant))).score);
      }
    }
    expect(markedMin).toBeGreaterThan(cleanMax * 1.5);
  });

  it('reports the region the overlay sits in', async () => {
    const topRight = WATERMARK_VARIANTS[0];
    const bottomStrip = WATERMARK_VARIANTS[5];
    const a = await detectWatermark(await applyVariant(bases[1].buffer, topRight));
    const b = await detectWatermark(await applyVariant(bases[1].buffer, bottomStrip));
    expect(a.region).toMatch(/^top/);
    expect(b.region).toMatch(/^bottom/);
  });
});

describe('robustness', () => {
  it('never throws on undecodable bytes — treated as not suspected', async () => {
    const v = await detectWatermark(Buffer.from('definitely not an image'));
    expect(v).toEqual({ suspected: false, region: null, score: 0 });
  });

  it('never throws on an empty buffer', async () => {
    const v = await detectWatermark(Buffer.alloc(0));
    expect(v.suspected).toBe(false);
  });

  it('tiny images are not analysed (not enough pixels to judge)', async () => {
    const tiny = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#888' } }).jpeg().toBuffer();
    expect((await detectWatermark(tiny)).suspected).toBe(false);
  });

  it('a typical 1254px image is analysed quickly', async () => {
    const big = await sharp(bases[1].buffer).resize(1254, 1254).jpeg({ quality: 85 }).toBuffer();
    const started = performance.now();
    await detectWatermark(big);
    // Typical cost is a few tens of ms; the generous ceiling only catches pathological regressions.
    expect(performance.now() - started).toBeLessThan(500);
  });
});
