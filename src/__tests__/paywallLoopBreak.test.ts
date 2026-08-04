import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-05] 무료 한도 소진 시 발행 루프 즉시 중단.
 *
 * 이전 동작: 3건을 쓴 뒤 4번째부터 main이 code:'PAYWALL'을 반환하는데,
 * 루프는 그 항목만 실패 처리하고 다음 항목으로 계속 진행했다. 연속 실패
 * 5회를 채워야 멈춰서 사용자는 "5번 실패했다"로 원인을 오해했다.
 *
 * 계약: 한도 소진 신호가 서면 남은 항목을 헛돌지 않고 즉시 멈추고,
 * 왜 멈췄는지 로그로 알린다. 유료 사용자와 한도 이내 무료 사용자에게는
 * 신호 자체가 발생하지 않으므로 영향이 없다.
 */
const PUBLISH_LOOPS: ReadonlyArray<readonly [string, string]> = [
  ['연속 발행', 'renderer/modules/continuousPublishing.ts'],
  ['일괄(반자동) 발행', 'renderer/renderer.ts'],
  ['다중계정 발행', 'renderer/modules/publishingHandlers.ts'],
  ['다중계정 풀오토 큐', 'renderer/modules/multiAccountManager.ts'],
];

describe('한도 소진 시 발행 루프가 즉시 멈춘다', () => {
  it('페이월 상태 조회 함수가 있고 전역으로 노출된다', () => {
    const src = read('renderer/modules/paywallSystem.ts');
    expect(src).toContain('export function isPaywallActive(): boolean');
    expect(src).toContain('return paywallActive;');
    // minify 후에도 루프에서 참조할 수 있어야 한다
    expect(src).toContain('(window as any).isPaywallActive = isPaywallActive;');
  });

  it('4개 발행 루프가 모두 한도 소진을 확인한다', () => {
    for (const [label, mod] of PUBLISH_LOOPS) {
      const src = read(mod);
      expect(src, `${label}(${mod})에 한도 확인이 없습니다`)
        .toContain("(window as any).isPaywallActive?.() === true");
    }
  });

  it('멈춘 이유를 사용자에게 알린다 (조용한 중단 금지)', () => {
    for (const [label, mod] of PUBLISH_LOOPS) {
      const src = read(mod);
      expect(src, `${label}에 안내 로그가 없습니다`)
        .toContain('오늘 무료 발행 횟수를 모두 사용해');
    }
  });

  it('연속 발행은 모드까지 정지시킨다 (break만 하면 "완료"로 오표시)', () => {
    const src = read('renderer/modules/continuousPublishing.ts');
    expect(src).toMatch(
      /isPaywallActive\?\.\(\) === true\) \{[\s\S]{0,400}?stopContinuousMode\('manual'\);[\s\S]{0,40}?break;/,
    );
  });

  it('한도 확인이 루프 본문 최상단에 있다', () => {
    // 다른 검사 뒤에 두면 한 항목을 더 시도한 뒤에야 멈춘다.
    // 파일 전체가 아니라 해당 루프 안에서만 순서를 확인한다.
    const src = read('renderer/renderer.ts');
    const loopStart = src.indexOf('for (let i = 0; i < publishQueue.length; i++) {');
    expect(loopStart).toBeGreaterThan(0);

    const loopHead = src.slice(loopStart, loopStart + 900);
    const gateIdx = loopHead.indexOf("(window as any).isPaywallActive?.() === true");
    const stopIdx = loopHead.indexOf("(window as any).stopBatchPublish");
    expect(gateIdx, '루프 본문에서 한도 확인을 찾지 못했습니다').toBeGreaterThan(0);
    expect(stopIdx, '루프 본문에서 중지 확인을 찾지 못했습니다').toBeGreaterThan(0);
    expect(gateIdx).toBeLessThan(stopIdx);
  });

  it('무료 한도 상수는 여전히 매일 3회다', async () => {
    const { FREE_TRIAL_DAILY_PUBLISH_LIMIT } = await import('../freeTrialPolicy');
    expect(FREE_TRIAL_DAILY_PUBLISH_LIMIT).toBe(3);
  });
});
