/**
 * Bot-detection backoff registry (in-memory, per app session).
 *
 * When 네이버 가 특정 계정에 대해 추가 인증(new_environment / suspicious_login /
 * too_many_attempts / captcha)을 요구하면, 그 계정을 일정 시간 backoff 시킨다.
 * - 자동 발행 흐름은 backoff 중인 계정을 건너뛰고 다음 계정으로 이동.
 * - 앱 재시작 시 리셋(메모리 한정) — 사용자가 다음 세션에서 다시 시도 가능.
 *
 * 부수 효과: 봇 감지 점수가 자연 감소할 시간을 벌어줌.
 */

export interface BotBackoffRecord {
  accountId: string;
  reason: string;
  startedAt: number;
  expiresAt: number;
}

const backoffMap = new Map<string, BotBackoffRecord>();

const DEFAULT_HOURS_BY_REASON: Record<string, number> = {
  too_many_attempts: 12,    // 시도 초과 — 가장 길게
  suspicious_login: 8,       // 의심 로그인 — 길게
  new_environment: 6,        // 새 기기 — 중간
  captcha: 4,                // 캡차 — 짧게
  default: 6,
};

function backoffHoursFor(reason: string): number {
  return DEFAULT_HOURS_BY_REASON[reason] ?? DEFAULT_HOURS_BY_REASON.default;
}

export function recordBotBackoff(
  accountId: string,
  reason: string,
  hoursOverride?: number,
): BotBackoffRecord {
  const hours = hoursOverride ?? backoffHoursFor(reason);
  const now = Date.now();
  const record: BotBackoffRecord = {
    accountId,
    reason,
    startedAt: now,
    expiresAt: now + hours * 60 * 60 * 1000,
  };
  backoffMap.set(accountId, record);
  console.log(`[BotBackoff] account (${reason}) backed off for ${hours}h until ${new Date(record.expiresAt).toISOString()}`);
  return record;
}

export function getBotBackoff(accountId: string): BotBackoffRecord | null {
  const rec = backoffMap.get(accountId);
  if (!rec) return null;
  if (rec.expiresAt < Date.now()) {
    backoffMap.delete(accountId);
    return null;
  }
  return rec;
}

export function isAccountBackedOff(accountId: string): boolean {
  return getBotBackoff(accountId) !== null;
}

export function clearBotBackoff(accountId: string): void {
  backoffMap.delete(accountId);
}

export function listActiveBackoffs(): BotBackoffRecord[] {
  const now = Date.now();
  const active: BotBackoffRecord[] = [];
  for (const [id, rec] of backoffMap.entries()) {
    if (rec.expiresAt < now) {
      backoffMap.delete(id);
      continue;
    }
    active.push(rec);
  }
  return active;
}

/**
 * (A) 계정별 로그인 시각 시차 helper.
 * 동일 PC + 동일 시각에 여러 계정이 줄줄이 로그인하면 네이버가 의심한다.
 * accountIndex(0-based)에 비례해 base + randomJitter ms 의 시차를 만든다.
 */
export function computeLoginStaggerDelayMs(accountIndex: number): number {
  if (accountIndex <= 0) return 0; // 첫 계정은 즉시
  // 3분 ~ 10분 사이 랜덤 + 계정마다 누적되는 base
  const baseMs = accountIndex * 3 * 60 * 1000; // 3분 단위 누적
  const jitterMs = Math.floor(Math.random() * (7 * 60 * 1000)); // 0~7분 랜덤
  return baseMs + jitterMs;
}

/**
 * (B) 로그인 직후 자연스러운 사람 패턴 대기. 7~13초 사이 랜덤.
 */
export function computePostLoginHumanDelayMs(): number {
  return 7000 + Math.floor(Math.random() * 6000); // 7000 ~ 12999 ms
}
