import { describe, expect, it, vi } from 'vitest';
import { resolveScheduledAccountCredentials } from '../scheduler/scheduledAccountResolver';

const accounts = [
  { id: 'account-a', naverId: 'naver-a', blogId: 'blog-a' },
  { id: 'account-b', naverId: 'naver-b', blogId: 'blog-b' },
];

describe('scheduled account resolver', () => {
  it('uses the account bound at queue time even when the current setting changed', () => {
    const getCredentials = vi.fn((accountId: string) => accountId === 'account-b'
      ? { naverId: 'naver-b', naverPassword: 'password-b' }
      : null);

    const result = resolveScheduledAccountCredentials({
      scheduledAccountId: 'account-b',
      scheduledNaverId: 'naver-b',
      configuredNaverId: 'naver-a',
      configuredNaverPassword: 'password-a',
      accounts,
      getCredentials,
    });

    expect(result).toEqual({
      accountId: 'account-b',
      naverId: 'naver-b',
      naverPassword: 'password-b',
      source: 'account-manager',
    });
  });

  it('fails closed instead of publishing to a different current account', () => {
    expect(() => resolveScheduledAccountCredentials({
      scheduledAccountId: 'missing-account',
      scheduledNaverId: 'naver-b',
      configuredNaverId: 'naver-a',
      configuredNaverPassword: 'password-a',
      accounts,
      getCredentials: () => null,
    })).toThrow(/SCHEDULED_ACCOUNT_UNAVAILABLE/);
  });

  it('keeps legacy schedules compatible when no account binding exists', () => {
    expect(resolveScheduledAccountCredentials({
      configuredNaverId: 'naver-a',
      configuredNaverPassword: 'password-a',
      accounts,
      getCredentials: () => null,
    })).toMatchObject({
      naverId: 'naver-a',
      naverPassword: 'password-a',
      source: 'legacy-config',
    });
  });
});
