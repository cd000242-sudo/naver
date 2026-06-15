import { describe, expect, it } from 'vitest';
import {
  buildNaverAutomationProfile,
  hashAutomationAccountId,
} from '../automation/accountProfilePolicy';

describe('accountProfilePolicy', () => {
  it('keeps account profile hashes stable for existing browser profiles', () => {
    expect(hashAutomationAccountId('')).toBe('0');
    expect(hashAutomationAccountId('cd00242')).toBe('9jp08f');
    expect(hashAutomationAccountId('rimi_77-')).toBe('kwkwrj');
    expect(hashAutomationAccountId('user_a')).toBe('dtr11v');
    expect(hashAutomationAccountId('user_b')).toBe('dtr11u');
  });

  it('keeps the Naver automation fingerprint deterministic per account', () => {
    expect(buildNaverAutomationProfile('cd00242')).toEqual({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7592.79 Safari/537.36',
      screen: { width: 1440, height: 900 },
    });

    expect(buildNaverAutomationProfile('rimi_77-')).toEqual({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7530.41 Safari/537.36',
      screen: { width: 1600, height: 900 },
    });
  });

  it('allows an explicit Chrome version hint without changing the account screen bucket', () => {
    expect(buildNaverAutomationProfile('cd00242', '150.0.7777.1')).toEqual({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7777.1 Safari/537.36',
      screen: { width: 1440, height: 900 },
    });
  });
});
