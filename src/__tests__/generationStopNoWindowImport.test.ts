import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// fullAutoFlow, continuousPublishing and several other suites load their modules without a `window`. The stop-window modules must
// load the same way: no top-level `window` access, and no static import of the settings window (startupEngineGate -> settingsModal).
const loaders: Record<string, () => Promise<unknown>> = {
  generationStopGate: () => import('../renderer/modules/generationStopGate.js'),
  generationStopImages: () => import('../renderer/modules/generationStopImages.js'),
  generationStopModal: () => import('../renderer/modules/generationStopModal.js'),
  generationStopResumeCard: () => import('../renderer/modules/generationStopResumeCard.js'),
  continuousStopResume: () => import('../renderer/modules/continuousStopResume.js'),
  fullAutoStopResume: () => import('../renderer/modules/fullAutoStopResume.js'),
  multiAccountStopResume: () => import('../renderer/modules/multiAccountStopResume.js'),
};
const modules = Object.keys(loaders);

describe('멈춤 창 모듈은 window 없이도 불러올 수 있다', () => {
  it.each(modules)('%s 를 node 환경에서 import 해도 던지지 않는다', async (name) => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    await expect(loaders[name]()).resolves.toBeTruthy();
  });

  it('게이트는 startupEngineGate(설정 창) 를 정적으로 끌어오지 않는다', () => {
    const source = readFileSync(resolve(__dirname, '..', 'renderer/modules/generationStopGate.ts'), 'utf-8');
    expect(source).not.toMatch(/^import .*startupEngineGate/m);
    expect(source).toContain('declare function applyEngineGateSelection(');
  });
});
