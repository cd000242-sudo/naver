export interface VariedTitle { text: string; kind: string; frame: string; frameLabel: string; basis: string }
export function forgeVariedTitles(keyword: string, derived: ReadonlyArray<{ keyword: string; searchVolume: number | null }>, serpTitles: readonly string[], frameCap?: number): VariedTitle[];
export const FRAME_CAP: number;
export const FRAME_LABEL: Record<string, string>;
