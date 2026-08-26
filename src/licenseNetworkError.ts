// src/licenseNetworkError.ts
// 라이선스·체험 인증 실패를 원인별로 구분해 사용자에게 알린다.
//
// [2026-08-26 사장님 실측] 인증 화면에 "인증에 실패했습니다. 인터넷 연결을 확인하세요."
// 가 떴는데 인터넷은 멀쩡했다. 직접 재보니 이랬다.
//   google.com          HTTP 200 (274ms)
//   script.google.com   HTTP 200 (1,677ms)
//   GAS 배포 URL        무응답 (15초 타임아웃)
// 원인은 인증 서버였는데 메시지는 사용자 탓처럼 읽혔다. 사장님이 인터넷을 의심하며
// 시간을 썼고, 같은 순간 다른 사용자들도 같은 메시지를 보고 있었을 것이다.
//
// 원인을 모르면 모른다고 쓴다. 확실하지 않은 원인을 사용자에게 지목하지 않는다.

export type LicenseNetworkFailureKind = 'timeout' | 'offline' | 'unknown';

/** fetch 실패 원인을 분류한다. AbortController 타임아웃과 실제 오프라인은 다르다. */
export function classifyLicenseNetworkFailure(error: unknown): LicenseNetworkFailureKind {
  const err = error as { name?: string; message?: string; cause?: { code?: string } } | null;
  const name = String(err?.name ?? '');
  const message = String(err?.message ?? '');
  const causeCode = String(err?.cause?.code ?? '');

  // AbortController 로 우리가 끊은 것 — 서버가 제때 답하지 않았다는 뜻이다.
  if (name === 'AbortError' || /aborted/i.test(message)) return 'timeout';
  if (/ETIMEDOUT|ETIMEOUT/i.test(causeCode) || /timed? ?out/i.test(message)) return 'timeout';

  // DNS·연결 자체가 안 되는 경우만 오프라인으로 본다.
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH/i.test(causeCode)) return 'offline';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|getaddrinfo/i.test(message)) return 'offline';

  return 'unknown';
}

/**
 * 사용자에게 보여줄 문장. `action` 은 "인증", "인증번호 발송" 처럼 무엇이 실패했는지.
 */
export function describeLicenseNetworkFailure(action: string, error: unknown): string {
  const label = String(action || '요청').trim();
  switch (classifyLicenseNetworkFailure(error)) {
    case 'timeout':
      return `${label}에 실패했습니다. 인증 서버가 응답하지 않습니다 — 잠시 후 다시 시도해주세요. (인터넷 문제가 아닙니다)`;
    case 'offline':
      return `${label}에 실패했습니다. 인터넷 연결을 확인하세요.`;
    default:
      return `${label}에 실패했습니다. 잠시 후 다시 시도해주세요.`;
  }
}

/**
 * 라이선스·체험 서버 호출 제한시간.
 *
 * [2026-08-26 실측] 같은 배포 URL이 이렇게 갈렸다.
 *   3.7초  — 정상 응답 {"ok":true,"status":"new"}
 *   25초+  — 무응답 (몇 분 전)
 * Apps Script 웹앱은 콜드 스타트·시트 잠금·시트 크기에 따라 응답이 크게 흔들린다.
 * 10초로 잡아 두면 서버가 멀쩡해도 사용자 쪽에서 먼저 끊어 "인증 실패"가 된다.
 * 사장님이 겪은 증상이 정확히 이것이다 — 인터넷도 서버도 살아 있는데 실패했다.
 */
export const LICENSE_SERVER_TIMEOUT_MS = 30_000;

/** 읽기 전용 조회는 한 번 더 시도한다. 부작용이 없어 재시도가 안전하다. */
export const LICENSE_SERVER_READ_RETRIES = 1;
