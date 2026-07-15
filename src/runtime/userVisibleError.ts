const DEFAULT_USER_ERROR = '작업 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
const MAX_USER_ERROR_LENGTH = 240;

const ANSI_ESCAPE_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const CREDENTIAL_PATTERN = /\b(api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|id[\s_-]*token|authorization|bearer|token|password|secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s|,;]+)/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*\b/g;
const URL_USERINFO_PATTERN = /((?:https?|socks4a?|socks5h?):\/\/)[^\s\/@:]+(?::[^\s\/@]*)?@/gi;
const WINDOWS_PATH_PATTERN = /(?:\b[A-Za-z]:\\|\\\\)(?:[^\\\r\n:*?"<>|]+\\)+[^,;|)"\r\n]*/g;
const UNC_PATH_PATTERN = /\\\\[^\s\\/]+\\[^\r\n|]+/g;
const POSIX_PRIVATE_PATH_PATTERN = /\/(?:Users|home|root|tmp|private\/var|var\/folders)\/[^\s,;|)"']+/g;

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return String(error ?? '');
}

function redactUrlPrivateSuffixes(message: string): string {
  return message.replace(
    /(?:https?|socks4a?|socks5h?):\/\/[^\s?#)]+(?:\?[^\s#)]*)?(?:#[^\s)]*)?/gi,
    (url) => {
      const privateSuffixIndex = url.search(/[?#]/);
      return privateSuffixIndex >= 0 ? url.slice(0, privateSuffixIndex) : url;
    },
  );
}

/**
 * Produces a bounded renderer-safe error summary. Raw errors remain available
 * in the main-process log, while credentials, local paths, and browser-driver
 * call logs never cross the IPC boundary.
 */
export function sanitizeUserVisibleError(error: unknown): string {
  let message = readErrorMessage(error).replace(ANSI_ESCAPE_PATTERN, '').trim();
  if (!message) return DEFAULT_USER_ERROR;

  const callLogIndex = message.search(/\bCall log:/i);
  if (callLogIndex >= 0) {
    const beforeCallLog = message.slice(0, callLogIndex).trim();
    const actionableCode = message.match(
      /\b(?:net::)?ERR_[A-Z0-9_]+\b|\bE(?:CONNRESET|CONNREFUSED|HOSTUNREACH|TIMEDOUT)\b/i,
    )?.[0];
    message = actionableCode && !beforeCallLog.includes(actionableCode)
      ? `${beforeCallLog} ${actionableCode}`.trim()
      : beforeCallLog;
  }

  message = message
    .replace(/\b(?:page|frame)\.(?:goto|click|waitFor\w*):\s*/gi, '')
    .replace(URL_USERINFO_PATTERN, '$1[redacted]@')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(JWT_PATTERN, '[redacted token]')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted key]')
    .replace(/sk-(?:ant-)?[A-Za-z0-9_-]{20,}/g, '[redacted key]')
    .replace(CREDENTIAL_PATTERN, (_match, label: string) => `${label}=[redacted]`)
    .replace(/file:\/\/\/[^\s)]+/gi, '[internal path]')
    .replace(WINDOWS_PATH_PATTERN, '[internal path]')
    .replace(UNC_PATH_PATTERN, '[internal path]')
    .replace(POSIX_PRIVATE_PATH_PATTERN, '[internal path]');

  message = redactUrlPrivateSuffixes(message)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[|,-]\s*$/, '')
    .trim();

  if (!message) return DEFAULT_USER_ERROR;
  if (message.length <= MAX_USER_ERROR_LENGTH) return message;
  return `${message.slice(0, MAX_USER_ERROR_LENGTH - 3).trimEnd()}...`;
}

function sanitizeFailureField(value: unknown): unknown {
  if (typeof value === 'string' || value instanceof Error) {
    return sanitizeUserVisibleError(value);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string') {
      return { ...record, message: sanitizeUserVisibleError(record.message) };
    }
  }
  return value;
}

/** Sanitizes only renderer-facing failure payloads and preserves successful data verbatim. */
export function sanitizeRendererIpcResult<T>(result: T): T {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const record = result as Record<string, unknown>;
  const explicitlySuccessful = record.success === true || record.ok === true;
  const failureLike = record.success === false
    || record.ok === false
    || (!explicitlySuccessful && 'error' in record);
  if (!failureLike) return result;

  const next: Record<string, unknown> = { ...record };
  for (const key of ['message', 'error', 'reason', 'details']) {
    if (key in next) next[key] = sanitizeFailureField(next[key]);
  }
  return next as T;
}
