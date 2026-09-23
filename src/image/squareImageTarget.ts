/**
 * NAVER FULL AUTO — "every generated image of this call is N x N" as an async-scoped setting.
 *
 * Engines save through imageUtils.writeImageFile deep inside their own code, and some (Flow,
 * Dropshot) ignore the requested aspect ratio. Threading a flag through every engine signature would
 * touch them all, so the main IPC handler runs one generation call inside
 * runWithSquareImageTarget(800, …) and writeImageFile reads currentSquareImageTarget().
 *
 * Main process only (node:async_hooks). Collected/downloaded photos (keepAspect) are never forced.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const squareImageTargetStorage = new AsyncLocalStorage<number>();

const MIN_SQUARE_TARGET = 256;
const MAX_SQUARE_TARGET = 2048;

/** The valid square size, or null when the value does not ask for one. */
export function normalizeSquareImageTarget(size: unknown): number | null {
  const value = Number(size);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= MIN_SQUARE_TARGET && rounded <= MAX_SQUARE_TARGET ? rounded : null;
}

export function runWithSquareImageTarget<T>(size: unknown, task: () => Promise<T>): Promise<T> {
  const target = normalizeSquareImageTarget(size);
  return target === null ? task() : squareImageTargetStorage.run(target, task);
}

export function currentSquareImageTarget(): number | null {
  return squareImageTargetStorage.getStore() ?? null;
}
