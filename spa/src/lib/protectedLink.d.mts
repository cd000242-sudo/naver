export declare const PROTECTED_LINK_VERSION: 1;
export declare const PROTECTED_LINK_KDF: 'PBKDF2-SHA256';
export declare const PROTECTED_LINK_ITERATIONS: number;

/** Encrypted link as stored in src/data/protectedLinks.json (all binary fields are base64). */
export interface ProtectedLinkPayload {
    v: number;
    kdf: string;
    iter: number;
    salt: string;
    iv: string;
    ct: string;
}

export type ProtectedLinkErrorCode = 'EMPTY_PASSWORD' | 'WRONG_PASSWORD' | 'BAD_PAYLOAD' | 'BAD_URL' | 'UNSUPPORTED';

export declare class ProtectedLinkError extends Error {
    readonly code: ProtectedLinkErrorCode;
    constructor(code: ProtectedLinkErrorCode, message?: string);
}

export declare function normalizePassword(password: unknown): string;
export declare function encryptText(plaintext: string, password: string, options?: { iterations?: number }): Promise<ProtectedLinkPayload>;
export declare function encryptLink(url: string, password: string, options?: { iterations?: number }): Promise<ProtectedLinkPayload>;
export declare function decryptLink(payload: unknown, password: string): Promise<string>;
