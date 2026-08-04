import { describe, expect, it } from 'vitest';

import {
  GATE_BODY_TRUST_MAX_CHARS,
  describeAccessGate,
  detectAccessGate,
  isProductPageReady,
  requiresManualUnlock,
} from '../crawler/adultVerificationPolicy';

/**
 * [2026-08-05] 성인인증 감지 — 라이브 실측 기반.
 *
 * 실측 원본: docs/ultraplan/ADULT_VERIFICATION_LIVE_MEASUREMENT_2026-08-05.md
 * 주류 상품(https://naver.me/GT42MEXe → smartstore 오디와인)을 Playwright로
 * 직접 열어 인증 미완료/완료/세션없음 3상태를 캡처했다.
 */

// ── 실측 픽스처 (문구·URL 모두 실제 캡처값) ──────────────────────────
const LIVE_ADULT_GATE = {
  url:
    'https://nid.naver.com/nidlogin.login?a_version=2&svctype=128'
    + '&url=https%3A%2F%2Fsmartstore.naver.com%2Fmakkaejoo_market%2Fproducts%2F8464207616'
    + '&surl=https%3A%2F%2Fsmartstore.naver.com%2Fmakkaejoo_market&realname=Y',
  title: 'NAVER 로그인',
  bodyText:
    '본문 바로가기\n네이버\n서비스 이용을 위해 연령확인이 필요해요\n아이디 또는 전화번호\n'
    + '비밀번호\n로그인 상태 유지\nIP 보안\nON\n로그인\nQR 코드 로그인\n아이디 찾기\n'
    + '비밀번호 찾기\n회원가입\n스마트봇 상담\n고객센터\n한국어\n© NAVER Corp.',
};

const LIVE_PRODUCT_PAGE = {
  url: 'https://smartstore.naver.com/makkaejoo_market/products/8464207616',
  title: '오디와인 13도 750ml 선물세트 동진부안참뽕와인 스위트 레드 (케이스, 쇼핑백 포함) : 마깨주 전통주',
  bodyText: '본문으로 바로가기\n네이버플러스 스토어 홈\n구매자 리뷰 82건\n'
    + '오디와인 13도 750ml 선물세트 [원산지:국산]\n'.repeat(200), // 실측 6,966자 수준
};

/**
 * 2단계 — 로그인은 됐지만 성인인증 미완료. 초판 정책이 놓쳤던 화면.
 * 사용자 지적("2차인증 안 된 사람은 인증을 제대로 해야 한다")으로 발견.
 */
const LIVE_ADULT_AUTH_STEP = {
  url: 'https://nid.naver.com/user2/help/realNameCheck?m=viewAdultUserAuth&token_help=hbkkbiCYN3QMwhD2',
  title: '회원정보 : 실명확인',
  bodyText:
    '본문 바로가기\n네이버\n닫기\n1년에 한 번, 나이 확인이 필요합니다.\n'
    + '이 정보내용은 청소년유해매체물로서 정보통신망 이용촉진 및 정보보호 등에 관한 법률 및 '
    + '청소년 보호법에 따라 19세 미만의 청소년이 이용할 수 없습니다.\n자세히\n'
    + '19세 이상입니다. 생일이 2007.12.31. 이전\n수집항목 안내\n휴대전화이미지\n'
    + '휴대폰으로\n문자 인증하기\n아이핀으로 인증 아이핀 발급\n'
    + '19세 미만입니다. 생일이 2008.01.01. 이후',
};

/** 3단계 — 본인인증(휴대폰/아이핀) 팝업. */
const LIVE_IPIN_POPUP = {
  url: 'https://nid.naver.com/user2/rncheck/authMobile?m=viewBeginIpin&isIpin=Y&token_help=hbkkbiCYN3QMwhD2',
  title: '네이버 : 본인인증',
  bodyText: '본인인증을 진행해주세요',
};

describe('성인인증 게이트 감지 — 실측 픽스처', () => {
  it('실측 인증 화면을 adult-verification으로 판정한다', () => {
    expect(detectAccessGate(LIVE_ADULT_GATE)).toBe('adult-verification');
  });

  it('2단계 성인인증 절차 화면도 잡는다 (초판이 놓쳤던 회귀)', () => {
    // 초판 정책의 세 신호가 전부 빗나가던 입력이다:
    // realname=Y 없음 / nidlogin.login 아님 / 본문에 "연령확인" 없음
    expect(LIVE_ADULT_AUTH_STEP.url).not.toMatch(/realname=Y/i);
    expect(LIVE_ADULT_AUTH_STEP.url).not.toMatch(/nidlogin\.login/i);
    expect(`${LIVE_ADULT_AUTH_STEP.title}${LIVE_ADULT_AUTH_STEP.bodyText}`).not.toMatch(/연령\s*확인/);

    expect(detectAccessGate(LIVE_ADULT_AUTH_STEP)).toBe('adult-verification');
  });

  it('3단계 본인인증 팝업도 잡는다', () => {
    expect(detectAccessGate(LIVE_IPIN_POPUP)).toBe('adult-verification');
  });

  it('인증 도메인이면 알 수 없는 새 단계여도 게이트로 본다 (변종 내성)', () => {
    // 네이버가 단계를 추가해도 nid.naver.com에 있으면 상품 페이지가 아니다
    expect(detectAccessGate({
      url: 'https://nid.naver.com/user2/some/futureStep?x=1',
      title: '알 수 없는 화면',
      bodyText: '내용',
    })).toBe('login-required');
  });

  it('실측 정상 상품 페이지는 게이트 없음으로 판정한다', () => {
    expect(LIVE_PRODUCT_PAGE.bodyText.length).toBeGreaterThan(GATE_BODY_TRUST_MAX_CHARS);
    expect(detectAccessGate(LIVE_PRODUCT_PAGE)).toBe('none');
  });

  it('realname=Y 단독으로 확정한다 (본문·제목 없어도)', () => {
    expect(detectAccessGate({ url: 'https://nid.naver.com/nidlogin.login?realname=Y' }))
      .toBe('adult-verification');
    // 쿼리 중간에 있어도 잡는다
    expect(detectAccessGate({ url: 'https://nid.naver.com/nidlogin.login?realname=Y&svctype=128' }))
      .toBe('adult-verification');
  });

  it('연령확인 없는 일반 로그인 인터스티셜은 login-required', () => {
    expect(detectAccessGate({
      url: 'https://nid.naver.com/nidlogin.login?url=https%3A%2F%2Fblog.naver.com',
      title: 'NAVER 로그인',
      bodyText: '아이디 또는 전화번호\n비밀번호\n로그인',
    })).toBe('login-required');
  });
});

describe('오탐 방벽 — 긴 본문의 키워드는 신뢰하지 않는다', () => {
  it('긴 상품 상세에 "연령확인" 안내문이 있어도 게이트로 보지 않는다', () => {
    const longProductBody = '이 상품은 주류이므로 구매 시 연령확인이 필요합니다. '
      + '상세 스펙 설명입니다. '.repeat(200);
    expect(longProductBody.length).toBeGreaterThan(GATE_BODY_TRUST_MAX_CHARS);
    expect(detectAccessGate({
      url: 'https://smartstore.naver.com/store/products/123',
      title: '오디와인 750ml',
      bodyText: longProductBody,
    })).toBe('none');
  });

  it('짧은 문서에서는 URL 신호가 없어도 연령확인을 잡는다', () => {
    expect(detectAccessGate({
      url: 'https://example.com/gate',
      title: '',
      bodyText: '서비스 이용을 위해 연령 확인이 필요해요',
    })).toBe('adult-verification');
  });

  it('봇 차단(429 에러 페이지)은 성인 게이트가 아니다', () => {
    // 실측 상태 C: credentials 없이 요청 → 429 + 시스템오류 페이지
    expect(detectAccessGate({
      url: 'https://smartstore.naver.com/makkaejoo_market/products/8464207616',
      title: '[에러] 에러페이지 - 시스템오류',
      bodyText: '시스템 오류가 발생했습니다.',
    })).toBe('none');
  });

  it('빈 입력은 none', () => {
    expect(detectAccessGate(undefined)).toBe('none');
    expect(detectAccessGate(null)).toBe('none');
    expect(detectAccessGate({})).toBe('none');
  });

  it('smartstore 도메인은 nid 판별에 걸리지 않는다 (부분 문자열 오탐)', () => {
    expect(detectAccessGate({
      url: 'https://smartstore.naver.com/nid.naver.com-fake/products/1',
      title: '상품',
      bodyText: '정상 상품 설명',
    })).toBe('none');
  });
});

describe('완료 판정 — 긍정 신호로만 진행한다', () => {
  it('실측 상품 페이지에서만 준비 완료로 본다', () => {
    expect(isProductPageReady(LIVE_PRODUCT_PAGE)).toBe(true);
  });

  it('인증 3단계 어디서도 준비 완료가 아니다', () => {
    expect(isProductPageReady(LIVE_ADULT_GATE)).toBe(false);
    expect(isProductPageReady(LIVE_ADULT_AUTH_STEP)).toBe(false);
    expect(isProductPageReady(LIVE_IPIN_POPUP)).toBe(false);
  });

  it('게이트가 안 보여도 본문이 얇으면 진행하지 않는다', () => {
    // "게이트 없음"만으로 진행하면 미지의 중간 화면을 상품으로 오인한다
    expect(isProductPageReady({
      url: 'https://smartstore.naver.com/store/products/1',
      title: '로딩 중',
      bodyText: '잠시만 기다려주세요',
    })).toBe(false);
  });

  it('URL이 없으면 준비 완료가 아니다', () => {
    expect(isProductPageReady({})).toBe(false);
    expect(isProductPageReady(null)).toBe(false);
  });
});

describe('개입 필요 판정과 안내 문구', () => {
  it('두 게이트 모두 사용자 개입을 요구한다', () => {
    expect(requiresManualUnlock('adult-verification')).toBe(true);
    expect(requiresManualUnlock('login-required')).toBe(true);
    expect(requiresManualUnlock('none')).toBe(false);
  });

  it('안내 문구가 무엇을 해야 하는지 알려준다', () => {
    const adult = describeAccessGate('adult-verification');
    expect(adult).toContain('성인인증');
    expect(adult).toContain('브라우저');
    // 실측 2단계 화면이 제시하는 실제 수단을 안내한다
    expect(adult).toMatch(/휴대폰|아이핀/);
    expect(describeAccessGate('login-required')).toContain('로그인');
    expect(describeAccessGate('none')).toBe('');
  });
});
