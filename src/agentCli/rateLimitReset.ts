// src/agentCli/rateLimitReset.ts
// Reads the reset moment out of a Codex usage-limit message and phrases the on-screen notice.
//   "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits
//    or try again at Nov 4th, 2026 3:42 PM."   (the apostrophe may be ' or the curly U+2019)
// The CLI prints local time. Pure module (no imports besides a type), shared by usageTracker and failureMessage.

import type { AgentProvider } from './types.js';

const MONTHS: Readonly<Record<string, number>> = Object.freeze({
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
});

const ABSOLUTE_RESET = /(?:try again|retry|resets?)\s+(?:at|on|after)\s+([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i;

/** Epoch ms of an absolute "Nov 4th, 2026 3:42 PM" style reset, or undefined when the text has none. */
export function parseAbsoluteResetAt(message: string): number | undefined {
  const match = String(message ?? '').match(ABSOLUTE_RESET);
  if (!match) return undefined;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (month === undefined) return undefined;
  let hour = Number(match[4]);
  const meridiem = (match[6] || '').toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59) return undefined;
  const at = new Date(Number(match[3]), month, Number(match[2]), hour, minute, 0, 0).getTime();
  return Number.isNaN(at) ? undefined : at;
}

function providerName(provider: AgentProvider): string {
  return provider === 'codex' ? 'Codex' : provider === 'gemini' ? 'Gemini CLI' : 'Claude Code';
}

/** "Codex 구독 한도 소진 — 11월 4일 15시 42분 이후 다시 시도" */
export function formatRateLimitNotice(provider: AgentProvider, resetAt: number): string {
  const d = new Date(resetAt);
  return `${providerName(provider)} 구독 한도 소진 — ${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${d.getMinutes()}분 이후 다시 시도`;
}

/** The notice when the raw text carries a reset moment, else ''. */
export function rateLimitNoticeFrom(provider: AgentProvider, rawText: unknown): string {
  const at = parseAbsoluteResetAt(String(rawText ?? ''));
  return at === undefined ? '' : formatRateLimitNotice(provider, at);
}
