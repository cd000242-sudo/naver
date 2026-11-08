export type PromoPlatformKey = 'naver' | 'google';
export const PROMO_PLATFORMS: readonly Readonly<{ key: PromoPlatformKey; label: string; example: string }>[];
export const DEFAULT_PLATFORM: 'naver';
export function normalizePlatform(value: unknown): PromoPlatformKey;
export function hostOf(url: unknown): string;
export function validatePromoUrl(url: unknown, platform: unknown): string;
export function suggestPlatform(url: unknown): PromoPlatformKey | '';
export function platformFromUrl(url: unknown): PromoPlatformKey | '';
export function promoPlatformOf(post: { platform?: unknown; url?: unknown } | null | undefined): PromoPlatformKey;
