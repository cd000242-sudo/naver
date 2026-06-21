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

/**
 * claude exposes `claude auth status` (JSON: { loggedIn, authMethod, subscriptionType, ... }).
 * Falls back to the ~/.claude/.credentials.json check if the JSON cannot be read.
 */
async function probeClaudeLogin(): Promise<{ loggedIn: boolean; detail?: string }> {
  try {
    const res = await spawnCollect({
      command: 'claude',
      args: ['auth', 'status'],
      provider: 'claude',
      timeoutMs: DETECT_TIMEOUT_MS,
    });
    const out = (res.stdout || res.stderr).trim();
    try {
      const j = JSON.parse(out) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
      if (j && j.loggedIn === true) {
        const detail = j.subscriptionType
          ? `${j.authMethod || 'claude.ai'} · ${j.subscriptionType}`
          : (j.authMethod || '로그인됨');
        return { loggedIn: true, detail };
      }
      return { loggedIn: false };
    } catch {
      // Non-JSON output — fall back to the credentials file existence check.
      try {
        await access(join(homedir(), '.claude', '.credentials.json'));
        return { loggedIn: true, detail: 'credentials.json 확인됨' };
      } catch {
        return { loggedIn: false };
      }
    }
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
