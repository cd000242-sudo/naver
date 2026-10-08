/**
 * pasteArrival.ts
 *
 * Arrival tracking for SmartEditor clipboard pastes.
 *
 * Why this exists: a Ctrl+V can land seconds after the key press on a slow PC. Judging the paste by
 * a single snapshot (or by "the count stopped changing") treats a paste that has not arrived YET as
 * a paste that FAILED. The rollback then sees an unchanged editor and the caller pastes again, so
 * the body lands twice. Everything here judges by growth over time instead:
 *   - the stall rule only ends the wait once growth has actually started;
 *   - before any further paste attempt a short settle re-reads the editor, and growth seen there is
 *     the late arrival of the previous paste (never a reason to paste again).
 */

export interface PasteSnapshot {
  chars: number;
  tables: number;
  text: string;
}

export interface ArrivalClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: ArrivalClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** Upper bound for waiting on one paste (kept from the 2026-06-22 slow-client fix). */
export const PASTE_ARRIVAL_MAX_WAIT_MS = 6000;
/** Shorter cap for the fallback stages (synthetic event / plain paste) that follow a failed native paste. */
export const PASTE_FALLBACK_ARRIVAL_MAX_WAIT_MS = 3000;
export const PASTE_ARRIVAL_POLL_MS = 400;
/** Consecutive identical reads that count as "growth has stalled" — only once growth has started. */
export const PASTE_ARRIVAL_STALL_READS = 3;
/** Settle window before a further paste attempt / next stage. */
export const LATE_ARRIVAL_SETTLE_MS = 800;
/** Coverage above this multiple of the expected text is reported as a suspected duplicate. */
export const DUPLICATE_SUSPECT_COVERAGE = 1.6;

/** True when anything has arrived in the editor compared to `reference`. */
export function hasEditorChanged(reference: PasteSnapshot, current: PasteSnapshot): boolean {
  return current.chars !== reference.chars || current.tables !== reference.tables;
}

export interface WaitForPasteArrivalOptions {
  readEditor: () => Promise<PasteSnapshot>;
  /** Editor state before the paste; growth is measured against it. */
  reference: PasteSnapshot;
  isVisible: (snapshot: PasteSnapshot) => boolean;
  clock?: ArrivalClock;
  maxWaitMs?: number;
  pollMs?: number;
  stallReads?: number;
}

/**
 * Polls the editor until the paste is visible, growth has started and then stalled, or the cap is
 * reached. Zero growth never ends the wait early — a paste that has not arrived yet looks exactly
 * like a paste that never will, and only the cap can tell them apart.
 */
export async function waitForPasteArrival(options: WaitForPasteArrivalOptions): Promise<PasteSnapshot> {
  const {
    readEditor,
    reference,
    isVisible,
    clock = realClock,
    maxWaitMs = PASTE_ARRIVAL_MAX_WAIT_MS,
    pollMs = PASTE_ARRIVAL_POLL_MS,
    stallReads = PASTE_ARRIVAL_STALL_READS,
  } = options;

  let snapshot = await readEditor();
  const start = clock.now();
  let lastChars = -1;
  let stableReads = 0;
  while (clock.now() - start < maxWaitMs) {
    if (isVisible(snapshot)) break;
    if (snapshot.chars === lastChars) {
      stableReads += 1;
      if (stableReads >= stallReads && hasEditorChanged(reference, snapshot)) break;
    } else {
      stableReads = 0;
    }
    lastChars = snapshot.chars;
    await clock.sleep(pollMs);
    snapshot = await readEditor();
  }
  return snapshot;
}

export interface DetectLateArrivalOptions {
  readEditor: () => Promise<PasteSnapshot>;
  /** Editor state the caller believes is current (e.g. the pre-paste state after a rollback). */
  reference: PasteSnapshot;
  isVisible: (snapshot: PasteSnapshot) => boolean;
  clock?: ArrivalClock;
  settleMs?: number;
  pollMs?: number;
}

/**
 * Waits a short settle and re-reads. Growth against `reference` means an earlier paste was still
 * on its way: keep following it until it finishes or stalls and hand back the fresh snapshot.
 * No growth: nothing is pending and the caller may continue.
 */
export async function detectLateArrival(
  options: DetectLateArrivalOptions,
): Promise<{ arrived: boolean; snapshot: PasteSnapshot }> {
  const {
    readEditor,
    reference,
    isVisible,
    clock = realClock,
    settleMs = LATE_ARRIVAL_SETTLE_MS,
    pollMs = PASTE_ARRIVAL_POLL_MS,
  } = options;

  const start = clock.now();
  let snapshot = reference;
  do {
    await clock.sleep(pollMs);
    snapshot = await readEditor();
    if (hasEditorChanged(reference, snapshot)) {
      const settled = await waitForPasteArrival({ readEditor, reference, isVisible, clock, pollMs });
      return { arrived: true, snapshot: settled };
    }
  } while (clock.now() - start < settleMs);
  return { arrived: false, snapshot };
}

const normalizeForCoverage = (value: string): string =>
  String(value || '').replace(/[​-‍﻿]/g, '').replace(/\s+/g, '');

/** Mirrors isPasteVisible's coverage: whitespace-free growth divided by the expected text length. */
export function pasteCoverageRatio(
  before: PasteSnapshot,
  after: PasteSnapshot,
  trimmedPlain: string,
): number {
  const expected = normalizeForCoverage(trimmedPlain).length;
  if (expected === 0) return 0;
  const beforeLength = normalizeForCoverage(before.text).length;
  const afterLength = normalizeForCoverage(after.text).length;
  const textSnapshotsTrusted = beforeLength > 0 || before.chars === 0;
  const delta = textSnapshotsTrusted
    ? Math.max(0, afterLength - beforeLength)
    : Math.max(0, after.chars - before.chars);
  return delta / expected;
}

/** Diagnostic line when far more text than expected landed (no automatic deletion). */
export function describeDuplicateSuspect(
  before: PasteSnapshot,
  after: PasteSnapshot,
  trimmedPlain: string,
): string | null {
  const ratio = pasteCoverageRatio(before, after, trimmedPlain);
  if (ratio <= DUPLICATE_SUSPECT_COVERAGE) return null;
  return `   ⚠️ [리치입력] 중복 의심: 붙여넣기 커버리지 ${ratio.toFixed(2)}배 `
    + `(기대 ${normalizeForCoverage(trimmedPlain).length}자, 증가 ${Math.max(0, after.chars - before.chars)}자) — 본문이 두 번 들어갔는지 확인 필요`;
}

/** Logs the duplicate diagnosis when it applies (diagnosis only — nothing is deleted). */
export function logDuplicateSuspect(
  log: ((message: string) => void) | undefined,
  before: PasteSnapshot,
  after: PasteSnapshot,
  trimmedPlain: string,
): void {
  const message = describeDuplicateSuspect(before, after, trimmedPlain);
  if (message) log?.(message);
}
