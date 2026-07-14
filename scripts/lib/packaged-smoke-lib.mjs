import fs from 'node:fs';
import path from 'node:path';

const RETRYABLE_WINDOWS_CLEANUP_ERRORS = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

function sleepSync(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

export function findPackagedExecutable(fileNames) {
  return (fileNames || []).find((name) => {
    const value = String(name || '');
    return /\.exe$/i.test(value)
      && !/uninstall|elevate|installer|setup/i.test(value);
  }) || null;
}

export function buildIsolatedPackagedAppEnv(baseEnv, root) {
  const env = {
    ...baseEnv,
    APPDATA: path.join(root, 'appdata'),
    LOCALAPPDATA: path.join(root, 'localappdata'),
    USERPROFILE: path.join(root, 'profile'),
    HOME: path.join(root, 'profile'),
    E2E_USER_DATA_DIR: path.join(root, 'userdata'),
    SELF_TEST: '1',
    E2E_TEST: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

export function removeIsolatedSmokeRoot(root, options = {}) {
  const rmSync = options.rmSync || fs.rmSync;
  const sleep = options.sleep || sleepSync;
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 8);
  const baseDelayMs = Math.max(1, Number(options.baseDelayMs) || 250);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      rmSync(root, {
        recursive: true,
        force: true,
        maxRetries: 4,
        retryDelay: 100,
      });
      return;
    } catch (error) {
      const code = String(error?.code || '');
      const canRetry = RETRYABLE_WINDOWS_CLEANUP_ERRORS.has(code) && attempt < maxAttempts;
      if (!canRetry) throw error;
      sleep(baseDelayMs * attempt);
    }
  }
}
