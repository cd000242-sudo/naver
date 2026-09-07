export type AffiliateRecommendation = {
  status: 'ready' | 'research' | 'excluded'; reasons: string[]; query: string; meaning: string;
  demand: { status: string; query: string; monthlySearches: number | null };
  competition: { status: string; query: string; documentCount: number | null; ratio: number | null; serpTop: {sampled:number;exact:number;partial:number}|null };
  freshness: { collectedAt: string | null; measuredAt: string | null; maxAgeHours: number };
};
export function assessAffiliateRecommendation(item: unknown, options?: {now?:number|string;collectedAt?:string|null;maxAgeMs?:number}): AffiliateRecommendation;
export function compareAffiliateRecommendations(a: {recommendation:AffiliateRecommendation}, b: {recommendation:AffiliateRecommendation}): number;
export function verifiedProductEvidence(item: unknown, options?: {now?:number;maxAgeMs?:number}): {id:string;sourceType:string;sourceUrl:string;excerpt:string;verifiedAt:string}[];
export function validateEvidenceTitle(item: unknown, row: unknown, options?: {now?:number;maxAgeMs?:number}): {text:string;status:'verified';evidenceIds:string[]}|null;
