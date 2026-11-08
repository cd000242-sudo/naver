/**
 * Turns a picture address (the editor's JPEG as a data address) into the post's thumbnail: long side 360 px, re-drawn on
 * a canvas and written as JPEG (which drops any EXIF block), as padded base64 of at most 40,000 characters. A thumbnail
 * is a nicety: every failure here gives `undefined` (the post is then sent without one), never an error.
 */
import { encodeThumbWithinBudget, thumbSize } from './communityThumb.mjs';

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('decode'));
        image.src = src;
    });
}

const toBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

function toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result);
            resolve(result.slice(result.indexOf(',') + 1));
        };
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(blob);
    });
}

/** The base64 JPEG thumbnail of the picture at `src`, or undefined when it cannot be made within the budget. */
export async function encodeThumbFromSource(src: string): Promise<string | undefined> {
    try {
        const image = await loadImage(src);
        const { width, height } = thumbSize(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return undefined;
        // JPEG has no see-through: a transparent picture would turn black.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, width, height);
        const made = await encodeThumbWithinBudget(async (quality: number) => {
            const blob = await toBlob(canvas, quality);
            return blob ? toBase64(blob) : null;
        });
        return made.ok ? made.data : undefined;
    } catch {
        return undefined;
    }
}
