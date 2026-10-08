/**
 * [2026-10-09] Late native paste was pasted again -> the body landed twice.
 *
 * The native Ctrl+V poll gave up after ~1.2 s even when NOTHING had arrived yet. The rollback then
 * saw an unchanged editor ("matchesBefore" = restored) and the retry pressed Ctrl+V a second time.
 * On a slow PC the first paste lands late, so both copies landed — and isPasteVisible has no upper
 * bound on coverage, so the doubled text was accepted as success.
 *
 * These tests drive the REAL pasteRichHtmlAtCursor against a happy-dom editor on a virtual clock;
 * the paste script decides when (and whether) each Ctrl+V actually lands.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pasteRichHtmlAtCursor } from '../automation/richTextPaste.js';
import {
  createRig, drive, installBrowserGlobals, mountEditor, occurrences,
  type Chunk,
} from './helpers/fakePasteEditor.js';

const LINES = [
  '꿀을 고를 때 가장 먼저 확인할 것은 원산지와 채밀 시기입니다.',
  '보관은 서늘하고 그늘진 곳이 좋으며 실온에 두는 편이 낫습니다.',
  '결정이 생겼다면 상한 것이 아니라 포도당이 굳은 것입니다.',
  '중탕으로 천천히 녹이면 원래의 묽은 상태로 돌아옵니다.',
  '개봉 후에는 뚜껑 주변을 닦아 두면 발효를 막을 수 있습니다.',
];
const PLAIN = LINES.join('\n');
const HTML = LINES.map((line) => `<p>${line}</p>`).join('');
const FIRST_LINE = LINES[0];

const whole = (delayMs: number): Chunk[] => [{ delayMs, lines: LINES }];

let restore: () => void;
beforeAll(() => { restore = installBrowserGlobals(); });
afterAll(() => { restore(); });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  mountEditor('이전에 입력된 본문입니다');
});
afterEach(() => { vi.useRealTimers(); });

async function paste(rig: ReturnType<typeof createRig>, log?: (m: string) => void) {
  const call = (pasteRichHtmlAtCursor as any)(rig.page, rig.frame, HTML, PLAIN, 0, log);
  return await drive(call as Promise<Awaited<ReturnType<typeof pasteRichHtmlAtCursor>>>);
}

describe('native paste that lands late', () => {
  it('lands after 2 s -> exactly one Ctrl+V and the body appears once', async () => {
    // A second press would land immediately too, so a re-paste shows up as a doubled body.
    const rig = createRig({ script: [whole(2000), whole(0), whole(0)] });
    const { value } = await paste(rig);

    expect(value.ok).toBe(true);
    expect(value.method).toBe('clipboard-html');
    expect(rig.pastePresses()).toBe(1);
    expect(occurrences(FIRST_LINE)).toBe(1);
  });

  it('lands after 7 s (beyond the poll cap) -> still no second paste', async () => {
    const rig = createRig({ script: [whole(7000), whole(0), whole(0)] });
    const { value } = await paste(rig);

    expect(value.ok).toBe(true);
    expect(rig.pastePresses()).toBe(1);
    expect(occurrences(FIRST_LINE)).toBe(1);
  });

  it('never arrives -> falls back as before (rolled back, typing fallback allowed, nothing doubled)', async () => {
    const rig = createRig({ script: [] });
    const { value, elapsedMs } = await paste(rig);

    expect(value.ok).toBe(false);
    expect(value.method).toBe('none');
    expect(value.safeToFallback).toBe(true);
    expect(occurrences(FIRST_LINE)).toBe(0);
    // Both native attempts and the plain paste were genuinely tried.
    expect(rig.pastePresses()).toBe(3);
    // Waiting for a paste that never comes is bounded (slow-PC patience, not a hang).
    expect(elapsedMs).toBeLessThan(60_000);
  });

  it('arrives partially and stalls -> existing partial handling (undo, then one clean retry)', async () => {
    const partial: Chunk[] = [{ delayMs: 300, lines: LINES.slice(0, 2) }];
    const rig = createRig({ script: [partial, whole(300)] });
    const { value } = await paste(rig);

    expect(value.ok).toBe(true);
    expect(rig.undoPresses()).toBeGreaterThanOrEqual(1);
    expect(rig.pastePresses()).toBe(2);
    expect(occurrences(FIRST_LINE)).toBe(1);
  });

  it('a fast paste (lands at once) keeps the single-press, no-extra-wait path', async () => {
    const rig = createRig({ script: [whole(0)] });
    const { value, elapsedMs } = await paste(rig);

    expect(value.ok).toBe(true);
    expect(rig.pastePresses()).toBe(1);
    // Caret verification dominates; the arrival wait itself must add nothing on success.
    expect(elapsedMs).toBeLessThan(6000);
  });
});

describe('later stages must not run on top of a paste that is still arriving', () => {
  it('synthetic paste event that lands after 2 s is accepted; plain Ctrl+V is never pressed', async () => {
    const rig = createRig({ script: [[], [], whole(0)], eventChunks: whole(2000) });
    const { value } = await paste(rig);

    expect(value.ok).toBe(true);
    expect(value.method).toBe('paste-event-html');
    expect(rig.pastePresses()).toBe(2); // the two (swallowed) native attempts only
    expect(occurrences(FIRST_LINE)).toBe(1);
  });

  it('plain paste that lands after 2 s is accepted instead of being reported as failed', async () => {
    const rig = createRig({ script: [[], [], whole(2000)] });
    const { value } = await paste(rig);

    expect(value.ok).toBe(true);
    expect(value.method).toBe('clipboard-plain');
    expect(occurrences(FIRST_LINE)).toBe(1);
  });
});

describe('duplicate diagnosis', () => {
  it('logs one 중복 의심 line when the editor holds far more than the expected text', async () => {
    const doubled: Chunk[] = [{ delayMs: 100, lines: [...LINES, ...LINES] }];
    const rig = createRig({ script: [doubled] });
    const log = vi.fn();
    const { value } = await paste(rig, log);

    expect(value.ok).toBe(true); // diagnosis only — nothing is deleted automatically
    const lines = log.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('중복 의심'));
    expect(lines).toHaveLength(1);
  });

  it('stays silent for a normal paste', async () => {
    const rig = createRig({ script: [whole(100)] });
    const log = vi.fn();
    await paste(rig, log);

    expect(log.mock.calls.map((c) => String(c[0])).some((m) => m.includes('중복 의심'))).toBe(false);
  });
});
