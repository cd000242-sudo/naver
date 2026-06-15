import { afterEach, describe, expect, it } from 'vitest';
import {
  readNonNegativeIntegerEnv,
  readNonNegativeMsEnv,
  readOptionalNonNegativeMsEnv,
} from '../contentEnvNumberPolicy';

const touchedKeys = new Set<string>();

function setEnv(key: string, value: string | undefined): void {
  touchedKeys.add(key);
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

afterEach(() => {
  for (const key of touchedKeys) delete process.env[key];
  touchedKeys.clear();
});

describe('contentEnvNumberPolicy', () => {
  it('returns undefined for missing, blank, negative, or non-numeric optional values', () => {
    expect(readOptionalNonNegativeMsEnv('TEST_TIMEOUT_MISSING')).toBeUndefined();

    setEnv('TEST_TIMEOUT_BLANK', '   ');
    setEnv('TEST_TIMEOUT_NEGATIVE', '-1');
    setEnv('TEST_TIMEOUT_TEXT', 'soon');

    expect(readOptionalNonNegativeMsEnv('TEST_TIMEOUT_BLANK')).toBeUndefined();
    expect(readOptionalNonNegativeMsEnv('TEST_TIMEOUT_NEGATIVE')).toBeUndefined();
    expect(readOptionalNonNegativeMsEnv('TEST_TIMEOUT_TEXT')).toBeUndefined();
  });

  it('floors valid optional values and respects the minimum', () => {
    setEnv('TEST_TIMEOUT_VALUE', '1500.8');
    setEnv('TEST_TIMEOUT_TOO_SMALL', '999');

    expect(readOptionalNonNegativeMsEnv('TEST_TIMEOUT_VALUE')).toBe(1500);
    expect(readOptionalNonNegativeMsEnv('TEST_TIMEOUT_TOO_SMALL', 1000)).toBeUndefined();
  });

  it('falls back when the required non-negative value is not valid', () => {
    setEnv('TEST_TIMEOUT_OK', '2500');
    setEnv('TEST_TIMEOUT_INVALID', 'nope');

    expect(readNonNegativeMsEnv('TEST_TIMEOUT_OK', 500)).toBe(2500);
    expect(readNonNegativeMsEnv('TEST_TIMEOUT_INVALID', 500)).toBe(500);
    expect(readNonNegativeMsEnv('TEST_TIMEOUT_MISSING', 500)).toBe(500);
  });

  it('reads retry count style integer values while preserving legacy decimal flooring', () => {
    setEnv('TEST_ATTEMPTS_OK', '3');
    setEnv('TEST_ATTEMPTS_FLOAT', '2.5');
    setEnv('TEST_ATTEMPTS_NEGATIVE', '-1');

    expect(readNonNegativeIntegerEnv('TEST_ATTEMPTS_OK', 1)).toBe(3);
    expect(readNonNegativeIntegerEnv('TEST_ATTEMPTS_FLOAT', 1)).toBe(2);
    expect(readNonNegativeIntegerEnv('TEST_ATTEMPTS_NEGATIVE', 1)).toBe(1);
    expect(readNonNegativeIntegerEnv('TEST_ATTEMPTS_MISSING', 1)).toBe(0);
  });
});
