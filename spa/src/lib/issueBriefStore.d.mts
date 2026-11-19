export type StoredIssueBrief = {
    facts: Array<{ text: string; sourceIndex: number }>;
    links: Array<{ url: string; press: string; publishedAt?: string | null; summary?: string }>;
    images: string[];
    keywords: string[];
    latestArticleAt?: string;
};
type BriefStorage = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
export const BRIEF_KEY: string;
export const BRIEF_TTL_MS: number;
export const BRIEF_MAX: number;
export const QUOTA_FALLBACK: string;
export function readBriefs(storage: BriefStorage, now: number): Record<string, StoredIssueBrief>;
export function rememberBrief(storage: BriefStorage, keyword: string, brief: StoredIssueBrief, now: number): boolean;
export function quotaNotice(result: { ok: boolean; error?: string; message?: string } | null | undefined): string;
