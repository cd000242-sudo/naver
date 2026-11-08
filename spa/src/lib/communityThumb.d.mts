export const THUMB_LIMITS: Readonly<{ side: number; quality: number; retryQuality: number; maxBase64: number }>;
export const THUMB_ID: string;
export function thumbSize(width: number, height: number): { width: number; height: number };
export function normalizeThumbId(value: unknown): string;
export function isThumbData(value: unknown): boolean;
export function encodeThumbWithinBudget(encode: (quality: number) => Promise<string | null>): Promise<{ ok: true; quality: number; data: string } | { ok: false }>;
export function firstImageId(blocks: ReadonlyArray<{ t?: string; id?: unknown }> | null | undefined): string;
export type ThumbPlan = { action: 'none' } | { action: 'attached' | 'server'; id: string };
export function planThumb(input: {
    blocks: ReadonlyArray<{ t?: string; id?: unknown }> | null | undefined;
    attachedIds?: readonly string[];
    editingPostId?: string;
    originalFirstId?: string;
    hadThumb?: boolean;
}): ThumbPlan;
export function pickRowThumb(item: { thumbId?: unknown; thumbUrl?: unknown } | null | undefined): { has: boolean; id: string; url: string };
