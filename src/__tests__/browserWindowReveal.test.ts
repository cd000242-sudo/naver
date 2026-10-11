/**
 * [2026-10-11 사장님] "타이핑 보러가기를 누르면 크롬 창이 뜨게, 발행할 때마다 크롬 창이 맨 앞으로 뜨게."
 * 발행 뒤 창은 Win32 SW_HIDE 로 숨겨지고, 그게 실패하면 화면 밖(-32000)으로 밀린 채 최소화된다.
 * 실측: CDP 최소화 → 복원은 SW_HIDE 창을 다시 보이게 한다. 화면 밖 창은 위치부터 바로잡아야 보인다.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isOffscreenBounds, revealBrowserWindow, revealWindowState, type WindowBounds } from '../automation/browserWindowReveal';

function fakeCdp(bounds: WindowBounds) {
  const calls: WindowBounds[] = [];
  return {
    calls,
    cdp: {
      async send(method: string, params?: { windowId: number; bounds: WindowBounds }) {
        if (method === 'Browser.getWindowForTarget') return { windowId: 7, bounds };
        expect(params?.windowId).toBe(7);
        calls.push(params!.bounds);
        return {};
      },
    } as any,
  };
}

describe('isOffscreenBounds', () => {
  it('화면 밖(-32000)으로 밀린 창만 화면 밖으로 본다', () => {
    expect(isOffscreenBounds({ left: -32000, top: -32000 })).toBe(true);
    expect(isOffscreenBounds({ left: -8, top: -8 })).toBe(false);
    expect(isOffscreenBounds({ left: 1920, top: 0 })).toBe(false);
    expect(isOffscreenBounds({})).toBe(false);
  });
});

describe('revealWindowState', () => {
  it('처음처럼 최대화로 돌려놓고, 사용자가 일반 크기로 둔 창은 그대로 둔다', () => {
    expect(revealWindowState('maximized', false)).toBe('maximized');
    expect(revealWindowState('minimized', false)).toBe('maximized');
    expect(revealWindowState(undefined, false)).toBe('maximized');
    expect(revealWindowState('normal', false)).toBe('normal');
    expect(revealWindowState('fullscreen', false)).toBe('fullscreen');
  });

  it('화면 밖에 있던 창은 최대화해서 화면 안으로 들인다', () => {
    expect(revealWindowState('normal', true)).toBe('maximized');
  });
});

describe('revealBrowserWindow', () => {
  it('숨긴(최대화) 창: 최소화했다가 최대화로 복원해 앞으로 올린다', async () => {
    const f = fakeCdp({ left: -8, top: -8, windowState: 'maximized' });
    expect(await revealBrowserWindow(f.cdp)).toBe('maximized');
    expect(f.calls).toEqual([{ windowState: 'minimized' }, { windowState: 'normal' }, { windowState: 'maximized' }]);
  });

  it('화면 밖으로 밀린 최소화 창: 일반 상태로 바꿔 화면 안(0,0)으로 옮긴 뒤 최대화', async () => {
    const f = fakeCdp({ left: -32000, top: -32000, width: 800, height: 600, windowState: 'minimized' });
    expect(await revealBrowserWindow(f.cdp)).toBe('maximized');
    expect(f.calls).toEqual([{ windowState: 'normal' }, { left: 0, top: 0 }, { windowState: 'minimized' }, { windowState: 'normal' }, { windowState: 'maximized' }]);
  });

  it('사용자가 일반 크기로 둔 창은 일반 크기로 돌린다', async () => {
    const f = fakeCdp({ left: 100, top: 50, windowState: 'normal' });
    expect(await revealBrowserWindow(f.cdp)).toBe('normal');
    expect(f.calls).toEqual([{ windowState: 'minimized' }, { windowState: 'normal' }]);
  });

  it('이미 최소화된 창은 한 번 더 최소화하지 않는다(최소화→최대화 직행은 크롬이 거부하므로 일반을 거친다)', async () => {
    const f = fakeCdp({ left: 0, top: 0, windowState: 'minimized' });
    await revealBrowserWindow(f.cdp);
    expect(f.calls).toEqual([{ windowState: 'normal' }, { windowState: 'maximized' }]);
  });
});

describe('발행 엔진 연결', () => {
  const engine = readFileSync(resolve('src/naverBlogAutomation.ts'), 'utf8').replace(/\r\n/g, '\n');
  it('두 발행 경로와 크롬 재시작 직후마다 타이핑 창을 앞으로 띄운다', () => {
    expect(engine.match(/this\.ensureDialogHandler\(\);\n\s*await this\.revealTypingWindow\(\);/g)?.length).toBe(3);
  });
  it('타이핑 보러가기 버튼도 같은 방식(화면 밖 창 위치 바로잡기)을 쓴다', () => {
    const show = engine.slice(engine.indexOf('async showBrowserWindow()'), engine.indexOf('async closeBrowser()'));
    expect(show).toContain('await revealBrowserWindow(client as unknown as WindowCdp);');
    expect(show).not.toContain("bounds: { windowState: 'normal' }");
  });
});
