/** Main-process authority for the qualifying issued license term, not payment proof. */
export interface DailyPublishingEntitlement {
  readonly version: 1;
  readonly dailyPublishing: boolean;
  readonly issuedTermDays: number | null;
  readonly lifetime: boolean;
  readonly validUntil: string | null;
}
export interface DailyEntitlementLicense {
  readonly deviceId: string;
  readonly isValid: boolean;
  readonly userId?: string;
  readonly licenseCode?: string;
  readonly sessionToken?: string;
  readonly expiresAt?: string;
}
export interface DailyEntitlementVerdict {
  readonly allowed: boolean;
  readonly reason: 'ANNUAL_PLAN_REQUIRED' | 'LICENSE_REQUIRED' | 'LICENSE_EXPIRED' |
    'ENTITLEMENT_CHANGED' | 'ENTITLEMENT_SERVER_UNAVAILABLE' | 'ENTITLED';
}
const denied = (): DailyPublishingEntitlement => ({ version: 1, dailyPublishing: false,
  issuedTermDays: null, lifetime: false, validUntil: null });
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const validExpiry = (value: unknown, now: number): value is string => typeof value === 'string' &&
  value.trim() !== '' && Number.isFinite(Date.parse(value)) && Date.parse(value) > now;

/** Accept only the explicit authenticated server contract. Generic tier labels never grant it. */
export function parseServerDailyEntitlement(response: unknown, now = Date.now()): DailyPublishingEntitlement {
  const result = object(response); const value = object(result.entitlements);
  if (result.valid !== true || result.ok === false || (result.blocked !== undefined && result.blocked !== false) ||
      value.version !== 1 || value.dailyPublishing !== true || typeof value.lifetime !== 'boolean') return denied();
  const lifetime = value.lifetime;
  if (Object.prototype.hasOwnProperty.call(result, 'expiresAt') &&
      !(lifetime && result.expiresAt === null) && !validExpiry(result.expiresAt, now)) return denied();
  if (lifetime ? value.issuedTermDays !== null : !Number.isSafeInteger(value.issuedTermDays) || Number(value.issuedTermDays) < 365) return denied();
  if (value.validUntil !== null || !lifetime) {
    if (!validExpiry(value.validUntil, now)) return denied();
  }
  return { version: 1, dailyPublishing: true, issuedTermDays: lifetime ? null : Number(value.issuedTermDays),
    lifetime, validUntil: value.validUntil as string | null };
}

/** The identity remains private in main; it is never logged or returned over the bridge. */
export function dailyLicenseIdentity(license: DailyEntitlementLicense): string {
  return JSON.stringify([license.deviceId, license.userId, license.licenseCode, license.sessionToken]);
}

/** Persisted local flags are not trusted; only this process's verified server receipts grant access. */
export function createDailyEntitlementGate(
  load: () => DailyEntitlementLicense | null | Promise<DailyEntitlementLicense | null>,
  now: () => number = Date.now,
) {
  let sequence = 0;
  let receipt: { identity: string; at: number; entitlement: DailyPublishingEntitlement } | undefined;
  let pending: { identity: string; ticket: number; promise: Promise<DailyEntitlementVerdict> } | undefined;
  const verdict = (value: DailyPublishingEntitlement): DailyEntitlementVerdict => ({
    allowed: value.dailyPublishing, reason: value.dailyPublishing ? 'ENTITLED' : 'ANNUAL_PLAN_REQUIRED',
  });
  const local = (license: DailyEntitlementLicense | null): DailyEntitlementVerdict | undefined => {
    if (!license?.isValid) return { allowed: false, reason: 'LICENSE_REQUIRED' };
    if (license.expiresAt !== undefined && !validExpiry(license.expiresAt, now())) return { allowed: false, reason: 'LICENSE_EXPIRED' };
    return undefined;
  };
  return {
    invalidate() { sequence++; receipt = undefined; pending = undefined; },
    observe(license: DailyEntitlementLicense, response: unknown): DailyPublishingEntitlement {
      sequence++;
      pending = undefined;
      const entitlement = parseServerDailyEntitlement(response, now());
      receipt = { identity: dailyLicenseIdentity(license), at: now(), entitlement };
      return entitlement;
    },
    async check(request: (license: DailyEntitlementLicense) => Promise<unknown>, forceFresh = false): Promise<DailyEntitlementVerdict> {
      const license = await load(); const failure = local(license);
      if (failure || !license) return failure!;
      const identity = dailyLicenseIdentity(license);
      if (!forceFresh && receipt?.identity === identity && now() - receipt.at >= 0 && now() - receipt.at < 60_000) {
        const entitlement = receipt.entitlement;
        return verdict(entitlement.validUntil !== null && !validExpiry(entitlement.validUntil, now()) ? denied() : entitlement);
      }
      if (pending?.identity === identity && pending.ticket === sequence) return pending.promise;
      const ticket = ++sequence;
      const promise = (async (): Promise<DailyEntitlementVerdict> => { try {
        const response = await request(license);
        const current = await load();
        if (ticket !== sequence || !current || dailyLicenseIdentity(current) !== identity) return { allowed: false, reason: 'ENTITLEMENT_CHANGED' };
        const currentFailure = local(current);
        if (currentFailure) return currentFailure;
        const entitlement = parseServerDailyEntitlement(response, now());
        receipt = { identity, at: now(), entitlement };
        return verdict(entitlement);
      } catch {
        if (ticket === sequence) receipt = undefined;
        return { allowed: false, reason: 'ENTITLEMENT_SERVER_UNAVAILABLE' };
      } })();
      pending = { identity, ticket, promise };
      try { return await promise; }
      finally { if (pending?.promise === promise) pending = undefined; }
    },
  };
}
