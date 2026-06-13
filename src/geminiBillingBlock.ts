function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || '';
  if (typeof error === 'string') return error;
  return String((error as any)?.message || (error as any)?.error?.message || '');
}

function safeStringifyError(error: unknown): string {
  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error as object));
  } catch {
    return String(error);
  }
}

function buildGeminiBillingRaw(error: unknown): string {
  return `${normalizeErrorMessage(error)}\n${safeStringifyError(error)}`.toLowerCase();
}

export type GeminiBillingBlockKind = 'none' | 'prepay_depleted' | 'postpay_spend_cap' | 'billing_required';

export function isGeminiPrepaidCreditsDepletedError(error: unknown): boolean {
  const raw = buildGeminiBillingRaw(error);
  return raw.includes('prepayment credits are depleted') ||
    (raw.includes('prepayment') && raw.includes('depleted')) ||
    raw.includes('billing#prepay') ||
    (raw.includes('ai studio') && raw.includes('manage your project and billing'));
}

export function classifyGeminiBillingBlock(error: unknown): GeminiBillingBlockKind {
  const raw = buildGeminiBillingRaw(error);
  if (isGeminiPrepaidCreditsDepletedError(error)) return 'prepay_depleted';

  if (
    raw.includes('spend cap') ||
    raw.includes('monthly usage cap') ||
    raw.includes('monthly spend') ||
    raw.includes('tier spend cap') ||
    raw.includes('billing account tier') ||
    (raw.includes('service') && raw.includes('paused') && raw.includes('billing'))
  ) {
    return 'postpay_spend_cap';
  }

  if (
    raw.includes('set up billing') ||
    raw.includes('billing account') ||
    raw.includes('no available credits') ||
    raw.includes('payment required') ||
    raw.includes('paid plan') ||
    raw.includes('billing details')
  ) {
    return 'billing_required';
  }

  return 'none';
}

export function buildGeminiBillingBlockMessage(kind: GeminiBillingBlockKind, modelName: string): string {
  if (kind === 'prepay_depleted') {
    return (
      `💳 [${modelName}] Gemini 결제 상태 때문에 호출이 차단되었습니다.\n\n` +
      `📌 판별 결과: Google이 이 키/프로젝트를 선불 크레딧 소진 상태로 응답했습니다.\n` +
      `후불이라고 알고 있는 키라면, 실제로 이 API 키가 후불 결제 프로젝트에서 발급된 키인지 확인해야 합니다.\n\n` +
      `💡 해결 방법:\n` +
      `  1) Google AI Studio → Projects에서 이 API 키가 연결된 프로젝트를 확인하세요.\n` +
      `  2) 선불 프로젝트라면 크레딧 충전 또는 자동 충전을 켜세요.\n` +
      `  3) 후불 프로젝트를 쓰려면 후불 결제 계정에 연결된 프로젝트에서 새 API 키를 발급해 앱에 넣으세요.`
    );
  }

  if (kind === 'postpay_spend_cap') {
    return (
      `💳 [${modelName}] Gemini 후불 결제 한도 때문에 호출이 차단되었습니다.\n\n` +
      `📌 판별 결과: Google이 월간 사용 한도, 프로젝트 spend cap, 또는 billing account tier cap에 걸린 상태로 응답했습니다.\n` +
      `이 경우 RPM/TPM 대기 문제가 아니므로 1분을 기다려도 자동으로 풀리지 않습니다.\n\n` +
      `💡 해결 방법:\n` +
      `  1) AI Studio Billing/Spend 화면에서 프로젝트 월간 한도와 billing account tier cap을 확인하세요.\n` +
      `  2) 한도를 올리거나 다음 결제 주기 시작 후 다시 실행하세요.\n` +
      `  3) 급한 작업은 한도가 남아 있는 다른 결제 프로젝트의 키를 사용하세요.`
    );
  }

  return (
    `💳 [${modelName}] Gemini 결제 연결 상태 때문에 호출이 차단되었습니다.\n\n` +
    `📌 판별 결과: Google이 이 API 키/프로젝트를 사용 가능한 유료 결제 상태로 보지 않습니다.\n\n` +
    `💡 해결 방법:\n` +
    `  1) AI Studio Projects에서 이 키가 연결된 프로젝트의 Billing Tier/Status를 확인하세요.\n` +
    `  2) 결제 계정 연결, 선불 충전, 후불 프로젝트 키 여부를 확인한 뒤 다시 실행하세요.`
  );
}
