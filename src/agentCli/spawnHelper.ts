// Cross-platform process spawner for the agent CLI service.
//
// Korean encoding: the prompt is written to stdin as a UTF-8 Buffer (a PowerShell pipe
// mangles non-ASCII, but a direct Node stdin write does not). Output is read as UTF-8.
//
// Windows: codex/claude may be installed as .cmd shims. We resolve the shim's real .exe/.js
// target and keep shell:false so renderer-controlled values never reach cmd.exe parsing.

import { spawn, type ChildProcess } from 'child_process';
import { existsSync, readFileSync, realpathSync } from 'fs';
import { delimiter, dirname, extname, isAbsolute, relative, resolve } from 'path';
import { AgentCliError, type AgentProvider } from './types.js';

export interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface SpawnArgs {
  command: string;
  args: string[];
  provider: AgentProvider;
  cwd?: string;
  /** Written to stdin as UTF-8 then closed. */
  stdin?: string;
  /** Hard deadline; the child is SIGKILLed on expiry. Default 180000ms. */
  timeoutMs?: number;
  /** Per-stream UTF-8 output budget. Default 8 MiB. */
  maxOutputBytes?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  /** Receives bounded stdout chunks as they arrive. Callback failures never affect the child. */
  onStdoutChunk?: (chunk: string) => void;
  /** Receives bounded stderr chunks as they arrive. Callback failures never affect the child. */
  onStderrChunk?: (chunk: string) => void;
}

export interface SpawnSession {
  readonly result: Promise<SpawnResult>;
  /** Write exactly one UTF-8 line while the interactive child is alive. */
  readonly writeLine: (value: string) => Promise<SpawnWriteStatus>;
  readonly closeInput: () => void;
  readonly cancel: () => void;
}

export type SpawnWriteStatus = 'accepted' | 'busy' | 'closed';

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const WINDOWS_TREE_TERMINATION_TIMEOUT_MS = 3_000;
const INTERACTIVE_WRITE_TIMEOUT_MS = 5_000;
const MAX_INTERACTIVE_WRITE_BYTES = 16 * 1024;

interface SpawnTarget {
  command: string;
  prefixArgs: string[];
  envOverrides?: NodeJS.ProcessEnv;
}

function killDirectChild(child: ChildProcess): void {
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

function resolveWindowsTaskkill(): string {
  const configuredRoot = process.env.SystemRoot
    ?? process.env.SYSTEMROOT
    ?? process.env.WINDIR
    ?? process.env.windir;
  const windowsRoot = configuredRoot && isAbsolute(configuredRoot)
    ? configuredRoot
    : 'C:\\Windows';
  return resolve(windowsRoot, 'System32', 'taskkill.exe');
}

/** Terminate descendants before their parent so the Windows process-tree relation is intact. */
function terminateSpawnedTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (
    process.platform !== 'win32'
    || !Number.isSafeInteger(pid)
    || (pid ?? 0) <= 0
    || child.exitCode != null
    || child.signalCode != null
  ) {
    killDirectChild(child);
    return Promise.resolve();
  }

  return new Promise((resolveTermination) => {
    let settled = false;
    let treeKiller: ChildProcess | undefined;

    const finish = (fallbackToDirectKill: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(fallbackTimer);
      if (fallbackToDirectKill) killDirectChild(child);
      resolveTermination();
    };

    const fallbackTimer = setTimeout(() => {
      try { treeKiller?.kill('SIGKILL'); } catch { /* already gone */ }
      finish(true);
    }, WINDOWS_TREE_TERMINATION_TIMEOUT_MS);

    try {
      treeKiller = spawn(
        resolveWindowsTaskkill(),
        ['/PID', String(pid), '/T', '/F'],
        {
          windowsHide: true,
          shell: false,
          stdio: 'ignore',
        },
      );
      treeKiller.once('error', () => finish(true));
      treeKiller.once('close', (code) => finish(code !== 0));
    } catch {
      finish(true);
    }
  });
}

function resolveInsideDirectory(baseDir: string, relativePath: string): string | undefined {
  const candidate = resolve(baseDir, relativePath.replace(/^[\\/]+/, ''));
  const fromBase = relative(baseDir, candidate);
  if (!fromBase || fromBase.startsWith('..') || isAbsolute(fromBase)) return undefined;
  return candidate;
}

function resolveExistingInsideDirectory(baseDir: string, relativePath: string): string | undefined {
  const candidate = resolveInsideDirectory(baseDir, relativePath);
  if (!candidate || !existsSync(candidate)) return undefined;
  try {
    const canonicalBase = realpathSync(baseDir);
    const canonicalCandidate = realpathSync(candidate);
    const fromCanonicalBase = relative(canonicalBase, canonicalCandidate);
    if (
      !fromCanonicalBase
      || fromCanonicalBase.startsWith('..')
      || isAbsolute(fromCanonicalBase)
    ) return undefined;
    return canonicalCandidate;
  } catch {
    return undefined;
  }
}

function isSafeWindowsPathEntry(entry: string): boolean {
  if (!isAbsolute(entry)) return false;
  const normalized = entry.replace(/\//g, '\\');
  return !normalized.startsWith('\\\\');
}

function resolveVariableNpmShim(source: string, baseDir: string): SpawnTarget | undefined {
  const assignments = new Map<string, string>();
  for (const match of source.matchAll(/^\s*SET\s+"([A-Z][A-Z0-9_]*)=%~dp0\\([^"\r\n]+)"\s*$/gim)) {
    const candidate = resolveExistingInsideDirectory(baseDir, match[2]);
    if (candidate) assignments.set(match[1].toUpperCase(), candidate);
  }

  for (const match of source.matchAll(/"%([A-Z][A-Z0-9_]*)%"\s+"%([A-Z][A-Z0-9_]*)%"\s+%\*/gi)) {
    const executable = assignments.get(match[1].toUpperCase());
    const script = assignments.get(match[2].toUpperCase());
    if (!script || extname(script).toLowerCase() !== '.js') continue;

    if (executable && extname(executable).toLowerCase() === '.exe') {
      return { command: executable, prefixArgs: [script] };
    }
    return {
      command: process.execPath,
      prefixArgs: [script],
      envOverrides: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }
  return undefined;
}

function resolveNpmCmdShim(shimPath: string): SpawnTarget | undefined {
  try {
    const source = readFileSync(shimPath, 'utf8');
    const baseDir = dirname(shimPath);

    const variableTarget = resolveVariableNpmShim(source, baseDir);
    if (variableTarget) return variableTarget;

    for (const match of source.matchAll(/"%dp0%\\([^"\r\n]+\.js)"/gi)) {
      const script = resolveExistingInsideDirectory(baseDir, match[1]);
      if (!script) continue;
      const adjacentNode = /"%dp0%\\node\.exe"/i.test(source)
        ? resolveExistingInsideDirectory(baseDir, 'node.exe')
        : undefined;
      if (adjacentNode) return { command: adjacentNode, prefixArgs: [script] };
      return {
        command: process.execPath,
        prefixArgs: [script],
        envOverrides: { ELECTRON_RUN_AS_NODE: '1' },
      };
    }

    for (const match of source.matchAll(/"%dp0%\\([^"\r\n]+\.exe)"/gi)) {
      const executable = resolveExistingInsideDirectory(baseDir, match[1]);
      if (executable) return { command: executable, prefixArgs: [] };
    }
  } catch {
    // The caller will attempt a direct spawn and receive a typed failure.
  }
  return undefined;
}

/** Resolve Windows npm shims to their real executable without invoking cmd.exe. */
export function resolveWindowsSpawnTarget(
  command: string,
  searchEnv: NodeJS.ProcessEnv = process.env,
): SpawnTarget | undefined {
  if (process.platform !== 'win32') return { command, prefixArgs: [] };

  if (isAbsolute(command)) {
    if (extname(command).toLowerCase() === '.cmd') {
      return resolveNpmCmdShim(command) ?? { command, prefixArgs: [] };
    }
    return { command, prefixArgs: [] };
  }

  // Do not rely on where.exe first: it writes using the active OEM code page, which can
  // corrupt a Korean (or otherwise non-ASCII) Windows profile path when Node decodes it.
  const pathEntries = String(searchEnv.Path || searchEnv.PATH || '')
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter((entry) => entry.length > 0 && isSafeWindowsPathEntry(entry));
  for (const entry of pathEntries) {
    const executable = resolveExistingInsideDirectory(entry, `${command}.exe`);
    if (executable) return { command: executable, prefixArgs: [] };

    const shim = resolveExistingInsideDirectory(entry, `${command}.cmd`);
    if (!shim) continue;
    const resolved = resolveNpmCmdShim(shim);
    if (resolved) return resolved;
  }

  // Do not fall back to where.exe or a bare command: both can search the current working
  // directory outside the caller-provided PATH. Failing closed prevents shim hijacking.
  return undefined;
}

/** Start an interactive CLI session while preserving the shared timeout/kill/output protections. */
export function startSpawnSession(opts: SpawnArgs): SpawnSession {
  const {
    command,
    args,
    provider,
    cwd,
    stdin,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    signal,
    env,
    onStdoutChunk,
    onStderrChunk,
  } = opts;

  let writeLineImpl: (value: string) => Promise<SpawnWriteStatus> = async () => 'closed';
  let closeInputImpl: () => void = () => undefined;
  let cancelImpl: () => void = () => undefined;

  const result = new Promise<SpawnResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AgentCliError('aborted', provider, '작업이 취소되었습니다.'));
      return;
    }

    const baseEnv = env ?? process.env;
    const target = resolveWindowsSpawnTarget(command, baseEnv);
    if (!target) {
      reject(new AgentCliError(
        'not_installed',
        provider,
        `${command} CLI를 허용된 PATH에서 찾을 수 없습니다. 설치 여부를 확인해주세요.`,
      ));
      return;
    }
    const finalArgs = [...target.prefixArgs, ...args];
    const childEnv = target.envOverrides
      ? { ...baseEnv, ...target.envOverrides }
      : baseEnv;

    let child: ChildProcess;
    try {
      child = spawn(target.command, finalArgs, {
        cwd,
        env: childEnv,
        windowsHide: true,
        shell: false,
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      reject(new AgentCliError(
        err.code === 'ENOENT' ? 'not_installed' : 'spawn_failed',
        provider,
        err.code === 'ENOENT'
          ? `${command} CLI를 찾을 수 없습니다. 설치 여부를 확인해주세요.`
          : `프로세스 실행 실패: ${err.message}`,
        err.code,
      ));
      return;
    }

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let settlePendingWrite: ((status: SpawnWriteStatus) => void) | undefined;
    const outputBudget = Number.isSafeInteger(maxOutputBytes) && maxOutputBytes > 0
      ? maxOutputBytes
      : DEFAULT_MAX_OUTPUT_BYTES;

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      settlePendingWrite?.('closed');
    };

    const terminateAndReject = (error: AgentCliError) => {
      if (settled) return;
      settled = true;
      cleanup();
      void terminateSpawnedTree(child).then(
        () => reject(error),
        () => reject(error),
      );
    };

    let inputClosed = false;
    let inputFailed = false;
    let writePending = false;
    const childStdin = child.stdin;
    const markInputClosed = (): void => {
      inputFailed = true;
      inputClosed = true;
      settlePendingWrite?.('closed');
    };
    childStdin?.on('error', markInputClosed);
    childStdin?.on('close', markInputClosed);

    writeLineImpl = async (value: string): Promise<SpawnWriteStatus> => {
      if (
        settled
        || inputClosed
        || inputFailed
        || !childStdin
        || typeof value !== 'string'
      ) return 'closed';
      const line = Buffer.from(`${value}\n`, 'utf8');
      if (line.byteLength > MAX_INTERACTIVE_WRITE_BYTES || writePending) return 'busy';

      writePending = true;
      return new Promise<SpawnWriteStatus>((resolveWrite) => {
        let finished = false;
        let writeReturned = false;
        let callbackDone = false;
        let drainDone = false;
        let drainListener: (() => void) | undefined;

        const finish = (status: SpawnWriteStatus): void => {
          if (finished) return;
          finished = true;
          clearTimeout(writeTimer);
          if (drainListener) childStdin.removeListener('drain', drainListener);
          if (settlePendingWrite === finish) settlePendingWrite = undefined;
          writePending = false;
          resolveWrite(status);
        };
        settlePendingWrite = finish;

        const maybeAccept = (): void => {
          if (writeReturned && callbackDone && drainDone) finish('accepted');
        };
        const writeTimer = setTimeout(() => {
          markInputClosed();
          try { childStdin.destroy(); } catch { /* already closed */ }
        }, INTERACTIVE_WRITE_TIMEOUT_MS);

        try {
          const acceptedWithoutBackpressure = childStdin.write(line, (error?: Error | null) => {
            if (error) {
              markInputClosed();
              return;
            }
            callbackDone = true;
            maybeAccept();
          });
          drainDone = acceptedWithoutBackpressure;
          if (!acceptedWithoutBackpressure) {
            drainListener = () => {
              drainDone = true;
              maybeAccept();
            };
            childStdin.once('drain', drainListener);
          }
          writeReturned = true;
          maybeAccept();
        } catch {
          markInputClosed();
        }
      });
    };
    closeInputImpl = (): void => {
      if (settled || inputClosed || !childStdin) return;
      inputClosed = true;
      settlePendingWrite?.('closed');
      try { childStdin.end(); } catch { /* child already closed stdin */ }
    };
    cancelImpl = (): void => {
      terminateAndReject(new AgentCliError('aborted', provider, '작업이 취소되었습니다.'));
    };

    const timer = setTimeout(() => {
      terminateAndReject(new AgentCliError(
        'timeout',
        provider,
        `${Math.round(timeoutMs / 1000)}초 내 응답이 없어 중단했습니다.`,
      ));
    }, timeoutMs);

    const onAbort = () => {
      terminateAndReject(new AgentCliError('aborted', provider, '작업이 취소되었습니다.'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => {
      if (settled) return;
      stdoutBytes += Buffer.byteLength(d, 'utf8');
      if (stdoutBytes > outputBudget) {
        terminateAndReject(new AgentCliError(
          'spawn_failed',
          provider,
          `Agent CLI stdout가 안전 한도(${outputBudget} bytes)를 초과해 중단했습니다.`,
        ));
        return;
      }
      stdout += d;
      try { onStdoutChunk?.(d); } catch { /* observer errors cannot break the child */ }
    });
    child.stderr?.on('data', (d: string) => {
      if (settled) return;
      stderrBytes += Buffer.byteLength(d, 'utf8');
      if (stderrBytes > outputBudget) {
        terminateAndReject(new AgentCliError(
          'spawn_failed',
          provider,
          `Agent CLI stderr가 안전 한도(${outputBudget} bytes)를 초과해 중단했습니다.`,
        ));
        return;
      }
      stderr += d;
      try { onStderrChunk?.(d); } catch { /* observer errors cannot break the child */ }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err.code === 'ENOENT') {
        reject(new AgentCliError('not_installed', provider, `${command} CLI를 찾을 수 없습니다. 설치 여부를 확인해주세요.`, err.message));
      } else {
        reject(new AgentCliError('spawn_failed', provider, `프로세스 실행 실패: ${err.message}`, err.code));
      }
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ code, stdout, stderr });
    });

    if (child.stdin) {
      try {
        if (stdin != null) child.stdin.write(Buffer.from(stdin, 'utf8'));
      } catch {
        // EPIPE if the child closed stdin early — ignore; exit code drives the outcome.
      }
    }
  });

  return Object.freeze({
    result,
    writeLine: (value: string) => writeLineImpl(value),
    closeInput: () => closeInputImpl(),
    cancel: () => cancelImpl(),
  });
}

/**
 * Spawn a CLI, feed the prompt over stdin (UTF-8), and collect stdout/stderr.
 * This legacy wrapper intentionally closes stdin immediately; interactive login uses
 * startSpawnSession instead.
 */
export function spawnCollect(opts: SpawnArgs): Promise<SpawnResult> {
  const session = startSpawnSession(opts);
  session.closeInput();
  return session.result;
}
