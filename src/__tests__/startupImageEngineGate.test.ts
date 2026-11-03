// @vitest-environment happy-dom
/**
 * [2026-11-03] 기동 엔진 선택 창의 "이미지 엔진" 칸.
 * 사장님 결정: 선택지는 이미지 탭 #image-source-select 가 단일 출처, 처음 한 번만 '관련 사진 찾기'를 미리 고르고
 * 그 뒤엔 마지막으로 확정한 엔진. 저장은 이미지 탭 change 경로를 그대로 타며, '관련 사진 찾기'는 저작권 동의가 필요하다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('../renderer/utils/settingsModal.js', () => ({
  restoreTextModelRadio: vi.fn((model: string) => {
    const radio = document.querySelector<HTMLInputElement>(`input[name="primaryGeminiTextModel"][value="${model}"]`);
    if (radio) radio.checked = true;
  }),
}));
const consent = vi.hoisted(() => ({
  has: vi.fn(() => false),
  ensure: vi.fn(async () => true),
}));
vi.mock('../renderer/modules/issueCollectConsent.js', () => ({
  hasIssueCopyrightConsent: consent.has,
  ensureIssueCopyrightConsent: consent.ensure,
}));

import { STARTUP_ENGINE_GATE_ID, showStartupEngineGate } from '../renderer/modules/startupEngineGate';
import {
  STARTUP_IMAGE_FIRST_SHOWN_KEY,
  startupImageCollectOptions,
} from '../renderer/modules/startupImageEngineGate';
import { collectEngineWireSelect } from '../renderer/modules/imageCollectEngineConsent';

const textCard = (value: string, title: string) => `
  <label><input type="radio" name="primaryGeminiTextModel" value="${value}">
    <div style="flex: 1;"><div><span>${title}</span><span></span></div><div>설명</div></div></label>`;

function mountDom(): HTMLSelectElement {
  document.body.innerHTML = `
    <div>${textCard('gemini-3.6-flash', 'Gemini 3.6 Flash')}${textCard('openai-gpt41', 'GPT-4.1')}</div>
    <input id="unified-generator" type="hidden" value=""><span id="nav-text-engine-status"></span>
    <select id="image-source-select">
      <option value="nano-banana-2" data-price="Gemini | ₩97/장">나노바나나 2</option>
      <option value="openai-image" data-price="gpt-image | ₩18/장" selected>덕테이프 · OpenAI</option>
      <option value="flow" data-price="Google Flow | 로그인 필요">Google Flow</option>
      <option value="collect-photos" data-price="무료 · 저작권 안내 동의 필요">관련 사진 찾기 (뉴스·기사 사진 · 무료)</option>
    </select>`;
  const select = document.getElementById('image-source-select') as HTMLSelectElement;
  // Same wiring the app has: consent capture gate first, then the image tab's save path.
  collectEngineWireSelect('image-source-select');
  select.addEventListener('change', () => {
    localStorage.setItem('globalImageSource', select.value);
    localStorage.setItem('fullAutoImageSource', select.value);
  });
  return select;
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const overlay = () => document.getElementById(STARTUP_ENGINE_GATE_ID);
const confirmBtn = () => document.getElementById(`${STARTUP_ENGINE_GATE_ID}-confirm`) as HTMLButtonElement;
const hintText = () => document.getElementById(`${STARTUP_ENGINE_GATE_ID}-hint`)?.textContent || '';
const pickText = (value: string) => pick('startup-engine-choice', value);
const pickImage = (value: string) => pick('startup-image-engine-choice', value);
const checkedImage = () => document.querySelector<HTMLInputElement>('input[name="startup-image-engine-choice"]:checked')?.value;
function pick(name: string, value: string): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}

let config: Record<string, unknown>;
beforeEach(() => {
  localStorage.clear();
  consent.has.mockReset().mockReturnValue(false);
  consent.ensure.mockReset().mockResolvedValue(true);
  mountDom();
  config = { primaryGeminiTextModel: '' };
  (window as any).api = {
    getConfig: vi.fn(async () => ({ ...config })),
    saveConfig: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(config, patch); return { success: true }; }),
    getAppInfo: vi.fn(async () => ({ isPackaged: false })),
  };
});

describe('이미지 엔진 선택지 = #image-source-select', () => {
  it('옵션의 값·제목·가격 안내를 그대로 읽는다', () => {
    const options = startupImageCollectOptions();
    expect(options.map((o) => o.value)).toEqual(['nano-banana-2', 'openai-image', 'flow', 'collect-photos']);
    expect(options[3]).toEqual({ value: 'collect-photos', title: '관련 사진 찾기 (뉴스·기사 사진 · 무료)', price: '무료 · 저작권 안내 동의 필요' });
  });

  it('창에는 그 옵션이 모두 라디오로 나온다 (collect-photos 포함)', () => {
    void showStartupEngineGate('');
    const values = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="startup-image-engine-choice"]')).map((r) => r.value);
    expect(values).toEqual(['nano-banana-2', 'openai-image', 'flow', 'collect-photos']);
    expect(overlay()!.querySelectorAll('button').length).toBe(1); // still no close / skip
  });

  it('이미지 탭 선택 칸이 없으면 이미지 칸 없이 예전처럼 동작한다', async () => {
    document.getElementById('image-source-select')!.remove();
    const done = showStartupEngineGate('');
    expect(document.querySelector('input[name="startup-image-engine-choice"]')).toBeNull();
    pickText('gemini-3.6-flash');
    confirmBtn().click();
    await expect(done).resolves.toBe('gemini-3.6-flash');
  });
});

describe('미리 선택 규칙 — 처음 한 번만 collect-photos', () => {
  it('처음 표시: collect-photos 가 미리 골라져 있다', () => {
    void showStartupEngineGate('gemini-3.6-flash');
    expect(checkedImage()).toBe('collect-photos');
    expect(confirmBtn().disabled).toBe(false);
  });

  it('처음 표시여도 저장된 이미지 엔진보다 collect-photos 가 우선이다', () => {
    localStorage.setItem('globalImageSource', 'flow');
    void showStartupEngineGate('gemini-3.6-flash');
    expect(checkedImage()).toBe('collect-photos');
  });

  it('두 번째부터는 마지막으로 확정한 엔진이 미리 골라진다', () => {
    localStorage.setItem(STARTUP_IMAGE_FIRST_SHOWN_KEY, '1');
    localStorage.setItem('globalImageSource', 'flow');
    void showStartupEngineGate('gemini-3.6-flash');
    expect(checkedImage()).toBe('flow');
  });

  it('두 번째부터 저장된 값이 없거나 목록에 없으면 아무것도 고르지 않고 확인은 잠긴다', () => {
    localStorage.setItem(STARTUP_IMAGE_FIRST_SHOWN_KEY, '1');
    localStorage.setItem('globalImageSource', 'local-folder'); // a real engine, but not in the dropdown
    void showStartupEngineGate('gemini-3.6-flash');
    expect(checkedImage()).toBeUndefined();
    expect(confirmBtn().disabled).toBe(true);
    pickImage('openai-image');
    expect(confirmBtn().disabled).toBe(false);
  });

  it('글 엔진을 안 골랐으면 이미지 엔진이 골라져 있어도 확인은 잠긴다', () => {
    void showStartupEngineGate('');
    expect(checkedImage()).toBe('collect-photos');
    expect(confirmBtn().disabled).toBe(true);
    pickText('openai-gpt41');
    expect(confirmBtn().disabled).toBe(false);
  });
});

describe('확정 — 이미지 탭 저장 경로를 탄다', () => {
  it('일반 엔진: select 값이 바뀌고 change 가 나가 같은 키에 저장, 첫 표시 표식 기록, 동의 질문 없음', async () => {
    const done = showStartupEngineGate('gemini-3.6-flash');
    pickImage('flow');
    confirmBtn().click();
    await expect(done).resolves.toBe('gemini-3.6-flash');
    expect((document.getElementById('image-source-select') as HTMLSelectElement).value).toBe('flow');
    expect(localStorage.getItem('globalImageSource')).toBe('flow');
    expect(localStorage.getItem('fullAutoImageSource')).toBe('flow');
    expect(localStorage.getItem(STARTUP_IMAGE_FIRST_SHOWN_KEY)).toBe('1');
    expect(consent.ensure).not.toHaveBeenCalled();
    expect(overlay()).toBeNull();
  });

  it('collect-photos: 동의 한 번(이중 질문 없음) 뒤 저장되고 표식이 남는다', async () => {
    const done = showStartupEngineGate('gemini-3.6-flash');
    confirmBtn().click(); // collect-photos is pre-selected on the first show
    await expect(done).resolves.toBe('gemini-3.6-flash');
    expect(consent.ensure).toHaveBeenCalledTimes(1);
    expect((config.imageCollectConsent as any)?.version).toBeGreaterThanOrEqual(1);
    expect(localStorage.getItem('globalImageSource')).toBe('collect-photos');
    expect(localStorage.getItem('fullAutoImageSource')).toBe('collect-photos');
    expect(localStorage.getItem(STARTUP_IMAGE_FIRST_SHOWN_KEY)).toBe('1');
  });

  it('collect-photos 동의를 거절하면 이미지 엔진은 저장되지 않고 창은 열린 채 다른 엔진을 고를 수 있다', async () => {
    consent.ensure.mockResolvedValue(false);
    const done = showStartupEngineGate('gemini-3.6-flash');
    let settled = false;
    void done.then(() => { settled = true; });
    confirmBtn().click();
    await flush(); await flush(); await flush();
    expect(settled).toBe(false);
    expect(overlay()).not.toBeNull();
    expect(localStorage.getItem('globalImageSource')).toBeNull();
    expect(localStorage.getItem('fullAutoImageSource')).toBeNull();
    expect(localStorage.getItem(STARTUP_IMAGE_FIRST_SHOWN_KEY)).toBeNull();
    expect(hintText()).toContain('동의');
    expect(confirmBtn().disabled).toBe(false);

    pickImage('openai-image');
    confirmBtn().click();
    await expect(done).resolves.toBe('gemini-3.6-flash');
    expect(localStorage.getItem('globalImageSource')).toBe('openai-image');
    expect(localStorage.getItem(STARTUP_IMAGE_FIRST_SHOWN_KEY)).toBe('1');
  });

  it('이미 동의 기록이 있으면 모달 없이 바로 저장된다', async () => {
    config.imageCollectConsent = { version: 1, agreedAt: '2026-11-03T00:00:00.000Z' };
    const done = showStartupEngineGate('gemini-3.6-flash');
    confirmBtn().click();
    await done;
    expect(consent.ensure).not.toHaveBeenCalled();
    expect(localStorage.getItem('globalImageSource')).toBe('collect-photos');
  });
});

describe('옛 엔진 보류(retiredImageEngineGate)와의 관계', () => {
  const park = () => localStorage.setItem('retiredImageEnginePending', JSON.stringify({ keys: { fullAutoImageSource: 'prodia', scAIImageEngine: 'prodia' } }));

  it('보류가 있으면 보류 안내와 같은 선택지만 보인다 (collect-photos 는 그 안내에도 없다)', () => {
    park();
    void showStartupEngineGate('gemini-3.6-flash');
    const values = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="startup-image-engine-choice"]')).map((r) => r.value);
    expect(values).toEqual(['nano-banana-2', 'openai-image', 'flow']);
    expect(checkedImage()).toBeUndefined();
    expect(confirmBtn().disabled).toBe(true);
  });

  it('옛 엔진 값이 아직 보류 전이어도 창을 띄우기 직전에 보류로 옮겨 같은 규칙을 적용한다', () => {
    localStorage.setItem(STARTUP_IMAGE_FIRST_SHOWN_KEY, '1');
    localStorage.setItem('globalImageSource', 'leonardoai');
    void showStartupEngineGate('gemini-3.6-flash');
    expect(localStorage.getItem('retiredImageEnginePending')).not.toBeNull();
    expect(checkedImage()).toBeUndefined();
    expect(document.querySelector('input[name="startup-image-engine-choice"][value="collect-photos"]')).toBeNull();
  });

  it('보류가 있을 때 여기서 고르면 보류가 해소되어 안내가 또 뜨지 않는다', async () => {
    park();
    const done = showStartupEngineGate('gemini-3.6-flash');
    pickImage('flow');
    confirmBtn().click();
    await done;
    expect(localStorage.getItem('retiredImageEnginePending')).toBeNull();
    expect(localStorage.getItem('scAIImageEngine')).toBe('flow');
    expect(localStorage.getItem('globalImageSource')).toBe('flow');
  });

  it('보류가 없으면 scAIImageEngine 같은 다른 키를 건드리지 않는다', async () => {
    const done = showStartupEngineGate('gemini-3.6-flash');
    pickImage('flow');
    confirmBtn().click();
    await done;
    expect(localStorage.getItem('scAIImageEngine')).toBeNull();
  });
});

describe('배선 소스 핀', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf-8');

  it('새 모듈이 copy-static 인라인(게이트 앞)과 지문 클로저에 등록됨', () => {
    const copyStatic = read('scripts/copy-static.mjs');
    const fingerprint = read('src/contentQualityV3/candidateRuntimeFingerprint.ts');
    for (const name of ['startupImageEngineGate', 'startupEngineGateView']) {
      expect(copyStatic).toContain(`'${name}.js'`);
      expect(fingerprint).toContain(`src/renderer/modules/${name}.ts`);
    }
    const at = (name: string) => copyStatic.indexOf(`'${name}.js'`);
    expect(at('startupEngineGateView')).toBeLessThan(at('startupEngineGate'));
    expect(at('startupImageEngineGate')).toBeLessThan(at('startupEngineGate'));
  });

  it('게이트 파일은 300줄 이하', () => {
    for (const name of ['startupEngineGate', 'startupEngineGateView', 'startupImageEngineGate']) {
      expect(read(`src/renderer/modules/${name}.ts`).split('\n').length).toBeLessThanOrEqual(300);
    }
  });
});
