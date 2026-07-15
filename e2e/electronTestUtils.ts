import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { ElectronApplication, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ElectronTestProfile {
  root: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => Promise<void>;
}

interface ElectronTestLease {
  release: () => Promise<void>;
}

interface LeaseOwner {
  pid: number;
  token: string;
  createdAt: string;
}

interface ElectronProfilePaths {
  userData: string;
  appData: string;
  localAppData: string;
  temp: string;
  home: string;
  xdgCache: string;
  xdgConfig: string;
}

const LEASE_DIRECTORY = path.join(os.tmpdir(), 'better-life-naver-electron-e2e.lock');
const LEASE_OWNER_FILE = path.join(LEASE_DIRECTORY, 'owner.json');
const LEASE_WAIT_TIMEOUT_MS = 45_000;
const OWNER_WRITE_GRACE_MS = 5_000;
const LEASE_HARD_STALE_MS = 5 * 60_000;
const GRACEFUL_CLOSE_TIMEOUT_MS = 3_000;
const FORCED_CLOSE_TIMEOUT_MS = 5_000;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function isProcessAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readLeaseOwner(): Promise<LeaseOwner | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(LEASE_OWNER_FILE, 'utf8')) as Partial<LeaseOwner>;
    if (!Number.isInteger(parsed.pid) || !parsed.token || !parsed.createdAt) return undefined;
    return parsed as LeaseOwner;
  } catch {
    return undefined;
  }
}

async function removeStaleLease(): Promise<boolean> {
  const owner = await readLeaseOwner();
  if (owner) {
    const ownerAgeMs = Date.now() - Date.parse(owner.createdAt);
    if (isProcessAlive(owner.pid) && ownerAgeMs < LEASE_HARD_STALE_MS) return false;
  } else {
    try {
      const stats = await fs.stat(LEASE_DIRECTORY);
      if (Date.now() - stats.mtimeMs < OWNER_WRITE_GRACE_MS) return false;
    } catch {
      return true;
    }
  }

  try {
    await fs.rm(LEASE_DIRECTORY, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function acquireElectronTestLease(): Promise<ElectronTestLease> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const deadline = Date.now() + LEASE_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      await fs.mkdir(LEASE_DIRECTORY);
      const owner: LeaseOwner = {
        pid: process.pid,
        token,
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(LEASE_OWNER_FILE, JSON.stringify(owner), { encoding: 'utf8', flag: 'wx' });
      return {
        release: async () => {
          const currentOwner = await readLeaseOwner();
          if (currentOwner?.token !== token) return;
          await fs.rm(LEASE_DIRECTORY, { recursive: true, force: true });
        },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        await fs.rm(LEASE_DIRECTORY, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      if (await removeStaleLease()) continue;
      await delay(100);
    }
  }

  const owner = await readLeaseOwner();
  throw new Error(
    `Timed out waiting for the Electron E2E launch lease after ${LEASE_WAIT_TIMEOUT_MS}ms` +
    (owner ? ` (owner pid=${owner.pid}, since=${owner.createdAt})` : ''),
  );
}

function getElectronProfilePaths(root: string): ElectronProfilePaths {
  const home = path.join(root, 'home');
  return {
    userData: path.join(root, 'userdata'),
    appData: path.join(root, 'appdata'),
    localAppData: path.join(root, 'localappdata'),
    temp: path.join(root, 'temp'),
    home,
    xdgCache: path.join(home, '.cache'),
    xdgConfig: path.join(home, '.config'),
  };
}

async function createElectronProfileDirectories(paths: ElectronProfilePaths): Promise<void> {
  const directories = [
    ...Object.values(paths),
    path.join(paths.home, 'Desktop'),
    path.join(paths.home, 'Documents'),
    path.join(paths.home, 'Downloads'),
  ];
  await Promise.all(directories.map((directory) => fs.mkdir(directory, { recursive: true })));
}

function getElectronProfileEnv(root: string, paths: ElectronProfilePaths): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    E2E_TEST: '1',
    E2E_USER_DATA_DIR: paths.userData,
    E2E_PROFILE_ROOT: root,
    APPDATA: paths.appData,
    LOCALAPPDATA: paths.localAppData,
    TEMP: paths.temp,
    TMP: paths.temp,
    HOME: paths.home,
    USERPROFILE: paths.home,
    XDG_CACHE_HOME: paths.xdgCache,
    XDG_CONFIG_HOME: paths.xdgConfig,
    EXPOSURE_POLLER_ENABLED: 'false',
  };
}

function validateProfilePrefix(prefix: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(prefix)) {
    throw new Error(`Invalid Electron E2E profile prefix: ${JSON.stringify(prefix)}`);
  }
}

export async function createElectronTestProfile(prefix: string): Promise<ElectronTestProfile> {
  validateProfilePrefix(prefix);
  const lease = await acquireElectronTestLease();
  let root: string | undefined;

  try {
    root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    const profileRoot = root;
    const paths = getElectronProfilePaths(profileRoot);
    await createElectronProfileDirectories(paths);

    let cleanupPromise: Promise<void> | undefined;
    return {
      root: profileRoot,
      env: getElectronProfileEnv(profileRoot, paths),
      cleanup: () => {
        cleanupPromise ??= (async () => {
          try {
            await fs.rm(profileRoot, {
              recursive: true,
              force: true,
              maxRetries: 10,
              retryDelay: 200,
            });
          } finally {
            await lease.release();
          }
        })();
        return cleanupPromise;
      },
    };
  } catch (error) {
    if (root) {
      await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
    await lease.release();
    throw error;
  }
}

function isMainWindow(page: Page): boolean {
  const url = page.url().replace(/\\/g, '/');
  return url.includes('/dist/public/index.html');
}

export async function waitForMainWindow(app: ElectronApplication, timeoutMs = 45_000): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  const childProcess = app.process();

  while (Date.now() < deadline) {
    const mainWindow = app.windows().find((page) => !page.isClosed() && isMainWindow(page));
    if (mainWindow) {
      await mainWindow.waitForLoadState('domcontentloaded', { timeout: 10_000 });
      return mainWindow;
    }
    if (!isProcessAlive(childProcess.pid)) {
      throw new Error(
        `Electron exited before its main window loaded ` +
        `(pid=${childProcess.pid}, exitCode=${childProcess.exitCode}, signal=${childProcess.signalCode})`,
      );
    }
    await delay(100);
  }

  const windowUrls = app.windows().map((page) => page.url()).join(', ');
  throw new Error(
    `Main Electron window did not load within ${timeoutMs}ms ` +
    `(pid=${childProcess.pid}, windows=${windowUrls || 'none'})`,
  );
}

async function waitForProcessExit(childProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (!isProcessAlive(childProcess.pid)) return true;

  return new Promise<boolean>((resolve) => {
    const finish = (exited: boolean) => {
      clearTimeout(timer);
      childProcess.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(!isProcessAlive(childProcess.pid)), timeoutMs);
    childProcess.once('exit', onExit);
  });
}

async function collectCommandOutput(
  command: string,
  args: string[],
  timeoutMs = FORCED_CLOSE_TIMEOUT_MS,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const finish = (error?: Error, output?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(output || '');
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', (error) => finish(error));
    child.once('exit', (code) => {
      if (code === 0) {
        finish(undefined, Buffer.concat(stdout).toString('utf8'));
        return;
      }
      finish(new Error(
        `${command} exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`,
      ));
    });
  });
}

async function listDescendantPids(rootPid: number): Promise<number[]> {
  const output = await collectCommandOutput('ps', ['-A', '-o', 'pid=,ppid=']);
  const childrenByParent = new Map<number, number[]>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const parentPid = Number(match[2]);
    childrenByParent.set(parentPid, [...(childrenByParent.get(parentPid) || []), pid]);
  }

  const descendants: number[] = [];
  const pending = [...(childrenByParent.get(rootPid) || [])];
  while (pending.length > 0) {
    const pid = pending.pop()!;
    descendants.push(pid);
    pending.push(...(childrenByParent.get(pid) || []));
  }
  return descendants;
}

async function terminateOwnedProcessTree(rootPid: number): Promise<void> {
  if (!isProcessAlive(rootPid)) return;

  if (process.platform === 'win32') {
    try {
      await collectCommandOutput('taskkill.exe', ['/PID', String(rootPid), '/T', '/F']);
    } catch (error) {
      if (isProcessAlive(rootPid)) throw error;
    }
    return;
  }

  const descendants = await listDescendantPids(rootPid).catch(() => []);
  for (const pid of [...descendants].reverse()) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // A descendant can exit while the tree snapshot is being processed.
    }
  }
  try {
    process.kill(rootPid, 'SIGKILL');
  } catch (error) {
    if (isProcessAlive(rootPid)) throw error;
  }
}

export async function closeElectronApp(app: ElectronApplication | undefined): Promise<void> {
  if (!app) return;

  const childProcess = app.process();
  const pid = childProcess.pid;
  void app.close().catch(() => undefined);

  const exitedGracefully = await waitForProcessExit(childProcess, GRACEFUL_CLOSE_TIMEOUT_MS);
  if (!exitedGracefully && pid) {
    console.warn(`[ElectronE2E] PID ${pid} did not exit cleanly; terminating its owned process tree.`);
    await terminateOwnedProcessTree(pid);
  }

  const exited = await waitForProcessExit(childProcess, FORCED_CLOSE_TIMEOUT_MS);
  if (!exited && isProcessAlive(pid)) {
    throw new Error(`Electron process tree did not exit after forced cleanup (pid=${pid})`);
  }

  // Chromium workers can release profile handles just after the process exit event.
  await delay(250);
}

export async function closeElectronTestSession(
  app: ElectronApplication | undefined,
  profile: ElectronTestProfile | undefined,
): Promise<void> {
  try {
    await closeElectronApp(app);
  } finally {
    await profile?.cleanup();
  }
}
