export interface HomefeedEvidence {
  homefeed: { kind: 'same-post' | 'similar'; day: string; rank: number | null; title: string; url: string } | null;
  mine: { title: string; day: string; count: number } | null;
}
export function annotateEvidence<T extends { title: string; sources: { title: string; url: string | null }[] }>(candidates: T[], daily: unknown): (T & { evidence: HomefeedEvidence })[];
export function evidenceSummary(daily: unknown): { homefeedTitles: number; days: number; from: string | null; to: string | null; myHits: number } | null;
