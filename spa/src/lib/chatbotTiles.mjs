// Free chatbot tiles: merges admin-saved site content over the built-in defaults.
// The admin editor (admin/chatbot-tiles-tools.js) writes exactly these fields:
//   chatbots.gemini / chatbots.naverFree        -> { title, desc, url, cta, badge }
//   chatbots.homefeedLocked                     -> { title, desc, payload }   (payload = ciphertext only)
// A blank or malformed saved value never replaces a default, so a half-filled editor cannot blank a tile.
import { PROTECTED_LINK_KDF, PROTECTED_LINK_VERSION } from './protectedLink.mjs';

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PUBLIC_FIELDS = ['title', 'desc', 'url', 'cta', 'badge'];

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** Only absolute https links may reach an href; everything else (javascript:, http:, relative) is refused. */
export function isHttpsUrl(value) {
    const text = cleanText(value);
    if (!text) return false;
    try {
        return new URL(text).protocol === 'https:';
    } catch {
        return false;
    }
}

/** Shape check for the sealed-link object stored in site content (the bundled file has the same shape). */
export function isSealedPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    return payload.v === PROTECTED_LINK_VERSION
        && payload.kdf === PROTECTED_LINK_KDF
        && Number.isInteger(payload.iter)
        && ['salt', 'iv', 'ct'].every((key) => typeof payload[key] === 'string' && BASE64.test(payload[key]));
}

/** Tile that links straight to a public page. `defaults` supplies every field; `override` may replace some. */
export function resolvePublicTile(defaults, override) {
    const saved = override && typeof override === 'object' ? override : {};
    const tile = { ...defaults };
    for (const field of PUBLIC_FIELDS) {
        const text = cleanText(saved[field]);
        if (!text) continue;
        if (field === 'url' && !isHttpsUrl(text)) continue;
        tile[field] = text;
    }
    return tile;
}

/** Password tile: text from the admin, ciphertext from the admin when well formed, otherwise the bundled one. */
export function resolveProtectedTile(defaults, override, bundledPayload) {
    const saved = override && typeof override === 'object' ? override : {};
    return {
        title: cleanText(saved.title) || defaults.title,
        desc: cleanText(saved.desc) || defaults.desc,
        payload: isSealedPayload(saved.payload) ? saved.payload : bundledPayload,
    };
}
