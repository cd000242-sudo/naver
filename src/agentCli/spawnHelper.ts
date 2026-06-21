// Cross-platform process spawner for the agent CLI service.
//
// Korean encoding: the prompt is written to stdin as a UTF-8 Buffer (a PowerShell pipe
// mangles non-ASCII, but a direct Node stdin write does not). Output is read as UTF-8.
//
// Windows: codex/claude are installed as .cmd shims. Node 20 refuses to spawn .cmd with
// shell:false, so we use shell:true and pre-quote any argument containing whitespace.

import { spawn } from 'child_process';
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

/** Quote an argument for cmd.exe when shell:true is in effect on Windows. */
function quoteWinArg(arg: string): string {
  if (!/[\s&|<>^"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
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

    const isWin = process.platform === 'win32';
    // With shell:true Node does not auto-quote; quote the command (e.g. a path containing
    // spaces) and any argument that needs it. A bare name like "codex" stays unquoted so
    // cmd.exe resolves it via PATHEXT to codex.cmd.
    const finalCommand = isWin ? quoteWinArg(command) : command;
    const finalArgs = isWin ? args.map(quoteWinArg) : args;

    const child = spawn(finalCommand, finalArgs, {
      cwd,
      env: env ?? process.env,
      windowsHide: true,
      shell: isWin,
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
