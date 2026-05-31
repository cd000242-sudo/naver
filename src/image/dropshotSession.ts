/**
 * 🍌 Dropshot session state — single shared browser context/page + generation chain.
 *
 * Node module singletons guarantee ONE instance, so login (dropshotLogin.ts) and
 * page lifecycle (dropshotCore.ts) read/write the exact same cached context/page.
 * Keeping this state in its own module lets those concerns live in separate files
 * without circular imports.
 */

let cachedContext: unknown = null;
let cachedPage: unknown = null;

/** Serialize all generation calls — single shared browser page. */
let _generationChain: Promise<unknown> = Promise.resolve();

export function getCachedPage(): unknown {
  return cachedPage;
}

export function getCachedContext(): unknown {
  return cachedContext;
}

export function setCached(ctx: unknown, page: unknown): void {
  cachedContext = ctx;
  cachedPage = page;
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

/** Invalidate cached browser context (called on fatal errors). */
export function invalidateBrowserCache(): void {
  cachedPage = null;
  cachedContext = null;
}
