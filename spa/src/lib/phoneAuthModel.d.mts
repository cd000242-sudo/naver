export const PHONE_PROMISE: string;
export function normalizePhone(value: unknown): string;
export function formatPhoneInput(value: unknown): string;
export function validatePhone(value: unknown): string;
export function normalizeCode(value: unknown): string;
export function validateAuthCode(value: unknown): string;
export function remainingSeconds(until: number, now: number): number;
export function formatWait(seconds: unknown): string;
export function sentMessage(expiresInSec: unknown): string;
export function sendButtonLabel(state: { sent: boolean; waitSec: number; busy: boolean }): string;
export function waitSeconds(value: unknown, fallback?: number): number;

export type PhoneFailureKind = 'taken' | 'phone' | 'required' | 'code' | 'expired' | 'sms' | 'wait' | 'already' | 'license' | 'other';
export type PhoneFailure = { kind: PhoneFailureKind; message: string; retryAfterSec?: number };
export function describePhoneFailure(result: { code?: string; message?: string; retryAfterSec?: unknown; triesLeft?: unknown } | null | undefined): PhoneFailure;
