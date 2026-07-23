/**
 * webauthnGuard.ts — keep the native Windows passkey dialog out of automated login.
 *
 * Naver's login page calls WebAuthn. On Windows, Chrome hands that to the native Windows
 * WebAuthn API, which opens a "Windows 보안" modal hosted by CredentialUIBroker.exe. That
 * modal lives outside the page, so Puppeteer can neither see nor dismiss it, and the
 * WebAuthn `timeout` does NOT close it — measured live: the call was still pending after
 * 180s and the dialog survived the requesting browser being killed. Automated login stops
 * dead there.
 *
 * Enabling the CDP WebAuthn domain virtualises authenticator discovery for the target, so
 * Chrome never consults the OS. Measured on nid.naver.com:
 *   without: navigator.credentials.get() -> "Windows 보안" dialog, waits for a human forever
 *   with:    no dialog at all; the call finds no authenticator and rejects with
 *            NotAllowedError once its own timeout elapses (8s call -> 8002ms)
 *            isConditionalMediationAvailable() true -> false
 *
 * The remaining wait is bounded by the caller's own timeout instead of a human, which is
 * the whole difference. No virtual authenticator is registered on purpose: an authenticator
 * that could answer would let a create() call register a bogus passkey on the real account.
 *
 * Conditional mediation matters most: it fires on ID-field focus with no click at all,
 * which is why the prompt reappeared on every login attempt.
 *
 * The page keeps working — WebAuthn simply finds no authenticator, so Naver falls back to
 * password login. No page JavaScript is patched, so this adds no detectable footprint of
 * the kind an overridden navigator.credentials would.
 */
import type { Page } from 'puppeteer';

/** The CDP session must stay attached: detaching disables the domain again. */
const guardedPages = new WeakSet<object>();

/**
 * Virtualise WebAuthn for this page so the OS passkey dialog can never open.
 * Idempotent per page, and never throws — login must proceed even if CDP is unavailable.
 */
export async function disablePlatformWebAuthn(page: Page | null | undefined): Promise<boolean> {
  if (!page || typeof (page as { createCDPSession?: unknown }).createCDPSession !== 'function') {
    return false;
  }
  if (guardedPages.has(page)) return true;

  try {
    const client = await page.createCDPSession();
    // enableUI:false keeps Chrome's own virtual-authenticator UI out of the way as well.
    await client.send('WebAuthn.enable', { enableUI: false });
    // Deliberately NOT detached — the domain stays enabled only while the session lives.
    guardedPages.add(page);
    console.log('[WebAuthnGuard] 🔐 패스키(WebAuthn) 프롬프트 차단 적용');
    return true;
  } catch (err) {
    // Older Chrome builds without the WebAuthn domain, or a target that died mid-attach.
    console.warn(`[WebAuthnGuard] ⚠️ 패스키 차단 적용 실패 (로그인은 계속): ${(err as Error)?.message}`);
    return false;
  }
}
