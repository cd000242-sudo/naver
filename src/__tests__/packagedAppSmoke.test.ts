import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildIsolatedPackagedAppEnv,
  findPackagedExecutable,
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
});
