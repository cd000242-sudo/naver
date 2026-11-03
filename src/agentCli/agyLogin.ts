// agy (Antigravity CLI) sign-in.
//
// [2026-08-23] Measured on agy 1.1.18: launched with piped stdio the CLI never prints a
// sign-in URL. Its own log only repeats "You are not logged into Antigravity" while stdout and
// stderr stay completely empty, and `agy models` says "Launch the CLI without arguments to
// sign in" — the sign-in UI only runs on a real console. So the piped-session + OAuth-URL flow
// that codex/claude use cannot drive it: the app opens a terminal window instead and waits for
// the credential to appear.

import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { agentCommandName } from './commandName.js';
import { resolveWindowsSpawnTarget, spawnCollect } from './spawnHelper.js';
import { buildGeminiSubscriptionEnv } from './subscriptionEnv.js';
import { AgentCliError } from './types.js';

const POLL_INTERVAL_MS = 3_000;
/** How long to look for the console we just opened, before detection polling starts. */
const CONSOLE_DISCOVERY_WINDOW_MS = 2_500;
const CONSOLE_DISCOVERY_STEP_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/**
 * PIDs of every running agy process.
 *
 * [2026-08-23] Measured: agy reports `Window Title: N/A` to tasklist, so the console cannot be
 * closed by the title `start` gave it. Identifying the process by PID is the only reliable
 * handle we have.
 */
async function listAgyPids(): Promise<Set<number>> {
  if (process.platform !== 'win32') return new Set();
  const image = `${agentCommandName('gemini')}.exe`;
  const { execFile } = await import('child_process');
  const stdout = await new Promise<string>((done) => {
    execFile(
      'tasklist',
      ['/FI', `IMAGENAME eq ${image}`, '/NH', '/FO', 'CSV'],
      { windowsHide: true },
      (err, out) => done(err ? '' : String(out || '')),
    );
  });
  const pids = new Set<number>();
  for (const line of stdout.split(/\r?\n/)) {
    // "agy.exe","32380","Console","1","214,972 K"
    const match = /^"[^"]*","(\d+)"/.exec(line.trim());
    if (match) pids.add(Number(match[1]));
  }
  return pids;
}

/**
 * Find the console opened by openAgyTerminal().
 *
 * Runs BEFORE any detection poll on purpose: detectAgent() spawns `agy --version` and
 * `agy models`, so PIDs sampled later would mix those short-lived probes into the diff.
 */
async function discoverOpenedAgyPids(pidsBefore: ReadonlySet<number>): Promise<number[]> {
  if (process.platform !== 'win32') return [];
  const deadline = Date.now() + CONSOLE_DISCOVERY_WINDOW_MS;
  while (Date.now() < deadline) {
    await sleep(CONSOLE_DISCOVERY_STEP_MS);
    const opened = [...(await listAgyPids())].filter((pid) => !pidsBefore.has(pid));
    if (opened.length > 0) return opened;
  }
  return [];
}

/** Close the login console once the credential is confirmed. Best-effort — never throws. */
async function closeAgyLoginConsole(pids: readonly number[]): Promise<void> {
  if (process.platform !== 'win32' || pids.length === 0) return;
  const { execFile } = await import('child_process');
  await Promise.all(pids.map((pid) => new Promise<void>((done) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => done());
  })));
}

function resolveAgyExecutable(env: NodeJS.ProcessEnv): string {
  if (process.platform !== 'win32') {
    for (const directory of String(env.PATH || '').split(delimiter)) {
      if (!isAbsolute(directory)) continue;
      try {
        const candidate = join(directory, agentCommandName('gemini'));
        accessSync(candidate, constants.X_OK); if (statSync(candidate).isFile()) return realpathSync(candidate);
      } catch { /* Try the next explicit PATH directory. */ }
    }
  } else {
    const target = resolveWindowsSpawnTarget(agentCommandName('gemini'), env);
    if (target && isAbsolute(target.command) && !target.prefixArgs.length) return target.command;
  }
  throw new AgentCliError(
      'not_installed',
      'gemini',
      'Antigravity CLI(agy)를 찾지 못했습니다. 먼저 설치를 완료해주세요.',
  );
}

/** Open a console window running agy so its sign-in UI has the terminal it requires. */
export async function openAgyLoginTerminal(env: NodeJS.ProcessEnv): Promise<void> {
  const executable = resolveAgyExecutable(env);

  if (process.platform === 'win32') {
    const configured = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    const systemRoot = isAbsolute(configured) ? configured : 'C:\\Windows';
    // Fixed local script. User/profile path metacharacters are environment data, never code.
    // Start-Process creates the real interactive console; the helper itself stays hidden.
    const result = await spawnCollect({ command: join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:LDB_AGY_LOGIN_EXECUTABLE -WorkingDirectory $env:LDB_AGY_LOGIN_DIRECTORY"],
      provider: 'gemini', timeoutMs: 15_000, env: { ...env, LDB_AGY_LOGIN_EXECUTABLE: executable, LDB_AGY_LOGIN_DIRECTORY: dirname(executable) } });
    if (result.code !== 0) throw new AgentCliError('spawn_failed', 'gemini', 'Antigravity 로그인 콘솔을 열지 못했습니다. 보안 정책과 터미널 실행 권한을 확인해주세요.');
    return;
  }

  if (process.platform === 'darwin') {
    const result = await spawnCollect({ command: '/usr/bin/open', args: ['-a', 'Terminal', executable], provider: 'gemini', timeoutMs: 15_000, env });
    if (result.code !== 0) throw new AgentCliError('spawn_failed', 'gemini', 'macOS Terminal을 열지 못했습니다. 터미널 실행 권한을 확인해주세요.');
    return;
  }

  throw new AgentCliError(
    'spawn_failed',
    'gemini',
    `이 운영체제에서는 앱이 터미널을 열 수 없습니다. 터미널에서 다음 실제 실행 파일을 열어 구글 로그인을 완료해주세요: ${executable}`,
  );
}

/**
 * Launch agy's terminal sign-in and wait until the credential is actually usable.
 *
 * @throws AgentCliError when the user does not finish signing in before the deadline.
 */
export async function loginAgyInInteractiveTerminal(timeoutMs: number): Promise<void> {
  const { clearAgentDetectionCache, detectAgent } = await import('./detect.js');

  const pidsBefore = await listAgyPids();
  await openAgyLoginTerminal(buildGeminiSubscriptionEnv());
  // [2026-08-23] agy has no login-only subcommand (verified on 1.1.19: install/update/models/
  //   mcp/plugin only), so signing in necessarily lands the user in its chat TUI and the window
  //   stays open. Users read that as "it just opened a terminal and stopped". Once the app has
  //   confirmed the credential there is nothing left for that console to do, so close it.
  const openedPids = await discoverOpenedAgyPids(pidsBefore);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    clearAgentDetectionCache('gemini');
    const status = await detectAgent('gemini', { forceRefresh: true }).catch(() => undefined);
    if (status?.loggedIn) {
      await closeAgyLoginConsole(openedPids);
      return;
    }
  }
  // Timed out: leave the console open — the user may still be mid sign-in.

  throw new AgentCliError(
    'not_logged_in',
    'gemini',
    '제한 시간 안에 Antigravity 로그인이 완료되지 않았습니다. 열린 터미널 창에서 구글 계정 로그인을 마친 뒤 다시 시도해주세요.',
  );
}
