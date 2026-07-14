import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildIsolatedPackagedAppEnv,
  findPackagedExecutable,
  removeIsolatedSmokeRoot,
} from '../../scripts/lib/packaged-smoke-lib.mjs';

describe('packaged app smoke helpers', () => {
  it('finds the product executable without accepting installer helpers', () => {
    expect(findPackagedExecutable([
      'elevate.exe',
      'Uninstall Better Life Naver.exe',
      'Better Life Naver.exe',
    ])).toBe('Better Life Naver.exe');
  });

  it('isolates every writable profile root and enables read-only self-test mode', () => {
    const root = path.join('C:', 'temp', 'packaged-smoke');
    const env = buildIsolatedPackagedAppEnv({
      APPDATA: 'real-appdata',
      LOCALAPPDATA: 'real-localappdata',
      USERPROFILE: 'real-profile',
      ELECTRON_RUN_AS_NODE: '1',
    }, root);

    expect(env.APPDATA).toBe(path.join(root, 'appdata'));
    expect(env.LOCALAPPDATA).toBe(path.join(root, 'localappdata'));
    expect(env.USERPROFILE).toBe(path.join(root, 'profile'));
    expect(env.HOME).toBe(path.join(root, 'profile'));
    expect(env.E2E_USER_DATA_DIR).toBe(path.join(root, 'userdata'));
    expect(env.SELF_TEST).toBe('1');
    expect(env.E2E_TEST).toBe('1');
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it('retries transient Windows profile locks before declaring cleanup failure', () => {
    let attempts = 0;
    const delays: number[] = [];

    removeIsolatedSmokeRoot('C:\\temp\\packaged-smoke', {
      rmSync: () => {
        attempts += 1;
        if (attempts < 3) {
          throw Object.assign(new Error('locked'), { code: 'EBUSY' });
        }
      },
      sleep: (delayMs: number) => delays.push(delayMs),
      maxAttempts: 4,
      baseDelayMs: 10,
    });

    expect(attempts).toBe(3);
    expect(delays).toEqual([10, 20]);
  });

  it('does not retry non-transient cleanup failures', () => {
    let attempts = 0;

    expect(() => removeIsolatedSmokeRoot('C:\\temp\\packaged-smoke', {
      rmSync: () => {
        attempts += 1;
        throw Object.assign(new Error('access denied'), { code: 'EACCES' });
      },
      sleep: () => undefined,
    })).toThrow('access denied');

    expect(attempts).toBe(1);
  });
});
