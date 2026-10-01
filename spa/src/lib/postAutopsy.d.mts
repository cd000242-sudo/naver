export interface AutopsyPostFact {
  title: string;
  url: string;
  publishedOn: string;
  publishedAt: string | null;
  approxTime: boolean;
  searchable: boolean;
  blocked: boolean;
  views: number | null;
  viewDays: number;
  viewsComplete: boolean;
}
export interface AutopsyHomefeedRow { day: string; rank: number; title: string; url: string; publishedAt: string | null }
export interface AutopsyFacts { from: string; to: string; posts: AutopsyPostFact[]; homefeed: AutopsyHomefeedRow[] }
export type AutopsyVerdict = 'blocked' | 'late' | 'outtitled' | 'no-homefeed' | 'unknown';
export type AutopsyFlag =
  | { kind: 'no-search' }
  | { kind: 'off-hours'; publishedHour: number; peakHours: number[] };
export interface AutopsyRow {
  post: AutopsyPostFact;
  verdict: AutopsyVerdict;
  match: { day: string; rank: number; title: string; url: string; publishedAt: string | null; leadMinutes: number | null } | null;
  dayTop: AutopsyHomefeedRow[];
  flags: AutopsyFlag[];
  hoursTracked: number | null;
}
export interface AutopsyResult {
  zero: AutopsyRow[];
  summary: { posts: number; complete: number; zero: number; incomplete: number; verdicts: Partial<Record<AutopsyVerdict, number>> };
}
export function autopsyPosts(facts: AutopsyFacts | null | undefined, options?: { myHours?: { hour: number; monthAverage: number }[] }): AutopsyResult;
