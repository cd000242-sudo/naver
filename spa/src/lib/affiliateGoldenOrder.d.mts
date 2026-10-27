export interface GoldenRatioFields { needVolume?: number | null; needDocs?: number | null; searchVolume?: number | null; documentCount?: number | null }
export function goldenMetrics(item: GoldenRatioFields): { volume: number | null; docs: number | null; ratio: number | null };
export function compareGoldenRatio(a: GoldenRatioFields, b: GoldenRatioFields): number;
