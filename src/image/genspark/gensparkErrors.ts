// src/image/genspark/gensparkErrors.ts
// [2026-10-10] 젠스파크 오류 코드와 오류 클래스. 자동 폴백 금지 — 모든 실패는 '[젠스파크] …' 문구로 멈춘다.

export const GENSPARK_LOGIN_REQUIRED = 'GENSPARK_LOGIN_REQUIRED';
export const GENSPARK_PROFILE_IN_USE = 'GENSPARK_PROFILE_IN_USE';
export const GENSPARK_CHALLENGE = 'GENSPARK_CHALLENGE';
export const GENSPARK_COMPOSER_NOT_FOUND = 'GENSPARK_COMPOSER_NOT_FOUND';
export const GENSPARK_MODEL_NOT_FOUND = 'GENSPARK_MODEL_NOT_FOUND';
export const GENSPARK_MODEL_CREDIT_CHANGED = 'GENSPARK_MODEL_CREDIT_CHANGED';
export const GENSPARK_SETTINGS_NOT_FOUND = 'GENSPARK_SETTINGS_NOT_FOUND';
export const GENSPARK_SUBMIT_FAILED = 'GENSPARK_SUBMIT_FAILED';
export const GENSPARK_JOB_TIMEOUT = 'GENSPARK_JOB_TIMEOUT';
export const GENSPARK_JOB_FAILED = 'GENSPARK_JOB_FAILED';
export const GENSPARK_RATE_LIMITED = 'GENSPARK_RATE_LIMITED';
export const GENSPARK_DOWNLOAD_FAILED = 'GENSPARK_DOWNLOAD_FAILED';
export const GENSPARK_DUPLICATE_IMAGE = 'GENSPARK_DUPLICATE_IMAGE';
export const GENSPARK_ABORTED = 'GENSPARK_ABORTED';

export type GensparkErrorCode =
  | typeof GENSPARK_LOGIN_REQUIRED
  | typeof GENSPARK_PROFILE_IN_USE
  | typeof GENSPARK_CHALLENGE
  | typeof GENSPARK_COMPOSER_NOT_FOUND
  | typeof GENSPARK_MODEL_NOT_FOUND
  | typeof GENSPARK_MODEL_CREDIT_CHANGED
  | typeof GENSPARK_SETTINGS_NOT_FOUND
  | typeof GENSPARK_SUBMIT_FAILED
  | typeof GENSPARK_JOB_TIMEOUT
  | typeof GENSPARK_JOB_FAILED
  | typeof GENSPARK_RATE_LIMITED
  | typeof GENSPARK_DOWNLOAD_FAILED
  | typeof GENSPARK_DUPLICATE_IMAGE
  | typeof GENSPARK_ABORTED;

export const GENSPARK_ERROR_PREFIX = '[젠스파크] ';

/** 코드별 기본 한글 문구(접두 제외). detail 이 있으면 뒤에 덧붙인다. */
const GENSPARK_DEFAULT_MESSAGES: Readonly<Record<GensparkErrorCode, string>> = Object.freeze({
  GENSPARK_LOGIN_REQUIRED: '로그인이 필요합니다. 젠스파크 창에서 직접 로그인해 주세요.',
  GENSPARK_PROFILE_IN_USE: '젠스파크 전용 크롬이 이미 열려 있습니다. 열린 창을 닫고 다시 시도해 주세요.',
  GENSPARK_CHALLENGE: '보안 확인(사람 확인) 화면이 떠 있습니다. 창에서 직접 통과한 뒤 다시 시도해 주세요.',
  GENSPARK_COMPOSER_NOT_FOUND: '이미지 입력창을 찾지 못했습니다. 젠스파크 화면이 바뀌었을 수 있습니다.',
  GENSPARK_MODEL_NOT_FOUND: '선택한 모델을 젠스파크 메뉴에서 찾지 못했습니다. 다른 모델로 몰래 바꾸지 않고 멈춥니다.',
  GENSPARK_MODEL_CREDIT_CHANGED: '선택한 모델의 크레딧 정책이 바뀌었습니다. 모델 설정을 다시 확인해 주세요.',
  GENSPARK_SETTINGS_NOT_FOUND: '종횡비·생성 횟수 설정을 찾지 못했습니다. 젠스파크 화면이 바뀌었을 수 있습니다.',
  GENSPARK_SUBMIT_FAILED: '이미지 생성 요청을 보내지 못했습니다.',
  GENSPARK_JOB_TIMEOUT: '이미지 생성 시간이 초과되었습니다.',
  GENSPARK_JOB_FAILED: '젠스파크가 이미지 생성에 실패했습니다.',
  GENSPARK_RATE_LIMITED: '요청이 제한되었습니다. 잠시 뒤 다시 시도해 주세요.',
  GENSPARK_DOWNLOAD_FAILED: '생성된 이미지를 내려받지 못했습니다.',
  GENSPARK_DUPLICATE_IMAGE: '같은 이미지가 중복으로 생성되었습니다.',
  GENSPARK_ABORTED: '사용자 요청으로 중지되었습니다.',
});

/** 배치 전체를 멈추는 코드. 나머지(제출·시간초과·생성실패·제한·다운로드·중복)는 그 항목만 실패. */
const GENSPARK_BATCH_FATAL_CODES: ReadonlySet<string> = new Set<string>([
  GENSPARK_LOGIN_REQUIRED,
  GENSPARK_PROFILE_IN_USE,
  GENSPARK_CHALLENGE,
  GENSPARK_COMPOSER_NOT_FOUND,
  GENSPARK_MODEL_NOT_FOUND,
  GENSPARK_MODEL_CREDIT_CHANGED,
  GENSPARK_SETTINGS_NOT_FOUND,
  GENSPARK_ABORTED,
]);

export class GensparkError extends Error {
  readonly code: GensparkErrorCode;
  /** 사용자에게 그대로 보일 한글 문구('[젠스파크] …') */
  readonly userMessage: string;

  constructor(code: GensparkErrorCode, detail?: string) {
    const base = GENSPARK_DEFAULT_MESSAGES[code] || '알 수 없는 오류';
    const extra = detail && detail.trim() ? ` (${detail.trim()})` : '';
    const text = GENSPARK_ERROR_PREFIX + base + extra;
    super(text);
    this.name = 'GensparkError';
    this.code = code;
    this.userMessage = text;
    Object.setPrototypeOf(this, GensparkError.prototype);
  }
}

export function gensparkIsError(error: unknown): error is GensparkError {
  return error instanceof GensparkError;
}

/** 배치 전체를 멈춰야 하는 오류인가. GensparkError 가 아니면 false(그 항목만 실패로 본다). */
export function gensparkIsBatchFatal(error: unknown): boolean {
  if (!(error instanceof GensparkError)) return false;
  return GENSPARK_BATCH_FATAL_CODES.has(error.code);
}
