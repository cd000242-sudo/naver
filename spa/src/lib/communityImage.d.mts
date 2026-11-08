export const IMAGE_LIMITS: Readonly<{ maxSide: number; quality: number; retryQuality: number; maxBytes: number; maxCount: number; maxBase64: number }>;
export function base64Length(bytes: number): number;
export function fitWithin(width: number, height: number, max?: number): { width: number; height: number };
export type EncodeResult<B extends { size: number }> = { ok: true; quality: number; blob: B } | { ok: false; message: string };
export function encodeWithinBudget<B extends { size: number }>(encode: (quality: number) => Promise<B | null>): Promise<EncodeResult<B>>;
export function planImageAdd<F extends { type: string }>(currentCount: number, files: readonly F[] | null | undefined): { accept: F[]; message: string };
export function isJpegDataUrl(value: unknown): boolean;
export function toJpegDataUrl(mime: unknown, data: unknown): string;
