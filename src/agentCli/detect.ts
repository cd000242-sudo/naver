// Install / login detection for the agent CLIs (drives the UI status badge).
// Best-effort and side-effect free: never throws — always resolves to an AgentCliStatus.

import { access } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { spawnCollect } from './spawnHelper.js';
import type { AgentCliStatus, AgentProvider } from './types.js';

const DETECT_TIMEOUT_MS = 8_000;

/** Probe `<cli> --version`; ENOENT (or any error) means not installed. */
async function probeVersion(provider: AgentProvider): Promise<string | undefined> {
  try {
    const res = await spawnCollect({
      command: provider,
      args: ['--version'],
      provider,
      timeoutMs: DETECT_TIMEOUT_MS,
    });
    if (res.code === 0) {
      return (res.stdout || res.stderr).trim() || undefined;
    }
  } catch {
    // not installed / spawn failure → undefined
  }
  return undefined;
}

/** codex exposes `codex login status` ("Logged in using ChatGPT"). */
async function probeCodexLogin(): Promise<{ loggedIn: boolean; detail?: string }> {
  try {
    const res = await spawnCollect({
      command: 'codex',
      args: ['login', 'status'],
      provider: 'codex',
      timeoutMs: DETECT_TIMEOUT_MS,
    });
    const out = (res.stdout || res.stderr).trim();
    return { loggedIn: res.code === 0 && /logged in/i.test(out), detail: out || undefined };
  } catch {
    return { loggedIn: false };
  }
}

/** claude stores subscription OAuth in ~/.claude/.credentials.json on this platform. */
async function probeClaudeLogin(): Promise<{ loggedIn: boolean; detail?: string }> {
  try {
    await access(join(homedir(), '.claude', '.credentials.json'));
    return { loggedIn: true, detail: 'credentials.json 확인됨' };
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Detect install + login status for one provider. Always resolves (never rejects).
 */
export async function detectAgent(provider: AgentProvider): Promise<AgentCliStatus> {
  const version = await probeVersion(provider);
  if (!version) {
    return { provider, installed: false, loggedIn: false };
  }

  const login = provider === 'codex' ? await probeCodexLogin() : await probeClaudeLogin();
  return {
    provider,
    installed: true,
    version,
    loggedIn: login.loggedIn,
    detail: login.detail,
  };
}
