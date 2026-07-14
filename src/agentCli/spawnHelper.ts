// Cross-platform process spawner for the agent CLI service.
//
// Korean encoding: the prompt is written to stdin as a UTF-8 Buffer (a PowerShell pipe
// mangles non-ASCII, but a direct Node stdin write does not). Output is read as UTF-8.
//
// Windows: codex/claude may be installed as .cmd shims. We resolve the shim's real .exe/.js
// target and keep shell:false so renderer-controlled values never reach cmd.exe parsing.

import { spawn, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { delimiter, dirname, extname, isAbsolute, resolve } from 'path';
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
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

const DEFAULT_TIMEOUT_MS = 180_000;

interface SpawnTarget {
  command: string;
  prefixArgs: string[];
}

function resolveNpmCmdShim(shimPath: string): SpawnTarget | undefined {
  try {
    const source = readFileSync(shimPath, 'utf8');
    const baseDir = dirname(shimPath);

    for (const match of source.matchAll(/"%dp0%\\([^"\r\n]+\.exe)"/gi)) {
      const executable = resolve(baseDir, match[1]);
      if (existsSync(executable)) return { command: executable, prefixArgs: [] };
    }

    for (const match of source.matchAll(/"%dp0%\\([^"\r\n]+\.js)"/gi)) {
      const script = resolve(baseDir, match[1]);
      if (existsSync(script)) return { command: process.execPath, prefixArgs: [script] };
    }
  } catch {
    // The caller will attempt a direct spawn and receive a typed failure.
  }
  return undefined;
}

/** Resolve Windows npm shims to their real executable without invoking cmd.exe. */
export function resolveWindowsSpawnTarget(command: string): SpawnTarget {
  if (process.platform !== 'win32') return { command, prefixArgs: [] };

  if (isAbsolute(command)) {
    if (extname(command).toLowerCase() === '.cmd') {
      return resolveNpmCmdShim(command) ?? { command, prefixArgs: [] };
    }
    return { command, prefixArgs: [] };
  }

  // Do not rely on where.exe first: it writes using the active OEM code page, which can
  // corrupt a Korean (or otherwise non-ASCII) Windows profile path when Node decodes it.
  const pathEntries = String(process.env.Path || process.env.PATH || '')
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  for (const entry of pathEntries) {
    const executable = resolve(entry, `${command}.exe`);
    if (existsSync(executable)) return { command: executable, prefixArgs: [] };

    const shim = resolve(entry, `${command}.cmd`);
    if (!existsSync(shim)) continue;
    const resolved = resolveNpmCmdShim(shim);
    if (resolved) return resolved;
  }

  const lookup = spawnSync('where.exe', [command], {
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  const candidates = String(lookup.stdout || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  const executable = candidates.find((candidate) => extname(candidate).toLowerCase() === '.exe');
  if (executable) return { command: executable, prefixArgs: [] };

  for (const candidate of candidates) {
    if (extname(candidate).toLowerCase() !== '.cmd') continue;
    const resolved = resolveNpmCmdShim(candidate);
    if (resolved) return resolved;
  }

  return { command, prefixArgs: [] };
}

/**
 * Spawn a CLI, feed the prompt over stdin (UTF-8), and collect stdout/stderr.
 * Rejects with a typed AgentCliError on ENOENT (not_installed), timeout, abort, or spawn failure.
 * Resolves with the raw exit code + buffers otherwise (caller classifies non-zero exits).
 */
export function spawnCollect(opts: SpawnArgs): Promise<SpawnResult> {
  const {
    command,
    args,
    provider,
    cwd,
    stdin,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    env,
  } = opts;

  return new Promise<SpawnResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AgentCliError('aborted', provider, '작업이 취소되었습니다.'));
      return;
    }

    const target = resolveWindowsSpawnTarget(command);
    const finalArgs = [...target.prefixArgs, ...args];

    const child = spawn(target.command, finalArgs, {
      cwd,
      env: env ?? process.env,
      windowsHide: true,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      reject(new AgentCliError('timeout', provider, `${Math.round(timeoutMs / 1000)}초 내 응답이 없어 중단했습니다.`));
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      reject(new AgentCliError('aborted', provider, '작업이 취소되었습니다.'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d: string) => { stdout += d; });
    child.stderr?.on('data', (d: string) => { stderr += d; });

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
        child.stdin.end();
      } catch {
        // EPIPE if the child closed stdin early — ignore; exit code drives the outcome.
      }
    }
  });
}
