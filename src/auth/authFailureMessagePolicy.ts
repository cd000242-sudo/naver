type AuthenticationFailureResponse = {
  ok?: unknown;
  valid?: unknown;
  code?: unknown;
  error?: unknown;
  message?: unknown;
  notice?: unknown;
  serviceEnabled?: unknown;
};

const AUTHENTICATION_FAILURE_PATTERNS: readonly RegExp[] = [
  /invalid credentials?|unauthorized|forbidden|wrong password|incorrect password/i,
  /user (?:was )?not found|user does not exist|account (?:was )?not found/i,
  /license (?:is )?(?:invalid|expired|not found)|already logged in|device limit/i,
  /이미\s*사용(?:된|\s*중인)?\s*(?:라이선스\s*)?(?:코드|아이디|계정)/i,
  /(?:유효하지\s*않|잘못된|만료된).{0,20}(?:라이선스|라이센스|코드)/i,
  /(?:아이디|비밀번호|계정|사용자).{0,30}(?:올바르지|일치하지|잘못|없습니다|찾을 수 없|잠김|차단|거부)/i,
  /(?:올바르지|일치하지|잘못|찾을 수 없|잠김|차단|거부).{0,30}(?:아이디|비밀번호|계정|사용자)/i,
  /(?:인증|로그인|라이선스|세션|기기|접근|등록).{0,30}(?:실패|오류|거부|차단|만료|종료|초과|중복|유효하지|필요)/i,
  /(?:실패|오류|거부|차단|만료|종료|초과|중복|유효하지).{0,30}(?:인증|로그인|라이선스|세션|기기|접근|등록)/i,
  /(?:서버|네트워크|연결|응답).{0,30}(?:실패|오류|시간 초과|불안정|없습니다)/i,
];

function normalizeCandidate(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isAuthenticationFailureMessage(value: unknown): boolean {
  const message = normalizeCandidate(value);
  return message.length > 0 && AUTHENTICATION_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function resolveAuthenticationFailureMessage(
  response: AuthenticationFailureResponse | null | undefined,
  fallback: string,
): string {
  if (response && (
    response.serviceEnabled === false
    || String(response.code || '').trim().toUpperCase() === 'SERVICE_DISABLED'
    || String(response.error || '').trim().toUpperCase() === 'SERVICE_DISABLED'
  )) {
    return '현재 서비스 점검 중입니다. 잠시 후 다시 시도해주세요.';
  }

  const candidates = [response?.error, response?.message];
  const trustedMessage = candidates.find(isAuthenticationFailureMessage);
  return normalizeCandidate(trustedMessage) || fallback;
}
