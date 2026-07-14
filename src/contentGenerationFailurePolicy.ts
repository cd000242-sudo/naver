function normalizeContentGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  if (typeof error === 'string') return error;
  return String((error as any)?.message || (error as any)?.error?.message || '');
}

export function isTerminalContentGenerationError(error: unknown): boolean {
  const errorCode = typeof error === 'object' && error !== null
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (['not_installed', 'not_logged_in', 'subscription_inactive', 'rate_limited'].includes(errorCode)) {
    return true;
  }

  const msg = normalizeContentGenerationErrorMessage(error).toLowerCase();
  if (!msg) return false;

  const terminalPatterns = [
    /사용자가.*취소|aborted|aborterror|원본 텍스트가 비어|크롤링 실패|에러 페이지/,
    /api\s*key|api키|401|403|unauthorized|forbidden|invalid[_\s-]?api[_\s-]?key|authentication|permission|권한|인증 실패|키가 유효하지|키가 설정/,
    /model.*not found|model.*does not exist|does not have access|모델을 찾을 수|모델에 접근|모델 없음/,
    /billing|payment|required|credit|balance|budget|insufficient[_\s-]?quota|hard[_\s-]?limit|크레딧|결제|잔액|예산|safety lock/,
    /limit:\s*0|free_tier|일일 무료|오늘의 무료|무료 할당량|사용량 초과|하드 한도|월간 결제|월간 할당량/,
    /content policy|policy violation|safety filter|콘텐츠 정책|정책 위반|안전 필터/,
  ];

  return terminalPatterns.some((pattern) => pattern.test(msg));
}

export function buildSameEngineRecoveryInstruction(provider: string, errorMessage: string): string {
  const compactError = errorMessage.replace(/\s+/g, ' ').slice(0, 220);
  return `
[SAME_ENGINE_RECOVERY]
- 이전 ${provider} 응답은 복구 가능한 생성 오류로 실패했습니다: ${compactError}
- 다른 AI 엔진으로 전환하지 않습니다. 반드시 현재 선택된 ${provider} 엔진 기준으로 다시 생성하세요.
- 사용자 프롬프트, 원본 자료, 제목/소제목/본문/표/FAQ 등 요구 구조를 빠짐없이 반영하세요.
- 출력은 순수 JSON 객체 하나만 반환하세요. 설명, 사과문, 마크다운 코드블록은 금지입니다.
`;
}
