/**
 * automation/timeouts.ts — 자동화 타임아웃 중앙 상수 (v2.10.70)
 *
 * 배경: v2.10.61~v2.10.69까지 5번에 걸쳐 같은 timeout 회귀 수정 (whack-a-mole).
 *   v2.10.61: FLOW 중복 검출
 *   v2.10.66: promptTranslation 8s→15s
 *   v2.10.67: naverBlogAutomation 30s→60s (page.goto + waitForNavigation 9곳)
 *   v2.10.68: registerOnce 정책 반전 + networkidle0→networkidle2
 *   v2.10.69: publishHelpers.ts 누락분 (3곳)
 *
 * 진짜 root cause: timeout 값이 코드 곳곳에 hardcode되어 회귀 영구 차단 불가능.
 *
 * 해결: 모든 발행/자동화 path의 timeout을 본 모듈 한 곳에서 관리.
 *   - 한 값 변경 → 모든 경로 동시 반영
 *   - 새 코드 작성 시 본 모듈 import 강제 (정책)
 *   - 다음 회귀 발생 시 한 곳만 수정
 */

/**
 * 네이버 블로그 자동화 path 전용 타임아웃.
 * 모든 page.goto / frame.waitForNavigation은 이 상수를 사용한다.
 */
export const NAVER_TIMEOUTS = {
  /** 블로그 글쓰기 페이지 진입 (page.goto) — 네트워크 / 세션 / 네이버 응답 지연 흡수 */
  PAGE_LOAD: 60000,

  /** 발행 후 결과 페이지 navigation 대기 (frame.waitForNavigation) — 네이버 백엔드 처리 + redirect */
  FRAME_NAVIGATION: 60000,

  /** 로그인 페이지 진입 — 보통 빠름, 30초 충분 */
  LOGIN_PAGE: 30000,

  /** Affiliate URL 로드 (쇼핑커넥트) — 외부 사이트 응답 흡수 */
  AFFILIATE_URL: 30000,

  /** 카테고리 / 발행 모달 셀렉터 검색 — UI 렌더 대기 */
  MODAL_SELECTOR: 15000,

  /** 페이지 reload (recovery) */
  PAGE_RELOAD: 60000,
} as const;

/**
 * waitUntil 옵션 — 네이버 광고 트래커 회피.
 *
 * networkidle0 = 0개 요청 500ms 동안 = 광고가 끊임없이 fire 시 영원히 idle 안 됨.
 * networkidle2 = 2개 이하 요청 500ms 동안 = 광고 트래커 통과.
 *
 * 발행 path는 무조건 networkidle2 (또는 'load') 사용.
 */
export const NAVER_WAIT_UNTIL = {
  /** 발행 후 결과 페이지 — networkidle2 (광고 회피) */
  FRAME_NAVIGATION: 'networkidle2' as const,

  /** 페이지 진입 — domcontentloaded (가장 빠름, 광고 무관) */
  PAGE_LOAD: 'domcontentloaded' as const,
};

/**
 * 외부 사이트 (Flow / ImageFX / Leonardo / DeepInfra) 타임아웃.
 * 발행 path 아니지만 일관성을 위해 중앙화.
 */
export const EXTERNAL_TIMEOUTS = {
  /** Flow / ImageFX 페이지 진입 */
  EXTERNAL_PAGE_LOAD: 60000,

  /** 이미지 생성 후 폴링 */
  IMAGE_GENERATION_POLL: 30000,

  /** 이미지 다운로드 (axios) */
  IMAGE_DOWNLOAD: 30000,

  /** 프롬프트 변환 LLM (Gemini/OpenAI/Claude) — 메인 콘텐츠 생성 아님 */
  PROMPT_TRANSLATION: 15000,
} as const;
