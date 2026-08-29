// src/content/credentialClearIntent.ts
// "사용자가 일부러 지웠다"와 "빈 값이 실수로 들어왔다"를 구분한다.
//
// [2026-08-29 사장님 실측] 로그인 화면의 "저장된 로그인 정보 삭제"를 눌러도
// 다른 라이선스 계정으로 로그인할 수 없었다. 실제 설정 파일이 이랬다:
//   settings_b52d….json : rememberLicenseCredentials=false, savedLicenseUserId=있음
//   settings.json(마스터): rememberLicenseCredentials=true,  savedLicenseUserId=있음
// 껐는데 자격증명이 남았고, 마스터가 자동로그인을 다시 켰다.
//
// 원인은 저장·로드 양쪽의 "빈 값이면 디스크 값으로 되돌린다" 방어다.
// 그 방어 자체는 옳다 — 화면 일부만 저장할 때 API 키가 날아가던 사고를 막는다.
// 문제는 빈 문자열 하나로 "손실"과 "삭제 의도"를 구분할 수 없다는 점이다.
//
// 그래서 삭제 의도를 **별도 필드로 명시**한다. 값이 아니라 의도를 싣는다.

/** 이 목록의 필드만 의도적 삭제 대상이다. API 키는 여기에 넣지 않는다. */
export const CLEARABLE_CREDENTIAL_FIELDS = Object.freeze([
  'savedLicenseUserId',
  'savedLicensePassword',
  'savedNaverId',
  'savedNaverPassword',
] as const);

export type ClearableCredentialField = typeof CLEARABLE_CREDENTIAL_FIELDS[number];

/** saveConfig 로 넘어오는 삭제 지시. 저장 후에는 남기지 않는다. */
export const CLEAR_INTENT_FIELD = '__clearCredentialFields' as const;

export function readClearIntent(config: unknown): ClearableCredentialField[] {
  const raw = (config as Record<string, unknown> | null)?.[CLEAR_INTENT_FIELD];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v || '').trim())
    .filter((v): v is ClearableCredentialField =>
      (CLEARABLE_CREDENTIAL_FIELDS as readonly string[]).includes(v));
}

/** 의도적으로 지우기로 한 필드인가 — 이 필드는 디스크 값으로 되돌리지 않는다. */
export function isIntentionallyCleared(
  field: string,
  cleared: readonly ClearableCredentialField[],
): boolean {
  return (cleared as readonly string[]).includes(field);
}
