import { expect, test, type ElectronApplication } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { closeElectronApp, createElectronTestProfile } from './electronTestUtils';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readFirstPid(stream: Readable, timeoutMs = 5_000): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let buffered = '';
    const timer = setTimeout(() => reject(new Error('Timed out waiting for child PID')), timeoutMs);
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buffered += chunk;
      const newlineIndex = buffered.indexOf('\n');
      if (newlineIndex < 0) return;

      clearTimeout(timer);
      const pid = Number.parseInt(buffered.slice(0, newlineIndex), 10);
      if (!Number.isInteger(pid) || pid <= 0) {
        reject(new Error(`Invalid child PID: ${buffered.slice(0, newlineIndex)}`));
        return;
      }
      resolve(pid);
    });
  });
}

function killIfAlive(pid: number | undefined): void {
  if (!pid || !isProcessAlive(pid)) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Best-effort cleanup for the intentionally orphaned regression fixture.
  }
}

test.describe('Electron E2E lifecycle helper', () => {
  test('rejects profile prefixes that can escape the temp directory', async () => {
    await expect(createElectronTestProfile('../outside-e2e-')).rejects.toThrow(
      'Invalid Electron E2E profile prefix',
    );
  });

  test('isolates profile-owned writable OS directories', async () => {
    const profile = await createElectronTestProfile('bln-helper-e2e-');

    try {
      for (const name of [
        'E2E_USER_DATA_DIR',
        'APPDATA',
        'LOCALAPPDATA',
        'TEMP',
        'TMP',
        'HOME',
        'USERPROFILE',
      ]) {
        const directory = profile.env[name];
        expect(directory, `${name} should be set`).toBeTruthy();
        expect(path.resolve(directory!)).toEqual(expect.stringMatching(
          new RegExp(`^${profile.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[\\\\/]|$)`),
        ));
        await expect(fs.stat(directory!)).resolves.toMatchObject({});
      }
    } finally {
      await profile.cleanup();
    }

    await expect(fs.access(profile.root)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('serializes profile owners until cleanup releases the launch lease', async () => {
    const first = await createElectronTestProfile('bln-lease-first-e2e-');
    const secondProfilePromise = createElectronTestProfile('bln-lease-second-e2e-');
    let second: Awaited<typeof secondProfilePromise> | undefined;

    try {
      const earlyResult = await Promise.race([
        secondProfilePromise.then(() => 'acquired' as const),
        new Promise<'waiting'>((resolve) => setTimeout(() => resolve('waiting'), 300)),
      ]);
      expect(earlyResult).toBe('waiting');

      await first.cleanup();
      second = await secondProfilePromise;
      expect(second.root).not.toBe(first.root);
    } finally {
      await first.cleanup();
      second ??= await secondProfilePromise;
      await second?.cleanup();
    }
  });

  test('closes the owned process tree when app.close resolves before process exit', async () => {
    test.setTimeout(20_000);
    const descendantScript = 'setInterval(() => {}, 1000)';
    const rootScript = [
      "const { spawn } = require('node:child_process');",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}], {`,
      "  stdio: 'ignore',",
      '  windowsHide: true,',
      '});',
      "process.stdout.write(String(child.pid) + '\\n');",
      'setInterval(() => {}, 1000);',
    ].join('\n');
    const root = spawn(process.execPath, ['-e', rootScript], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    let descendantPid: number | undefined;

    try {
      descendantPid = await readFirstPid(root.stdout!);
      expect(root.kill(0)).toBe(true);
      expect(root.killed).toBe(true);
      expect(isProcessAlive(root.pid!)).toBe(true);
      const fakeApp = {
        close: async () => undefined,
        process: () => root,
      } as unknown as ElectronApplication;

      await closeElectronApp(fakeApp);

      await expect.poll(() => isProcessAlive(root.pid!), { timeout: 5_000 }).toBe(false);
      await expect.poll(() => isProcessAlive(descendantPid!), { timeout: 5_000 }).toBe(false);
    } finally {
      killIfAlive(descendantPid);
      killIfAlive(root.pid);
    }
  });
});
