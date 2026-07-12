import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('continuous Flow publish handoff regression guard', () => {
  const originalWindow = (globalThis as any).window;

  beforeAll(() => {
    (globalThis as any).window = {};
  });

  afterAll(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  it('does not inherit a cancelled full-auto modal during continuous publishing', async () => {
    const { resolveFullAutoProgressModal } = await import('../renderer/utils/fullAutoUtils.js');
    const staleModal = { cancelled: true } as any;

    expect(resolveFullAutoProgressModal(staleModal, true)).toBeNull();
    expect(resolveFullAutoProgressModal(staleModal, false)).toBe(staleModal);
  });

  it('keeps lexical and window continuous-mode state synchronized at every transition', () => {
    const continuous = read('renderer/modules/continuousPublishing.ts');
    const renderer = read('renderer/renderer.ts');
    const fullAutoUtils = read('renderer/utils/fullAutoUtils.ts');

    expect(continuous).toContain('function setContinuousModeState(active: boolean): void');
    expect(continuous).toContain('isContinuousMode = active;');
    expect(continuous).toContain('(window as any).isContinuousMode = active;');
    expect(continuous.match(/setContinuousModeState\(true\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(continuous.match(/setContinuousModeState\(false\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(continuous).not.toMatch(/\bisContinuousMode\s*=\s*(?:true|false)\s*;/);
    expect(renderer).toContain('(window as any).isContinuousMode = isContinuousMode;');
    expect(fullAutoUtils).not.toContain("setWindowState('isContinuousMode', false);");
  });

  it('isolates continuous publishing from stale modal cancellation and fails open on CTA lookup', () => {
    const fullAuto = read('renderer/modules/fullAutoFlow.ts');

    expect(fullAuto.match(/resolveFullAutoProgressModal\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(fullAuto).toMatch(/try\s*{\s*autoLinkPreviousPost\(formData, modal\);\s*}\s*catch/);
  });

  it('distinguishes entering the renderer flow from dispatching automation to the main process', () => {
    const continuous = read('renderer/modules/continuousPublishing.ts');
    const fullAuto = read('renderer/modules/fullAutoFlow.ts');
    const renderer = read('renderer/renderer.ts');

    expect(renderer).toContain('(window as any)._publishAutomationDispatched = false;');

    const dispatchMarkerIndex = fullAuto.indexOf("window._publishAutomationDispatched = true;");
    const runAutomationIndex = fullAuto.indexOf("apiClient.call('runAutomation', [payload]");
    expect(dispatchMarkerIndex).toBeGreaterThan(-1);
    expect(runAutomationIndex).toBeGreaterThan(dispatchMarkerIndex);

    expect(continuous).toContain('const publishWasDispatched = (window as any)._publishAutomationDispatched === true;');
    expect(continuous).toContain('if ((item as any)._publishStarted && publishWasDispatched)');
  });

  it('announces and reasserts the continuous state before the login handoff', () => {
    const continuous = read('renderer/modules/continuousPublishing.ts');
    const handoffIndex = continuous.indexOf('네이버 로그인 및 발행 단계로 이동합니다.');
    const publishIndex = continuous.indexOf("await withStopCheck(executeUnifiedAutomation(formData), { kind: 'publish' });");
    const reassertIndex = continuous.lastIndexOf('setContinuousModeState(true);', publishIndex);

    expect(handoffIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeGreaterThan(handoffIndex);
    expect(reassertIndex).toBeGreaterThan(-1);
    expect(reassertIndex).toBeLessThan(publishIndex);
  });
});
