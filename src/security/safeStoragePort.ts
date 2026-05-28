/**
 * Thin re-export of electron.safeStorage so tests can mock this local module
 * (vi.mock against the `electron` package is unreliable across environments).
 *
 * Production paths import `safeStoragePort` instead of `electron` directly.
 */

import { safeStorage } from 'electron';

export const port = safeStorage;
