/**
 * [2026-10-11 사장님 승인] 보호조치의 뿌리 — 앱 크롬이 지문 위장 때문에 사장님 크롬과 "다른·변조된 기계"로 보였다
 * (실측 81항목 중 26 다름: 맥 GPU 문자열, Win10, 가짜 RAM, 덮어쓴 함수 소스 노출, 가짜 WebRTC·카메라·알림 권한).
 * 앱 크롬은 이 PC 그대로를 보고한다. 남기는 것은 자동화 표시 제거(--enable-automation 제외, AutomationControlled)뿐이고,
 * WebRTC IP 차단 인자는 프록시를 쓸 때만 붙인다.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(file), 'utf8').replace(/\r\n/g, '\n');
const sessions = read('src/browserSessionManager.ts');
const engine = read('src/naverBlogAutomation.ts');

describe('앱 크롬은 이 PC 그대로를 보고한다 (지문 위장 없음)', () => {
  it('발행 크롬은 순정 puppeteer 로 띄운다 — puppeteer-extra 전역 플러그인(크롤러·이미지 엔진의 스텔스)이 묻지 않게', () => {
    // 실측(2026-10-11): 등록 코드를 지운 뒤에도 맥 GPU 문자열·코어 4개·Win 10.0·알림 denied 가 남았다.
    //   puppeteer-extra 는 단일 객체라 다른 모듈이 등록한 스텔스가 발행 크롬 실행에도 적용됐기 때문이다.
    expect(sessions).toMatch(/^import puppeteer(?:, \{[^}]*\})? from 'puppeteer';/m);
    expect(sessions).not.toMatch(/from 'puppeteer-extra'/);
    expect(engine).not.toMatch(/from 'puppeteer-extra'/);
  });

  it('세션 관리자: 스텔스 플러그인·페이지 덧씌우기·가짜 화면·가짜 뷰포트·시간대 에뮬레이션이 없다', () => {
    expect(sessions).not.toContain('puppeteer-extra-plugin-stealth');
    expect(sessions).not.toContain('enabledEvasions');
    expect(sessions).not.toContain('evaluateOnNewDocument(');
    expect(sessions).not.toContain('setViewport(');
    expect(sessions).not.toContain('emulateTimezone(');
    expect(sessions).not.toContain('setUserAgent(');
    expect(sessions).not.toMatch(/--window-size=/);
    expect(sessions).not.toMatch(/webGL|Iris|GTX|hardwareConcurrency|deviceMemory/);
    expect(sessions).toContain('defaultViewport: null');
    expect(sessions).toContain("ignoreDefaultArgs: ['--enable-automation']");
    expect(sessions).toContain("'--disable-blink-features=AutomationControlled'");
  });

  it('세션 관리자: WebRTC IP 차단 인자는 프록시를 쓸 때만 붙는다', () => {
    const launch = sessions.slice(sessions.indexOf('const launchArgs = ['), sessions.indexOf('const launchOptions: Parameters<typeof puppeteer.launch>[0]'));
    const proxyBlock = launch.slice(launch.indexOf('if (proxyUrl) {'));
    const beforeProxy = launch.slice(0, launch.indexOf('if (proxyUrl) {'));
    expect(beforeProxy).not.toMatch(/webrtc/i);
    expect(proxyBlock).toContain('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
    expect(launch).not.toContain('WebRtcHideLocalIpsWithMdns');
  });

  it('발행 엔진: UA·브랜드·GPU·캔버스·WebRTC·화면 덧씌우기와 사이트 격리 해제가 없다', () => {
    expect(engine).not.toContain('setupStealthSupplements');
    expect(engine).not.toContain('setUserAgentOverride');
    expect(engine).not.toContain('evaluateOnNewDocument(');
    expect(engine).not.toContain('buildNaverAutomationProfile');
    expect(engine).not.toContain('detectChromeFullVersion');
    expect(engine).not.toMatch(/UNMASKED_VENDOR|toDataURL = function|Sec-CH-UA|--window-size=|deviceScaleFactor|IsolateOrigins|disable-site-isolation-trials/);
    expect(engine).toContain('defaultViewport: null');
    expect(engine).toContain("ignoreDefaultArgs: ['--enable-automation']");
  });

  it('발행 엔진: WebRTC IP 차단 인자는 계정별 프록시를 쓸 때만 붙는다', () => {
    const launch = engine.slice(engine.indexOf('const launchOptions: Parameters<typeof puppeteer.launch>[0] = {'), engine.indexOf('this.browser = await puppeteer.launch(launchOptions);'));
    const argsList = launch.slice(0, launch.indexOf('ignoreDefaultArgs'));
    expect(argsList).not.toMatch(/webrtc/i);
    expect(launch.slice(launch.indexOf('ignoreDefaultArgs'))).toMatch(/proxy[\s\S]*webrtc-ip-handling-policy=disable_non_proxied_udp/i);
  });
});
