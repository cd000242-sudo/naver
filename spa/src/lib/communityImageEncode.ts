/**
 * Turns a picked picture file into a post picture: long side at most 1000 px, re-drawn on a canvas and written as JPEG.
 * Re-drawing is what removes the EXIF block (location, camera, time). Everything happens in the browser; nothing is
 * sent from here. The sizes and the 160 KB budget are in communityImage.mjs.
 */
import { IMAGE_LIMITS, encodeWithinBudget, fitWithin } from './communityImage.mjs';
import type { UploadImage } from './communityApi';

/** A picture ready to send, with an address the editor can show it from (a blob address of this tab only). */
export type EncodedImage = UploadImage & { previewUrl: string };
export type EncodeOutcome = { ok: true; image: EncodedImage } | { ok: false; message: string };

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const fail = (message: string): EncodeOutcome => ({ ok: false, message });
const UNREADABLE = '이 사진은 읽을 수 없어요. JPG나 PNG 사진으로 올려 주세요.';

/** Ids are letters and digits only: they go into the post's JSON and into addresses. */
export function newImageId(): string {
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return `i${random}`;
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded> {
    if (typeof createImageBitmap === 'function') {
        try {
            const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
            return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
        } catch {
            // Fall through to the image element (older browsers).
        }
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('decode')); image.src = url; });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

const toBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

function toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(blob);
    });
}

export async function encodeImageFile(file: File): Promise<EncodeOutcome> {
    if (!file.type.startsWith('image/')) return fail('사진 파일만 올릴 수 있어요.');
    if (file.size > MAX_FILE_BYTES) return fail('사진이 너무 커요. 더 작은 사진으로 올려 주세요.');
    let decoded: Decoded;
    try {
        decoded = await decode(file);
    } catch {
        return fail(UNREADABLE);
    }
    try {
        const { width, height } = fitWithin(decoded.width, decoded.height);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return fail(UNREADABLE);
        // JPEG has no see-through: a transparent picture would turn black.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.source, 0, 0, width, height);
        const made = await encodeWithinBudget((quality: number) => toBlob(canvas, quality));
        if (!made.ok) return fail(made.message);
        const data = await toBase64(made.blob);
        if (data.length > IMAGE_LIMITS.maxBase64) return fail('사진이 너무 커요. 더 작은 사진으로 올려 주세요.');
        return { ok: true, image: { id: newImageId(), mime: 'image/jpeg', data, previewUrl: URL.createObjectURL(made.blob) } };
    } catch {
        return fail(UNREADABLE);
    } finally {
        decoded.release();
    }
}
