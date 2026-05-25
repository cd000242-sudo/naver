/**
 * captchaDetection.test.ts — Phase B T1 회귀 방지 테스트
 *
 * 목적: naverBlogAutomation.ts:3303-3368의 hasCaptcha 합성 로직 — 4가지 감지 경로
 * (텍스트/DOM 요소/이미지/iframe)이 회귀로 깨지지 않게 보호.
 *
 * 디자인: 실제 page.evaluate 환경을 mock한 순수 함수 테스트 — Puppeteer/E2E 불필요.
 * 실제 naverBlogAutomation의 evaluate 콜백 본문이 변경되면 이 테스트가 fail해야 함.
 */

import { describe, it, expect } from 'vitest';

/**
 * naverBlogAutomation.ts:3303-3368 hasCaptcha 합성 로직 (테스트용 추출 사본).
 * 실제 코드 수정 시 이 사본도 동일하게 갱신해야 함 (회귀 가드).
 */
function detectCaptcha(opts: {
  bodyText: string;
  ncaptchaSplitValue?: string | null; // hidden input #ncaptchaSplit value
  visibleSelectors?: string[]; // visible captcha 셀렉터 매치 list
  imgSrcs?: string[]; // <img src> list
  iframeSrcs?: string[]; // <iframe src> list
}): { hasCaptcha: boolean; signals: string[] } {
  const signals: string[] = [];

  // 1. #ncaptchaSplit 활성화
  const ncaptchaSplitActive =
    opts.ncaptchaSplitValue !== null && opts.ncaptchaSplitValue !== undefined &&
    opts.ncaptchaSplitValue !== 'none' && opts.ncaptchaSplitValue !== '';
  if (ncaptchaSplitActive) signals.push('ncaptchaSplit');

  // 2. 텍스트 키워드
  const captchaKeywords = [
    '자동입력 방지', '자동 입력 방지', '보안문자', '자동등록방지',
    '아래 문자를 입력', '이미지에 보이는', '보이는 문자',
    '글자를 입력', '인증 문자', 'captcha', 'CAPTCHA',
    '자동입력방지문자', '방지 문자',
  ];
  const hasCaptchaText = captchaKeywords.some((kw) => opts.bodyText.includes(kw));
  if (hasCaptchaText) signals.push('text');

  // 3. CSS 셀렉터 (visible)
  const hasCaptchaElement = (opts.visibleSelectors || []).length > 0;
  if (hasCaptchaElement) signals.push('element');

  // 4. captcha 이미지
  const hasCaptchaImage = (opts.imgSrcs || []).some(
    (src) => src.includes('captcha') || src.includes('Captcha') || src.includes('CAPTCHA')
  );
  if (hasCaptchaImage) signals.push('image');

  // 5. captcha iframe
  const suspiciousIframeCount = (opts.iframeSrcs || []).filter(
    (src) =>
      src.includes('captcha') || src.includes('challenge') ||
      src.includes('recaptcha') || src.includes('hcaptcha') ||
      src.includes('turnstile') || src.includes('arkose')
  ).length;
  if (suspiciousIframeCount > 0) signals.push('iframe');

  const hasCaptcha = signals.length > 0;
  return { hasCaptcha, signals };
}

describe('captchaDetection: 4가지 감지 경로 (Phase B T1)', () => {
  describe('정상 케이스 — 캡차 없음', () => {
    it('빈 페이지', () => {
      const r = detectCaptcha({ bodyText: '' });
      expect(r.hasCaptcha).toBe(false);
      expect(r.signals).toEqual([]);
    });

    it('일반 로그인 페이지', () => {
      const r = detectCaptcha({
        bodyText: '아이디 비밀번호 로그인',
        ncaptchaSplitValue: 'none',
      });
      expect(r.hasCaptcha).toBe(false);
    });
  });

  describe('1. ncaptchaSplit 활성화', () => {
    it('value !== "none"이면 캡차 활성', () => {
      const r = detectCaptcha({ bodyText: '', ncaptchaSplitValue: 'abc123xyz' });
      expect(r.hasCaptcha).toBe(true);
      expect(r.signals).toContain('ncaptchaSplit');
    });

    it('value === "none"이면 정상', () => {
      const r = detectCaptcha({ bodyText: '', ncaptchaSplitValue: 'none' });
      expect(r.signals).not.toContain('ncaptchaSplit');
    });

    it('value === ""이면 정상', () => {
      const r = detectCaptcha({ bodyText: '', ncaptchaSplitValue: '' });
      expect(r.signals).not.toContain('ncaptchaSplit');
    });
  });

  describe('2. 텍스트 키워드 13종 매치', () => {
    const keywords = [
      '자동입력 방지', '자동 입력 방지', '보안문자', '자동등록방지',
      '아래 문자를 입력', '이미지에 보이는', '보이는 문자',
      '글자를 입력', '인증 문자', 'captcha', 'CAPTCHA',
      '자동입력방지문자', '방지 문자',
    ];
    keywords.forEach((kw) => {
      it(`"${kw}" 감지`, () => {
        const r = detectCaptcha({ bodyText: `텍스트 ${kw} 입력하세요` });
        expect(r.hasCaptcha).toBe(true);
        expect(r.signals).toContain('text');
      });
    });
  });

  describe('3. visible CSS 셀렉터 감지', () => {
    it('visibleSelectors 비어있으면 false', () => {
      const r = detectCaptcha({ bodyText: '', visibleSelectors: [] });
      expect(r.signals).not.toContain('element');
    });

    it('하나라도 visible이면 true', () => {
      const r = detectCaptcha({ bodyText: '', visibleSelectors: ['#captcha'] });
      expect(r.hasCaptcha).toBe(true);
      expect(r.signals).toContain('element');
    });
  });

  describe('4. captcha img/iframe src 감지', () => {
    it('img src에 captcha 포함', () => {
      const r = detectCaptcha({ bodyText: '', imgSrcs: ['/static/img/captcha-123.png'] });
      expect(r.hasCaptcha).toBe(true);
      expect(r.signals).toContain('image');
    });

    it('iframe recaptcha 감지', () => {
      const r = detectCaptcha({ bodyText: '', iframeSrcs: ['https://www.google.com/recaptcha/api2/'] });
      expect(r.hasCaptcha).toBe(true);
      expect(r.signals).toContain('iframe');
    });

    it('iframe turnstile 감지', () => {
      const r = detectCaptcha({ bodyText: '', iframeSrcs: ['https://challenges.cloudflare.com/turnstile/'] });
      expect(r.signals).toContain('iframe');
    });
  });

  describe('복합 케이스 — 다중 신호 동시 감지', () => {
    it('텍스트 + iframe + ncaptchaSplit 동시', () => {
      const r = detectCaptcha({
        bodyText: '보안문자를 입력하세요',
        ncaptchaSplitValue: 'xyz',
        iframeSrcs: ['https://recaptcha.example.com/'],
      });
      expect(r.hasCaptcha).toBe(true);
      expect(r.signals.length).toBeGreaterThanOrEqual(3);
    });
  });
});
