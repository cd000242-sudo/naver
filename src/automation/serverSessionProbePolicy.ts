import { isLoginChallengeUrl, isLoginProtectionUrl, isNaverSessionLoginUrl, parseNaverSessionUrl } from './loginPageNavigationPolicy.js';

export const SERVER_SESSION_PROBE_URL = 'https://blog.naver.com/GoBlogWrite.naver';
export type ServerSessionProbeStatus = 'ready' | 'login-required' | 'challenge' | 'protected' | 'unavailable' | 'unknown';
export interface ServerSessionProbeResult {
  finalUrl?: string;
  status?: number;
  error?: string;
  hasEditor?: boolean;
  hasLoginForm?: boolean;
  hasChallenge?: boolean;
  hasProtection?: boolean;
  /** Bounded visible text, used only when no editor is present. Never returned in diagnostics. */
  bodyText?: string;
}
export interface ServerSessionProbeVerdict {
  status: ServerSessionProbeStatus;
  /** Compatibility only: false does NOT mean that submitting credentials is appropriate. */
  ok: boolean;
  reason: string;
  /** True only when an editor frame confirmed a DIFFERENT blog id than the one expected for the account (configured or learned). */
  identityMismatch?: true;
  /** With `identityMismatch`: the blog the window holds, and the blog this account is expected to have (absent when none is known). */
  observedBlogId?: string;
  expectedBlogId?: string;
  /** On a ready verdict: the blog the editor confirmed for this account. */
  blogId?: string;
}
export type CommitTimeBlockCode = 'LOGIN_REQUIRED' | 'LOGIN_CHALLENGE' | 'ACCOUNT_PROTECTED' | 'ACCOUNT_MISMATCH';
/**
 * Right before the irreversible publish click only POSITIVE evidence of a problem may stop the run. Missing or
 * unclear evidence (frame detached/changed, page changed, probe timeout, identity not readable) says nothing
 * about the account, and the session was already verified when the run started.
 */
export function resolveCommitTimeBlock(verdict: ServerSessionProbeVerdict): CommitTimeBlockCode | undefined {
  if (verdict.status === 'protected') return 'ACCOUNT_PROTECTED';
  if (verdict.status === 'challenge') return 'LOGIN_CHALLENGE';
  if (verdict.status === 'login-required') return 'LOGIN_REQUIRED';
  return verdict.identityMismatch === true ? 'ACCOUNT_MISMATCH' : undefined;
}
export function isServerSessionLoginRedirect(finalUrl: string | undefined): boolean {
  return isNaverSessionLoginUrl(finalUrl) && !isLoginChallengeUrl(String(finalUrl || ''));
}
const verdict = (status: ServerSessionProbeStatus, reason: string): ServerSessionProbeVerdict => ({ status, ok: status === 'ready', reason });

/** Fail closed on ambiguous responses; transport failures never imply logged-out credentials. */
export function resolveServerSessionProbeVerdict(result: ServerSessionProbeResult | null | undefined): ServerSessionProbeVerdict {
  if (!result) return verdict('unknown', 'no-result');
  const url = parseNaverSessionUrl(result.finalUrl);
  if (!url) return result.error ? verdict('unavailable', 'network-error') : verdict('unknown', 'untrusted-url');
  // Positive blocking evidence takes priority over stale editor evidence or an HTTP 200.
  const text = result.hasEditor ? '' : String(result.bodyText || '').slice(0, 12000).replace(/\s+/g, ' ');
  if (isLoginProtectionUrl(result.finalUrl) || result.hasProtection === true
    || /보호\s*조치(?:가\s*)?(?:되었|됐|되었습니다|중|된|되었습니다)|이용이\s*제한되었습니다/.test(text)) {
    return verdict('protected', 'account-protected');
  }
  if (isLoginChallengeUrl(result.finalUrl || '') || result.hasChallenge === true
    || /(?:본인\s*(?:인증|확인)|보안\s*(?:인증|확인))(?:을|이)?\s*(?:완료|진행|해\s*주|필요)|자동\s*입력\s*방지\s*(?:문자|확인)/.test(text)) {
    return verdict('challenge', 'verification-required');
  }
  if (result.error) return verdict('unavailable', 'network-error');
  const httpStatus = Number.isInteger(result.status) ? result.status! : 0;
  if (httpStatus === 429 || httpStatus >= 500 && httpStatus <= 599) return verdict('unavailable', 'http-' + httpStatus);
  if (isServerSessionLoginRedirect(result.finalUrl) || result.hasLoginForm === true) return verdict('login-required', 'login-redirect-or-form');
  if (httpStatus < 200 || httpStatus >= 300) return verdict('unknown', 'http-' + (httpStatus || 'unknown'));
  if (['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname) && result.hasEditor === true) return verdict('ready', 'editor-http-' + httpStatus);
  return verdict('unknown', 'missing-editor-evidence');
}
