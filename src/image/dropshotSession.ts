/**
 * 🍌 Dropshot session state — single shared browser context/page + generation chain.
 *
 * Node module singletons guarantee ONE instance, so login (dropshotLogin.ts) and
 * page lifecycle (dropshotCore.ts) read/write the exact same cached context/page.
 * Keeping this state in its own module lets those concerns live in separate files
 * without circular imports.
 */

import { withCleanupTimeout } from '../runtime/cleanupTimeout.js';

let cachedContext: unknown = null;
let cachedPage: unknown = null;
const trackedContexts = new Set<unknown>();

/** Serialize all generation calls — single shared browser page. */
let _generationChain: Promise<unknown> = Promise.resolve();
let pendingGenerations = 0;
let loginActive = false;
let checkActive = false;
let generationEpoch = 0;

export class DropshotCleanupIncompleteError extends Error {
  readonly code = 'DROPSHOT_CLEANUP_INCOMPLETE';

  constructor(message = 'Dropshot browser context cleanup did not complete') {
    super(message);
    this.name = 'DropshotCleanupIncompleteError';
  }
}

export interface DropshotOperationState {
  readonly pendingGenerations: number;
  readonly loginActive: boolean;
  readonly checkActive: boolean;
}

export function getCachedPage(): unknown {
  return cachedPage;
}

export function getCachedContext(): unknown {
  return cachedContext;
}

export function setCached(ctx: unknown, page: unknown): void {
  cachedContext = ctx;
  cachedPage = page;
  trackDropshotContext(ctx);
}

export function clearCached(): void {
  cachedContext = null;
  cachedPage = null;
}

export function getGenerationChain(): Promise<unknown> {
  return _generationChain;
}

export function setGenerationChain(p: Promise<unknown>): void {
  _generationChain = p;
}

export function getDropshotGenerationEpoch(): number {
  return generationEpoch;
}

/** Invalidates every generation that captured an older epoch. */
export function abortDropshotGenerations(): number {
  generationEpoch += 1;
  return generationEpoch;
}

export function isDropshotGenerationAborted(capturedEpoch: number): boolean {
  return capturedEpoch !== generationEpoch;
}

export function trackDropshotContext(context: unknown): void {
  if (context) trackedContexts.add(context);
}

export function untrackDropshotContext(context: unknown): void {
  if (context) trackedContexts.delete(context);
}

export function hasTrackedDropshotContexts(): boolean {
  return trackedContexts.size > 0;
}

export function getDropshotOperationState(): DropshotOperationState {
  return { pendingGenerations, loginActive, checkActive };
}

export function tryBeginDropshotGeneration(): boolean {
  if (loginActive || checkActive) return false;
  pendingGenerations += 1;
  return true;
}

export function endDropshotGeneration(): void {
  pendingGenerations = Math.max(0, pendingGenerations - 1);
}

export function tryBeginDropshotLogin(): boolean {
  if (pendingGenerations > 0 || loginActive || checkActive) return false;
  loginActive = true;
  return true;
}

export function endDropshotLogin(): void {
  loginActive = false;
}

export function tryBeginDropshotCheck(): boolean {
  if (pendingGenerations > 0 || loginActive || checkActive) return false;
  checkActive = true;
  return true;
}

export function endDropshotCheck(): void {
  checkActive = false;
}

export async function closeTrackedDropshotContext(
  context: unknown,
  timeoutMs = 5_000,
): Promise<boolean> {
  if (!context || typeof (context as { close?: unknown }).close !== 'function') {
    untrackDropshotContext(context);
    return true;
  }

  try {
    await withCleanupTimeout(
      () => (context as { close: () => Promise<void> }).close(),
      timeoutMs,
      'Dropshot browser context',
    );
    untrackDropshotContext(context);
    return true;
  } catch {
    // Keep ownership so a later shutdown/abort pass can try this context again.
    return false;
  }
}

/** Close and clear the cached browser context. Useful for tests and shutdown. */
export async function closeBrowserCache(timeoutMs = 5_000): Promise<void> {
  const context = cachedContext;
  const closed = await closeTrackedDropshotContext(context, timeoutMs);
  if (!closed) {
    throw new DropshotCleanupIncompleteError();
  }
  // Do not discard ownership before close is confirmed. If Chrome keeps the
  // profile lock past the deadline, retaining this cache prevents a new launch
  // from racing the still-live dedicated context.
  if (cachedContext === context) {
    cachedPage = null;
    cachedContext = null;
  }
}

/** Close every context, including visible login windows not stored in the cache. */
export async function closeAllDropshotContexts(timeoutMs = 5_000): Promise<void> {
  const contexts = new Set(trackedContexts);
  const ownedCachedContext = cachedContext;
  const ownedCachedPage = cachedPage;
  if (ownedCachedContext) contexts.add(ownedCachedContext);

  const contextList = [...contexts];
  const results = await Promise.all(
    contextList.map((context) => closeTrackedDropshotContext(context, timeoutMs)),
  );
  const cachedIndex = ownedCachedContext ? contextList.indexOf(ownedCachedContext) : -1;
  const cachedClosed = cachedIndex < 0 || results[cachedIndex] === true;
  if (cachedContext === ownedCachedContext) {
    if (cachedClosed) {
      cachedPage = null;
      cachedContext = null;
    } else {
      cachedPage = ownedCachedPage;
    }
  }
  if (results.some((closed) => !closed)) {
    throw new DropshotCleanupIncompleteError(
      'One or more Dropshot browser contexts could not be closed before the deadline',
    );
  }
}

/** Fatal browser errors must close the old persistent context before relaunch. */
export async function invalidateBrowserCache(): Promise<void> {
  await closeBrowserCache();
}
