/**
 * Browser-profile ownership helpers shared by the Dropshot and Genspark engines (2026-11-12).
 *
 * A dedicated Chrome profile can be owned by one browser at a time. When the login window is already open, a second
 * Chrome started on the same profile hands about:blank to it and exits at once. Retrying on other channels only piles
 * up blank tabs, and Playwright's raw launch log (pid, argument list, garbled Korean) must never reach the screen.
 *
 * The launch error alone is not a reliable signal: the Korean hand-off line comes out garbled in the OS code page and the
 * real failure can be only "Target page, context or browser has been closed" + "<launched>" (exitCode=21 measured on the
 * sister app), so the lock file on disk is checked as well.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Screen text for Dropshot when another browser owns the profile. The code prefix keeps the batch-stop classification. */
export const DROPSHOT_PROFILE_IN_USE_MESSAGE =
  'DROPSHOT_BROWSER_LAUNCH_FAILED: 리더스 나노바나나 창이 이미 열려 있습니다. 그 창에서 로그인을 마치거나 창을 닫은 뒤 다시 시도해 주세요.';

/** Thin file-system seam (tests replace members of this object). */
export interface ProfileLockIo {
  exists(file: string): boolean;
  /** Opens the file for read/write and closes it again; throws EBUSY/EPERM/EACCES while a browser holds it. */
  probeOpen(file: string): void;
  readlink(file: string): string;
  /** process.kill(pid, 0) */
  signal0(pid: number): void;
}

export const profileLockIo: ProfileLockIo = {
  exists: (file) => fs.existsSync(file),
  probeOpen: (file) => { fs.closeSync(fs.openSync(file, 'r+')); },
  readlink: (file) => fs.readlinkSync(file),
  signal0: (pid) => { process.kill(pid, 0); },
};

const PROFILE_IN_USE_PATTERNS: RegExp[] = [
  /ProcessSingleton|SingletonLock|SingletonSocket|SingletonCookie/i,
  /user data directory[^\n]*(?:already\s+)?in use/i,
  /profile(?: directory)?[^\n]*(?:in use|locked)/i,
  /Opening in existing browser session/i,
  /기존\s*브라우저\s*세션/,
];
// The hand-off line is printed in the OS code page (garbled on a Korean Windows), so "launched and exited with code 0
// right away" is the wording-independent signal.
const HANDED_OFF_AND_EXITED = /<launched>[\s\S]*<process did exit:\s*exitCode=0\b/;

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  return String(error ?? '');
}

/** True when the launch error says that another browser already owns the profile. */
export function isBrowserProfileInUseError(error: unknown): boolean {
  const text = errorText(error);
  if (!text) return false;
  return PROFILE_IN_USE_PATTERNS.some((pattern) => pattern.test(text)) || HANDED_OFF_AND_EXITED.test(text);
}

/**
 * Is the profile owned by a running browser? Read from disk.
 * Windows: Chromium keeps <profile>\lockfile open while it runs (open r+ -> EBUSY) and removes it on exit.
 * POSIX: SingletonLock is a symlink "host-pid"; it counts only while that pid is alive.
 */
export function isBrowserProfileLockHeld(
  profileDir: string,
  platform: NodeJS.Platform = process.platform,
  io: ProfileLockIo = profileLockIo,
): boolean {
  if (platform === 'win32') {
    const lock = path.join(profileDir, 'lockfile');
    if (!io.exists(lock)) return false;
    try {
      io.probeOpen(lock);
      return false;
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
    }
  }
  try {
    const target = io.readlink(path.join(profileDir, 'SingletonLock'));
    const pid = Number(String(target).split('-').pop());
    if (!(pid > 0)) return false;
    io.signal0(pid);
    return true;
  } catch (error) {
    return (error as { code?: string } | null)?.code === 'EPERM';
  }
}

/** Same check with a short grace window: a browser that was just closed may still be releasing the lock. */
export async function isBrowserProfileOwnedByRunningBrowser(
  profileDir: string,
  tries = 3,
  delayMs = 400,
  io: ProfileLockIo = profileLockIo,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (!isBrowserProfileLockHeld(profileDir, platform, io)) return false;
    if (attempt < tries - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return true;
}

/** Before launching: if a running browser owns the profile, stop with the given short message instead of starting another one. */
export async function throwIfBrowserProfileOwned(profileDir: string, message: string): Promise<void> {
  if (await isBrowserProfileOwnedByRunningBrowser(profileDir)) throw new Error(message);
}

/** After a failed launch: the wording says "in use", or the lock on disk is held. Either way another channel cannot help. */
export function isProfileBusyAfterLaunchFailure(
  error: unknown,
  profileDir: string,
  io: ProfileLockIo = profileLockIo,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return isBrowserProfileInUseError(error) || isBrowserProfileLockHeld(profileDir, platform, io);
}

/** One short line for the screen: first line of the error, no driver prefix, no paths, no launch log. */
export function summarizeBrowserLaunchError(error: unknown): string {
  const first = errorText(error).split('\n').map((line) => line.trim()).find(Boolean) || 'unknown';
  return first
    .replace(/^browserType\.\w+:\s*/, '')
    .replace(/[A-Za-z]:\\.*$/, '...')
    .replace(/\/(?:Users|home|root|tmp|var)\/.*$/, '...')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
}

/** Full launch error for the console log only (never for the screen). */
export function launchErrorLogText(error: unknown): string {
  return errorText(error).slice(0, 2000);
}
