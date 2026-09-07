export type WritingAssessment = {
  status: 'ready' | 'research' | 'excluded'; reasons: string[];
  demand?: { status: string; query?: string; monthlySearches?: number | null };
};
export function sourceUrl(value: unknown): string | null;
export function recommendationReason(reason: string): string;
export function affiliateTitle(item: unknown): { text: string; label: string; basis: string; verified: boolean };
export function affiliateWritingBrief(item: unknown, assessment?: WritingAssessment): {
  query: string; ready: boolean; warning: string; reasons: string[];
  title: ReturnType<typeof affiliateTitle>; sections: string[];
  sources: { id: string; url: string; excerpt: string; measuredAt?: string }[];
};
