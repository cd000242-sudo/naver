/**
 * [2026-09-15 사장님 실측] "메인 풀오토 이미지 설정 → Flow Google 계정연동이
 * Step 1/3 로그인중에서 계속 그대로입니다. 로그인이 되지 않고 있어요."
 *
 * 원인: 버튼 라벨은 "Google 계정 연동 (Flow)" 인데 1단계에서 ImageFX 로그인을 돌렸다.
 *   - ImageFX 경로는 세션이 잡힐 때까지 최대 15분(5초 × 180회) 블로킹한다
 *   - ImageFX 프로필(imagefx-chrome-profile)은 Flow 프로필(flow-chromium-profile)과 별개라
 *     그 15분이 성공해도 Flow 로그인에는 아무 도움이 안 된다
 *   - 그 동안 화면은 "Step 1/3" 고정 문구 그대로라 멈춘 것으로 보인다
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const settings = readFileSync(
  resolve(__dirname, '../renderer/components/HeadingImageSettings.ts'),
  'utf8',
);
const imageFx = readFileSync(resolve(__dirname, '../image/imageFxGenerator.ts'), 'utf8');
const flow = readFileSync(resolve(__dirname, '../image/flowGenerator.ts'), 'utf8');

/** 연동 버튼 핸들러 본문만 떼어낸다 — 다른 버튼의 코드가 섞이지 않게. */
function connectHandlerSource(): string {
  const start = settings.indexOf("document.getElementById('switch-google-account-btn')?.addEventListener");
  const end = settings.indexOf("document.getElementById('test-flow-connection-btn')?.addEventListener", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return settings.slice(start, end);
}

describe('Flow Google 계정 연동', () => {
  it('ImageFX 를 고르지 않았으면 ImageFX 로그인을 돌리지 않는다', () => {
    const handler = connectHandlerSource();
    // 호출은 남아 있어도 되지만, 반드시 엔진 조건 뒤에 있어야 한다.
    const guardAt = handler.indexOf("=== 'imagefx'");
    const callAt = handler.indexOf('switchImageFxGoogleAccount');
    expect(guardAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(guardAt);
    expect(handler).toMatch(/if\s*\(needsImageFxLogin\)/);
  });

  it('두 로그인은 프로필이 달라 서로 대체되지 않는다 — 가드가 필요한 근거', () => {
    expect(imageFx).toMatch(/imagefx-chrome-profile/);
    expect(flow).toMatch(/flow-chromium-profile/);
  });

  it('ImageFX 로그인은 최대 15분 블로킹한다 — 무조건 태우면 안 되는 근거', () => {
    // 5초 간격 × 180회. 숫자가 바뀌면 이 테스트가 알려 준다.
    expect(imageFx).toMatch(/for\s*\(let i = 0; i < 180; i\+\+\)/);
  });

  it('진행 중에는 경과 시간과 메인 진행 로그를 화면에 비춘다 — 멈춘 것처럼 보이지 않게', () => {
    const handler = connectHandlerSource();
    expect(handler).toMatch(/image-generation:log/);
    expect(handler).toMatch(/setInterval\(paintStatus/);
    // 끝나면 반드시 정리한다 — 모달을 여닫을 때마다 타이머가 쌓이면 안 된다.
    expect(handler).toMatch(/clearInterval\(progressTicker\)/);
    expect(handler).toMatch(/unsubscribeProgress\?\.\(\)/);
  });

  it('없어진 3단계 표기를 화면에 더 이상 쓰지 않는다', () => {
    // 주석에는 사장님 제보 문구가 남아 있어도 된다 — 화면에 나가는 코드만 본다.
    const code = connectHandlerSource()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/Step 1\/3/);
  });

  it('상태 줄에 들어가는 계정명·메시지는 이스케이프한다', () => {
    expect(settings).toMatch(/function escapeHtmlForStatus/);
    expect(connectHandlerSource()).toMatch(/escapeHtmlForStatus\(userName\)/);
  });
});
