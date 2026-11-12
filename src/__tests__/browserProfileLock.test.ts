import { afterEach, describe, expect, it } from 'vitest';
import {
  isBrowserProfileInUseError,
  isBrowserProfileLockHeld,
  isBrowserProfileOwnedByRunningBrowser,
  isProfileBusyAfterLaunchFailure,
  summarizeBrowserLaunchError,
  type ProfileLockIo,
} from '../image/browserProfileLock.js';

const err = (code: string): Error => Object.assign(new Error(code), { code });

/** Playwright's launch failure when a second Chrome hands off to the first one and exits. */
const HANDOFF_EXIT0 = [
  'browserType.launchPersistentContext: Target page, context or browser has been closed',
  'Browser logs:',
  '',
  '<launched> pid=21488',
  '[pid=21488][err] some output',
  '<process did exit: exitCode=0, signal=null>',
  '<process did exit: exitCode=0, signal=null>',
].join('\n');

/** Real capture from the Orbit side: no lock wording at all, exit code 21. */
const NO_WORDING_EXIT21 = [
  'browserType.launchPersistentContext: Target page, context or browser has been closed',
  'Browser logs:',
  '',
  '<launched> pid=999',
  '<process did exit: exitCode=21, signal=null>',
].join('\n');

function io(overrides: Partial<ProfileLockIo> = {}): ProfileLockIo {
  return {
    exists: () => false,
    probeOpen: () => undefined,
    readlink: () => { throw err('ENOENT'); },
    signal0: () => undefined,
    ...overrides,
  };
}

describe('profile-in-use error wording', () => {
  it('recognizes the English Chromium lock messages', () => {
    expect(isBrowserProfileInUseError(new Error('Failed to create a ProcessSingleton for your profile directory'))).toBe(true);
    expect(isBrowserProfileInUseError(new Error('user data directory is already in use'))).toBe(true);
    expect(isBrowserProfileInUseError(new Error('Opening in existing browser session.'))).toBe(true);
  });

  it('recognizes the Korean Chrome hand-off line', () => {
    expect(isBrowserProfileInUseError(new Error('기존 브라우저 세션에서 여는 중입니다.'))).toBe(true);
    expect(isBrowserProfileInUseError(new Error('[err] 기존  브라우저  세션에서 여는 중'))).toBe(true);
  });

  it('recognizes a launch that handed off and exited at once with code 0', () => {
    expect(isBrowserProfileInUseError(new Error(HANDOFF_EXIT0))).toBe(true);
  });

  it('does not match unrelated failures', () => {
    expect(isBrowserProfileInUseError(new Error('Failed to load user profile image'))).toBe(false);
    expect(isBrowserProfileInUseError(new Error('network down'))).toBe(false);
    expect(isBrowserProfileInUseError(new Error('browserType.launchPersistentContext: Target page, context or browser has been closed'))).toBe(false);
    expect(isBrowserProfileInUseError(new Error(NO_WORDING_EXIT21))).toBe(false);
    expect(isBrowserProfileInUseError(undefined)).toBe(false);
  });
});

describe('profile lock held on disk', () => {
  it('Windows: a missing or openable lockfile is free, a busy one is held', () => {
    expect(isBrowserProfileLockHeld('p', 'win32', io())).toBe(false);
    expect(isBrowserProfileLockHeld('p', 'win32', io({ exists: () => true }))).toBe(false);
    for (const code of ['EBUSY', 'EPERM', 'EACCES']) {
      expect(isBrowserProfileLockHeld('p', 'win32', io({ exists: () => true, probeOpen: () => { throw err(code); } })), code).toBe(true);
    }
    expect(isBrowserProfileLockHeld('p', 'win32', io({ exists: () => true, probeOpen: () => { throw err('ENOENT'); } }))).toBe(false);
  });

  it('POSIX: the lock counts only while its process is alive', () => {
    const live = io({ readlink: () => 'host-4242' });
    expect(isBrowserProfileLockHeld('p', 'linux', live)).toBe(true);
    expect(isBrowserProfileLockHeld('p', 'linux', io({ readlink: () => 'host-4242', signal0: () => { throw err('ESRCH'); } }))).toBe(false);
    expect(isBrowserProfileLockHeld('p', 'linux', io({ readlink: () => 'host-4242', signal0: () => { throw err('EPERM'); } }))).toBe(true);
    expect(isBrowserProfileLockHeld('p', 'linux', io())).toBe(false);
    expect(isBrowserProfileLockHeld('p', 'linux', io({ readlink: () => 'garbage' }))).toBe(false);
  });

  it('waits a short grace window for a browser that was just closed', async () => {
    let probes = 0;
    const releasing = io({
      exists: () => true,
      probeOpen: () => { probes += 1; if (probes < 3) throw err('EBUSY'); },
    });
    await expect(isBrowserProfileOwnedByRunningBrowser('p', 3, 0, releasing, 'win32')).resolves.toBe(false);
    expect(probes).toBe(3);

    let stuck = 0;
    const held = io({ exists: () => true, probeOpen: () => { stuck += 1; throw err('EBUSY'); } });
    await expect(isBrowserProfileOwnedByRunningBrowser('p', 3, 0, held, 'win32')).resolves.toBe(true);
    expect(stuck).toBe(3);
  });

  it('treats a launch failure as profile-in-use by wording or by the lock on disk', () => {
    const busy = io({ exists: () => true, probeOpen: () => { throw err('EBUSY'); } });
    expect(isProfileBusyAfterLaunchFailure(new Error(HANDOFF_EXIT0), 'p', io(), 'win32')).toBe(true);
    expect(isProfileBusyAfterLaunchFailure(new Error(NO_WORDING_EXIT21), 'p', busy, 'win32')).toBe(true);
    expect(isProfileBusyAfterLaunchFailure(new Error(NO_WORDING_EXIT21), 'p', io(), 'win32')).toBe(false);
    expect(isProfileBusyAfterLaunchFailure(new Error('spawn ENOENT'), 'p', io(), 'win32')).toBe(false);
  });
});

describe('launch failure summary for the screen', () => {
  afterEach(() => undefined);

  it('keeps one short line and drops the browser log and local paths', () => {
    const long = [
      'browserType.launchPersistentContext: Failed to launch C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe --user-data-dir=C:\\Users\\a\\x',
      'Browser logs:',
      ...Array.from({ length: 40 }, (_, i) => `<launched> arg ${i}`),
    ].join('\n');
    const line = summarizeBrowserLaunchError(new Error(long));
    expect(line).not.toContain('\n');
    expect(line.length).toBeLessThanOrEqual(100);
    expect(line).not.toMatch(/Program Files|C:\\Users/);
    expect(line).not.toContain('Browser logs');
  });

  it('handles empty and non-error input', () => {
    expect(summarizeBrowserLaunchError(undefined)).toBe('unknown');
    expect(summarizeBrowserLaunchError('plain text')).toBe('plain text');
  });
});
