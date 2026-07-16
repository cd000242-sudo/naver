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

export type OpenAiFailureKind =
  | 'AUTH_INVALID_KEY'
  | 'PROJECT_OR_PERMISSION_FORBIDDEN'
  | 'MODEL_NOT_FOUND_OR_NO_ACCESS'
  | 'BILLING_OR_CREDIT'
  | 'RATE_LIMIT'
  | 'INVALID_REQUEST'
  | 'OPENAI_SERVER_ERROR'
  | 'REQUEST_TIMEOUT'
  | 'REQUEST_ABORTED'
  | 'DNS_LOOKUP_FAILED'
  | 'TLS_OR_CERTIFICATE_FAILED'
  | 'SOCKET_CONNECTION_FAILED'
  | 'NETWORK_FETCH_FAILED'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN';

export interface OpenAiFailureClassification {
  kind: OpenAiFailureKind;
  status?: number;
  code: string;
  type: string;
  requestId: string;
  providerMessage: string;
  requestMayHaveReachedProvider: boolean;
}

function normalizeHttpStatus(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : undefined;
}

export function sanitizeOpenAiProviderMessage(error: unknown): string {
  const structuredMessage = typeof (error as any)?.message === 'string'
    ? String((error as any).message)
    : normalizeErrorMessage(error);
  return structuredMessage
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, '$1[REDACTED_CREDENTIALS]@')
    .replace(/([?&](?:api[-_]?key|access[-_]?token|auth[-_]?token|token|key)=)[^&#\s]+/gi, '$1[REDACTED_QUERY_SECRET]')
    .replace(/\b(?:OPENAI_API_KEY|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, 'OPENAI_API_KEY=[REDACTED_API_KEY]')
    .replace(/\bauthorization\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi, 'authorization: [REDACTED_AUTH]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_API_KEY]')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

export function sanitizeOpenAiUrlForLog(value: unknown): string {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '[invalid OpenAI base URL]';
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return '[invalid OpenAI base URL]';
  }
}

function sanitizeDiagnosticField(value: unknown): string {
  return String(value || '')
    .replace(/[^A-Za-z0-9._:-]/g, '_')
    .slice(0, 128);
}

export function classifyOpenAiFailure(error: unknown): OpenAiFailureClassification {
  const err = error as any;
  const status = normalizeHttpStatus(err?.status ?? err?.response?.status);
  const code = sanitizeDiagnosticField(err?.code || err?.error?.code).toLowerCase();
  const type = sanitizeDiagnosticField(err?.type || err?.error?.type).toLowerCase();
  const providerMessage = sanitizeOpenAiProviderMessage(error);
  const message = providerMessage.toLowerCase();
  const diagnostic = getErrorDiagnosticText(error, providerMessage);
  const headers = err?.headers || err?.response?.headers;
  const requestId = sanitizeDiagnosticField(
    readHeaderValue(headers, 'x-request-id') || readHeaderValue(headers, 'openai-request-id'),
  );

  const result = (
    kind: OpenAiFailureKind,
    requestMayHaveReachedProvider = status !== undefined,
  ): OpenAiFailureClassification => ({
    kind,
    status,
    code,
    type,
    requestId,
    providerMessage,
    requestMayHaveReachedProvider,
  });

  const isBilling =
    code.includes('insufficient_quota') ||
    code.includes('billing_hard_limit') ||
    type.includes('insufficient_quota') ||
    message.includes('billing hard limit') ||
    message.includes('payment required') ||
    message.includes('credit balance');

  // When OpenAI returned HTTP metadata it is authoritative. Provider/proxy text
  // must not turn a 5xx into a local network, model, or 429 diagnosis.
  if (status !== undefined) {
    if (status === 401) return result('AUTH_INVALID_KEY');
    if (status === 402) return result('BILLING_OR_CREDIT');
    if (status === 403) return result('PROJECT_OR_PERMISSION_FORBIDDEN');
    if (status === 404) return result('MODEL_NOT_FOUND_OR_NO_ACCESS');
    if (status === 408) return result('REQUEST_TIMEOUT', true);
    if (status === 429) return result(isBilling ? 'BILLING_OR_CREDIT' : 'RATE_LIMIT');
    if (status >= 500) return result('OPENAI_SERVER_ERROR', true);
    if (status >= 400) return result('INVALID_REQUEST');
  }

  if (code === 'invalid_api_key' || message.includes('incorrect api key') || message.includes('invalid api key')) {
    return result('AUTH_INVALID_KEY', false);
  }
  if (isBilling) return result('BILLING_OR_CREDIT', false);
  if (code === 'model_not_found' || (message.includes('model') && (message.includes('not found') || message.includes('does not exist')))) {
    return result('MODEL_NOT_FOUND_OR_NO_ACCESS', false);
  }
  if (code.includes('rate_limit') || type.includes('rate_limit') || message.includes('rate limit') || message.includes('too many requests')) {
    return result('RATE_LIMIT', false);
  }
  if (message.includes('빈 응답') || message.includes('empty response') || code === 'empty_response') {
    return result('EMPTY_RESPONSE', true);
  }

  // Transport-stage causes are checked before generic timeout/abort words.
  if (diagnostic.includes('enotfound') || diagnostic.includes('eai_again') || diagnostic.includes('dns')) {
    return result('DNS_LOOKUP_FAILED', false);
  }
  if (diagnostic.includes('tls') || diagnostic.includes('certificate') || diagnostic.includes('cert_')) {
    return result('TLS_OR_CERTIFICATE_FAILED', false);
  }
  if (diagnostic.includes('und_err_connect_timeout') || diagnostic.includes('econnrefused')) {
    return result('SOCKET_CONNECTION_FAILED', false);
  }
  if (diagnostic.includes('econnreset') || diagnostic.includes('socket')) {
    return result('SOCKET_CONNECTION_FAILED', true);
  }
  if (diagnostic.includes('timeout') || diagnostic.includes('시간 초과') || diagnostic.includes('etimedout')) {
    return result('REQUEST_TIMEOUT', true);
  }
  if (diagnostic.includes('apiuseraborterror') || diagnostic.includes('사용자가 콘텐츠 생성을 취소') || diagnostic.includes('user aborted')) {
    return result('REQUEST_ABORTED', true);
  }
  if (diagnostic.includes('apiconnectionerror') || diagnostic.includes('connection error') || diagnostic.includes('fetch failed') || diagnostic.includes('network')) {
    return result('NETWORK_FETCH_FAILED', true);
  }
  if (diagnostic.includes('abort') || diagnostic.includes('ecanceled')) return result('REQUEST_ABORTED', true);
  return result('UNKNOWN', true);
}

function getOpenAiFailureGuidance(kind: OpenAiFailureKind): { reason: string; solution: string } {
  switch (kind) {
    case 'AUTH_INVALID_KEY':
      return {
        reason: 'OpenAI가 API 키 인증을 거부했습니다.',
        solution: '환경설정에서 OpenAI API 키를 다시 저장하고, 키가 삭제·만료되지 않았는지 확인하세요.',
      };
    case 'PROJECT_OR_PERMISSION_FORBIDDEN':
      return {
        reason: 'API 키는 도달했지만 현재 프로젝트·조직·모델 권한으로 요청이 허용되지 않았습니다.',
        solution: 'OpenAI 프로젝트의 모델 접근 권한, 조직/프로젝트 선택, API 키 권한을 확인하세요. 403을 잘못된 키로 단정하지 않습니다.',
      };
    case 'MODEL_NOT_FOUND_OR_NO_ACCESS':
      return {
        reason: '선택한 모델이 현재 API 프로젝트에 없거나 이 프로젝트에서 접근할 수 없습니다.',
        solution: 'OpenAI 프로젝트의 모델 접근 목록과 앱의 선택 모델을 확인하세요. 앱은 다른 유료 모델로 자동 전환하지 않습니다.',
      };
    case 'BILLING_OR_CREDIT':
      return {
        reason: 'OpenAI 결제 한도·크레딧·예산 제한으로 요청이 거부됐습니다.',
        solution: 'OpenAI Platform의 Billing과 프로젝트 예산/사용 한도를 확인하세요.',
      };
    case 'RATE_LIMIT':
      return {
        reason: '현재 프로젝트의 요청 또는 토큰 속도 제한에 걸렸습니다.',
        solution: '표시된 대기 시간이 지난 뒤 같은 모델로 다시 실행하거나 프로젝트의 RPM/TPM 한도를 확인하세요.',
      };
    case 'INVALID_REQUEST':
      return {
        reason: 'OpenAI가 요청 형식이나 파라미터를 유효하지 않은 요청으로 거부했습니다.',
        solution: '아래 HTTP 상태·원본 오류를 확인하세요. 최신 앱에서도 반복되면 해당 진단 전체를 전달해 주세요.',
      };
    case 'OPENAI_SERVER_ERROR':
      return {
        reason: 'PC 네트워크가 아니라 OpenAI 서버가 5xx 오류를 반환했습니다.',
        solution: 'OpenAI 상태 페이지를 확인하고 잠시 후 수동으로 다시 실행하세요. 중복 과금 위험 때문에 앱은 자동 재호출하지 않았습니다.',
      };
    case 'REQUEST_TIMEOUT':
      return {
        reason: '제한 시간 안에 OpenAI 응답이 끝나지 않았습니다. 요청이 서버에 도달했을 가능성은 있습니다.',
        solution: '네트워크 상태와 OpenAI 상태를 확인한 뒤 수동으로 다시 실행하세요. 앱은 모호한 timeout을 자동 재호출하지 않습니다.',
      };
    case 'REQUEST_ABORTED':
      return {
        reason: '요청이 사용자 취소 또는 상위 작업 취소 신호로 중단됐습니다.',
        solution: '취소하지 않았다면 작업 제한 시간과 앱 로그의 직전 취소 사유를 확인하세요.',
      };
    case 'DNS_LOOKUP_FAILED':
      return {
        reason: 'OpenAI 도메인의 DNS 주소를 찾지 못해 HTTP 응답을 받기 전에 연결이 실패했습니다.',
        solution: 'DNS, 인터넷 연결, VPN/프록시와 방화벽에서 api.openai.com 접근을 확인하세요.',
      };
    case 'TLS_OR_CERTIFICATE_FAILED':
      return {
        reason: 'TLS/인증서 연결 단계에서 HTTP 응답을 받기 전에 실패했습니다.',
        solution: '보안 프로그램의 HTTPS 검사, 시스템 시간, 프록시/VPN과 인증서 설정을 확인하세요.',
      };
    case 'SOCKET_CONNECTION_FAILED':
      return {
        reason: '소켓 연결이 끊기거나 거부되어 HTTP 응답을 받기 전에 실패했습니다.',
        solution: '인터넷 연결, VPN/프록시, 방화벽과 api.openai.com 접속 경로를 확인하세요.',
      };
    case 'NETWORK_FETCH_FAILED':
      return {
        reason: 'OpenAI의 HTTP 응답을 받기 전에 네트워크 요청이 실패했습니다.',
        solution: '인터넷 연결, VPN/프록시, 방화벽과 api.openai.com 접속 경로를 확인하세요.',
      };
    case 'EMPTY_RESPONSE':
      return {
        reason: 'OpenAI 요청은 끝났지만 사용할 수 있는 본문이 비어 있었습니다.',
        solution: '원본 오류와 OpenAI 사용량을 확인한 뒤 수동으로 다시 실행하세요. 앱은 빈 응답을 자동 재호출하지 않습니다.',
      };
    default:
      return {
        reason: 'HTTP 상태와 오류 코드만으로 원인을 확정할 수 없는 OpenAI 오류입니다.',
        solution: '아래 원인 코드·HTTP 상태·원본 오류를 그대로 전달해 주세요. 앱은 다른 모델이나 새 유료 요청으로 자동 전환하지 않습니다.',
      };
  }
}

export function buildOpenAiGenerationFailureMessage(
  error: unknown,
  modelName: string,
  policy: { requestCount?: number; automaticRetryCount?: number } = {},
): string {
  const failure = classifyOpenAiFailure(error);
  const requestCount = Math.max(1, Math.floor(policy.requestCount ?? 1));
  const automaticRetryCount = Math.max(0, Math.floor(policy.automaticRetryCount ?? 0));
  const guidance = getOpenAiFailureGuidance(failure.kind);
  const responseParts = [
    failure.status ? `HTTP ${failure.status}` : 'HTTP 응답 없음',
    failure.code ? `code=${failure.code}` : '',
    failure.type ? `type=${failure.type}` : '',
    failure.requestId ? `request-id=${failure.requestId}` : '',
  ].filter(Boolean);
  const definitelyPreResponse = !failure.requestMayHaveReachedProvider && failure.status === undefined;
  const providerRejectedBeforeGeneration =
    (failure.status !== undefined && failure.status >= 400 && failure.status < 500) ||
    [
      'AUTH_INVALID_KEY',
      'PROJECT_OR_PERMISSION_FORBIDDEN',
      'MODEL_NOT_FOUND_OR_NO_ACCESS',
      'BILLING_OR_CREDIT',
      'RATE_LIMIT',
      'INVALID_REQUEST',
    ].includes(failure.kind);
  const billingNote = definitelyPreResponse
    ? 'OpenAI의 HTTP 응답을 받기 전 실패라 일반적으로 토큰 사용량이 기록되지 않지만, 최종 사용량은 OpenAI 대시보드가 기준입니다.'
    : providerRejectedBeforeGeneration
      ? 'OpenAI가 생성 전에 오류로 거절한 요청은 일반적으로 생성 토큰이 기록되지 않지만, 최종 사용량은 OpenAI 대시보드가 기준입니다.'
    : failure.requestMayHaveReachedProvider
      ? '요청이 OpenAI 서버에 도달했거나 처리됐을 수 있어 앱이 과금 여부를 확정하거나 환불할 수 없습니다. 중복 요청 방지를 위해 자동 재호출하지 않았습니다.'
      : '앱에서 새 유료 요청을 자동으로 만들지 않았습니다. 최종 사용량은 OpenAI 대시보드가 기준입니다.';

  return [
    `[OPENAI_REQUEST_FAILED:${failure.kind}]`,
    `OpenAI 요청 실패 (모델: ${modelName}, 요청 ${requestCount}회, 자동 재호출 ${automaticRetryCount}회).`,
    `📌 정확한 원인: ${guidance.reason}`,
    `🔎 원인 코드: ${failure.kind} · ${responseParts.join(' · ')}`,
    `💳 과금 안내: ${billingNote}`,
    `💡 해결 방법: ${guidance.solution}`,
    `원본 오류: ${failure.providerMessage || '오류 메시지 없음'}`,
  ].join('\n\n');
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
  return classifyOpenAiFailure(error).kind;
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
  const classification = classifyOpenAiFailure(
    message && !normalizeErrorMessage(error) ? new Error(message) : error,
  );
  return [
    'REQUEST_TIMEOUT',
    'DNS_LOOKUP_FAILED',
    'TLS_OR_CERTIFICATE_FAILED',
    'SOCKET_CONNECTION_FAILED',
    'NETWORK_FETCH_FAILED',
  ].includes(classification.kind);
}
