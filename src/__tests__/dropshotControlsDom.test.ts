// @vitest-environment happy-dom
/**
 * [2026-10-11 실측] 드롭샷 생성 화면: 장수 조절이 input[type=number] 에서 "— 2장 +" 증감 버튼("생성 개수 줄이기/늘리기")으로
 * 바뀌었고, 구독 없는 계정이 무제한 스위치를 켜면 "Pro · Team 구독하면 이미지 생성 무제한" 안내 창이 뜬다.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { detectDropshotSubscriptionPrompt, stepDropshotCountDown } from '../image/dropshotControlsDom';

function stepper(count: number, disabled = false): HTMLButtonElement {
  document.body.innerHTML = `
    <div class="stepper">
      <button type="button" aria-label="생성 개수 줄이기" ${disabled ? 'disabled' : ''}>—</button>
      <span>${count}장</span>
      <button type="button" aria-label="생성 개수 늘리기">+</button>
    </div>`;
  const button = document.querySelector<HTMLButtonElement>('button[aria-label="생성 개수 줄이기"]')!;
  button.getBoundingClientRect = () => ({ width: 24, height: 24 } as DOMRect);
  return button;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('stepDropshotCountDown', () => {
  it('2장이면 "줄이기"를 한 번 누르고 누른 사실을 알린다', () => {
    const button = stepper(2);
    let clicks = 0; button.addEventListener('click', () => { clicks += 1; });
    expect(stepDropshotCountDown()).toEqual({ count: 2, clicked: true });
    expect(clicks).toBe(1);
  });

  it('이미 1장이면 누르지 않는다', () => {
    const button = stepper(1);
    let clicks = 0; button.addEventListener('click', () => { clicks += 1; });
    expect(stepDropshotCountDown()).toEqual({ count: 1, clicked: false });
    expect(clicks).toBe(0);
  });

  it('버튼이 비활성이거나 증감 버튼이 없으면 아무것도 하지 않는다', () => {
    stepper(3, true);
    expect(stepDropshotCountDown()).toEqual({ count: 3, clicked: false });
    document.body.innerHTML = '<input type="number" value="2">';
    expect(stepDropshotCountDown()).toEqual({ count: null, clicked: false });
  });
});

describe('detectDropshotSubscriptionPrompt', () => {
  it('구독 안내 창(Pro · Team 구독하면 이미지 생성 무제한)을 잡아낸다', () => {
    document.body.innerHTML = '<div role="dialog"><span>기간 한정</span><h2>Pro · Team 구독하면 이미지 생성 무제한</h2><button>무제한 혜택 보기</button></div>';
    expect(detectDropshotSubscriptionPrompt()).toContain('구독하면');
  });

  it('평소 생성 화면(무제한 모드 스위치·배너만 있음)은 구독 안내로 보지 않는다', () => {
    document.body.innerHTML = '<div><span>무제한 모드</span><button role="switch" aria-checked="false"></button><button>이미지 생성하기 150</button></div>';
    expect(detectDropshotSubscriptionPrompt()).toBeNull();
  });
});

describe('발행 엔진 연결', () => {
  const browser = readFileSync(resolve('src/image/dropshotBrowser.ts'), 'utf8').replace(/\r\n/g, '\n');
  it('ensureDropshotControls 가 숫자 입력칸 뒤에 증감 버튼으로 1장까지 내리고, 거부 문구에 구독 안내 감지를 싣는다', () => {
    const controls = browser.slice(browser.indexOf('export async function ensureDropshotControls('));
    expect(controls.indexOf('page.evaluate(stepDropshotCountDown)')).toBeGreaterThan(controls.indexOf('input[type="number"]'));
    expect(controls).toContain('page.evaluate(detectDropshotSubscriptionPrompt)');
    expect(controls).toContain('Pro·Team 구독이 없거나 만료');
  });
});
