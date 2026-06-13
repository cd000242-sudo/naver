export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  return String(error || '');
}

export function safeStringifyError(error: unknown): string {
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return '';
  }
}

export function getErrorDiagnosticText(error: unknown, message = ''): string {
  const err = error as any;
  return [
    message,
    normalizeErrorMessage(error),
    err?.name,
    err?.code,
    err?.type,
    err?.status,
    err?.cause?.name,
    err?.cause?.code,
    err?.cause?.message,
    safeStringifyError(error),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function formatWaitDurationKo(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, Math.floor(ms)) : 0;
  if (safeMs < 60_000) return '1분 미만';
  return `${Math.ceil(safeMs / 60_000)}분`;
}

export function formatWaitBudgetKo(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(60_000, Math.floor(ms)) : 60_000;
  return `${Math.ceil(safeMs / 60_000)}분`;
}

export function classifyOpenAiDiagnosticError(error: unknown): string {
  const status = (error as any)?.status || (error as any)?.response?.status;
  const code = String((error as any)?.code || (error as any)?.error?.code || '').toLowerCase();
  const type = String((error as any)?.type || (error as any)?.error?.type || '').toLowerCase();
  const message = normalizeErrorMessage(error).toLowerCase();
  const diagnostic = getErrorDiagnosticText(error, message);

  if (status === 401 || message.includes('invalid api key') || message.includes('incorrect api key')) return 'AUTH_INVALID_KEY';
  if (status === 403) return 'PROJECT_OR_PERMISSION_FORBIDDEN';
  if (status === 404 || code === 'model_not_found' || message.includes('model') && message.includes('not found')) return 'MODEL_NOT_FOUND_OR_NO_ACCESS';
  if (status === 429 || code.includes('rate') || type.includes('rate') || message.includes('rate limit') || message.includes('too many requests')) return 'RATE_LIMIT';
  if (code.includes('insufficient_quota') || message.includes('billing') || message.includes('credit') || message.includes('payment')) return 'BILLING_OR_CREDIT';
  if (status >= 500) return 'OPENAI_SERVER_ERROR';
  if (diagnostic.includes('timeout') || diagnostic.includes('시간 초과')) return 'REQUEST_TIMEOUT';
  if (diagnostic.includes('enotfound') || diagnostic.includes('eai_again') || diagnostic.includes('dns')) return 'DNS_LOOKUP_FAILED';
  if (diagnostic.includes('tls') || diagnostic.includes('certificate') || diagnostic.includes('cert')) return 'TLS_OR_CERTIFICATE_FAILED';
  if (diagnostic.includes('socket') || diagnostic.includes('econnreset') || diagnostic.includes('econnrefused') || diagnostic.includes('etimedout')) return 'SOCKET_CONNECTION_FAILED';
  if (diagnostic.includes('fetch failed') || diagnostic.includes('network') || diagnostic.includes('connection error')) return 'NETWORK_FETCH_FAILED';
  if (diagnostic.includes('abort') || diagnostic.includes('ecanceled')) return 'REQUEST_ABORTED';
  return 'UNKNOWN';
}

export function readHeaderValue(headers: any, name: string): string {
  try {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || headers.get(name.toLowerCase()) || '';
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lower) return String(value);
    }
  } catch {
    // Ignore malformed headers.
  }
  return '';
}

export function isOpenAiConnectionIssue(error: unknown, message = ''): boolean {
  const diagnostic = getErrorDiagnosticText(error, message);
  if (diagnostic.includes('apiuseraborterror') || diagnostic.includes('사용자가 콘텐츠 생성을 취소')) {
    return false;
  }

  return diagnostic.includes('apiconnectionerror') ||
    diagnostic.includes('apiconnectiontimeouterror') ||
    diagnostic.includes('connection error') ||
    diagnostic.includes('api connection') ||
    diagnostic.includes('failed to connect') ||
    diagnostic.includes('fetch failed') ||
    diagnostic.includes('network') ||
    diagnostic.includes('socket') ||
    diagnostic.includes('tls') ||
    diagnostic.includes('econnreset') ||
    diagnostic.includes('econnrefused') ||
    diagnostic.includes('etimedout') ||
    diagnostic.includes('enotfound') ||
    diagnostic.includes('eai_again') ||
    diagnostic.includes('ecanceled');
}
