export type GradeEntry = Readonly<{ key: string; label: string; min: number; range: string; reward: string; condition: string; conditionDetail: string }>;
export type ServerReward = { days: number; mode: 'auto' | 'approval' } | null;
export type ScoreRules = { post: number; comment: number; visit: number; likeReceived: number; dailyCap: number; accepted?: number };
export type RewardStatus = 'granted' | 'pending' | 'approved' | 'rejected';
export type RewardItem = { tier: string; label: string; days: number; mode: 'auto' | 'approval'; status: RewardStatus; createdAt: string; decidedAt: string };
export type RewardRow = { key: string; tierLabel: string; text: string; status: RewardStatus; statusLabel: string; tone: 'done' | 'wait' | 'review' };

export const GRADE_TABLE: readonly GradeEntry[];
export const FOREST_GRADE: Readonly<{ key: 'forest'; label: string; min: number; nextAt: null; nextLabel: null }>;
export const OWNER_GRADE_TEXT: string;
export const SCORE_RULES: string;
export function rewardText(reward: { days?: unknown; mode?: unknown } | null | undefined): string;
export function pickGrades(raw: unknown): Array<{ key: string; label: string; min: number; reward: ServerReward; extra?: { likesMin: number; topsMin: number; topLikesMin: number } }>;
export function gradeGuide(config: { grades?: unknown } | null | undefined): readonly GradeEntry[];
export function pickScoreRules(raw: unknown): ScoreRules | null;
export function scoreRulesText(raw: unknown): string;
export function normalizeRewards(raw: unknown): RewardItem[];
export function rewardRows(rewards: unknown): RewardRow[];
export function requestTierLabel(tier: string, given?: string): string;
