export type ForestExtra = { likesMin: number; topsMin: number; topLikesMin: number };
export type Forest = { likes: number; tops: number } & ForestExtra;
export const FOREST_PROGRESS_FROM: number;
export function pickForestExtra(raw: unknown): ForestExtra | null;
export function pickForest(raw: unknown): Forest | null;
export function forestGuideLine(minScore: unknown, extra: unknown): string;
export function forestGuideDetail(extra: unknown): string;
export function forestProgress(profile: { role?: unknown; score?: unknown; forest?: unknown } | null | undefined): { text: string; likesText: string; topsText: string; likesDone: boolean; topsDone: boolean } | null;
