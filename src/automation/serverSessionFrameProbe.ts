import type { Page } from 'puppeteer';
import { isTrustedNaverEditorFrameUrl } from './initialEditorReadiness.js';
import { parseNaverSessionUrl } from './loginPageNavigationPolicy.js';
import { resolveServerSessionProbeVerdict, type ServerSessionProbeResult } from './serverSessionProbePolicy.js';

export interface ServerSessionFrameEvidence extends ServerSessionProbeResult { accountIdentity?: string; }

// A string avoids bundler-generated function wrappers inside the browser context.
export const SESSION_FRAME_EVIDENCE_SCRIPT = `(() => {
  const hasEditor = !!document.querySelector('.se-main-container') && !!document.querySelector('.se-documentTitle, .se-section-documentTitle, [data-name="documentTitle"], .se-text-paragraph[contenteditable], .se-component-content[contenteditable]');
  const bodyText = hasEditor ? '' : (document.body?.textContent || '').slice(0, 12000);
  return {
    finalUrl: location.href, status: 200, hasEditor, bodyText,
    hasLoginForm: !!document.querySelector('input[type="password"]') && !!document.querySelector('input[name="id"], input#id'),
    hasChallenge: !!document.querySelector('input[name="captcha"], input#captcha') || /자동입력 방지|보안문자를 입력|본인 확인이 필요/.test(bodyText),
    hasProtection: /보호조치가 적용|보호조치 해제|이용이 제한/.test(bodyText)
  };
})()`;

function identityFromEditorUrl(value: string): string | undefined {
  const url = parseNaverSessionUrl(value);
  if (!url || !['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname)) return undefined;
  const identity = url.searchParams.get('blogId') || (url.searchParams.get('Redirect') === 'Write' ? /^\/([A-Za-z0-9_-]+)$/.exec(url.pathname)?.[1] : undefined);
  return identity && /^[A-Za-z0-9_-]{1,100}$/.test(identity) ? identity : undefined;
}

/** Inspect every trusted frame, including nested/cross-origin frames, without navigating or fetching. */
export async function inspectCurrentSessionFrames(page: Pick<Page, 'frames' | 'url'>): Promise<ServerSessionFrameEvidence | null> {
  const topUrl = page.url();
  if (!parseNaverSessionUrl(topUrl)) return { error: 'untrusted-page' };
  const frames = page.frames().filter(frame => isTrustedNaverEditorFrameUrl(frame.url()));
  const results = await Promise.all(frames.map(async (frame): Promise<ServerSessionFrameEvidence> => {
    const url = frame.url();
    try {
      const result = await frame.evaluate(SESSION_FRAME_EVIDENCE_SCRIPT) as ServerSessionFrameEvidence;
      if (frame.url() !== url || result.finalUrl !== url || !page.frames().includes(frame)) return { error: 'frame-changed' };
      return { ...result, accountIdentity: result.hasEditor ? identityFromEditorUrl(url) : undefined };
    } catch { return { error: 'frame-unavailable' }; }
  }));
  if (page.url() !== topUrl) return { error: 'page-changed' };
  // A stale editor must never hide a login/protection surface in a later frame.
  for (const status of ['protected', 'challenge', 'login-required']) {
    const blocked = results.find(result => resolveServerSessionProbeVerdict(result).status === status);
    if (blocked) return blocked;
  }
  const unavailable = results.find(result => result.error);
  if (unavailable) return unavailable;
  const editors = results.filter(result => resolveServerSessionProbeVerdict(result).ok);
  if (!editors.length) return null;
  const identity = editors[0].accountIdentity;
  return { ...editors[0], accountIdentity: identity && editors.every(result => result.accountIdentity?.toLowerCase() === identity.toLowerCase()) ? identity : undefined };
}
