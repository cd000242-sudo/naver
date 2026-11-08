/**
 * Turns a picked picture file into the profile photo: the middle square, 128x128, JPEG, as small as the server's cell
 * needs (quality steps down until it fits). Everything happens in the browser; nothing is sent from here.
 */
import { AVATAR_SIZE, avatarCrop, fitAvatar } from './communityAvatarModel.mjs';

export type AvatarMade = { ok: true; dataUrl: string } | { ok: false; message: string };

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const fail = (message: string): AvatarMade => ({ ok: false, message });
const UNREADABLE = '이 사진은 읽을 수 없어요. 다른 사진으로 해 주세요.';

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

export async function makeAvatar(file: File): Promise<AvatarMade> {
    if (!file.type.startsWith('image/')) return fail('사진 파일을 골라 주세요.');
    if (file.size > MAX_FILE_BYTES) return fail('사진이 너무 커요. 더 작은 사진으로 해 주세요.');
    let decoded: Decoded;
    try {
        decoded = await decode(file);
    } catch {
        return fail(UNREADABLE);
    }
    try {
        const crop = avatarCrop(decoded.width, decoded.height);
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const context = canvas.getContext('2d');
        if (!crop || !context) return fail(UNREADABLE);
        // JPEG has no see-through: a transparent picture would turn black.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
        context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.source, crop.sx, crop.sy, crop.side, crop.side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        const fit = fitAvatar((quality) => canvas.toDataURL('image/jpeg', quality));
        return fit ? { ok: true, dataUrl: fit.dataUrl } : fail('사진을 충분히 줄이지 못했어요. 다른 사진으로 해 주세요.');
    } catch {
        return fail(UNREADABLE);
    } finally {
        decoded.release();
    }
}
