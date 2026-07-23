/**
 * Chrome launch flags — duplicate-switch regression.
 *
 * Chrome keeps only the LAST occurrence of a repeated switch. browserSessionManager carried
 * two --disable-features entries in one args array, so the first one (PasswordManager 등)
 * was silently discarded and the 2026-02-08 "비밀번호 저장 팝업 비활성화" fix never applied.
 * A duplicate is invisible in review and produces no error at runtime — only a test catches it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SOURCE = readFileSync(
  join(__dirname, '..', 'browserSessionManager.ts'),
  'utf8',
);

/** Switch names that Chrome collapses to a single (last) value. */
const COLLAPSING_SWITCHES = [
  '--disable-features',
  '--enable-features',
  '--disable-blink-features',
];

function occurrencesOf(flag: string): string[] {
  // Only count real argument strings, not the flag names quoted inside comments.
  return [...SOURCE.matchAll(/^\s*'(--[a-z-]+)=([^']*)',/gim)]
    .filter((match) => match[1] === flag)
    .map((match) => match[2]);
}

describe('browserSessionManager launch flags', () => {
  for (const flag of COLLAPSING_SWITCHES) {
    it(`declares ${flag} at most once so Chrome cannot discard the earlier value`, () => {
      expect(occurrencesOf(flag).length).toBeLessThanOrEqual(1);
    });
  }

  it('keeps the password-manager suppression that the duplicate had been eating', () => {
    const [features] = occurrencesOf('--disable-features');
    expect(features).toBeDefined();
    expect(features.split(',')).toContain('PasswordManager');
  });

  it('still disables the WebRTC mDNS local-IP feature', () => {
    const [features] = occurrencesOf('--disable-features');
    expect(features.split(',')).toContain('WebRtcHideLocalIpsWithMdns');
  });

  it('does not silently re-enable site-isolation disabling (2026-03-27 결정)', () => {
    const [features] = occurrencesOf('--disable-features');
    expect(features.split(',')).not.toContain('site-per-process');
    expect(features.split(',')).not.toContain('IsolateOrigins');
  });
});
