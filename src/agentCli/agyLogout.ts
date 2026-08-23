// agy (Antigravity CLI) logout.
//
// [2026-08-23] The gemini provider moved to agy in v2.11.145, but logout still deleted
// ~/.gemini/oauth_creds.json — the retired gemini CLI's artifact. agy never reads that file, so
// "계정 전환" always ended with the postcondition error "the previous account is still connected"
// and the user could not switch Google accounts at all.
//
// Where agy actually keeps the session (measured on this machine, agy 1.1.18 / Windows 11):
//   - OS keyring: a Generic credential named "gemini:antigravity" (cmdkey /list shows
//     "LegacyGeneric:target=gemini:antigravity", user "antigravity"). This holds the token.
//   - ~/.gemini/google_accounts.json: {"active":"<google account>","old":[...]}.
// Clearing both is the symmetric logout action.

import { spawnCollect } from './spawnHelper.js';

const KEYRING_SERVICE = 'gemini';
const KEYRING_ACCOUNT = 'antigravity';
const LOGOUT_TIMEOUT_MS = 15_000;

function resolveWindowsSystemBinary(name: string): string {
  const configuredRoot = process.env.SystemRoot
    ?? process.env.SYSTEMROOT
    ?? process.env.WINDIR
    ?? process.env.windir;
  const windowsRoot = configuredRoot && /^[a-zA-Z]:[\\/]/.test(configuredRoot)
    ? configuredRoot
    : 'C:\\Windows';
  return `${windowsRoot}\\System32\\${name}`;
}

function keyringDeleteCommand(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: resolveWindowsSystemBinary('cmdkey.exe'),
      args: [`/delete:${KEYRING_SERVICE}:${KEYRING_ACCOUNT}`],
    };
  }
  if (process.platform === 'darwin') {
    return {
      command: '/usr/bin/security',
      args: ['delete-generic-password', '-s', KEYRING_SERVICE, '-a', KEYRING_ACCOUNT],
    };
  }
  return {
    command: 'secret-tool',
    args: ['clear', 'service', KEYRING_SERVICE, 'account', KEYRING_ACCOUNT],
  };
}

/**
 * Clear the stored Google account so agy asks for a new login.
 *
 * The keyring entry is the part that actually revokes the session; the account file only
 * records which account was active. A missing keyring entry is treated as success — the user
 * is already logged out — so the caller's own postcondition check stays the source of truth.
 */
export async function logoutAgyAccount(): Promise<void> {
  const { command, args } = keyringDeleteCommand();
  await spawnCollect({
    command,
    args,
    provider: 'gemini',
    timeoutMs: LOGOUT_TIMEOUT_MS,
  }).catch(() => undefined); // deleting a credential that is not there must not fail logout

  await clearActiveGoogleAccountFile();
}

async function clearActiveGoogleAccountFile(): Promise<void> {
  const { readFile, writeFile } = await import('fs/promises');
  const { homedir } = await import('os');
  const { join } = await import('path');
  const file = join(homedir(), '.gemini', 'google_accounts.json');

  let previousActive = '';
  let previousOld: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      previousActive = typeof record.active === 'string' ? record.active : '';
      previousOld = Array.isArray(record.old) ? record.old : [];
    }
  } catch {
    return; // no account file (or unreadable) → nothing left to clear
  }

  const old = previousActive && !previousOld.includes(previousActive)
    ? [...previousOld, previousActive]
    : previousOld;
  await writeFile(file, `${JSON.stringify({ active: '', old }, null, 2)}\n`, 'utf-8')
    .catch(() => undefined);
}
