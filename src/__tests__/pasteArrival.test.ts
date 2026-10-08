import { describe, expect, it } from 'vitest';
import {
  describeDuplicateSuspect,
  detectLateArrival,
  hasEditorChanged,
  pasteCoverageRatio,
  waitForPasteArrival,
  type ArrivalClock,
  type PasteSnapshot,
} from '../automation/pasteArrival.js';

const snap = (chars: number, text = 'x'.repeat(chars), tables = 0): PasteSnapshot => ({ chars, tables, text });

/** Virtual clock: sleeping advances time; the editor content is a function of virtual time. */
function makeClock(): ArrivalClock & { time: () => number } {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, time: () => t };
}

const BEFORE = snap(100);

describe('hasEditorChanged', () => {
  it('compares chars and table counts against the reference', () => {
    expect(hasEditorChanged(BEFORE, snap(100))).toBe(false);
    expect(hasEditorChanged(BEFORE, snap(101))).toBe(true);
    expect(hasEditorChanged(BEFORE, snap(100, 'x'.repeat(100), 1))).toBe(true);
  });
});

describe('waitForPasteArrival', () => {
  it('keeps polling with zero growth (no early stall exit) until the paste lands late', async () => {
    const clock = makeClock();
    const reads: number[] = [];
    const readEditor = async () => {
      reads.push(clock.time());
      return clock.time() >= 3000 ? snap(400) : snap(100);
    };
    const result = await waitForPasteArrival({
      readEditor, reference: BEFORE, isVisible: (s) => s.chars >= 400, clock,
    });
    expect(result.chars).toBe(400);
    // Old rule gave up after ~1.2 s of identical reads; the late paste at 3 s must still be seen.
    expect(clock.time()).toBeLessThanOrEqual(3600);
  });

  it('gives up at the cap when nothing ever arrives', async () => {
    const clock = makeClock();
    const result = await waitForPasteArrival({
      readEditor: async () => snap(100), reference: BEFORE, isVisible: () => false, clock,
    });
    expect(result.chars).toBe(100);
    expect(clock.time()).toBeGreaterThanOrEqual(6000);
    expect(clock.time()).toBeLessThan(6800);
  });

  it('ends early once growth started and then stalled (partial paste)', async () => {
    const clock = makeClock();
    const result = await waitForPasteArrival({
      readEditor: async () => (clock.time() >= 400 ? snap(180) : snap(100)),
      reference: BEFORE, isVisible: () => false, clock,
    });
    expect(result.chars).toBe(180);
    expect(clock.time()).toBeLessThan(3000); // 3 stable reads after the growth, not the 6 s cap
  });

  it('returns immediately when the first read is already visible (fast paste costs no wait)', async () => {
    const clock = makeClock();
    const result = await waitForPasteArrival({
      readEditor: async () => snap(500), reference: BEFORE, isVisible: () => true, clock,
    });
    expect(result.chars).toBe(500);
    expect(clock.time()).toBe(0);
  });

  it('honours a custom cap', async () => {
    const clock = makeClock();
    await waitForPasteArrival({
      readEditor: async () => snap(100), reference: BEFORE, isVisible: () => false, clock, maxWaitMs: 3000,
    });
    expect(clock.time()).toBeGreaterThanOrEqual(3000);
    expect(clock.time()).toBeLessThan(3800);
  });
});

describe('detectLateArrival', () => {
  it('reports nothing arrived after a short settle when the editor is unchanged', async () => {
    const clock = makeClock();
    const result = await detectLateArrival({
      readEditor: async () => snap(100), reference: BEFORE, isVisible: () => false, clock,
    });
    expect(result.arrived).toBe(false);
    expect(clock.time()).toBeLessThanOrEqual(1000); // short settle, not a long wait
  });

  it('treats growth inside the settle window as the late arrival and waits for it to finish', async () => {
    const clock = makeClock();
    const result = await detectLateArrival({
      readEditor: async () => {
        const t = clock.time();
        return t < 400 ? snap(100) : t < 1200 ? snap(250) : snap(400);
      },
      reference: BEFORE, isVisible: (s) => s.chars >= 400, clock,
    });
    expect(result.arrived).toBe(true);
    expect(result.snapshot.chars).toBe(400);
  });

  it('reports a partial late arrival with the stalled snapshot', async () => {
    const clock = makeClock();
    const result = await detectLateArrival({
      readEditor: async () => (clock.time() >= 400 ? snap(250) : snap(100)),
      reference: BEFORE, isVisible: () => false, clock,
    });
    expect(result.arrived).toBe(true);
    expect(result.snapshot.chars).toBe(250);
  });
});

describe('duplicate diagnosis', () => {
  const expected = '가'.repeat(200);

  it('computes coverage in whitespace-free space, like isPasteVisible', () => {
    const before = snap(10, '나'.repeat(10));
    const after = snap(210, '나'.repeat(10) + expected);
    expect(pasteCoverageRatio(before, after, expected)).toBeCloseTo(1, 5);
  });

  it('flags coverage above 1.6x', () => {
    const before = snap(10, '나'.repeat(10));
    const doubled = snap(410, '나'.repeat(10) + expected + expected);
    const message = describeDuplicateSuspect(before, doubled, expected);
    expect(message).toContain('중복 의심');
    expect(message).toContain('2.00');
  });

  it('stays silent for normal and slightly-over coverage', () => {
    const before = snap(10, '나'.repeat(10));
    expect(describeDuplicateSuspect(before, snap(210, '나'.repeat(10) + expected), expected)).toBeNull();
    const padded = snap(300, '나'.repeat(10) + expected + '다'.repeat(60));
    expect(describeDuplicateSuspect(before, padded, expected)).toBeNull();
  });
});
