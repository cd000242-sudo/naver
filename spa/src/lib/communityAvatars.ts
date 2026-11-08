/**
 * Profile photos: fetch many at once, keep them in this browser, set or remove my own.
 * The list never waits for them (letters are drawn first). A photo is public information, so the store holds only
 * key -> picture; never a token, a phone number or an id. Everything read back is checked again before it is drawn.
 */
import { callWithToken } from './communityApi';
import { AVATAR_KEYS_PER_CALL, chunkKeys, isAvatarKey, safeAvatarUrl } from './communityAvatarModel.mjs';
import { COMMUNITY_ACTIONS, COMMUNITY_CODES } from './communityContract.mjs';
import { loadCommunitySession, saveCommunitySession } from './communitySession';

export const AVATAR_STORE_KEY = 'leaderspro.community.avatars.v1';
/** Most photos kept, and the most characters they may take together; the oldest go first. */
export const AVATAR_CACHE_MAX = 120;
const CACHE_CHARS_MAX = 1_500_000;
/** After a refusal (an old server, a bad moment) the photos are not asked for again for this long. */
const PAUSE_MS = 60 * 1000;
let pausedUntil = 0;

type Stored = { order: string[]; map: Record<string, string> };

function area(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function readStore(): Stored {
    const empty: Stored = { order: [], map: {} };
    const storage = area();
    if (!storage) return empty;
    try {
        const saved = JSON.parse(storage.getItem(AVATAR_STORE_KEY) || 'null') as Partial<Stored> | null;
        const map: Record<string, string> = {};
        const order: string[] = [];
        for (const key of Array.isArray(saved?.order) ? saved.order : []) {
            const url = safeAvatarUrl(saved?.map?.[key]);
            if (isAvatarKey(key) && url && !(key in map)) { map[key] = url; order.push(key); }
        }
        return { order, map };
    } catch {
        return empty;
    }
}

function writeStore(next: Stored): void {
    const storage = area();
    if (!storage) return;
    const order = [...next.order];
    let chars = order.reduce((sum, key) => sum + next.map[key].length, 0);
    while (order.length > AVATAR_CACHE_MAX || (chars > CACHE_CHARS_MAX && order.length > 1)) {
        const oldest = order.shift() as string;
        chars -= next.map[oldest].length;
    }
    const map = Object.fromEntries(order.map((key) => [key, next.map[key]]));
    try { storage.setItem(AVATAR_STORE_KEY, JSON.stringify({ order, map })); } catch { /* storage full or blocked: photos are fetched again */ }
}

const uniqueKeys = (keys: readonly unknown[]): string[] => [...new Set(keys.filter(isAvatarKey))];

/** Photos already kept here for these keys; no network. */
export function readCachedAvatars(keys: readonly unknown[]): Record<string, string> {
    const { map } = readStore();
    return Object.fromEntries(uniqueKeys(keys).filter((key) => key in map).map((key) => [key, map[key]]));
}

/** Keeps one photo (newest last). */
export function rememberAvatar(key: string, dataUrl: string): void {
    const url = safeAvatarUrl(dataUrl);
    if (!isAvatarKey(key) || !url) return;
    const store = readStore();
    writeStore({ order: [...store.order.filter((entry) => entry !== key), key], map: { ...store.map, [key]: url } });
}

/**
 * The photos for these keys: what is kept, plus ONE call per 50 missing keys. Never throws; a refusal or garbage
 * answer just leaves those keys without a photo (the screen draws the first letter) and pauses further asking.
 */
export async function fetchAvatars(keys: readonly unknown[]): Promise<Record<string, string>> {
    const wanted = uniqueKeys(keys);
    const have = readCachedAvatars(wanted);
    const missing = wanted.filter((key) => !(key in have));
    if (missing.length === 0 || Date.now() < pausedUntil) return have;
    const answers = await Promise.all(chunkKeys(missing, AVATAR_KEYS_PER_CALL).map((chunk) => callWithToken(COMMUNITY_ACTIONS.avatars, { keys: chunk })));
    const found: Record<string, string> = {};
    for (const answer of answers) {
        if (!answer.ok) { pausedUntil = Date.now() + PAUSE_MS; continue; }
        const photos = answer.avatars && typeof answer.avatars === 'object' ? answer.avatars as Record<string, unknown> : {};
        for (const [key, value] of Object.entries(photos)) {
            const url = safeAvatarUrl(value);
            if (isAvatarKey(key) && url && missing.includes(key)) found[key] = url;
        }
    }
    const store = readStore();
    const fresh = Object.keys(found);
    if (fresh.length > 0) writeStore({ order: [...store.order.filter((key) => !fresh.includes(key)), ...fresh], map: { ...store.map, ...found } });
    return { ...have, ...found };
}

export type SetAvatarOutcome = { ok: true; avatarKey: string | null } | { ok: false; code: string; message: string };

/** `image` is a data address, or null to remove the photo. The new key goes into the stored login at once. */
export async function setMyAvatar(image: string | null): Promise<SetAvatarOutcome> {
    if (image !== null && !safeAvatarUrl(image)) return { ok: false, code: COMMUNITY_CODES.INVALID_IMAGE, message: '사진을 읽지 못했어요. 다른 사진으로 해 주세요.' };
    const result = await callWithToken(COMMUNITY_ACTIONS.setAvatar, { image });
    if (!result.ok) {
        const refused = result.code === COMMUNITY_CODES.INVALID_IMAGE;
        return { ok: false, code: result.code, message: refused ? '사진을 올릴 수 없어요. 다른 사진으로 해 주세요.' : result.message };
    }
    const avatarKey = isAvatarKey(result.avatarKey) ? result.avatarKey : null;
    if (avatarKey && image) rememberAvatar(avatarKey, image);
    const current = loadCommunitySession();
    if (current) saveCommunitySession({ ...current, avatarKey: avatarKey ?? '' });
    return { ok: true, avatarKey };
}
