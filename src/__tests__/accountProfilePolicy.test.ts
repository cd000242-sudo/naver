import { describe, expect, it } from 'vitest';
import { hashAutomationAccountId } from '../automation/accountProfilePolicy';

describe('accountProfilePolicy', () => {
  it('keeps account profile hashes stable for existing browser profiles', () => {
    expect(hashAutomationAccountId('')).toBe('0');
    expect(hashAutomationAccountId('cd00242')).toBe('9jp08f');
    expect(hashAutomationAccountId('rimi_77-')).toBe('kwkwrj');
    expect(hashAutomationAccountId('user_a')).toBe('dtr11v');
    expect(hashAutomationAccountId('user_b')).toBe('dtr11u');
  });
});
