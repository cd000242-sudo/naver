/**
 * SPEC-IMAGE-RECOVERY-001 R4: Google Flow UI multi-selector fallbacks.
 *
 * Flow is in beta — UI changes are frequent. Each entry exposes a primary
 * selector and an ordered list of fallbacks, allowing flowGenerator.ts to
 * iterate from most-specific to most-permissive.
 *
 * The renderer-side remoteUpdate mechanism (src/automation/selectors/remoteUpdate.ts)
 * may overwrite the primary at runtime if Google ships a UI change.
 */

import type { SelectorEntry, SelectorMap } from './types';

export type FlowSelectorKey =
  | 'newProjectButton'
  | 'promptInput'
  | 'submitButton'
  | 'cookieBannerClose'
  | 'profileMenu'
  | 'logoutLink';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary, fallbacks, description,
});

export const FLOW_SELECTORS: SelectorMap<FlowSelectorKey> = {
  newProjectButton: entry(
    'button:has-text("새 프로젝트")',
    [
      'button:has-text("New project")',
      'button:has-text("新しいプロジェクト")',
      'button[aria-label*="project" i][aria-label*="new" i]',
      'button:has-text("add_2")',
      'a[href*="/new"]',
    ],
    'Flow 새 프로젝트 버튼',
  ),
  promptInput: entry(
    '[role="textbox"][contenteditable="true"]',
    [
      'div[contenteditable="true"]',
      'textarea[aria-label*="prompt" i]',
      'textarea[placeholder*="prompt" i]',
      'input[type="text"][aria-label*="prompt" i]',
    ],
    'Flow 프롬프트 입력창',
  ),
  submitButton: entry(
    'button:has-text("arrow_forward")',
    [
      'button[aria-label*="submit" i]',
      'button[aria-label*="generate" i]',
      'button[type="submit"]',
      'button:has(svg[aria-label*="forward" i])',
    ],
    'Flow 전송 버튼',
  ),
  cookieBannerClose: entry(
    'button:has-text("모두 수락")',
    [
      'button:has-text("Accept all")',
      'button:has-text("Reject all")',
      'button[aria-label*="cookie" i]',
      'button[data-testid*="cookie" i]',
    ],
    'Flow 쿠키 동의 배너 닫기',
  ),
  profileMenu: entry(
    'button[aria-label*="account" i]',
    [
      'button[aria-label*="Google 계정" i]',
      'a[href*="accounts.google.com"]',
      'img[alt*="profile" i]',
    ],
    'Flow 프로필 메뉴',
  ),
  logoutLink: entry(
    'a:has-text("로그아웃")',
    [
      'a:has-text("Sign out")',
      'a[href*="Logout"]',
      'button:has-text("로그아웃")',
      'button:has-text("Sign out")',
    ],
    'Flow 로그아웃 링크',
  ),
};

/**
 * Iterate through primary + fallbacks in priority order.
 * The first parameter `excludeIds` lets the recovery coordinator skip selectors
 * that have already been tried in the current heading.
 */
export function* iterateFlowSelectors(
  key: FlowSelectorKey,
  excludeIds: ReadonlySet<string> = new Set(),
): Generator<{ id: string; selector: string }> {
  const e = FLOW_SELECTORS[key];
  const all = [e.primary, ...e.fallbacks];
  for (let i = 0; i < all.length; i++) {
    const id = `${key}#${i}`;
    if (excludeIds.has(id)) continue;
    yield { id, selector: all[i] };
  }
}
