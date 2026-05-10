/**
 * Flow/ImageFX overlay 차단 패턴 단위 테스트.
 *
 * flowGenerator.ts와 imageFxGenerator.ts의 인라인 정규식과 *동일 출처*로
 * 회귀 자동 검증. Google labs UI 변경 시 본 테스트가 가장 먼저 깨져야 안전.
 */

import { describe, it, expect } from 'vitest';
import {
  OVERLAY_URL_RE,
  OVERLAY_TEXT_RE,
  SAFE_TEXT_RE,
  FLOW_CDN_RE,
  GENERATED_IMAGE_ALT_RE,
  RELOAD_RECOVERABLE_RE,
  isOverlayUrl,
  isFlowCdnUrl,
  isGeneratedImageAlt,
  isReloadRecoverable,
} from '../image/flowOverlayPatterns';

describe('OVERLAY_URL_RE — iframe overlay URL 매칭', () => {
  // 실제 사용자 디버그 로그에서 추출
  it('실제 changelog URL (사용자 디버그)', () => {
    expect(isOverlayUrl(
      'https://www.gstatic.com/aitestkitchen/website/flow/changelogs/2026-04-28-v0-08018419-2523-4641-976f-6293a72c7524.html',
    )).toBe(true);
  });

  it.each([
    'https://x.com/changelog/2026-05-09.html',
    'https://x.com/changelogs/abc.html',
    'https://x.com/whats_new.html',
    'https://x.com/whats-new/v2.html',
    'https://x.com/whatsnew/index.html',
    'https://x.com/banner/promo.html',
    'https://x.com/survey/feedback.html',
    'https://x.com/consent/cookies.html',
    'https://x.com/onboarding/tour.html',
    'https://x.com/promo/spring2026.html',
  ])('overlay 판정: %s', (url) => {
    expect(isOverlayUrl(url)).toBe(true);
  });

  it.each([
    'https://media.getMediaUrlRedirect/abc',
    'https://flowMedia.googleapis.com/abc',
    'https://googleusercontent.com/abc',
    'https://accounts.google.com/signin',
    'https://labs.google/fx/tools/flow',
    'https://example.com/api/v1/users',
    '',
  ])('정상 URL (false): %s', (url) => {
    expect(isOverlayUrl(url)).toBe(false);
  });

  it('null/undefined 안전', () => {
    expect(isOverlayUrl(null)).toBe(false);
    expect(isOverlayUrl(undefined)).toBe(false);
  });
});

describe('OVERLAY_TEXT_RE — dialog 텍스트 매칭', () => {
  it.each([
    "What's new in Flow",
    'Whats new — version 2',
    '새로운 기능을 확인하세요',
    '변경 사항이 있습니다',
    'Take the tour',
    'Guide me through',
    'Welcome to onboarding!',
    '시작하기 가이드',
    '소개합니다',
  ])('overlay text: %s', (text) => {
    expect(OVERLAY_TEXT_RE.test(text)).toBe(true);
  });

  it('정상 dialog 텍스트는 false', () => {
    expect(OVERLAY_TEXT_RE.test('Sign in to continue')).toBe(false);
    expect(OVERLAY_TEXT_RE.test('Enter prompt here')).toBe(false);
  });
});

describe('SAFE_TEXT_RE — 화이트리스트 (로그인/입력)', () => {
  it.each([
    'Sign in to your account',
    '로그인하시겠습니까?',
    'Enter email address',
    'Password is required',
    '비밀번호를 입력하세요',
    'prompt input',
    '프롬프트를 입력하세요',
  ])('safe text: %s', (text) => {
    expect(SAFE_TEXT_RE.test(text)).toBe(true);
  });

  it('overlay 텍스트는 화이트리스트에 안 걸림', () => {
    expect(SAFE_TEXT_RE.test("What's new in Flow")).toBe(false);
    expect(SAFE_TEXT_RE.test('새로운 기능')).toBe(false);
  });
});

describe('FLOW_CDN_RE — 이미지 응답 CDN URL', () => {
  it.each([
    'https://media.getMediaUrlRedirect/abc',
    'https://www.googleusercontent.com/img/123',
    'https://lh3.googleusercontent.com/proxy',
    'https://www.gstatic.com/aitestkitchen/img.jpg',
    'https://labs.google/api/flow/image',
    'https://aitestkitchen.googleapis.com/img',
    'https://flowMedia.example/abc',
    'https://flow-media.example/abc',
  ])('CDN 매칭: %s', (url) => {
    expect(isFlowCdnUrl(url)).toBe(true);
  });

  it('overlay URL은 CDN 매칭에서 사전 제외', () => {
    expect(isFlowCdnUrl('https://www.gstatic.com/aitestkitchen/website/flow/changelogs/2026-04-28.html')).toBe(false);
    expect(isFlowCdnUrl('https://example.com/banner/img.png')).toBe(false);
  });

  it('일반 외부 URL은 false', () => {
    expect(isFlowCdnUrl('https://example.com/image.png')).toBe(false);
    expect(isFlowCdnUrl('')).toBe(false);
    expect(isFlowCdnUrl(null)).toBe(false);
  });
});

describe('GENERATED_IMAGE_ALT_RE — alt 텍스트 다국어 14언어', () => {
  it.each([
    ['ko-1', '생성된 이미지'],
    ['ko-2', '이미지 결과'],
    ['ko-3', '생성됨'],
    ['en-1', 'Generated image'],
    ['en-2', 'Generated content'],
    ['cn-simplified', '已生成'],
    ['cn-image', '生成图像'],
    ['jp-1', '生成された'],
    ['fr-1', 'Image générée'],
    ['es-1', 'Imagen generada'],
    ['de-1', 'Generiertes Bild'],
    ['it-1', 'Immagine generata'],
    ['ru-1', 'Сгенерированное изображение'],
    ['pt-1', 'Imagem Gerada'],
    ['th-1', 'รูปภาพที่สร้างแล้ว'],
  ])('%s: %s', (_lang, text) => {
    expect(isGeneratedImageAlt(text)).toBe(true);
  });

  it('일반 alt는 false', () => {
    expect(isGeneratedImageAlt('avatar')).toBe(false);
    expect(isGeneratedImageAlt('logo')).toBe(false);
    expect(isGeneratedImageAlt('thumbnail')).toBe(false);
    expect(isGeneratedImageAlt('')).toBe(false);
    expect(isGeneratedImageAlt(null)).toBe(false);
  });
});

describe('isReloadRecoverable — page.reload 폴백 트리거 조건', () => {
  it.each([
    'locator.click: Timeout 30000ms exceeded.',
    'FLOW_PROMPT_INPUT_NOT_FOUND:Flow 프롬프트 입력창을 찾지 못했습니다.',
    'FLOW_SUBMIT_BUTTON_NOT_FOUND:전송 버튼(arrow_forward)을 10초 내 찾지 못함.',
    'FLOW_IMAGE_TIMEOUT:Flow 이미지 생성이 120초 안에 끝나지 않았습니다.',
    '<iframe>...subtree intercepts pointer events',
  ])('recoverable: %s', (msg) => {
    expect(isReloadRecoverable(msg)).toBe(true);
  });

  it.each([
    'FLOW_BROWSER_LAUNCH_FAILED:모든 브라우저 실행 실패',
    'FLOW_LOGIN_TIMEOUT:Google 로그인 시간이 30분을 넘었습니다',
    'FLOW_PROJECT_REDIRECT_TIMEOUT:URL 리다이렉트 30초 초과',
    'AdsPower 연결 실패',
    'EPERM: operation not permitted',
  ])('non-recoverable (reload skip): %s', (msg) => {
    expect(isReloadRecoverable(msg)).toBe(false);
  });

  it('빈 메시지는 false', () => {
    expect(isReloadRecoverable('')).toBe(false);
    expect(isReloadRecoverable(null as any)).toBe(false);
  });
});

describe('교차 검증 — 사용자 실제 디버그 로그 시나리오', () => {
  it('flow-debug-20260506 케이스: changelog iframe → reload trigger', () => {
    const errMsg = 'locator.click: Timeout 30000ms exceeded. Call log: <iframe src="https://www.gstatic.com/aitestkitchen/website/flow/changelogs/2026-04-28.html"></iframe> from <div class="hHCoWD"> subtree intercepts pointer events';
    // overlay URL 감지
    const urlMatch = errMsg.match(/src="([^"]+)"/);
    expect(urlMatch).not.toBeNull();
    expect(isOverlayUrl(urlMatch![1])).toBe(true);
    // reload 폴백 대상
    expect(isReloadRecoverable(errMsg)).toBe(true);
  });

  it('alt 텍스트 매칭 실패 케이스 (Google이 새 패턴 도입 가정)', () => {
    // 만약 Google이 "Result image"라는 새 텍스트로 변경하면 매칭 X — 이 테스트가 빨갛게 떠야 함
    expect(isGeneratedImageAlt('Result image')).toBe(false); // 의도적 false (새 패턴 도입 시 확장 필요)
  });
});

describe('정규식 자체 검증 (회귀 방지)', () => {
  it('OVERLAY_URL_RE는 i 플래그 (대소문자 무시)', () => {
    expect(OVERLAY_URL_RE.flags).toContain('i');
  });
  it('GENERATED_IMAGE_ALT_RE는 i 플래그', () => {
    expect(GENERATED_IMAGE_ALT_RE.flags).toContain('i');
  });
  it('FLOW_CDN_RE는 i 플래그', () => {
    expect(FLOW_CDN_RE.flags).toContain('i');
  });
});
