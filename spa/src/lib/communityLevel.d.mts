export type LevelKey = 'associate' | 'member';
export type LevelUpFlags = { post: boolean; comment: boolean };
type LevelProfile = { role?: string; level?: unknown; levelUp?: unknown } | null | undefined;

export const ASSOCIATE_GRADE: Readonly<{ key: 'associate'; label: string; min: 0; nextAt: null; nextLabel: null }>;
export function normalizeLevel(value: unknown): LevelKey;
export function normalizeLevelUp(raw: unknown): LevelUpFlags;
export function isAssociate(profile: LevelProfile): boolean;
export function levelUpSteps(profile: LevelProfile): Array<{ key: 'post' | 'comment'; label: string; done: boolean }>;
export function levelUpReady(profile: LevelProfile): boolean;
export function associateWriteState(profile: LevelProfile, boardId: string): { open: boolean; reason: '' | 'board' | 'post-done'; message: string };
export function levelUpFromNeed(need: unknown): LevelUpFlags | null;
export function describeLevelUpFailure(result: { code?: unknown; need?: unknown; message?: unknown } | null | undefined): string;
