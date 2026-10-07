export type VsSample = {
    query: string;
    searchVolume: number;
    documentCount: number | null;
    sourceCount: number;
    theirs: string[];
    ours: Array<{ text: string; edge: string }>;
    asOf: string;
};
export const VS_SNAPSHOT: VsSample;
export function pickVsSample(cards: unknown[], asOf: string): VsSample | null;
