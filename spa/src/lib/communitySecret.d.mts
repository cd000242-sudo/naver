export type SecretClass = Readonly<{ allowed: boolean; lifetime: boolean }>;
type SecretProfile = { role?: string; secretClass?: unknown } | null | undefined;

export const GREETING_BOARD: 'greeting';
export const LEVELUP_BOARD: 'levelup';
export const SECRET_BOARD: 'secret';
export function normalizeSecretClass(raw: unknown): SecretClass;
export function secretAccess(profile: SecretProfile): SecretClass;
export const SECRET_LOCK: Readonly<{ title: string; tag: string; lines: readonly string[]; pricing: string; pricingLabel: string }>;
export const SECRET_LIFETIME_HINT: string;
