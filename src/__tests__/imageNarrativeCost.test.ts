/**
 * SPEC-IMAGE-NARRATIVE-2026 Phase 6 — cost-layer tests.
 *
 * Covers the three new cost modules:
 *  - imageHashCache: LRU + TTL + provider/mode isolation
 *  - budgetGuard: daily/monthly limit enforcement + lazy rollover
 *  - imageResizer: ≤1024px longest-edge + format preservation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import {
  getCachedInference,
  setCachedInference,
  clearCache,
  getCacheStats,
} from '../imageNarrative/cost/imageHashCache';
import {
  checkBudget,
  recordVisionCall,
  configureBudget,
  resetBudgetCounters,
  getBudgetState,
} from '../imageNarrative/cost/budgetGuard';
import {
  resizeForVision,
  savingsRatio,
} from '../imageNarrative/cost/imageResizer';
import type { InferenceResponse } from '../imageNarrative/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeResponse(imageId: string): InferenceResponse {
  return {
    imageId,
    provider: 'gemini',
    latencyMs: 100,
    result: {
      scene_type: 'travel',
      location_hint: '서울',
      food_items: [],
      activities: [],
      mood: 'relaxed',
      time_of_day: 'afternoon',
      visible_text: [],
      raw_caption: '시내 산책',
      model: 'gemini-2.5-flash',
      confidence: 0.85,
    },
  };
}

async function makeJpegBuffer(width: number, height: number): Promise<string> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  return buf.toString('base64');
}

async function makePngBuffer(width: number, height: number): Promise<string> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 200, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// imageHashCache
// ---------------------------------------------------------------------------

describe('imageHashCache', () => {
  beforeEach(() => {
    clearCache();
  });

  it('returns null on cold lookup', () => {
    expect(getCachedInference('imagedata', 'gemini', 'auto')).toBeNull();
    expect(getCacheStats().misses).toBe(1);
    expect(getCacheStats().hits).toBe(0);
  });

  it('returns the stored response after set', () => {
    const r = makeResponse('img-1');
    setCachedInference('imagedata', 'gemini', 'auto', r);
    const hit = getCachedInference('imagedata', 'gemini', 'auto');
    expect(hit).not.toBeNull();
    expect(hit?.imageId).toBe('img-1');
    expect(getCacheStats().hits).toBe(1);
    expect(getCacheStats().hitRate).toBeCloseTo(1.0);
  });

  it('isolates entries by provider', () => {
    setCachedInference('imagedata', 'gemini', 'auto', makeResponse('gemini-img'));
    expect(getCachedInference('imagedata', 'openai', 'auto')).toBeNull();
  });

  it('isolates entries by mode', () => {
    setCachedInference('imagedata', 'gemini', 'travel', makeResponse('travel-img'));
    expect(getCachedInference('imagedata', 'gemini', 'food')).toBeNull();
  });

  it('expires entries after TTL', () => {
    setCachedInference('imagedata', 'gemini', 'auto', makeResponse('img'), 1);
    // Wait past the 1ms TTL synchronously
    const start = Date.now();
    while (Date.now() - start < 5) {
      // spin briefly so the TTL elapses without using async timers
    }
    expect(getCachedInference('imagedata', 'gemini', 'auto')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// budgetGuard
// ---------------------------------------------------------------------------

describe('budgetGuard', () => {
  beforeEach(() => {
    resetBudgetCounters();
    configureBudget({ dailyLimit: 200, monthlyLimit: 5000 });
  });

  it('allows the first call', () => {
    const check = checkBudget();
    expect(check.allowed).toBe(true);
    expect(check.dailyUsed).toBe(0);
  });

  it('blocks when the daily limit is reached', () => {
    configureBudget({ dailyLimit: 3, monthlyLimit: 100 });
    recordVisionCall();
    recordVisionCall();
    recordVisionCall();
    const check = checkBudget();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('일일');
    expect(check.dailyUsed).toBe(3);
  });

  it('blocks when the monthly limit is reached before the daily one', () => {
    configureBudget({ dailyLimit: 100, monthlyLimit: 2 });
    recordVisionCall();
    recordVisionCall();
    const check = checkBudget();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('이번 달');
    expect(check.monthlyUsed).toBe(2);
  });

  it('clamps non-positive limit values to 1', () => {
    configureBudget({ dailyLimit: 0, monthlyLimit: -10 });
    const state = getBudgetState();
    expect(state.dailyLimit).toBe(1);
    expect(state.monthlyLimit).toBe(1);
  });

  it('rolls over the daily counter on a new day', () => {
    configureBudget({ dailyLimit: 5, monthlyLimit: 100 });
    const today = new Date('2026-05-28T12:00:00');
    const tomorrow = new Date('2026-05-29T12:00:00');
    recordVisionCall(today);
    recordVisionCall(today);
    expect(checkBudget(today).dailyUsed).toBe(2);
    // Different day → daily window resets, monthly window persists
    expect(checkBudget(tomorrow).dailyUsed).toBe(0);
    expect(checkBudget(tomorrow).monthlyUsed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// imageResizer
// ---------------------------------------------------------------------------

describe('imageResizer', () => {
  it('skips images already at or below 1024px', async () => {
    const small = await makeJpegBuffer(800, 600);
    const result = await resizeForVision(small, 'image/jpeg');
    expect(result.skipped).toBe(true);
    expect(result.base64).toBe(small);
    expect(savingsRatio(result)).toBe(0);
  });

  it('resizes a 2048x2048 JPEG to within 1024px and shrinks bytes', async () => {
    const big = await makeJpegBuffer(2048, 2048);
    const result = await resizeForVision(big, 'image/jpeg');
    expect(result.skipped).toBe(false);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.resizedBytes).toBeLessThan(result.originalBytes);
    expect(savingsRatio(result)).toBeGreaterThan(0);
    // Confirm pixel dimensions actually shrank
    const meta = await sharp(Buffer.from(result.base64, 'base64')).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1024);
  });

  it('preserves PNG format for transparent inputs', async () => {
    const png = await makePngBuffer(1600, 1200);
    const result = await resizeForVision(png, 'image/png');
    expect(result.skipped).toBe(false);
    expect(result.mimeType).toBe('image/png');
  });

  it('normalizes HEIC mime to JPEG output', async () => {
    const big = await makeJpegBuffer(2000, 1500);
    const result = await resizeForVision(big, 'image/heic');
    expect(result.mimeType).toBe('image/jpeg');
  });
});
