/**
 * Unit tests for human-interaction primitives (anti-BotGuard behavioral mimicry).
 * Browser-driving functions are integration-tested live; here we verify the pure
 * timing/curve generators produce human-shaped (non-constant, in-range) values.
 */

import { describe, it, expect } from 'vitest';
import {
  gaussianDelay,
  randBetween,
  bezierPoint,
  easeInOut,
  buildMousePath,
  buildWarmupTargets,
} from '../image/humanInteraction';

describe('gaussianDelay', () => {
  it('clamps to >= min and centers near mean (variance present)', () => {
    const samples = Array.from({ length: 2000 }, () => gaussianDelay(50, 20, 12));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(12);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(60);
    // human-shaped: real variance, not constant
    expect(new Set(samples).size).toBeGreaterThan(50);
  });
});

describe('randBetween', () => {
  it('stays within [a, b]', () => {
    for (let i = 0; i < 500; i++) {
      const v = randBetween(5, 9);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe('bezierPoint / easeInOut', () => {
  it('bezier endpoints equal control endpoints', () => {
    expect(bezierPoint(0, 10, 20, 30, 0)).toBeCloseTo(0);
    expect(bezierPoint(0, 10, 20, 30, 1)).toBeCloseTo(30);
  });
  it('easeInOut is 0→1 monotonic with mid 0.5', () => {
    expect(easeInOut(0)).toBeCloseTo(0);
    expect(easeInOut(1)).toBeCloseTo(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(0.25)).toBeLessThan(0.5);
  });
});

describe('buildMousePath', () => {
  it('starts near start, ends exactly at end, with many jittered steps', () => {
    const path = buildMousePath({ x: 100, y: 100 }, { x: 800, y: 500 });
    expect(path.length).toBeGreaterThanOrEqual(15);
    const last = path[path.length - 1];
    expect(last.x).toBe(800);
    expect(last.y).toBe(500);
    // not a straight line — intermediate points deviate (jitter + curve)
    const mid = path[Math.floor(path.length / 2)];
    const straightX = 100 + (800 - 100) * 0.5;
    expect(Math.abs(mid.x - straightX)).toBeGreaterThan(0);
  });

  it('two paths between same points differ (non-deterministic, human-like)', () => {
    const a = buildMousePath({ x: 0, y: 0 }, { x: 500, y: 500 });
    const b = buildMousePath({ x: 0, y: 0 }, { x: 500, y: 500 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('buildWarmupTargets', () => {
  it('returns the requested count of in-viewport points', () => {
    const pts = buildWarmupTargets(1280, 800, 3);
    expect(pts.length).toBe(3);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(128);
      expect(p.x).toBeLessThanOrEqual(1152);
      expect(p.y).toBeGreaterThanOrEqual(80);
      expect(p.y).toBeLessThanOrEqual(720);
    }
  });
  it('default count is 2–4', () => {
    for (let i = 0; i < 50; i++) {
      const n = buildWarmupTargets(1000, 1000).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});
