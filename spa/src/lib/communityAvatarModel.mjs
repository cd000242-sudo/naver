/**
 * Rules for the round profile photo, kept apart from the browser so node:test can pin them: the picture size, the
 * centre crop, how small it must get, which keys and addresses may be drawn. The server is the authority.
 */

export const AVATAR_SIZE = 128;
/** The server keeps a photo in one sheet cell (50,000 characters of base64), so about 37KB of JPEG at most. */
export const AVATAR_MAX_BYTES = 37000;
/** JPEG qualities tried from the best down until the picture fits. */
export const AVATAR_QUALITIES = Object.freeze([0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
/** `community-avatars` takes at most this many keys per call. */
export const AVATAR_KEYS_PER_CALL = 50;

const KEY_PATTERN = /^[0-9a-f]{20}$/;
const URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const URL_PARTS = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/]*)(={0,2})$/;
const MAX_URL_LENGTH = 60000;

/** An avatar key is 20 lowercase hex characters (what the server puts on posts, comments and profiles). */
export const isAvatarKey = (value) => typeof value === 'string' && KEY_PATTERN.test(value);

/** A server-sent photo is drawn only when it is a plain base64 jpeg / png / webp address; anything else is '' (a letter is drawn). */
export const safeAvatarUrl = (value) => (typeof value === 'string' && value.length <= MAX_URL_LENGTH && URL_PATTERN.test(value) ? value : '');

/** Size in bytes of the picture inside a base64 data address; 0 when it is not one. */
export function dataUrlBytes(dataUrl) {
    const parts = URL_PARTS.exec(String(dataUrl || ''));
    if (!parts) return 0;
    return Math.floor(((parts[1].length + parts[2].length) * 3) / 4) - parts[2].length;
}

/** The middle square of a picture: where to cut and how long its side is. null for a picture without a size. */
export function avatarCrop(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    const side = Math.floor(Math.min(width, height));
    return { sx: Math.floor((width - side) / 2), sy: Math.floor((height - side) / 2), side };
}

/** The first quality whose picture fits the server's cell. `encode(quality)` returns a data address. null when none fits. */
export function fitAvatar(encode) {
    for (const quality of AVATAR_QUALITIES) {
        const dataUrl = encode(quality);
        if (dataUrl && dataUrlBytes(dataUrl) > 0 && dataUrlBytes(dataUrl) <= AVATAR_MAX_BYTES) return { dataUrl, quality };
    }
    return null;
}

/** The letter in the circle when there is no photo: the first character of the nickname. */
export function avatarInitial(name) {
    const first = typeof name === 'string' ? Array.from(name.trim())[0] : '';
    return first ? first.toUpperCase() : '?';
}

/** Splits a list into pieces of at most `size`. */
export function chunkKeys(keys, size = AVATAR_KEYS_PER_CALL) {
    const pieces = [];
    for (let at = 0; at < keys.length; at += size) pieces.push(keys.slice(at, at + size));
    return pieces;
}
