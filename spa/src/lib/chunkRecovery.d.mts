export const RELOAD_GUARD_MS: number;
export function isChunkLoadError(error: unknown): boolean;
export function shouldAutoReload(now: number, lastReloadAt: number | null): boolean;
export function recoverFromChunkError(): boolean;
export function installChunkRecovery(): void;
