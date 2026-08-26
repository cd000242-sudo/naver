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
/** 최근 몇 번의 한도 관측을 기억할지. 플랜·모델이 바뀌면 옛 관측은 틀린다. */
const OBSERVED_LIMIT_HISTORY = 5;

interface ProviderUsage {
  /** Epoch ms of each successful generate call, oldest first. */
  calls: number[];
  /** Last rate-limit event reported by the CLI. */
  rateLimit?: { at: number; resetAt?: number };
  /**
   * [2026-08-26] How many of OUR calls fit in a window before the CLI said "limit".
   * Recorded each time a rate limit is hit; kept across windows because it is the
   * only capacity evidence we ever get. Plans and models change, so we keep a few
   * recent observations rather than one all-time number.
   */
  observedLimits?: number[];
}

type UsageFile = Partial<Record<AgentProvider, ProviderUsage>>;

export interface AgentUsageWindow {
  provider: AgentProvider;
  /**
   * 이 앱이 한도에 막혔던 순간의 창 내 호출 수 중 가장 작은 값.
   * 한 번도 막힌 적 없으면 undefined — 그때는 남은 개수를 말할 수 없다.
   */
  observedLimit?: number;
  /** observedLimit이 있을 때만: 남은 것으로 보이는 글 수(0 이상). */
  estimatedRemaining?: number;
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
  // 관측 한도는 창이 지나도 지운다 — 그것만이 유일한 용량 근거다.
  const observedLimits = (entry?.observedLimits ?? [])
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(-OBSERVED_LIMIT_HISTORY);
  return {
    calls,
    ...(rateLimit ? { rateLimit } : {}),
    ...(observedLimits.length ? { observedLimits } : {}),
  };
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
  // [2026-08-26] 막힌 순간의 창 내 호출 수 = 이 플랜이 앱에 허용한 실측 용량.
  //   구독 CLI는 남은 양을 알려주는 명령이 없어(v2.11.135 확인) 이것이 유일한 근거다.
  if (entry.calls.length > 0) {
    entry.observedLimits = [...(entry.observedLimits ?? []), entry.calls.length]
      .slice(-OBSERVED_LIMIT_HISTORY);
  }
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
  // 관측값 중 최솟값을 쓴다 — 가장 보수적인 추정이라 "된다고 했는데 막혔다"를 줄인다.
  const observedLimit = entry.observedLimits?.length
    ? Math.min(...entry.observedLimits)
    : undefined;
  const estimatedRemaining = observedLimit !== undefined
    ? Math.max(0, observedLimit - entry.calls.length)
    : undefined;
  return {
    provider,
    callsInWindow: entry.calls.length,
    ...(observedLimit !== undefined ? { observedLimit } : {}),
    ...(estimatedRemaining !== undefined ? { estimatedRemaining } : {}),
    ...(oldest ? { windowOpensAt: oldest + AGENT_USAGE_WINDOW_MS } : {}),
    ...(entry.rateLimit ? { rateLimitedAt: entry.rateLimit.at } : {}),
    ...(entry.rateLimit?.resetAt ? { rateLimitResetAt: entry.rateLimit.resetAt } : {}),
  };
}
