/**
 * Agent CLI service — unit tests.
 *
 * Pure helpers (parse/classify) are tested directly. The spawn layer is exercised against a
 * real `node` child (no codex/claude, no subscription quota) so the UTF-8 stdin path — the
 * Korean-encoding requirement — is verified end to end without external dependencies.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { tryExtractJson, parseClaudeEnvelope, classifyExit } from '../agentCli/parse';
import { resolveWindowsSpawnTarget, spawnCollect } from '../agentCli/spawnHelper';
import { AgentCliError } from '../agentCli/types';

describe('parse.tryExtractJson', () => {
  it('parses clean JSON object', () => {
    expect(tryExtractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts JSON object wrapped in prose / code fences', () => {
    const wrapped = '여기 결과입니다:\n```json\n{"title":"가을 캠핑","ok":true}\n```\n끝.';
    expect(tryExtractJson(wrapped)).toEqual({ title: '가을 캠핑', ok: true });
  });

  it('parses top-level array', () => {
    expect(tryExtractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('returns undefined when no JSON present', () => {
    expect(tryExtractJson('그냥 평범한 문장입니다.')).toBeUndefined();
    expect(tryExtractJson('')).toBeUndefined();
  });
});

describe('parse.parseClaudeEnvelope', () => {
  it('returns result text from a success envelope', () => {
    const env = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '안녕하세요' });
    expect(parseClaudeEnvelope(env)).toBe('안녕하세요');
  });

  it('throws AgentCliError when envelope reports an error', () => {
    const env = JSON.stringify({ is_error: true, result: 'usage limit reached' });
    try {
      parseClaudeEnvelope(env);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentCliError);
      expect((e as AgentCliError).code).toBe('rate_limited');
    }
  });

  it('throws bad_json on non-JSON stdout', () => {
    expect(() => parseClaudeEnvelope('not json at all')).toThrowError(AgentCliError);
  });

  it('throws empty_output on blank stdout', () => {
    try {
      parseClaudeEnvelope('   ');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AgentCliError).code).toBe('empty_output');
    }
  });
});

describe('parse.classifyExit', () => {
  it('flags an expired or inactive Claude subscription separately from login expiry', () => {
    expect(classifyExit('claude', 'Your Claude subscription has expired.')).toBe('subscription_inactive');
    expect(classifyExit('claude', 'Claude Code requires an active Pro or Max plan. Upgrade to continue.'))
      .toBe('subscription_inactive');
  });

  it('flags rate/usage limits', () => {
    expect(classifyExit('codex', 'Error: usage limit reached')).toBe('rate_limited');
    expect(classifyExit('claude', 'HTTP 429 Too Many Requests')).toBe('rate_limited');
    expect(classifyExit('codex', 'weekly limit exceeded')).toBe('rate_limited');
  });

  it('flags auth/login problems', () => {
    expect(classifyExit('codex', 'Error: not logged in. Please run codex login')).toBe('not_logged_in');
    expect(classifyExit('claude', '401 Unauthorized')).toBe('not_logged_in');
  });

  it('flags a missing binary (Windows cmd shell wording)', () => {
    expect(classifyExit('codex', "'codex' is not recognized as an internal or external command")).toBe('not_installed');
  });

  it('falls back to nonzero_exit for unknown errors', () => {
    expect(classifyExit('codex', 'some unexpected failure')).toBe('nonzero_exit');
  });
});

describe('spawnCollect — real node child (no CLI / no quota)', () => {
  const NODE = process.execPath;
  // Real codex/claude calls pass only flags + temp-file paths as args (the prompt goes via
  // stdin), so the test scripts live in temp .js files and the args stay path-only — matching
  // production and sidestepping cross-platform shell quoting of inline code.
  let dir: string;
  const echoScript = () => join(dir, 'echo.js');
  const exitScript = () => join(dir, 'exit.js');
  const sleepScript = () => join(dir, 'sleep.js');
  const floodScript = () => join(dir, 'flood.js');
  const treeParentScript = () => join(dir, 'tree-parent.js');
  const treeMarker = () => join(dir, 'tree-grandchild-survived.txt');
  const treeReadyMarker = () => join(dir, 'tree-grandchild-ready.txt');
  const npmShim = () => join(dir, 'codex.cmd');
  const npmShimScript = () => join(dir, 'codex-cli.js');
  const variableNpmShim = () => join(dir, 'npm.cmd');
  const variableNpmNode = () => join(dir, 'node.exe');
  const variableNpmCli = () => join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const standardAgentShim = () => join(dir, 'claude.cmd');
  const standardAgentCli = () => join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
  const escapeShimDir = () => join(dir, 'escape-bin');
  const escapeShim = () => join(escapeShimDir(), 'escape-agent.cmd');
  const escapeTarget = () => join(dir, 'outside.js');

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentcli-test-'));
    writeFileSync(echoScript(), 'const c=[];process.stdin.on("data",d=>c.push(d));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(c)));', 'utf8');
    writeFileSync(exitScript(), 'console.log("hello");process.exit(3);', 'utf8');
    writeFileSync(sleepScript(), 'setTimeout(()=>{},60000);', 'utf8');
    writeFileSync(floodScript(), 'process.stdout.write("x".repeat(2048));', 'utf8');
    writeFileSync(treeParentScript(), [
      'const { spawn } = require("child_process");',
      'const marker = process.argv[2];',
      'const readyMarker = process.argv[3];',
      'const code = `setTimeout(() => require("fs").writeFileSync(process.argv[1], "alive"), 1000);`;',
      'const child = spawn(process.execPath, ["-e", code, marker], { stdio: "ignore", windowsHide: true });',
      'require("fs").writeFileSync(readyMarker, String(child.pid));',
      'child.unref();',
      'setInterval(() => {}, 60000);',
    ].join('\n'), 'utf8');
    writeFileSync(npmShimScript(), 'process.stdout.write(process.env.ELECTRON_RUN_AS_NODE || "");', 'utf8');
    writeFileSync(npmShim(), '@"%dp0%\\codex-cli.js" %*\r\n', 'utf8');
    mkdirSync(join(dir, 'node_modules', 'npm', 'bin'), { recursive: true });
    mkdirSync(join(dir, 'node_modules', '@anthropic-ai', 'claude-code'), { recursive: true });
    mkdirSync(escapeShimDir(), { recursive: true });
    writeFileSync(variableNpmNode(), '', 'utf8');
    writeFileSync(variableNpmCli(), 'process.stdout.write("npm");', 'utf8');
    writeFileSync(standardAgentCli(), 'process.stdout.write("claude");', 'utf8');
    writeFileSync(standardAgentShim(), [
      '@ECHO off',
      'IF EXIST "%dp0%\\node.exe" (',
      '  SET "_prog=%dp0%\\node.exe"',
      ') ELSE (',
      '  SET "_prog=node"',
      ')',
      '"%_prog%" "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*',
      '',
    ].join('\r\n'), 'utf8');
    writeFileSync(escapeTarget(), 'process.stdout.write("escaped");', 'utf8');
    writeFileSync(escapeShim(), '@"%dp0%\\..\\outside.js" %*\r\n', 'utf8');
    writeFileSync(variableNpmShim(), [
      '@ECHO OFF',
      'SETLOCAL',
      'SET "NODE_EXE=%~dp0\\node.exe"',
      'SET "NPM_PREFIX_JS=%~dp0\\node_modules\\npm\\bin\\npm-prefix.js"',
      'SET "NPM_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npm-cli.js"',
      '"%NODE_EXE%" "%NPM_CLI_JS%" %*',
      '',
    ].join('\r\n'), 'utf8');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips UTF-8 Korean over stdin (encoding guarantee)', async () => {
    const korean = '가을 캠핑 후기 — 오감으로 느낀 단풍 🍁';
    const res = await spawnCollect({
      command: NODE,
      args: [echoScript()],
      provider: 'codex',
      stdin: korean,
      timeoutMs: 10_000,
    });
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(korean);
  });

  it('captures stdout and exit code', async () => {
    const res = await spawnCollect({
      command: NODE,
      args: [exitScript()],
      provider: 'claude',
      timeoutMs: 10_000,
    });
    expect(res.code).toBe(3);
    expect(res.stdout.trim()).toBe('hello');
  });

  const windowsIt = process.platform === 'win32' ? it : it.skip;
  windowsIt('runs npm JavaScript shims with packaged Electron in Node mode', async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    const res = await spawnCollect({
      command: npmShim(),
      args: [],
      provider: 'codex',
      env,
      timeoutMs: 10_000,
    });

    expect(res.code).toBe(0);
    expect(res.stdout).toBe('1');
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  windowsIt('resolves commands only from the caller-provided PATH', () => {
    const target = resolveWindowsSpawnTarget('codex', {
      PATH: dir,
      PATHEXT: '.EXE;.CMD',
      SYSTEMROOT: process.env.SYSTEMROOT,
    });

    expect(target.command).toBe(process.execPath);
    expect(target.prefixArgs).toEqual([npmShimScript()]);
  });

  it('terminates a CLI that exceeds the bounded output budget', async () => {
    await expect(spawnCollect({
      command: NODE,
      args: [floodScript()],
      provider: 'codex',
      timeoutMs: 10_000,
      maxOutputBytes: 512,
    })).rejects.toMatchObject({ code: 'spawn_failed' });
  });

  windowsIt('resolves the variable-indirection format used by the current npm.cmd', () => {
    const target = resolveWindowsSpawnTarget('npm', {
      PATH: dir,
      PATHEXT: '.EXE;.CMD',
      SYSTEMROOT: process.env.SYSTEMROOT,
    });

    expect(target).toMatchObject({
      command: variableNpmNode(),
      prefixArgs: [variableNpmCli()],
    });
  });

  windowsIt('preserves the CLI script in a standard npm agent shim with adjacent node.exe', () => {
    const target = resolveWindowsSpawnTarget('claude', {
      PATH: dir,
      PATHEXT: '.EXE;.CMD',
      SYSTEMROOT: process.env.SYSTEMROOT,
    });

    expect(target).toMatchObject({
      command: variableNpmNode(),
      prefixArgs: [standardAgentCli()],
    });
  });

  windowsIt('rejects relative PATH entries even when they resolve from the current directory', () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(dir);
      expect(resolveWindowsSpawnTarget('claude', {
        PATH: '.',
        PATHEXT: '.EXE;.CMD',
        SYSTEMROOT: process.env.SYSTEMROOT,
      })).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  windowsIt('rejects shim targets that escape their PATH directory', () => {
    expect(resolveWindowsSpawnTarget('escape-agent', {
      PATH: escapeShimDir(),
      PATHEXT: '.EXE;.CMD',
      SYSTEMROOT: process.env.SYSTEMROOT,
    })).toBeUndefined();
  });

  windowsIt('does not resolve a command from the current working directory', () => {
    const command = 'cwd-only-agent';
    const cwdShim = join(dir, `${command}.cmd`);
    const cwdScript = join(dir, `${command}.js`);
    writeFileSync(cwdScript, 'process.stdout.write("unsafe");', 'utf8');
    writeFileSync(cwdShim, `@"%dp0%\\${command}.js" %*\r\n`, 'utf8');

    const originalCwd = process.cwd();
    try {
      process.chdir(dir);
      const target = resolveWindowsSpawnTarget(command, {
        PATH: join(dir, 'not-on-path'),
        PATHEXT: '.EXE;.CMD',
        SYSTEMROOT: process.env.SYSTEMROOT,
      });

      expect(target).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('signals a missing binary (ENOENT on POSIX, non-zero cmd exit on Windows)', async () => {
    try {
      const res = await spawnCollect({
        command: 'definitely-not-a-real-binary-xyz',
        args: [],
        provider: 'codex',
        timeoutMs: 5_000,
      });
      // Some Windows launch failures resolve with a non-zero status instead of ENOENT.
      expect(res.code).not.toBe(0);
    } catch (e) {
      // POSIX direct spawn → ENOENT → AgentCliError(not_installed).
      expect(e).toBeInstanceOf(AgentCliError);
      expect(['not_installed', 'spawn_failed']).toContain((e as AgentCliError).code);
    }
  });

  it('rejects with timeout when the child exceeds the deadline', async () => {
    try {
      await spawnCollect({
        command: NODE,
        args: [sleepScript()],
        provider: 'claude',
        timeoutMs: 300,
      });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AgentCliError).code).toBe('timeout');
    }
  });

  windowsIt('terminates a confirmed Windows grandchild on abort', async () => {
    const controller = new AbortController();
    const result = spawnCollect({
      command: NODE,
      args: [treeParentScript(), treeMarker(), treeReadyMarker()],
      provider: 'codex',
      timeoutMs: 10_000,
      signal: controller.signal,
    });

    for (let attempt = 0; attempt < 100 && !existsSync(treeReadyMarker()); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const grandchildStarted = existsSync(treeReadyMarker());
    controller.abort();

    expect(grandchildStarted).toBe(true);
    await expect(result).rejects.toMatchObject({ code: 'aborted' });

    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(existsSync(treeMarker())).toBe(false);
  });

  it('rejects with aborted when the signal fires', async () => {
    const ac = new AbortController();
    const p = spawnCollect({
      command: NODE,
      args: [sleepScript()],
      provider: 'codex',
      timeoutMs: 10_000,
      signal: ac.signal,
    });
    ac.abort();
    try {
      await p;
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as AgentCliError).code).toBe('aborted');
    }
  });
});
