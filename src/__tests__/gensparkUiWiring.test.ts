// @vitest-environment happy-dom
// [2026-10-10] 젠스파크 2b — 화면 연결 등록 지점 시험(소스 단언 + 실제 함수 실행).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gsBindModelSelect,
  gsGetSavedModelId,
  gsPopulateModelSelect,
  gsRowHtml,
} from '../renderer/modules/gensparkLoginUi.js';
import { gensparkListModels } from '../image/genspark/gensparkModels.js';

const root = resolve(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf-8');

describe('젠스파크 화면 연결 — 등록 지점', () => {
  const html = read('public/index.html');

  it('엔진 select 에 젠스파크 option 이 있고 기본 선택(selected)이 아니다', () => {
    const m = html.match(/<option value="genspark"[^>]*>/);
    expect(m).not.toBeNull();
    expect(m![0]).not.toMatch(/selected/);
  });

  it('관리 탭·스튜디오에 로그인 행과 모델 select 가 있다', () => {
    for (const p of ['mgmt', 'imgstudio']) {
      expect(html).toContain(`id="${p}-genspark-row"`);
      expect(html).toContain(`id="${p}-gs-login-btn"`);
      expect(html).toContain(`id="${p}-gs-check-btn"`);
      expect(html).toContain(`id="${p}-genspark-model"`);
    }
  });

  it('쇼핑 라디오에는 genspark 가 없다', () => {
    expect(html).not.toMatch(/name="(continuous-modal|ma)-shopping-subimage-source"[^>]*value="genspark"/);
  });

  it('쇼핑 차단 목록에는 genspark 가 있다', () => {
    expect(read('src/renderer/utils/shoppingConnectUtils.ts')).toMatch(/SHOPPING_CONNECT_BLOCKED_FAKE_AI[\s\S]*?'genspark'/);
  });

  it('HeadingImageSettings 읽기·쓰기 허용 목록 모두에 genspark (저장값 유지)', () => {
    const src = read('src/renderer/components/HeadingImageSettings.ts');
    expect(src).toMatch(/const VALID_AI_SOURCES[^\n]*'genspark'/);
    expect(src).toMatch(/const VALID_SOURCES[^\n]*'genspark'/);
    expect(src).toContain("| 'genspark'");
  });

  it('unifiedDOMCache 유효 엔진 목록에 genspark', () => {
    expect(read('src/renderer/modules/unifiedDOMCache.ts')).toMatch(/VALID_AI_SOURCES = \[[^\]]*'genspark'/);
  });

  it('headingImageGen 엔진 분기 2곳 모두에 genspark', () => {
    const src = read('src/renderer/modules/headingImageGen.ts');
    expect(src.match(/imageSource === 'dropshot' \|\| imageSource === 'genspark'/g)?.length).toBe(2);
  });

  it('재생성 허용 엔진·스튜디오 엔진 목록에 genspark', () => {
    expect(read('src/renderer/modules/imageDisplayGrid.ts')).toMatch(/IMAGE_REGENERATE_ENGINES[\s\S]*?'genspark'/);
    expect(read('src/renderer/modules/imageGenStudioCore.ts')).toContain("value: 'genspark'");
  });

  it('UI 자동화 엔진 목록(발행 간격·제한 시간)에 genspark', () => {
    for (const f of [
      'src/renderer/modules/continuousPublishing.ts',
      'src/renderer/modules/multiAccountManager.ts',
      'src/renderer/modules/publishingHandlers.ts',
      'src/renderer/modules/costAndAutoGen.ts',
    ]) {
      expect(read(f), f).toMatch(/UI_(AUTOMATION_)?IMAGE_(SOURCES|PROVIDERS)[^\n]*'genspark'/);
    }
  });

  it('copy-static 에 모듈과 모델 표 의존 파일이 등록돼 있다', () => {
    const src = read('scripts/copy-static.mjs');
    expect(src).toContain("'gensparkLoginUi.js'");
    expect(src).toContain('image/genspark/gensparkModels.js');
  });

  it('지문 클로저 목록에 gensparkLoginUi 가 있다', () => {
    expect(read('src/contentQualityV3/candidateRuntimeFingerprint.ts')).toContain('src/renderer/modules/gensparkLoginUi.ts');
  });
});

describe('젠스파크 모델 select (실제 함수 실행)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<select id="m1"></select><select id="m2"></select>';
    localStorage.clear();
    (window as any).api = { saveConfig: vi.fn().mockResolvedValue({}) };
  });

  it('15개 옵션을 채우고 크레딧 모델에는 라벨이 붙으며 기본은 GPT Image 2.5', () => {
    gsPopulateModelSelect('m1');
    const sel = document.getElementById('m1') as HTMLSelectElement;
    expect(sel.options.length).toBe(15);
    expect(sel.value).toBe('gpt-image-2.5');
    const credit = gensparkListModels().filter((m) => !m.creditFree);
    expect(credit.length).toBeGreaterThan(0);
    const labels = Array.from(sel.options).map((o) => o.textContent || '');
    expect(labels.filter((l) => l.endsWith(' (크레딧 차감)')).length).toBe(credit.length);
  });

  it('크레딧 모델을 고를 때 확인창 거절하면 이전 값 유지·저장 안 함', () => {
    gsBindModelSelect('m1');
    const sel = document.getElementById('m1') as HTMLSelectElement;
    const credit = gensparkListModels().find((m) => !m.creditFree)!;
    window.confirm = vi.fn(() => false);
    sel.value = credit.id;
    sel.dispatchEvent(new Event('change'));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(sel.value).toBe('gpt-image-2.5');
    expect((window as any).api.saveConfig).not.toHaveBeenCalled();
    expect(gsGetSavedModelId()).toBe('gpt-image-2.5');
  });

  it('확인창 승인하면 저장하고 다른 화면 select 도 동기화한다', () => {
    gsBindModelSelect('m1');
    gsBindModelSelect('m2');
    const sel = document.getElementById('m1') as HTMLSelectElement;
    const credit = gensparkListModels().find((m) => !m.creditFree)!;
    window.confirm = vi.fn(() => true);
    sel.value = credit.id;
    sel.dispatchEvent(new Event('change'));
    expect((window as any).api.saveConfig).toHaveBeenCalledWith({ gensparkImageModel: credit.id });
    expect((document.getElementById('m2') as HTMLSelectElement).value).toBe(credit.id);
    expect(gsGetSavedModelId()).toBe(credit.id);
  });

  it('크레딧이 없는 모델은 확인창 없이 바로 저장한다', () => {
    gsBindModelSelect('m1');
    const sel = document.getElementById('m1') as HTMLSelectElement;
    const free = gensparkListModels().find((m) => m.creditFree && m.id !== 'gpt-image-2.5');
    if (!free) return;
    window.confirm = vi.fn(() => false);
    sel.value = free.id;
    sel.dispatchEvent(new Event('change'));
    expect(window.confirm).not.toHaveBeenCalled();
    expect((window as any).api.saveConfig).toHaveBeenCalledWith({ gensparkImageModel: free.id });
  });

  it('서브모달용 행 HTML 에 로그인·확인·모델 요소가 있다', () => {
    const h = gsRowHtml('hsettings');
    expect(h).toContain('hsettings-gs-login-btn');
    expect(h).toContain('hsettings-genspark-model');
  });
});
