export const LOGIN_PATH: string;
export const SIGNUP_PATH: string;

export function safeNextPath(raw: unknown): string;
export function loginPath(next?: unknown): string;
export function signupPath(next?: unknown): string;
export function afterAuthPath(next?: unknown): string;

export function validateLogin(input: { userId?: string; password?: string }): string;
export function validateSignup(input: { userId?: string; password?: string; passwordConfirm?: string; nickname?: string }): string;

export type NoticePart = Readonly<{ text: string; bold?: boolean }>;
export const REGISTER_NOTICE_PARTS: readonly NoticePart[];
export const REGISTER_NOTICE_TEXT: string;

export function describeRegisterFailure(result: { code?: string; productName?: string; message?: string; error?: string } | null | undefined): string;
export function isSessionFailure(code: unknown): boolean;

export type LewordVerdict =
    | { kind: 'ok' }
    | { kind: 'not-activated' | 'expired' | 'login' | 'blocked'; message: string }
    | { kind: 'error'; message: string };
export function mapLewordVerify(payload: unknown): LewordVerdict;
