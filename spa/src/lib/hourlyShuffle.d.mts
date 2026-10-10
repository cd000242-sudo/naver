export function kstHour(nowMs: number): number;
export function msToNextHour(nowMs: number): number;
export function shuffleSeed(hour: number, bump?: number): number;
export function shuffleWithinTiers<T>(items: readonly T[], tierOf: (item: T) => number, seed: number): T[];
