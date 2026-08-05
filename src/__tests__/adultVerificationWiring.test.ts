import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { waitForAccessGateUnlocked } from '../crawler/crawlerBrowser';

/**
 * [2026-08-06 라이브] 쇼핑모드 주류(성인인증) 상품: 감지기(adultVerificationPolicy)는
 * 2026-08-05에 만들어졌지만 어떤 코드도 import 하지 않아 죽은 배선이었다.
 * 5개 크롤 전략이 인증 화면을 "결과 없음"으로 오인하고 페이지를 닫아, 사용자가
 * 로그인할 틈 없이 창이 껐다 켜졌다를 반복했고, 가까스로 로그인해도 수집은 이미
 * 실패 종료 + 본문 생성은 자료 52자로 끝났다.
 *
 * 계약: navigateWithRetry 가 캡차와 동일 패턴으로 성인인증/로그인 게이트를
 * 감지하면 페이지를 닫지 않고 사용자 완료를 대기한다(상품 페이지 도달 = 긍정 판정).
 */

type MockPageState = { url: string; title: string; bodyText: string };

function makeMockPage(states: MockPageState[]): {
  page: {
    url: () => string;
    evaluate: () => Promise<{ title: string; bodyText: string }>;
    waitForTimeout: (ms: number) => Promise<void>;
    bringToFront: () => Promise<void>;
  };
  broughtToFront: () => boolean;
} {
  let step = 0;
  let front = false;
  const current = (): MockPageState => states[Math.min(step, states.length - 1)];
  return {
    page: {
      url: () => current().url,
      evaluate: async () => ({ title: current().title, bodyText: current().bodyText }),
      waitForTimeout: async () => {
        step += 1;
      },
      bringToFront: async () => {
        front = true;
      },
    },
    broughtToFront: () => front,
  };
}

const AUTH_URL = 'https://nid.naver.com/user2/help/realNameCheck?m=viewAdultUserAuth';
const PRODUCT_URL = 'https://m.smartstore.naver.com/makkaejoo_market/products/8464207616';
const AUTH_STATE: MockPageState = {
  url: AUTH_URL,
  title: '회원정보 : 실명확인',
  bodyText: '1년에 한 번, 나이 확인이 필요합니다. 19세 미만의 청소년이 이용할 수 없습니다.',
};
const PRODUCT_STATE: MockPageState = {
  url: PRODUCT_URL,
  title: '오드뱅상 13도 750ml 선물세트',
  bodyText: '상품 상세 본문 '.repeat(200), // >= 1500자 (실측 정상 상품 페이지 6,966자)
};

describe('adult verification gate wiring', () => {
  it('게이트가 없으면 즉시 true (대기 없음)', async () => {
    const { page } = makeMockPage([PRODUCT_STATE]);
    await expect(waitForAccessGateUnlocked(page as never, 1000)).resolves.toBe(true);
  });

  it('성인인증 화면이면 창을 앞으로 가져오고, 사용자 인증 완료(상품 페이지 도달) 후 true', async () => {
    const { page, broughtToFront } = makeMockPage([AUTH_STATE, AUTH_STATE, PRODUCT_STATE]);
    await expect(waitForAccessGateUnlocked(page as never, 60000)).resolves.toBe(true);
    expect(broughtToFront()).toBe(true);
  });

  it('타임아웃까지 인증이 안 되면 false (페이지 이동·파괴는 호출자 소관 아님)', async () => {
    const { page } = makeMockPage([AUTH_STATE]);
    await expect(waitForAccessGateUnlocked(page as never, 1)).resolves.toBe(false);
  });

  // [2026-08-06 라이브 재발 v2.11.174] 본문 크롤은 navigateWithRetry 가 아니라
  // AffiliateCrawler 의 brandconnect 자체 goto 경로를 탄다 — 배선 누락으로 1.4초 만에
  // "모든 방법 실패" → 페이지 닫힘 → 52자로 생성 진행. 로그인 창이 "바로 꺼진" 원인.
  it('brandconnect 리다이렉트 경로도 게이트 대기를 배선한다 (소스 계약)', () => {
    const source = readFileSync(new URL('../crawler/productSpecCrawler.ts', import.meta.url), 'utf8');
    // 리다이렉트 대기 루프 안에서 인증 도메인 감지 → 대기 → 대기시간 리셋
    expect(source).toMatch(/waitForAccessGateUnlocked/);
    expect(source).toMatch(/nid\\?\.naver\\?\.com/);
    // brandconnect goto 는 JS 리다이렉트 체인이라 중단 에러를 삼키고 루프가 판정한다
    expect(source).toMatch(/brandconnect goto 중단|리다이렉트 대기로 진행/);
  });

  it('게이트 대기가 최소화된 크롤러 창을 복원한다 (소스 계약)', () => {
    const source = readFileSync(new URL('../crawler/crawlerBrowser.ts', import.meta.url), 'utf8');
    // 크롤러 창은 생성 직후 최소화된다 — bringToFront 만으로는 사용자가 로그인 화면을
    // 볼 수 없어 CDP 로 windowState 를 복원해야 한다.
    expect(source).toMatch(/Browser\.setWindowBounds/);
    expect(source).toMatch(/windowState:\s*'normal'/);
  });

  it('navigateWithRetry 가 게이트 대기를 배선한다 (소스 계약)', () => {
    const source = readFileSync(new URL('../crawler/crawlerBrowser.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/from '\.\/adultVerificationPolicy/);
    // 첫 시도와 리트라이 루프 양쪽에서 게이트를 확인한다
    const wiringCount = (source.match(/waitForAccessGateUnlocked\(/g) || []).length;
    expect(wiringCount).toBeGreaterThanOrEqual(3); // 정의 1 + 배선 2곳 이상
    // 인증 대기 타임아웃 시 다른 URL 로 이동하는 리트라이를 타지 않는다(로그인 세션 보호)
    expect(source).toMatch(/인증 대기 타임아웃|게이트 타임아웃/);
  });
});
