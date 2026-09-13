import { describe, expect, it } from 'vitest';
import {
  FLOW_WORKSPACE_ENTRY_LABEL_RE,
  hasGoogleSessionCookies,
  isFlowWorkspaceUrl,
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

describe('Flow workspace URL policy', () => {
  it.each([
    'https://flow.google.com/',
    'https://flow.google.com/project/test?view=images#latest',
    'https://labs.google/fx',
    'https://labs.google/fx/',
    'https://labs.google/fx/tools/flow/project/test',
  ])('accepts an official secure workspace URL: %s', (url) => {
    expect(isFlowWorkspaceUrl(url)).toBe(true);
  });

  it.each([
    'https://flow.google.com.attacker.test/',
    'https://attacker-flow.google.com/',
    'https://labs.google.attacker.test/fx/tools/flow',
    'https://labs.google/fx-fake',
    'https://labs.google/',
    'https://accounts.google.com/',
    'http://flow.google.com/',
    'http://labs.google/fx/tools/flow',
    'https://user:password@flow.google.com/',
    'https://user@labs.google/fx/tools/flow',
    'https://flow.google.com:444/',
    'not a URL',
    '',
  ])('rejects unrelated or unsafe URLs: %s', (url) => {
    expect(isFlowWorkspaceUrl(url)).toBe(false);
  });
});
