// @vitest-environment happy-dom
/**
 * [2026-09-10] 앱 기동 시 글생성 엔진 강제 선택 게이트.
 * 배경: primaryGeminiTextModel 이 비면 모든 폴백이 gemini-3.1-flash-lite 로 수렴해
 * 사용자가 고른 적 없는 엔진으로 발행되던 문제. 사장님 지시 = 매 기동마다 선택.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../renderer/utils/settingsModal.js', () => ({
  restoreTextModelRadio: vi.fn((model: string) => {
    const radio = document.querySelector<HTMLInputElement>(
      `input[name="primaryGeminiTextModel"][value="${model}"]`,
    );
    if (radio) radio.checked = true;
  }),
}));

import {
  STARTUP_ENGINE_GATE_ID,
  collectEngineGateOptions,
  showStartupEngineGate,
  initStartupEngineGate,
} from '../renderer/modules/startupEngineGate';

const card = (value: string, title: string, badge: string, desc: string, checked = false) => `
  <label class="gemini-model-card">
    <input type="radio" name="primaryGeminiTextModel" value="${value}" ${checked ? 'checked' : ''}>
    <div style="flex: 1;">
      <div><span>${title}</span><span>${badge}</span></div>
      <div>${desc}</div>
    </div>
  </label>`;

function mountSettingsDom(): void {
  document.body.innerHTML = `
    <div id="settings">
      ${card('gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite', '저비용', '가장 싼 엔진', true)}
      ${card('gemini-3.6-flash', 'Gemini 3.6 Flash', '추천', '균형형 엔진')}
      ${card('openai-gpt41', 'GPT-4.1', '', 'OpenAI 엔진')}
    </div>
    <input id="unified-generator" type="hidden" value="">
    <span id="nav-text-engine-status"></span>`;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const overlay = () => document.getElementById(STARTUP_ENGINE_GATE_ID);
const confirmBtn = () =>
  document.getElementById(`${STARTUP_ENGINE_GATE_ID}-confirm`) as HTMLButtonElement | null;
const pick = (value: string) => {
  const radio = document.querySelector<HTMLInputElement>(
    `input[name="startup-engine-choice"][value="${value}"]`,
  )!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('startupEngineGate — 옵션 수집', () => {
  beforeEach(mountSettingsDom);

  it('설정 라디오 카드에서 제목/배지/설명을 읽는다 (SSOT = index.html 카드)', () => {
    const options = collectEngineGateOptions();
    expect(options.map((o) => o.value)).toEqual(['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'openai-gpt41']);
    expect(options[1]).toEqual({ value: 'gemini-3.6-flash', title: 'Gemini 3.6 Flash', badge: '추천', description: '균형형 엔진' });
    expect(options[2].badge).toBe('');
  });
});

describe('startupEngineGate — 차단 오버레이', () => {
  let saveConfig: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    mountSettingsDom();
    saveConfig = vi.fn(async () => ({ success: true }));
    (window as any).api = {
      getConfig: vi.fn(async () => ({ geminiApiKey: 'k', primaryGeminiTextModel: '' })),
      saveConfig,
      getAppInfo: vi.fn(async () => ({ isPackaged: false })),
    };
  });

  it('저장값이 없으면 아무것도 선택되지 않고 확인 버튼은 비활성 — 3.1 자동 선택 금지', () => {
    void showStartupEngineGate('');
    expect(overlay()).not.toBeNull();
    expect(document.querySelector('input[name="startup-engine-choice"]:checked')).toBeNull();
    expect(confirmBtn()?.disabled).toBe(true);
    // no close / skip affordance
    expect(overlay()!.querySelectorAll('button').length).toBe(1);
  });

  it('저장값이 있으면 그 엔진만 미리 선택되고 확인은 활성', () => {
    void showStartupEngineGate('gemini-3.6-flash');
    const checked = document.querySelector<HTMLInputElement>('input[name="startup-engine-choice"]:checked');
    expect(checked?.value).toBe('gemini-3.6-flash');
    expect(confirmBtn()?.disabled).toBe(false);
  });

  it('저장값이 카드에 없는 모델이면 미선택 상태로 시작한다', () => {
    void showStartupEngineGate('gemini-2.0-retired');
    expect(document.querySelector('input[name="startup-engine-choice"]:checked')).toBeNull();
    expect(confirmBtn()?.disabled).toBe(true);
  });

  it('선택 → 확인: primaryGeminiTextModel + defaultAiProvider 저장, 설정 라디오 동기화, 오버레이 제거', async () => {
    const done = showStartupEngineGate('');
    pick('gemini-3.6-flash');
    expect(confirmBtn()?.disabled).toBe(false);
    confirmBtn()!.click();
    await expect(done).resolves.toBe('gemini-3.6-flash');
    expect(saveConfig).toHaveBeenCalledTimes(1);
    const saved = saveConfig.mock.calls[0][0];
    expect(saved.primaryGeminiTextModel).toBe('gemini-3.6-flash');
    expect(saved.defaultAiProvider).toBe('gemini');
    expect(saved.geminiApiKey).toBe('k'); // existing config preserved
    expect(overlay()).toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('input[name="primaryGeminiTextModel"]:checked')?.value,
    ).toBe('gemini-3.6-flash');
    expect((document.getElementById('unified-generator') as HTMLInputElement).value).toBe('gemini');
    expect(document.getElementById('nav-text-engine-status')?.textContent).toBe('현재: Gemini 3.6 Flash');
  });

  it('OpenAI 엔진을 고르면 provider 가 openai 로 저장된다', async () => {
    const done = showStartupEngineGate('');
    pick('openai-gpt41');
    confirmBtn()!.click();
    await done;
    expect(saveConfig.mock.calls[0][0].defaultAiProvider).toBe('openai');
  });

  it('저장 실패 시 오버레이가 남고 힌트에 오류가 보이며 재시도 가능', async () => {
    saveConfig.mockRejectedValueOnce(new Error('disk full'));
    void showStartupEngineGate('');
    pick('gemini-3.6-flash');
    confirmBtn()!.click();
    await flush(); await flush();
    expect(overlay()).not.toBeNull();
    expect(confirmBtn()?.disabled).toBe(false);
    expect(document.getElementById(`${STARTUP_ENGINE_GATE_ID}-hint`)?.textContent).toContain('disk full');
  });

  it('엔진 카드가 없으면 게이트를 건너뛴다 (null)', async () => {
    document.body.innerHTML = '';
    await expect(showStartupEngineGate('')).resolves.toBeNull();
    expect(overlay()).toBeNull();
  });
});

describe('startupEngineGate — 기동 진입점', () => {
  beforeEach(mountSettingsDom);

  it('E2E_TEST 모드(Playwright 릴리즈 게이트)에서는 오버레이를 띄우지 않는다', async () => {
    (window as any).api = {
      getConfig: vi.fn(async () => ({})),
      saveConfig: vi.fn(),
      getAppInfo: vi.fn(async () => ({ isPackaged: false, e2eTest: true })),
    };
    await expect(initStartupEngineGate()).resolves.toBeNull();
    expect(overlay()).toBeNull();
  });

  it('api 브리지가 없으면 건너뛴다', async () => {
    (window as any).api = undefined;
    await expect(initStartupEngineGate()).resolves.toBeNull();
  });

  it('일반 기동: 저장된 모델이 있어도 게이트를 띄운다 (매 기동 확인)', async () => {
    (window as any).api = {
      getConfig: vi.fn(async () => ({ primaryGeminiTextModel: 'gemini-3.6-flash' })),
      saveConfig: vi.fn(async () => ({ success: true })),
      getAppInfo: vi.fn(async () => ({ isPackaged: true })),
    };
    const pending = initStartupEngineGate();
    await flush(); await flush();
    expect(overlay()).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('input[name="startup-engine-choice"]:checked')?.value,
    ).toBe('gemini-3.6-flash');
    confirmBtn()!.click();
    await expect(pending).resolves.toBe('gemini-3.6-flash');
  });
});

describe('배선 소스 핀', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf-8');

  it('renderer.ts 기동 블록이 initStartupEngineGate 를 호출한다', () => {
    const renderer = read('src/renderer/renderer.ts');
    expect(renderer).toMatch(/import \{ initStartupEngineGate \} from ["']\.\/modules\/startupEngineGate\.js["']/);
    expect(renderer).toMatch(/await initStartupEngineGate\(\)/);
  });

  it('priceInfoModal 의 첫 실행 설정창 자동 오픈(3.1 선택 잠금 경로)이 제거됨', () => {
    const modal = read('src/renderer/modules/priceInfoModal.ts');
    expect(modal).not.toMatch(/if \(!config\.primaryGeminiTextModel\)\s*\{[\s\S]{0,400}openSettingsModal/);
  });

  it('copy-static 인라인 목록 + 지문 클로저에 두 모듈이 등록됨', () => {
    const copyStatic = read('scripts/copy-static.mjs');
    const fingerprint = read('src/contentQualityV3/candidateRuntimeFingerprint.ts');
    for (const name of ['startupEngineGate', 'visionInferCancel']) {
      expect(copyStatic).toContain(`'${name}.js'`);
      expect(fingerprint).toContain(`src/renderer/modules/${name}.ts`);
    }
  });

  it('systemHandlers app:getInfo 가 e2eTest 플래그를 돌려준다', () => {
    const handlers = read('src/main/ipc/systemHandlers.ts');
    expect(handlers).toMatch(/e2eTest: process\.env\.E2E_TEST === '1'/);
  });
});
