export type CoupangDiscovery = {
    status: 'candidate' | 'inspect';
    cues: { quote: string; use: string; question: string }[];
    reasons: string[];
    sourceKind: 'category' | 'promotion' | 'unknown';
    sourceLabel: string;
    fresh: boolean;
    measuredAt: string | null;
    salesVerified: false;
    noveltyVerified: false;
};
export function coupangProductUrl(value: unknown): string | null;
export function assessCoupangDiscovery(input: unknown, options?: { now?: number }): CoupangDiscovery;
export function compareCoupangDiscovery(a: { row: { bestRank?: number; name?: string }; discovery: CoupangDiscovery }, b: { row: { bestRank?: number; name?: string }; discovery: CoupangDiscovery }): number;
