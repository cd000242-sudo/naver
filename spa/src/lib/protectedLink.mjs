// Password-protected link helper: PBKDF2-SHA256 -> AES-256-GCM through WebCrypto.
// One module is shared by the browser bundle, scripts/encrypt-protected-link.mjs and the tests,
// so the cipher parameters can never drift apart between "seal" and "open".
//
// The site is static and its repository is public, so only the ciphertext is ever shipped.
// Security therefore rests on the password strength plus the PBKDF2 cost below.

export const PROTECTED_LINK_VERSION = 1;
export const PROTECTED_LINK_KDF = 'PBKDF2-SHA256';
/** OWASP 2023 guidance for PBKDF2-HMAC-SHA256. Stored in each payload, so it can be raised later. */
export const PROTECTED_LINK_ITERATIONS = 600_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 5_000_000;

/**
 * Error codes: EMPTY_PASSWORD, WRONG_PASSWORD, BAD_PAYLOAD, BAD_URL, UNSUPPORTED.
 * WRONG_PASSWORD also covers tampered ciphertext — AES-GCM cannot tell the two apart.
 */
export class ProtectedLinkError extends Error {
    constructor(code, message) {
        super(message ?? code);
        this.name = 'ProtectedLinkError';
        this.code = code;
    }
}

/** NFC + trim so a Korean password typed on another OS/IME (or pasted with a stray space) still matches. */
export function normalizePassword(password) {
    return String(password ?? '').normalize('NFC').trim();
}

function requireCrypto() {
    const webCrypto = globalThis.crypto;
    if (!webCrypto?.subtle || typeof webCrypto.getRandomValues !== 'function') {
        throw new ProtectedLinkError('UNSUPPORTED', 'WebCrypto is not available in this environment');
    }
    return webCrypto;
}

function toBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(text) {
    if (typeof text !== 'string' || text === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
        throw new ProtectedLinkError('BAD_PAYLOAD', 'invalid base64 field');
    }
    try {
        return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
    } catch {
        throw new ProtectedLinkError('BAD_PAYLOAD', 'invalid base64 field');
    }
}

async function deriveKey(subtle, password, salt, iterations, usage) {
    const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage],
    );
}

function assertHttpsUrl(text, code) {
    let parsed;
    try {
        parsed = new URL(text);
    } catch {
        throw new ProtectedLinkError(code, 'not a valid URL');
    }
    if (parsed.protocol !== 'https:') throw new ProtectedLinkError(code, 'only https links are allowed');
}

/** Seals arbitrary text. Prefer encryptLink(); this is exported for tests and future non-link secrets. */
export async function encryptText(plaintext, password, { iterations = PROTECTED_LINK_ITERATIONS } = {}) {
    const secret = normalizePassword(password);
    if (!secret) throw new ProtectedLinkError('EMPTY_PASSWORD', 'password is empty');
    const webCrypto = requireCrypto();
    const salt = webCrypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(webCrypto.subtle, secret, salt, iterations, 'encrypt');
    const sealed = await webCrypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: GCM_TAG_BYTES * 8 }, key, new TextEncoder().encode(plaintext));
    return {
        v: PROTECTED_LINK_VERSION,
        kdf: PROTECTED_LINK_KDF,
        iter: iterations,
        salt: toBase64(salt),
        iv: toBase64(iv),
        ct: toBase64(new Uint8Array(sealed)),
    };
}

/** Seals an https link. Anything else (http:, javascript:, garbage) is refused up front. */
export async function encryptLink(url, password, options) {
    assertHttpsUrl(url, 'BAD_URL');
    return encryptText(url, password, options);
}

/** Opens a payload and returns the https link. Throws ProtectedLinkError — never returns a partial value. */
export async function decryptLink(payload, password) {
    const secret = normalizePassword(password);
    if (!secret) throw new ProtectedLinkError('EMPTY_PASSWORD', 'password is empty');
    if (
        !payload || typeof payload !== 'object'
        || payload.v !== PROTECTED_LINK_VERSION || payload.kdf !== PROTECTED_LINK_KDF
        || !Number.isInteger(payload.iter) || payload.iter < MIN_ITERATIONS || payload.iter > MAX_ITERATIONS
    ) {
        throw new ProtectedLinkError('BAD_PAYLOAD', 'unsupported payload');
    }
    const salt = fromBase64(payload.salt);
    const iv = fromBase64(payload.iv);
    const sealed = fromBase64(payload.ct);
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || sealed.length <= GCM_TAG_BYTES) {
        throw new ProtectedLinkError('BAD_PAYLOAD', 'unexpected field sizes');
    }
    const webCrypto = requireCrypto();
    const key = await deriveKey(webCrypto.subtle, secret, salt, payload.iter, 'decrypt');
    let plain;
    try {
        plain = await webCrypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: GCM_TAG_BYTES * 8 }, key, sealed);
    } catch {
        throw new ProtectedLinkError('WRONG_PASSWORD', 'wrong password or damaged data');
    }
    const url = new TextDecoder().decode(plain);
    assertHttpsUrl(url, 'BAD_PAYLOAD');
    return url;
}
