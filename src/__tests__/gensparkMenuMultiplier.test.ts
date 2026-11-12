// @vitest-environment happy-dom
// [2026-11-12 실측] 젠스파크 모델 메뉴의 크레딧 배수 읽기와 서버 과부하 거절 문구 신호 시험 — 실측 구조를 흉내 낸 고정 HTML(실제 접속 없음).
import { describe, expect, it } from 'vitest';
import { readGensparkModelMenu, readGensparkPageSignals } from '../image/genspark/gensparkSelectors';

const item = (lines: string[]): string =>
  `<div class="model-container">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;

// [2026-11-12 실측] 젠스파크가 모델 메뉴를 바꿨다 — 'No credit cost' 가 없어지고 모든 모델 옆에 크레딧 배수가 붙는다
//   (메뉴 글자 예: "GPT Image 2.5 $$ $$ 1×", "Nano Banana 2.1 $$ $$ 0.63×"). 이름은 첫 줄 그대로, 배수는 별도로 읽는다.
describe('readGensparkModelMenu — 크레딧 배수 메뉴(2026-11-12)', () => {
  const html = (items: string[]) => `<div class="v-binder-follower-content">${items.join('')}</div>`;

  it('이름은 그대로 읽고 배수는 creditMultiplier 로 읽는다(무제한 표시가 없으니 creditFree 는 false)', () => {
    document.body.innerHTML = html([
      item(['모델 자동 선택']),
      item(['Nano Banana 2.1', '$$ $$', '0.63×']),
      item(['GPT Image 2.5', '$$ $$', '1×']),
      item(['New', 'GPT Image 2.6', '$$ $$', '1×']),
      item(['Bytedance Seedream 5.0 Pro', '$$ $$', '0.85×']),
    ]);
    const items = readGensparkModelMenu();
    expect(items.map((i) => i.label)).toEqual([
      '모델 자동 선택', 'Nano Banana 2.1', 'GPT Image 2.5', 'GPT Image 2.6', 'Bytedance Seedream 5.0 Pro',
    ]);
    expect(items[2]).toEqual({ label: 'GPT Image 2.5', creditFree: false, needsInput: false, isNew: false, creditMultiplier: '1×' });
    expect(items[1].creditMultiplier).toBe('0.63×');
    expect(items[3]).toMatchObject({ label: 'GPT Image 2.6', isNew: true, creditMultiplier: '1×' });
    expect(items[4].creditMultiplier).toBe('0.85×');
    // 배수가 없는 항목(모델 자동 선택)은 필드를 두지 않는다
    expect('creditMultiplier' in items[0]).toBe(false);
  });

  it('배수 글자가 여러 조각으로 나뉘어도 읽고, 이름 속 숫자(2.5, 2.1)를 배수로 착각하지 않는다', () => {
    document.body.innerHTML = html([
      item(['GPT Image 2.5', '$$', '$$', '1', '×']),
      item(['Nano Banana 2 Flash Lite', '$$ $$', '0.63 ×']),
      item(['Nano Banana Pro', '$$ $$']),
    ]);
    const items = readGensparkModelMenu();
    expect(items.map((i) => i.creditMultiplier)).toEqual(['1×', '0.63×', undefined]);
    expect(items[2].label).toBe('Nano Banana Pro');
  });

  it('할인 배지가 붙어도 마지막 배수(지금 값)를 쓴다', () => {
    document.body.innerHTML = html([item(['Bytedance Seedream 5.5', '40% 할인', '0.3×'])]);
    expect(readGensparkModelMenu()[0].creditMultiplier).toBe('0.3×');
  });

  it("'No credit cost' 가 실제로 보이는 계정이면 그대로 무제한(creditFree)으로 본다", () => {
    document.body.innerHTML = html([item(['GPT Image 2.5', 'No credit cost'])]);
    expect(readGensparkModelMenu()[0]).toMatchObject({ label: 'GPT Image 2.5', creditFree: true });
  });
});

describe('readGensparkPageSignals — 서버 과부하 거절', () => {
  // [2026-11-11 실측(Orbit)] 전송 4초 뒤 "서버가 과부하 상태입니다. 나중에 다시 시도해 주세요." 가 유일한 답이었다 — 제한 신호로 본다.
  it('서버 과부하 거절 문구는 제한(rateLimited)으로 본다', () => {
    document.body.innerHTML = '<p>서버가 과부하 상태입니다. 나중에 다시 시도해 주세요.</p>';
    expect(readGensparkPageSignals().rateLimited).toBe(true);
    document.body.innerHTML = '<p>The server is overloaded. Please try again later.</p>';
    expect(readGensparkPageSignals().rateLimited).toBe(true);
  });

  // 최근 항목 목록에는 지난 프롬프트 제목이 그대로 뜬다 — "멀티탭 과부하" 같은 글감이 생성 화면 전체를 제한으로 막으면 안 된다.
  it('최근 항목에 뜬 글감 제목(과부하·overloaded 단어만 포함)은 제한으로 보지 않는다', () => {
    document.body.innerHTML = '<p>멀티탭 과부하 차단기 설명 이미지</p><p>An overloaded truck on a bridge</p>';
    expect(readGensparkPageSignals().rateLimited).toBe(false);
  });
});
