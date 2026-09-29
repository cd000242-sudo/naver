/**
 * Verdict policy for the pre-publish server-session probe.
 *
 * Background (2026-09-29 diagnostics, accounts mic*, pnc*): the probe
 * fetched PostWriteForm.naver and treated "final URL is not the login page"
 * as a valid session. Naver answers that URL with HTTP 404 (no redirect) when
 * the session is dead, so the gate passed with expired cookies, the editor
 * navigation bounced to nidlogin, and a three-attempt re-login loop followed.
 *
 * A valid session now requires BOTH: no login redirect AND a 2xx response.
 * Anything ambiguous resolves to "invalid" — a wasted re-login is recoverable,
 * a skipped login on a dead session is not.
 */

export interface ServerSessionProbeResult {
  finalUrl?: string;
  status?: number;
  error?: string;
}

export interface ServerSessionProbeVerdict {
  ok: boolean;
  reason: string;
}

const LOGIN_REDIRECT_PATTERN = /nidlogin\.login|nid\.naver\.com\/nidlogin/;

export function isServerSessionLoginRedirect(finalUrl: string | undefined): boolean {
  return LOGIN_REDIRECT_PATTERN.test(String(finalUrl || ''));
}

export function resolveServerSessionProbeVerdict(
  result: ServerSessionProbeResult | null | undefined,
): ServerSessionProbeVerdict {
  if (!result) {
    return { ok: false, reason: 'no-result' };
  }
  if (result.error) {
    return { ok: false, reason: result.error };
  }
  if (isServerSessionLoginRedirect(result.finalUrl)) {
    return { ok: false, reason: `login-redirect ${result.finalUrl}` };
  }
  const status = typeof result.status === 'number' ? result.status : NaN;
  if (!(status >= 200 && status < 300)) {
    return { ok: false, reason: `http-${Number.isNaN(status) ? 'unknown' : status} ${result.finalUrl || ''}`.trim() };
  }
  return { ok: true, reason: `http-${status} ${result.finalUrl || ''}`.trim() };
}
