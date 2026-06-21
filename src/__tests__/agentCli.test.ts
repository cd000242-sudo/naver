/**
 * Agent CLI service — unit tests.
 *
 * Pure helpers (parse/classify) are tested directly. The spawn layer is exercised against a
 * real `node` child (no codex/claude, no subscription quota) so the UTF-8 stdin path — the
 * Korean-encoding requirement — is verified end to end without external dependencies.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { tryExtractJson, parseClaudeEnvelope, classifyExit } from '../agentCli/parse';
import { spawnCollect } from '../agentCli/spawnHelper';
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

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentcli-test-'));
    writeFileSync(echoScript(), 'const c=[];process.stdin.on("data",d=>c.push(d));process.stdin.on("end",()=>process.stdout.write(Buffer.concat(c)));', 'utf8');
    writeFileSync(exitScript(), 'console.log("hello");process.exit(3);', 'utf8');
    writeFileSync(sleepScript(), 'setTimeout(()=>{},60000);', 'utf8');
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

  it('signals a missing binary (ENOENT on POSIX, non-zero cmd exit on Windows)', async () => {
    try {
      const res = await spawnCollect({
        command: 'definitely-not-a-real-binary-xyz',
        args: [],
        provider: 'codex',
        timeoutMs: 5_000,
      });
      // Windows shell:true → cmd.exe exits non-zero instead of emitting an ENOENT event.
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
