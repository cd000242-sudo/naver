import type { PreemptionRow } from '../components/leword/PreemptionCard';
export type GoldenEditorialAssessment = { ready: boolean; reasons: string[]; title: string | null; sources: NonNullable<PreemptionRow['brief']>['facts'] };
export type GoldenWritingItem = GoldenEditorialAssessment & {row: PreemptionRow};
export function safeGoldenTitle(row: PreemptionRow, input: unknown): string | null;
export function assessGoldenEditorial(row: PreemptionRow, now?: number): GoldenEditorialAssessment;
export function selectGoldenWriting(rows: PreemptionRow[], now?: number, limit?: number): GoldenWritingItem[];
export function canReadGoldenWriting(row: PreemptionRow, unlocked: boolean, freeNames: string[]): boolean;

export function selectGoldenResearch(rows: PreemptionRow[], preferred?: string, limit?: number): PreemptionRow[];
