(function attachProtectedLinkTools(root, factory) {
    'use strict';

    const tools = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = tools;
    }

    if (root) {
        root.AdminProtectedLink = tools;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProtectedLinkTools() {
    'use strict';

    // Same cipher as spa/src/lib/protectedLink.mjs (PBKDF2-SHA256 -> AES-256-GCM). The two files are kept in step
    // by src/__tests__/adminChatbotTiles.test.ts, which opens what this file seals with the site's own decryptLink.
    const VERSION = 1;
    const KDF = 'PBKDF2-SHA256';
    const ITERATIONS = 600000;
    const SALT_BYTES = 16;
    const IV_BYTES = 12;
    const TAG_BITS = 128;
    const MIN_PASSWORD_LENGTH = 12;

    /** NFC + trim, so the Korean password typed here matches what a visitor types on another OS or IME. */
    function normalizePassword(password) {
        return String(password === undefined || password === null ? '' : password).normalize('NFC').trim();
    }

    function samePassword(left, right) {
        return normalizePassword(left) === normalizePassword(right);
    }

    /** Empty string = fine, otherwise a short Korean reason. Only https links can be sealed. */
    function checkLink(url) {
        const text = String(url === undefined || url === null ? '' : url).trim();
        if (!text) return '링크를 입력해 주세요.';
        let parsed;
        try {
            parsed = new URL(text);
        } catch (error) {
            return 'https:// 로 시작하는 올바른 주소를 입력해 주세요.';
        }
        return parsed.protocol === 'https:' ? '' : 'https:// 로 시작하는 주소만 쓸 수 있습니다.';
    }

    /** A warning, never a block: short passwords can be guessed offline because the ciphertext is public. */
    function passwordWarning(password) {
        const length = Array.from(normalizePassword(password)).length;
        if (length === 0 || length >= MIN_PASSWORD_LENGTH) return '';
        return '비밀번호가 ' + MIN_PASSWORD_LENGTH + '자보다 짧습니다. 암호문은 누구나 볼 수 있어서 짧은 비밀번호는 풀릴 수 있습니다. (저장은 됩니다)';
    }

    function toBase64(bytes) {
        let binary = '';
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary);
    }

    function getCrypto() {
        const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
        if (!webCrypto || !webCrypto.subtle || typeof webCrypto.getRandomValues !== 'function') {
            throw new Error('이 브라우저에서는 암호화를 할 수 없습니다. 다른 브라우저로 열어 주세요.');
        }
        return webCrypto;
    }

    /** Seals an https link with a password. Returns the ciphertext object only; neither input is kept anywhere. */
    async function seal(url, password) {
        const linkProblem = checkLink(url);
        if (linkProblem) throw new Error(linkProblem);
        const secret = normalizePassword(password);
        if (!secret) throw new Error('비밀번호를 입력해 주세요.');
        const webCrypto = getCrypto();
        const salt = webCrypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const iv = webCrypto.getRandomValues(new Uint8Array(IV_BYTES));
        const material = await webCrypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
        const key = await webCrypto.subtle.deriveKey(
            { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ITERATIONS },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt'],
        );
        const sealed = await webCrypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, tagLength: TAG_BITS },
            key,
            new TextEncoder().encode(String(url).trim()),
        );
        return {
            v: VERSION,
            kdf: KDF,
            iter: ITERATIONS,
            salt: toBase64(salt),
            iv: toBase64(iv),
            ct: toBase64(new Uint8Array(sealed)),
        };
    }

    return Object.freeze({
        MIN_PASSWORD_LENGTH,
        checkLink,
        passwordWarning,
        samePassword,
        seal,
    });
});
