// @vitest-environment happy-dom
// [2026-10-13 사장님] 글 발행하기 탭을 "원고 가져오기(기본) / 앱에서 생성" 두 흐름으로 나누고, 톤·개인 프롬프트는 고급 설정으로 접는다.
//   기존 칸은 옮기기만 하고(리스너 유지) 아이디는 그대로다. 목업 승인 뒤 실제 DOM 과 같은 골격으로 검증한다.
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DEFAULT_PUBLISH_FLOW,
  PUBLISH_FLOW_STORAGE_KEY,
  applyPublishFlow,
  initPublishFlowChooser,
  readStoredPublishFlow,
  resolveFlowVisibility,
} from '../renderer/modules/publishFlowChooser';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
}

/** The real tab skeleton: subtabs → account → category block → tone block → custom prompt → generation tabs → semi-auto. */
function mountTab(): void {
  document.body.innerHTML = `
    <div id="tab-unified"><section class="form-section">
      <h2>AI 자동 블로그 발행</h2>
      <div id="publish-mode-subtabs"><button class="pub-mode-tab active" data-pubmode="single">단일발행</button></div>
      <div class="field" id="publish-account-block">계정</div>
      <div class="field"><button id="open-category-modal-btn">카테고리</button></div>
      <div><label>글 톤</label><select id="unified-tone-style"><option>친근한</option></select></div>
      <div id="custom-prompt-section"><input id="custom-prompt-enable" type="checkbox"></div>
      <div id="publish-mode-top-section"><select id="publish-mode-top-select"><option value="semi-auto">반자동</option></select></div>
      <div id="content-generation-tabs"><input id="batch-link-input"><button id="generate-from-url-btn">URL로 AI 글 생성하기</button></div>
      <div id="unified-only-publish-settings"><button id="unified-publish-btn">발행</button></div>
      <div id="unified-semi-auto-section" class="field" style="display: block;"><h3>✏️ 반자동 편집</h3>
        <input id="unified-generated-title"><textarea id="unified-generated-content"></textarea></div>
    </section></div>`;
}

const display = (id: string) => (document.getElementById(id) as HTMLElement).style.display;

beforeEach(() => { mountTab(); });

describe('publishFlowChooser — 저장값·가시성(순수)', () => {
  it('저장된 선택이 없거나 이상하면 기본은 가져오기', () => {
    expect(DEFAULT_PUBLISH_FLOW).toBe('import');
    expect(readStoredPublishFlow(memoryStorage())).toBe('import');
    expect(readStoredPublishFlow(memoryStorage({ [PUBLISH_FLOW_STORAGE_KEY]: 'garbage' }))).toBe('import');
    expect(readStoredPublishFlow(memoryStorage({ [PUBLISH_FLOW_STORAGE_KEY]: 'app' }))).toBe('app');
    expect(readStoredPublishFlow(null)).toBe('import');
  });

  it('가져오기는 생성 칸을 숨기고 원고 칸을 보이며, 앱 생성은 원고 칸을 글이 있을 때만 보인다', () => {
    expect(resolveFlowVisibility('import', false)).toEqual({ generation: false, semiAuto: true });
    expect(resolveFlowVisibility('app', false)).toEqual({ generation: true, semiAuto: false });
    expect(resolveFlowVisibility('app', true)).toEqual({ generation: true, semiAuto: true });
  });
});

describe('initPublishFlowChooser — 실제 골격', () => {
  it('서브탭 바로 아래에 카드 2장을 넣고, 기본(가져오기)으로 생성 칸을 숨기고 원고 칸·안내를 보인다', () => {
    const storage = memoryStorage();
    expect(initPublishFlowChooser(document, storage)).toBe('import');
    const chooser = document.getElementById('publish-flow-chooser')!;
    expect(chooser.previousElementSibling?.id).toBe('publish-mode-subtabs');
    expect(chooser.querySelectorAll('.publish-flow-card')).toHaveLength(2);
    expect(chooser.querySelector('.publish-flow-card.active')?.getAttribute('data-flow')).toBe('import');
    expect(display('content-generation-tabs')).toBe('none');
    expect(display('unified-semi-auto-section')).toBe('block');
    expect(document.getElementById('publish-flow-import-hint')?.textContent).toContain('붙여넣으세요');
    expect(document.getElementById('publish-flow-steps')?.textContent).toContain('원고 붙여넣기');
    expect(storage.getItem(PUBLISH_FLOW_STORAGE_KEY)).toBe('import');
  });

  it('톤·개인 프롬프트는 "고급 설정" 접힘으로 옮기고 아이디·요소는 그대로 살아 있다', () => {
    initPublishFlowChooser(document, memoryStorage());
    const details = document.getElementById('unified-advanced-settings') as HTMLDetailsElement;
    expect(details.tagName).toBe('DETAILS');
    expect(details.open).toBe(false);
    expect(details.contains(document.getElementById('unified-tone-style'))).toBe(true);
    expect(details.contains(document.getElementById('custom-prompt-section'))).toBe(true);
    // The publish-mode select and the category block stay where they were (E2E and users rely on them).
    expect(details.contains(document.getElementById('publish-mode-top-select'))).toBe(false);
    expect(details.contains(document.getElementById('open-category-modal-btn'))).toBe(false);
  });

  it('앱 카드를 누르면 생성 칸이 보이고 빈 원고 칸은 숨으며 선택이 저장된다; 글이 있으면 원고 칸은 남는다', () => {
    const storage = memoryStorage();
    initPublishFlowChooser(document, storage);
    (document.querySelector('.publish-flow-card[data-flow="app"]') as HTMLButtonElement).click();
    expect(display('content-generation-tabs')).toBe('');
    expect(display('unified-semi-auto-section')).toBe('none');
    expect(display('publish-flow-import-hint')).toBe('none');
    expect(storage.getItem(PUBLISH_FLOW_STORAGE_KEY)).toBe('app');
    expect(document.getElementById('publish-flow-steps')?.textContent).toContain('AI 글 생성');
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = '붙여넣은 원고';
    applyPublishFlow('app', document, storage);
    expect(display('unified-semi-auto-section')).toBe('block');
  });

  it('저장된 선택(app)을 다음 실행 때 그대로 펼치고, 두 번 초기화해도 카드가 중복되지 않는다', () => {
    const storage = memoryStorage({ [PUBLISH_FLOW_STORAGE_KEY]: 'app' });
    expect(initPublishFlowChooser(document, storage)).toBe('app');
    expect(display('content-generation-tabs')).toBe('');
    initPublishFlowChooser(document, storage);
    expect(document.querySelectorAll('#publish-flow-chooser')).toHaveLength(1);
    expect(document.querySelectorAll('#unified-advanced-settings')).toHaveLength(1);
  });

  it('탭 골격이 없으면 아무것도 하지 않는다', () => {
    document.body.innerHTML = '<div></div>';
    expect(initPublishFlowChooser(document, memoryStorage())).toBeNull();
  });
});

describe('배선', () => {
  it('renderer.ts 가 초기화 때 흐름 선택을 켠다', () => {
    const src = readFileSync(resolve('src/renderer/renderer.ts'), 'utf8');
    expect(src).toContain("from './modules/publishFlowChooser.js'");
    expect(src).toContain('initPublishFlowChooser()');
  });
});
