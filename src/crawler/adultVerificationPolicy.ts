/**
 * [2026-08-05] 성인인증(연령확인) 게이트 감지 — 순수 함수.
 *
 * 사용자 요구: "쇼핑커넥트 모드에 주류같은 성인인증 필요한 건 로그인 요청하고
 * 성인인증까지 완료하고 나서 정상적으로 제품창이 뜨면 크롤링 진행되게 해줘."
 *
 * 판정 기준은 추측이 아니라 **라이브 실측**이다
 * (docs/ultraplan/ADULT_VERIFICATION_LIVE_MEASUREMENT_2026-08-05.md).
 * 주류 상품 https://naver.me/GT42MEXe → smartstore 오디와인 상품으로 확인:
 *
 *   인증 미완료: nid.naver.com/nidlogin.login?...&realname=Y
 *               title "NAVER 로그인" / body 134자
 *               "서비스 이용을 위해 연령확인이 필요해요"
 *   인증 완료  : smartstore.naver.com/{store}/products/{id}
 *               title 실제 상품명 / body 6,966자
 *
 * 실측에서 확인되지 않은 표현(성인인증·19세·미성년자·청소년 유해·본인확인)은
 * 넣지 않는다 — 넣어봤자 감지에 기여하지 않고 오탐 표면만 넓힌다.
 * 실제 신호는 `realname=Y`와 "연령확인"이었다.
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
 * 상품 상세 페이지에는 "연령확인" 같은 문구가 안내문으로 들어갈 수 있다.
 * 인증 인터스티셜은 실측 134자로 매우 짧으므로, 짧은 문서일 때만 본문을 근거로 쓴다.
 * (crawlerBrowser의 v2.11.134 오탐 방벽과 같은 기준 — 그때 긴 상품 본문의
 *  "과전류시 자동차단기능"이 차단 신호로 오인됐다.)
 */
export const GATE_BODY_TRUST_MAX_CHARS = 1500;

/** 네이버 로그인 인터스티셜 판별 — 호스트와 경로를 함께 본다. */
function isNaverLoginInterstitial(url: string): boolean {
  return /(^|\/\/|\.)nid\.naver\.com\//i.test(url) && /nidlogin\.login/i.test(url);
}

/**
 * 실명·연령 확인을 요구하는 로그인 요청인지.
 * 네이버가 성인 상품 접근 시 붙이는 쿼리 파라미터 (실측 확인).
 */
function requiresRealNameVerification(url: string): boolean {
  return /[?&]realname=y(?:&|$)/i.test(url);
}

function mentionsAgeCheck(bodyText: string, title: string): boolean {
  const haystack = `${title}\n${bodyText}`;
  return /연령\s*확인/.test(haystack);
}

/**
 * 페이지가 접근 게이트에 막혔는지 판정한다.
 *
 * 봇 차단(429·에러 페이지)은 여기서 다루지 않는다 — 성인인증과 다른 상태이고
 * 기존 ERROR_PAGE_INDICATORS 경로가 담당한다. 두 상태를 한 분기로 합치면
 * 사용자에게 잘못된 안내("인증하세요")를 하게 된다.
 */
export function detectAccessGate(input?: AccessGateInput | null): AccessGateKind {
  const url = String(input?.url ?? '').trim();
  const title = String(input?.title ?? '').trim();
  const rawBody = String(input?.bodyText ?? '');
  const bodyText = rawBody.trim();

  if (!url && !title && !bodyText) return 'none';

  // 1) 가장 강한 신호 — 실명/연령 확인 요구 파라미터. 단독으로 확정한다.
  if (url && requiresRealNameVerification(url)) return 'adult-verification';

  const onLoginInterstitial = url ? isNaverLoginInterstitial(url) : false;

  // 2) 로그인 인터스티셜 + 연령확인 문구 → 성인 게이트.
  //    본문은 짧을 때만 근거로 쓴다.
  const bodyTrustworthy = bodyText.length < GATE_BODY_TRUST_MAX_CHARS;
  if (onLoginInterstitial) {
    if (bodyTrustworthy && mentionsAgeCheck(bodyText, title)) return 'adult-verification';
    return 'login-required';
  }

  // 3) URL 신호가 없어도 짧은 문서에서 연령확인을 명시하면 성인 게이트로 본다.
  if (bodyTrustworthy && mentionsAgeCheck(bodyText, title)) return 'adult-verification';

  return 'none';
}

/** 게이트가 사용자 개입(로그인/인증)을 요구하는지. */
export function requiresManualUnlock(kind: AccessGateKind): boolean {
  return kind === 'adult-verification' || kind === 'login-required';
}

/** 사용자에게 보여줄 안내 문구. */
export function describeAccessGate(kind: AccessGateKind): string {
  if (kind === 'adult-verification') {
    return '🔞 성인인증이 필요한 상품입니다 — 열린 브라우저에서 네이버 로그인 + 연령확인을 완료해주세요. 완료되면 자동으로 이어서 진행합니다.';
  }
  if (kind === 'login-required') {
    return '🔒 네이버 로그인이 필요한 페이지입니다 — 열린 브라우저에서 로그인해주세요. 완료되면 자동으로 이어서 진행합니다.';
  }
  return '';
}
