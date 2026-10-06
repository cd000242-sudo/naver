export interface PlanQuestion { title: string; link: string; where: string; postdate: string }
export interface AffiliateCandidate { name: string; platform: string; keyword: string; reward: string; link: string }
export function questionChecklist(items: unknown[], limit: number, keyword?: string): PlanQuestion[];
export function affiliateCandidates(keyword: string, snapshot: unknown, limit: number): AffiliateCandidate[];
export function matchAppPlan<T extends { keyword?: string; updatedAt?: string }>(plans: T[], keyword: string): T | null;
