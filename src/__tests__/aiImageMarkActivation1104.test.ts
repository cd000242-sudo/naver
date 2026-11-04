/**
 * [2026-11-04] 고객 제보 "AI 활용 체크를 켜도 체크가 안 된다". 발행 직전 AI 마크 단계가 이미지를 누른 뒤 400ms 한 번만
 * 버튼을 찾고, 못 찾으면 조용히 넘어가고, 누른 뒤 켜졌는지 확인하지 않고, 결과와 상관없이 "완료"를 찍었다(느린 PC에서
 * 툴바가 늦게 뜨면 통째로 빠진다). 버튼은 최대 2초 기다리고(보이는 것만), 누른 뒤 켜짐을 다시 읽어 확인하고, 요약은
 * 결과대로 쓴다. 이미지를 누르는 방식(좌표 클릭)은 그대로다 — 이 모듈은 찾기 · 확인 · 요약만 맡는다.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  confirmAiMarkActive, findVisibleAiMarkButton, readAiMarkButtonState, summarizeAiMarkResults, waitForAiMarkButton,
} from '../automation/aiImageMark';

type FakeState = { visible: boolean; active: boolean };
const button = (state: () => FakeState) => ({ evaluate: vi.fn(async () => state()) });
const scope = (buttons: () => unknown[]) => ({ $$: vi.fn(async () => buttons()) });
const noDelay = vi.fn(async () => undefined);

describe('readAiMarkButtonState (runs in the editor frame)', () => {
  const el = (attrs: Record<string, string>, cls: string[] = [], rect = { width: 20, height: 20 }, style = {}) => ({
    getBoundingClientRect: () => rect,
    classList: { contains: (c: string) => cls.includes(c) },
    getAttribute: (k: string) => attrs[k] ?? null,
    disabled: false,
    __style: { display: 'block', visibility: 'visible', ...style },
  });
  it('active by class, aria-pressed or aria-checked; hidden or zero-size is not visible', () => {
    (globalThis as any).window = { getComputedStyle: (b: any) => b.__style };
    expect(readAiMarkButtonState(el({}, ['se-is-selected']) as any)).toEqual({ visible: true, active: true });
    expect(readAiMarkButtonState(el({ 'aria-pressed': 'true' }) as any).active).toBe(true);
    expect(readAiMarkButtonState(el({ 'aria-checked': 'true' }) as any).active).toBe(true);
    expect(readAiMarkButtonState(el({}) as any)).toEqual({ visible: true, active: false });
    expect(readAiMarkButtonState(el({}, [], { width: 0, height: 0 }) as any).visible).toBe(false);
    expect(readAiMarkButtonState(el({}, [], undefined, { display: 'none' }) as any).visible).toBe(false);
  });
});

describe('finding and confirming the AI mark button', () => {
  it('component scope first, then the frame; hidden duplicates are skipped', async () => {
    const hidden = button(() => ({ visible: false, active: false }));
    const shown = button(() => ({ visible: true, active: false }));
    const found = await findVisibleAiMarkButton(scope(() => [hidden]) as any, scope(() => [shown]) as any);
    expect(found?.button).toBe(shown);
  });

  it('a toolbar that shows up late is still found (polling, not one 400 ms look)', async () => {
    let calls = 0;
    const late = button(() => ({ visible: true, active: false }));
    const component = scope(() => (++calls >= 4 ? [late] : []));
    const found = await waitForAiMarkButton(component as any, scope(() => []) as any, noDelay);
    expect(found?.button).toBe(late);
  });

  it('no button within the wait → null (the caller logs it, never "완료")', async () => {
    expect(await waitForAiMarkButton(scope(() => []) as any, scope(() => []) as any, noDelay)).toBeNull();
  });

  it('after the click the mark is re-read until it is on, otherwise unconfirmed', async () => {
    let reads = 0;
    const turnsOn = button(() => ({ visible: true, active: ++reads >= 2 }));
    expect(await confirmAiMarkActive(scope(() => [turnsOn]) as any, scope(() => []) as any, noDelay)).toBe(true);
    const staysOff = button(() => ({ visible: true, active: false }));
    expect(await confirmAiMarkActive(scope(() => [staysOff]) as any, scope(() => []) as any, noDelay)).toBe(false);
  });
});

describe('summarizeAiMarkResults', () => {
  it('"완료" only when every target was turned on or already on', () => {
    expect(summarizeAiMarkResults(['enabled', 'already-enabled', 'enabled'])).toBe('✅ [AI 마크] AI 활용 표시 완료 — 켬 2 · 이미 켜짐 1');
    const partial = summarizeAiMarkResults(['enabled', 'button-missing', 'unconfirmed']);
    expect(partial).toBe('⚠️ [AI 마크] AI 활용 표시 일부 실패 — 켬 1 · 이미 켜짐 0 · 버튼 못 찾음 1 · 켜짐 미확인 1 (발행 후 해당 이미지의 AI 활용 표시를 확인해 주세요)');
    expect(partial).not.toContain('완료');
    expect(summarizeAiMarkResults([])).toBe('ℹ️ [AI 마크] 표시할 AI 이미지가 없습니다');
  });
});
