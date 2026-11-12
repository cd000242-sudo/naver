import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('patchright', () => ({ chromium: { launchPersistentContext: mocks.launch } }));

import { profileLockIo } from '../image/browserProfileLock.js';
import { launchBrowser } from '../image/dropshotBrowser.js';
import { launchGensparkBrowser } from '../image/genspark/gensparkBrowser.js';
import { GENSPARK_PROFILE_IN_USE, GensparkError } from '../image/genspark/gensparkErrors.js';

const HANDOFF_KO = [
  'browserType.launchPersistentContext: Target page, context or browser has been closed',
  'Browser logs:',
  '',
  '<launched> pid=21488',
  '[pid=21488][err] 기존 브라우저 세션에서 여는 중입니다.',
  '<process did exit: exitCode=0, signal=null>',
].join('\n');

const NO_WORDING_EXIT21 = [
  'browserType.launchPersistentContext: Target page, context or browser has been closed',
  'Browser logs:',
  '',
  '<launched> pid=999',
  '<process did exit: exitCode=21, signal=null>',
].join('\n');

const NOISY_UNRELATED = [
  'browserType.launchPersistentContext: spawn EACCES',
  'Browser logs:',
  ...Array.from({ length: 40 }, (_, i) => `<launched> argument number ${i} C:\\Users\\someone\\AppData\\x`),
].join('\n');

const original = { ...profileLockIo };
const busy = (): never => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); };
const missing = (): never => { throw Object.assign(new Error('none'), { code: 'ENOENT' }); };

/** The profile is owned by a running browser from the start. */
function lockHeldFromStart(): void {
  Object.assign(profileLockIo, {
    exists: () => true, probeOpen: busy, readlink: () => `host-${process.pid}`, signal0: () => undefined,
  });
}
/** The profile looks free until the first launch attempt has happened. */
function lockHeldAfterFirstLaunch(): void {
  const launched = (): boolean => mocks.launch.mock.calls.length > 0;
  Object.assign(profileLockIo, {
    exists: () => launched(),
    probeOpen: () => { if (launched()) busy(); },
    readlink: () => (launched() ? `host-${process.pid}` : missing()),
    signal0: () => undefined,
  });
}
function lockFree(): void {
  Object.assign(profileLockIo, {
    exists: () => false, probeOpen: () => undefined, readlink: missing, signal0: () => undefined,
  });
}

let fakeHome = '';
const savedEnv = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };

beforeAll(() => {
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bln-lockwire-'));
  process.env.USERPROFILE = fakeHome;
  process.env.HOME = fakeHome;
});
afterAll(() => {
  process.env.USERPROFILE = savedEnv.USERPROFILE;
  process.env.HOME = savedEnv.HOME;
  fs.rmSync(fakeHome, { recursive: true, force: true });
});
beforeEach(() => {
  mocks.launch.mockReset();
  lockFree();
});
afterEach(() => {
  Object.assign(profileLockIo, original);
});

async function messageOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the launch to fail');
}

describe('Dropshot launch when another browser owns the profile', () => {
  it('stops after the first try on the Korean hand-off failure and answers with one short line', async () => {
    mocks.launch.mockRejectedValue(new Error(HANDOFF_KO));
    const message = await messageOf(launchBrowser('p', true));
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(message).toMatch(/^DROPSHOT_BROWSER_LAUNCH_FAILED: /);
    expect(message).toMatch(/이미 열려/);
    expect(message).not.toContain('\n');
    expect(message.length).toBeLessThan(160);
  });

  it('does not start another browser at all when the lock is held on disk', async () => {
    lockHeldFromStart();
    const message = await messageOf(launchBrowser('p', true));
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(message).toMatch(/^DROPSHOT_BROWSER_LAUNCH_FAILED: .*이미 열려/);
  });

  it('recognizes a failure without any lock wording through the lock on disk and stops retrying', async () => {
    lockHeldAfterFirstLaunch();
    mocks.launch.mockRejectedValue(new Error(NO_WORDING_EXIT21));
    const message = await messageOf(launchBrowser('p', true));
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(message).toMatch(/이미 열려/);
  });

  it('keeps trying the other channels for an unrelated failure and keeps the screen text short', async () => {
    mocks.launch.mockRejectedValue(new Error(NOISY_UNRELATED));
    const message = await messageOf(launchBrowser('p', true));
    expect(mocks.launch).toHaveBeenCalledTimes(3);
    expect(message).toMatch(/Chrome\/Edge\/Chromium 실행 실패/);
    expect(message).not.toContain('\n');
    expect(message).not.toMatch(/someone|argument number 5/);
    expect(message.length).toBeLessThan(200);
  });
});

describe('Genspark launch when another browser owns the profile', () => {
  const expectInUse = (error: unknown): void => {
    expect(error).toBeInstanceOf(GensparkError);
    expect((error as GensparkError).code).toBe(GENSPARK_PROFILE_IN_USE);
    expect((error as GensparkError).userMessage).not.toContain('\n');
  };

  it('stops after the first try on the Korean hand-off failure', async () => {
    mocks.launch.mockRejectedValue(new Error(HANDOFF_KO));
    await launchGensparkBrowser().then(() => { throw new Error('should fail'); }, expectInUse);
    expect(mocks.launch).toHaveBeenCalledTimes(1);
  });

  it('does not start another browser at all when the lock is held on disk', async () => {
    lockHeldFromStart();
    await launchGensparkBrowser().then(() => { throw new Error('should fail'); }, expectInUse);
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('recognizes a failure without any lock wording through the lock on disk', async () => {
    lockHeldAfterFirstLaunch();
    mocks.launch.mockRejectedValue(new Error(NO_WORDING_EXIT21));
    await launchGensparkBrowser().then(() => { throw new Error('should fail'); }, expectInUse);
    expect(mocks.launch).toHaveBeenCalledTimes(1);
  });

  it('keeps trying the other channels for an unrelated failure', async () => {
    mocks.launch.mockRejectedValue(new Error(NOISY_UNRELATED));
    const message = await messageOf(launchGensparkBrowser());
    expect(mocks.launch).toHaveBeenCalledTimes(3);
    expect(message).toMatch(/Chrome\/Edge\/Chromium 실행 실패/);
    expect(message).not.toContain('\n');
  });
});
