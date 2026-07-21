/**
 * usageTracker.ts — local 5-hour-window usage visibility for agent CLIs.
 *
 * [v2.11.135] Subscription CLIs (codex/claude/gemini) enforce rolling quota
 * windows (예: Claude 5시간 창) but expose NO query command or file for the
 * remaining budget — verified live against the installed claude CLI
 * (.credentials.json carries subscriptionType/rateLimitTier only). The honest
 * best effort is therefore: (1) count our own calls per rolling 5h window,
 * (2) when the CLI reports rate_limited, parse/remember the reset moment.
 * Numbers are OUR usage only — other tools sharing the subscription are not
 * visible, and the UI copy must say "앱에서 사용" accordingly.
 */
import { app } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { AgentProvider } from './types.js';

export const AGENT_USAGE_WINDOW_MS = 5 * 60 * 60 * 1000;
const MAX_EVENTS_PER_PROVIDER = 500;

interface ProviderUsage {
  /** Epoch ms of each successful generate call, oldest first. */
  calls: number[];
  /** Last rate-limit event reported by the CLI. */
  rateLimit?: { at: number; resetAt?: number };
}

type UsageFile = Partial<Record<AgentProvider, ProviderUsage>>;

export interface AgentUsageWindow {
  provider: AgentProvider;
  /** Successful calls from THIS app inside the current rolling window. */
  callsInWindow: number;
  /** When the oldest in-window call leaves the window (ms epoch), if any. */
  windowOpensAt?: number;
  /** Last CLI-reported rate limit, if it happened within the window. */
  rateLimitedAt?: number;
  /** CLI-reported reset moment when parseable (ms epoch). */
  rateLimitResetAt?: number;
}

function usageFilePath(): string {
  return join(app.getPath('userData'), 'agent-usage.json');
}

function loadFile(): UsageFile {
  try {
    return JSON.parse(readFileSync(usageFilePath(), 'utf8')) as UsageFile;
  } catch {
    return {};
  }
}

function saveFile(data: UsageFile): void {
  try {
    const filePath = usageFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(data), 'utf8');
  } catch {
    // Usage visibility is best-effort — never break generation over it.
  }
}

function pruned(entry: ProviderUsage | undefined, now: number): ProviderUsage {
  const calls = (entry?.calls ?? [])
    .filter((t) => Number.isFinite(t) && now - t < AGENT_USAGE_WINDOW_MS)
    .slice(-MAX_EVENTS_PER_PROVIDER);
  const rateLimit = entry?.rateLimit && now - entry.rateLimit.at < AGENT_USAGE_WINDOW_MS
    ? entry.rateLimit
    : undefined;
  return { calls, ...(rateLimit ? { rateLimit } : {}) };
}

/** Record one successful generate call. */
export function recordAgentCall(provider: AgentProvider, now: number = Date.now()): void {
  const data = loadFile();
  const entry = pruned(data[provider], now);
  entry.calls.push(now);
  data[provider] = entry;
  saveFile(data);
}

/**
 * Parse a reset moment out of a CLI rate-limit message. Known shapes:
 * "resets 3pm", "resets at 15:00", "try again in 2 hours 30 minutes",
 * "retry after 90 minutes". Returns epoch ms or undefined.
 */
export function parseRateLimitReset(message: string, now: number = Date.now()): number | undefined {
  const text = String(message || '');

  // Optional-both groups let "again in ..." match with nothing captured, so
  // hours(+minutes) and minutes-only are matched by separate mandatory forms.
  const hours = text.match(/\b(?:in|after)\s+(\d+)\s*h(?:ou)?rs?\b(?:\s*(?:and\s*)?(\d+)\s*m(?:in(?:ute)?s?)?\b)?/i);
  if (hours) {
    const ms = (Number(hours[1]) * 60 + Number(hours[2] || 0)) * 60 * 1000;
    if (ms > 0) return now + ms;
  }
  const minutesOnly = text.match(/\b(?:in|after)\s+(\d+)\s*m(?:in(?:ute)?s?)?\b/i);
  if (minutesOnly) {
    const ms = Number(minutesOnly[1]) * 60 * 1000;
    if (ms > 0) return now + ms;
  }

  const clock = text.match(/resets?\s*(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2] || 0);
    const meridiem = (clock[3] || '').toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) {
      const candidate = new Date(now);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate.getTime() <= now) candidate.setDate(candidate.getDate() + 1);
      return candidate.getTime();
    }
  }
  return undefined;
}

/** Record a CLI-reported rate limit (with best-effort reset parsing). */
export function recordAgentRateLimit(
  provider: AgentProvider,
  rawMessage: string,
  now: number = Date.now(),
): void {
  const data = loadFile();
  const entry = pruned(data[provider], now);
  const resetAt = parseRateLimitReset(rawMessage, now);
  entry.rateLimit = { at: now, ...(resetAt ? { resetAt } : {}) };
  data[provider] = entry;
  saveFile(data);
}

/** Current rolling-window snapshot for the UI. */
export function getAgentUsageWindow(
  provider: AgentProvider,
  now: number = Date.now(),
): AgentUsageWindow {
  const entry = pruned(loadFile()[provider], now);
  const oldest = entry.calls[0];
  return {
    provider,
    callsInWindow: entry.calls.length,
    ...(oldest ? { windowOpensAt: oldest + AGENT_USAGE_WINDOW_MS } : {}),
    ...(entry.rateLimit ? { rateLimitedAt: entry.rateLimit.at } : {}),
    ...(entry.rateLimit?.resetAt ? { rateLimitResetAt: entry.rateLimit.resetAt } : {}),
  };
}
