/**
 * [2026-08-05] 성인인증(연령확인) 게이트 감지 — 순수 함수.
 *
 * 사용자 요구: "쇼핑커넥트 모드에 주류같은 성인인증 필요한 건 로그인 요청하고
 * 성인인증까지 완료하고 나서 정상적으로 제품창이 뜨면 크롤링 진행되게 해줘."
 *
 * ── 실측 근거 (Playwright 직접 캡처) ────────────────────────────────
 * docs/ultraplan/ADULT_VERIFICATION_LIVE_MEASUREMENT_2026-08-05.md
 * 주류 상품 https://naver.me/GT42MEXe → smartstore 오디와인(마깨주 전통주).
 *
 * 게이트는 **한 화면이 아니라 여러 단계**였다:
 *
 *   1단계 비로그인
 *      nid.naver.com/nidlogin.login?…&realname=Y
 *      title "NAVER 로그인" / "서비스 이용을 위해 연령확인이 필요해요"
 *
 *   2단계 로그인했지만 성인인증 미완  ← 처음 실측에서 놓쳤던 화면
 *      nid.naver.com/user2/help/realNameCheck?m=viewAdultUserAuth
 *      title "회원정보 : 실명확인"
 *      "1년에 한 번, 나이 확인이 필요합니다."
 *      "이 정보내용은 청소년유해매체물로서 … 19세 미만의 청소년이 이용할 수 없습니다."
 *      "휴대폰으로 문자 인증하기" / "아이핀으로 인증"
 *
 *   3단계 본인인증 팝업
 *      nid.naver.com/user2/rncheck/authMobile?m=viewBeginIpin&isIpin=Y
 *
 *   완료  smartstore.naver.com/{store}/products/{id} (본문 6,966자)
 *
 * 1단계만 보고 만든 초판 정책은 2단계에서 세 신호가 전부 빗나가 'none'을
 * 반환했다 — 인증 화면을 상품 페이지로 오인하는 상태였다.
 *
 * ── 설계 원칙 ──────────────────────────────────────────────────────
 * 그래서 **게이트 변종을 열거하지 않는다.** 네이버가 단계를 추가하면 또 놓친다.
 * 대신 "인증 도메인(nid.naver.com)에 있으면 아직 상품 페이지가 아니다"라는
 * 위치 기반 판정을 1차로 쓰고, 세부 종류는 안내 문구를 고르는 데만 쓴다.
 * 완료 판정도 "게이트가 사라졌는가"(부정)가 아니라 "상품 페이지에 도달했는가"
 * (긍정)로 한다 — 미지의 중간 화면에서 성급히 진행하지 않기 위해서다.
 */
export type AccessGateKind = 'none' | 'adult-verification' | 'login-required';

export interface AccessGateInput {
  /** 최종 도달 URL (리다이렉트 후) */
  readonly url?: string;
  /** document.title */
  readonly title?: string;
  /** document.body.innerText */
  readonly bodyText?: string;
}

/**
 * 본문 키워드를 신뢰할 수 있는 최대 길이.
 *
 * 상품 상세에는 "19세 미만 구매 불가" 같은 안내문이 들어갈 수 있다.
 * 인증 화면은 실측 134~322자로 짧으므로, 짧은 문서일 때만 본문을 근거로 쓴다.
 * (crawlerBrowser의 v2.11.134 오탐 방벽과 같은 기준.)
 */
export const GATE_BODY_TRUST_MAX_CHARS = 1500;

/** 네이버 인증 도메인 — 여기 있으면 어느 단계든 아직 상품 페이지가 아니다. */
function isNaverAuthHost(url: string): boolean {
  return /^https?:\/\/(?:[^/]*\.)?nid\.naver\.com(?:[/:?#]|$)/i.test(url);
}

/**
 * 성인/연령 확인 단계임을 알리는 URL 마커 (실측 3단계 전부 커버).
 *   realname=Y            — 1단계 로그인 인터스티셜
 *   viewAdultUserAuth     — 2단계 성인 인증 안내
 *   realNameCheck         — 실명확인 경로
 *   rncheck / viewBeginIpin — 3단계 본인인증(휴대폰/아이핀)
 */
function hasAdultUrlMarker(url: string): boolean {
  return /[?&]realname=y(?:&|$)/i.test(url)
    || /viewadultuserauth/i.test(url)
    || /realnamecheck/i.test(url)
    || /\/rncheck\//i.test(url)
    || /viewbeginipin/i.test(url);
}

/** 성인/연령 확인 문구 (실측 2단계 본문에서 확인된 표현 포함). */
function mentionsAgeGate(haystack: string): boolean {
  return /연령\s*확인/.test(haystack)
    || /나이\s*확인/.test(haystack)
    || /청소년\s*유해/.test(haystack)
    || /실명\s*확인/.test(haystack)
    || /19세\s*미만/.test(haystack)
    || /성인\s*인증/.test(haystack);
}

/**
 * 페이지가 접근 게이트에 막혔는지 판정한다.
 *
 * 봇 차단(429·에러 페이지)은 여기서 다루지 않는다 — 성인인증과 다른 상태이고
 * 기존 ERROR_PAGE_INDICATORS 경로가 담당한다. 두 상태를 한 분기로 합치면
 * 봇에 막힌 사용자에게 "인증하세요"라는 엉뚱한 안내를 하게 된다.
 */
export function detectAccessGate(input?: AccessGateInput | null): AccessGateKind {
  const url = String(input?.url ?? '').trim();
  const title = String(input?.title ?? '').trim();
  const bodyText = String(input?.bodyText ?? '').trim();

  if (!url && !title && !bodyText) return 'none';

  const bodyTrustworthy = bodyText.length < GATE_BODY_TRUST_MAX_CHARS;
  const haystack = bodyTrustworthy ? `${title}\n${bodyText}` : title;
  const ageWording = mentionsAgeGate(haystack);

  // 1) 인증 도메인에 있으면 단계와 무관하게 게이트다. 종류만 가른다.
  if (url && isNaverAuthHost(url)) {
    return (hasAdultUrlMarker(url) || ageWording) ? 'adult-verification' : 'login-required';
  }

  // 2) 도메인 신호가 없어도 URL 마커나 짧은 문서의 연령 문구가 있으면 게이트.
  if (url && hasAdultUrlMarker(url)) return 'adult-verification';
  if (ageWording && bodyTrustworthy) return 'adult-verification';

  return 'none';
}

/**
 * 상품 페이지에 실제로 도달했는지 (긍정 판정).
 *
 * 대기 루프의 종료 조건으로 쓴다. "게이트가 안 보인다"로 끝내면 미지의 중간
 * 화면에서 성급히 진행해 인증 화면 HTML을 상품 정보로 파싱하게 된다.
 */
export function isProductPageReady(input?: AccessGateInput | null): boolean {
  const url = String(input?.url ?? '').trim();
  const bodyText = String(input?.bodyText ?? '').trim();
  if (!url) return false;
  if (isNaverAuthHost(url)) return false;
  if (detectAccessGate(input) !== 'none') return false;
  // 실측: 인증 화면 134~322자 vs 정상 상품 페이지 6,966자.
  return bodyText.length >= GATE_BODY_TRUST_MAX_CHARS;
}

/** 게이트가 사용자 개입(로그인/인증)을 요구하는지. */
export function requiresManualUnlock(kind: AccessGateKind): boolean {
  return kind === 'adult-verification' || kind === 'login-required';
}

/** 사용자에게 보여줄 안내 문구. */
export function describeAccessGate(kind: AccessGateKind): string {
  if (kind === 'adult-verification') {
    return '🔞 성인인증이 필요한 상품입니다 — 열린 브라우저에서 네이버 로그인 후 '
      + '휴대폰/아이핀으로 연령 확인을 완료해주세요(로그인 화면에 "로그인 상태 유지"가 '
      + '있으면 켜 두면 다음부터 자동 진행). 완료되면 자동으로 이어서 진행합니다.';
  }
  if (kind === 'login-required') {
    return '🔒 네이버 로그인이 필요한 페이지입니다 — 열린 브라우저에서 로그인해주세요'
      + '("로그인 상태 유지"가 있으면 켜 두면 다음부터 자동 진행). '
      + '완료되면 자동으로 이어서 진행합니다.';
  }
  return '';
}
