// Pure parsing/classification helpers for the agent CLI service.
// Kept side-effect free so they are unit-testable without spawning a process.

import { AgentCliError, type AgentErrorCode, type AgentProvider } from './types.js';

/**
 * Best-effort JSON extraction from a model's final message.
 * Tries a direct parse first, then falls back to the outermost {...} / [...] fence
 * (covers cases where the CLI wraps JSON in prose or code fences).
 * Returns undefined when nothing parseable is found.
 */
export function tryExtractJson(text: string): unknown | undefined {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fenced extraction
  }

  const candidates: Array<[number, number]> = [];
  const objStart = trimmed.indexOf('{');
  const objEnd = trimmed.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) candidates.push([objStart, objEnd]);
  const arrStart = trimmed.indexOf('[');
  const arrEnd = trimmed.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) candidates.push([arrStart, arrEnd]);

  // Prefer whichever fence starts earliest (the document's top-level structure).
  candidates.sort((a, b) => a[0] - b[0]);
  for (const [start, end] of candidates) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

/**
 * Parse the envelope printed by `claude -p --output-format json`.
 * Shape: { type, subtype, result, is_error, ... }. Returns the `result` text.
 * Throws AgentCliError when the envelope reports an error or lacks a result.
 */
export function parseClaudeEnvelope(stdout: string): string {
  const raw = (stdout ?? '').trim();
  if (!raw) {
    throw new AgentCliError('empty_output', 'claude', 'claude가 빈 응답을 반환했습니다.');
  }

  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new AgentCliError(
      'bad_json',
      'claude',
      'claude 출력(JSON 봉투)을 파싱하지 못했습니다.',
      raw.slice(0, 500),
    );
  }

  if (obj && typeof obj === 'object') {
    const env = obj as Record<string, unknown>;
    if (env.is_error === true) {
      throw new AgentCliError(
        classifyExit('claude', String(env.result ?? ''), raw),
        'claude',
        typeof env.result === 'string' && env.result
          ? `claude 오류: ${env.result}`
          : 'claude가 오류를 반환했습니다.',
      );
    }
    if (typeof env.result === 'string' && env.result.trim()) {
      return env.result;
    }
  }

  throw new AgentCliError('empty_output', 'claude', 'claude 응답에 result가 없습니다.', raw.slice(0, 500));
}

/** True only for wording that means the account has no active Claude Code entitlement. */
export function isSubscriptionInactiveMessage(text: string): boolean {
  const hay = String(text ?? '').toLowerCase();
  return [
    /(?:claude\s+)?subscription.{0,50}(?:expired|inactive|ended|cancelled|canceled|lapsed)/,
    /(?:expired|inactive|ended|cancelled|canceled|lapsed).{0,50}(?:claude\s+)?subscription/,
    /(?:requires?|need).{0,40}(?:an?\s+)?active.{0,25}(?:subscription|pro|max|plan)/,
    /(?:no|without|does not have).{0,30}(?:active|paid).{0,30}(?:subscription|plan|entitlement)/,
    /(?:upgrade|renew).{0,50}(?:subscription|plan).{0,30}(?:continue|use claude code)/,
    /(?:upgrade|renew).{0,40}(?:claude\s+)?(?:pro|max).{0,30}(?:continue|use claude code)/,
    /not (?:eligible|entitled) to (?:access|use) claude code/,
    /구독.{0,20}(?:만료|종료|비활성|해지)/,
    /(?:만료|종료|비활성|해지).{0,20}구독/,
    /활성.{0,20}(?:구독|요금제|플랜).{0,20}필요/,
  ].some((pattern) => pattern.test(hay));
}

/**
 * Classify a non-zero CLI exit into a stable error code by scanning stderr/stdout.
 * Conservative: only flags rate-limit / auth when the wording is explicit, else nonzero_exit.
 */
export function classifyExit(
  _provider: AgentProvider,
  stderr: string,
  stdout = '',
): AgentErrorCode {
  const hay = `${stderr}\n${stdout}`.toLowerCase();

  // Legacy Windows releases surfaced missing .cmd shims through cmd.exe text.
  if (/is not recognized as an internal or external command|command not found|no such file or directory/.test(hay)) {
    return 'not_installed';
  }

  if (isSubscriptionInactiveMessage(hay)) {
    return 'subscription_inactive';
  }

  if (
    /usage limit|rate limit|rate.limited|quota|too many requests|\b429\b|weekly limit|5-?hour|limit reached|out of (credits|tokens)|insufficient_quota/.test(
      hay,
    )
  ) {
    return 'rate_limited';
  }

  if (
    /not logged in|unauthorized|\b401\b|authentication|auth(entication)? (failed|required)|please (run|sign in)|login required|run `?codex login`?|run `?claude login`?|no credentials/.test(
      hay,
    )
  ) {
    return 'not_logged_in';
  }

  return 'nonzero_exit';
}
