/**
 * Pictures inside a post (forum contract 1114, section 3). The page shrinks each one to 1000 px on the long side and
 * re-encodes it as JPEG (which also drops the EXIF block: location, camera, time). The numbers and the budget loop
 * live here as pure code; the canvas itself is in communityImageEncode.ts.
 */

export const IMAGE_LIMITS = Object.freeze({
    maxSide: 1000,
    quality: 0.72,
    retryQuality: 0.55,
    maxBytes: 160 * 1024,
    maxCount: 6,
    /** The most base64 characters the server takes for one picture. */
    maxBase64: 220000,
});

/** Length of the base64 text of `bytes` bytes (4 characters per 3 bytes, rounded up). */
export const base64Length = (bytes) => 4 * Math.ceil(bytes / 3);

/** Size after cutting the long side to `max`; the shape is kept and a small picture is never enlarged. */
export function fitWithin(width, height, max = IMAGE_LIMITS.maxSide) {
    const w = Math.max(0, Number(width) || 0);
    const h = Math.max(0, Number(height) || 0);
    const scale = Math.min(1, max / Math.max(w, h, 1));
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

const TOO_BIG = '사진이 너무 커요. 더 작은 사진으로 올려 주세요.';
const UNREADABLE = '이 사진은 읽을 수 없어요. JPG나 PNG 사진으로 올려 주세요.';

/**
 * Encodes at 0.72 and, if that is over 160 KB, once more at 0.55; still over means the picture is refused.
 * `encode(quality)` resolves to `{ size, ... }` (a Blob) or null; whatever it returns is handed back as `blob`.
 */
export async function encodeWithinBudget(encode) {
    for (const quality of [IMAGE_LIMITS.quality, IMAGE_LIMITS.retryQuality]) {
        let blob;
        try {
            blob = await encode(quality);
        } catch {
            return { ok: false, message: UNREADABLE };
        }
        if (!blob || !Number.isFinite(blob.size)) return { ok: false, message: UNREADABLE };
        if (blob.size <= IMAGE_LIMITS.maxBytes) return { ok: true, quality, blob };
    }
    return { ok: false, message: TOO_BIG };
}

/** Which of the chosen files can still be added: images only, and no more than six pictures in the post. */
export function planImageAdd(currentCount, files) {
    const list = Array.isArray(files) ? files : [];
    const images = list.filter((file) => typeof file?.type === 'string' && file.type.startsWith('image/'));
    const room = Math.max(0, IMAGE_LIMITS.maxCount - Math.max(0, Number(currentCount) || 0));
    const accept = images.slice(0, room);
    let message = '';
    if (images.length > room) message = `사진은 ${IMAGE_LIMITS.maxCount}장까지 넣을 수 있어요.`;
    else if (images.length < list.length) message = '사진 파일만 올릴 수 있어요.';
    return { accept, message };
}

const JPEG_DATA = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

/** A picture address that is safe to give an <img>: a jpeg data address and nothing else. */
export const isJpegDataUrl = (value) => typeof value === 'string' && JPEG_DATA.test(value);

/** The data address of what `community-post-image` returned; '' unless it is a real jpeg. */
export function toJpegDataUrl(mime, data) {
    if (mime !== 'image/jpeg' || typeof data !== 'string') return '';
    const url = `data:image/jpeg;base64,${data}`;
    return isJpegDataUrl(url) ? url : '';
}
