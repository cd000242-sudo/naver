import { describe, expect, it } from 'vitest';
import {
  FLOW_WORKSPACE_ENTRY_LABEL_RE,
  hasGoogleSessionCookies,
} from '../image/flowWorkspaceEntryPolicy';

describe('Flow workspace landing entry policy', () => {
  it.each([
    'Create with Google Flow',
    'Try in Google Flow',
    'Google Flow로 만들기',
    'Flow 시작하기',
  ])('recognizes the workspace CTA: %s', (label) => {
    expect(FLOW_WORKSPACE_ENTRY_LABEL_RE.test(label)).toBe(true);
  });

  it('requires an existing Google session before silent workspace entry', () => {
    expect(hasGoogleSessionCookies(['NID_AUT', '__Secure-1PSID'])).toBe(true);
    expect(hasGoogleSessionCookies(['NID_AUT', 'PREF'])).toBe(false);
  });
});
