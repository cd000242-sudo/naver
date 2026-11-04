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
/**
 * The `result` text of a `claude --output-format json` error envelope, when stdout is one.
 * On a non-zero exit the envelope (e.g. "API Error: 529 Overloaded…") is the real cause;
 * without this the user only saw a truncated usage/cost blob.
 */
export function extractClaudeEnvelopeError(stdout: string): string | null {
  const raw = (stdout ?? '').trim();
  if (!raw.startsWith('{')) return null;
  try {
    const env = JSON.parse(raw) as Record<string, unknown>;
    if (env && env.is_error === true && typeof env.result === 'string' && env.result.trim()) {
      return env.result.trim();
    }
  } catch { /* not an envelope */ }
  return null;
}

/**
 * [2026-11-04] One log line of what the `claude -p --output-format json` envelope reports besides the text: turns,
 * wall / API time and token usage — the body call takes 150~204 s and nothing said where. '' when absent; never throws.
 */
export function describeClaudeEnvelopeStats(stdout: string): string {
  let env: Record<string, unknown>;
  try {
    const parsed = JSON.parse((stdout ?? '').trim()) as unknown;
    if (!parsed || typeof parsed !== 'object') return '';
    env = parsed as Record<string, unknown>;
  } catch {
    return '';
  }
  const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
  const seconds = (ms: number | undefined, label: string) => (ms === undefined ? [] : [`${label} ${(ms / 1000).toFixed(1)}초`]);
  const usage = (env.usage && typeof env.usage === 'object' ? env.usage : {}) as Record<string, unknown>;
  const tokens = ([['입력', 'input_tokens'], ['캐시생성', 'cache_creation_input_tokens'], ['캐시읽기', 'cache_read_input_tokens'], ['출력', 'output_tokens']] as const)
    .flatMap(([label, key]) => { const n = num(usage[key]); return n === undefined ? [] : [`${label} ${n.toLocaleString('en-US')}`]; });
  const turns = num(env.num_turns);
  const parts = [
    ...(turns === undefined ? [] : [`턴 ${turns}`]),
    ...seconds(num(env.duration_ms), '전체'),
    ...seconds(num(env.duration_api_ms), 'API'),
    ...tokens,
  ];
  if (parts.length === 0) return '';
  return tokens.length > 0 ? `${parts.join(' · ')} 토큰` : parts.join(' · ');
}

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

// [v2.11.145] parseGeminiEnvelope removed with the migration to agy (Antigravity CLI).
// gemini printed a { response, stats } envelope; agy has no envelope flag and writes the answer
// straight to stdout, so geminiRunner returns the trimmed stdout with no wrapper to unpack.

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

  // [2026-09-22] Upstream 529 is transient and must not read as "CLI broke" — it gets one retry.
  if (/\b529\b|overloaded|server-side issue/.test(hay)) {
    return 'server_overloaded';
  }

  // [2026-11-03] The CLI refuses a model this subscription cannot use (codex: "model is not supported when
  // using Codex with a ChatGPT account"; claude: "issue with the selected model ... may not exist").
  // Checked before the quota/auth words so a refusal is never read as a limit or a logout.
  if (
    /selected model|model_not_found|(?:unknown|invalid|unsupported) model|model\b[^\n]{0,80}\b(?:is not supported|not supported when|does not exist|may not exist|not found|is not available)|do(?:es)? not have access to (?:the )?model/.test(
      hay,
    )
  ) {
    return 'model_unavailable';
  }

  if (
    /usage limit|rate limit|rate.limited|quota|too many requests|\b429\b|weekly limit|5-?hour|limit reached|out of (credits|tokens)|insufficient_quota|resource_exhausted/.test(
      hay,
    )
  ) {
    return 'rate_limited';
  }

  if (
    /not logged in|unauthorized|\b401\b|authentication|auth(entication)? (failed|required)|please (run|sign in)|login required|run `?codex login`?|run `?claude login`?|no credentials|credential|unauthenticated|oauth/.test(
      hay,
    )
  ) {
    return 'not_logged_in';
  }

  return 'nonzero_exit';
}
