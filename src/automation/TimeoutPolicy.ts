// v2.7.45 — Timeout Policy 단일 모듈
//
// architect 진단(docs/diagnosis-2026-04-29/automation-summary.md):
//   "타임아웃 정책 카오스 — waitForSelector 1s/2s/3s/5s/8s/10s 6단계 산발 분포"
//   같은 발행 모달인데 editorHelpers 5초, publishHelpers 3초/5초/10초 혼재.
//
// 본 모듈은 모든 Puppeteer/Playwright 대기에 사용할 단일 정책을 export한다.

/**
 * 작업 종류별 권장 타임아웃 (ms)
 *   - tier 1 (instant): 사용자 입력 검증, 빠른 DOM 요소
 *   - tier 2 (interactive): 일반 클릭/타이핑 후 결과 대기
 *   - tier 3 (network): 페이지 navigation, AJAX
 *   - tier 4 (heavy): 이미지 업로드, 스토어 페이지 로드
 *   - tier 5 (login): 로그인 redirect 체인 + 보안 인증
 */
export const TimeoutPolicy = {
  /** 1초 — 명시적 빠른 검증 (existsSync DOM, validation) */
  INSTANT: 1_000,

  /** 5초 — 일반 UI 요소 대기 (버튼, 모달, dropdown) */
  INTERACTIVE: 5_000,

  /** 15초 — 네트워크 작업 (form submit, AJAX 결과) */
  NETWORK: 15_000,

  /** 25초 — 페이지 navigation + 에디터 frame 안착 */
  NAVIGATION: 25_000,

  /** 30초 — 이미지 업로드 1개 / 카테고리 dropdown 로드 */
  HEAVY: 30_000,

  /** 60초 — 발행 confirm 모달 + 카테고리 선택 + 발행 시작 */
  PUBLISH: 60_000,

  /** 120초 — OpenAI 이미지 생성 1장 */
  IMAGE_GENERATION: 120_000,

  /** 300초 (5분) — 사용자 수동 로그인 대기 */
  MANUAL_LOGIN: 300_000,

  /** 600초 (10분) — 보안 인증 / 캡차 해결 */
  SECURITY_VERIFY: 600_000,
} as const;

/**
 * 폴링 간격 (waitForFunction 등에 사용)
 */
export const PollingPolicy = {
  /** 200ms — 매우 빠른 폴링 (경합 상태 검증) */
  FAST: 200,

  /** 500ms — 표준 (selector 안착, 페이지 라우팅) */
  STANDARD: 500,

  /** 1000ms — 느린 폴링 (큐 상태 변화) */
  SLOW: 1_000,
} as const;

/**
 * 재시도 정책
 */
export const RetryPolicy = {
  /** 짧은 작업 — 2회 시도 */
  QUICK: 2,

  /** 일반 작업 — 3회 시도 */
  STANDARD: 3,

  /** 중요 작업 — 4회 시도 (발행, 로그인) */
  CRITICAL: 4,

  /** 재시도 간 대기 시간 — 점진 backoff */
  BACKOFF_BASE_MS: 1_000,
} as const;

/**
 * 도우미: 점진 backoff 시간 계산
 *   attempt 1 → 1s, 2 → 2s, 3 → 4s, 4 → 8s
 */
export function backoffDelay(attempt: number): number {
  return Math.min(RetryPolicy.BACKOFF_BASE_MS * Math.pow(2, attempt - 1), 30_000);
}
