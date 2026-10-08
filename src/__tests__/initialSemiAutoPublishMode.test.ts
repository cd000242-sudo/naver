// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initContentModeHelpAndSmartPublish, readSemiAutoEditorDraft, resolvePublishAutomationMode } from '../renderer/modules/tailUIUtils';
import { handleSemiAutoPublish } from '../renderer/modules/publishingHandlers';
import { clearSemiAutoFieldsBeforeGeneration } from '../renderer/modules/contentGeneration';

const sourceHtml = readFileSync(resolve(__dirname, '../../public/index.html'), 'utf8');
const selectorMarkup = (id: string) => sourceHtml.match(new RegExp(`<select id="${id}"[\\s\\S]*?</select>`))![0];
const select = (id = 'publish-mode-top-select') => document.getElementById(id) as HTMLSelectElement;
const button = (id = 'unified-publish-btn') => document.getElementById(id) as HTMLButtonElement;

describe('initial semi-auto publishing settings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete (window as any).__pendingPublishMode;
    document.body.innerHTML = `${selectorMarkup('publish-mode-top-select')}${selectorMarkup('publish-mode-select')}
      ${sourceHtml.match(/<button type="button" id="unified-publish-btn"[\s\S]*?<\/button>/)![0]}
      <button id="generate-from-url-btn"></button><button id="generate-manual-btn"></button>
      <button id="full-auto-publish-btn"></button><button id="semi-auto-publish-btn"></button><button id="unified-stop-btn" style="display:none"></button>
      <input id="unified-generated-title"><textarea id="unified-generated-content"></textarea><input id="unified-publish-mode" value="draft"><section id="unified-semi-auto-section"></section>
      <section id="unified-preview-section"></section><section id="content-generation-tabs"></section><p id="publish-mode-top-desc"></p><p id="publish-mode-desc"></p>`;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const key of ['__pendingPublishMode', 'markContentGenerated', 'markContentCleared', 'syncPublishMode', 'updatePublishButtonVisibility', 'currentStructuredContent']) delete (window as any)[key];
  });

  it('selects semi-auto in the shipped HTML and prevents publishing before initialization', () => {
    expect(select().value).toBe('semi-auto');
    expect(select('publish-mode-select').value).toBe('semi-auto');
    expect(button().disabled).toBe(true);
  });

  it('starts in semi-auto with generation available and publish disabled until a manuscript is ready', () => {
    initContentModeHelpAndSmartPublish();
    vi.advanceTimersByTime(1500);
    expect(select().value).toBe('semi-auto');
    expect(select('publish-mode-select').value).toBe('semi-auto');
    expect(button('generate-from-url-btn').disabled).toBe(false);
    expect(button('generate-manual-btn').disabled).toBe(false);
    expect(button().disabled).toBe(true);
    (document.getElementById('unified-generated-title') as HTMLInputElement).value = '원고 제목';
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = '원고 본문';
    (window as any).markContentGenerated();
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('반자동 발행');
    const full = vi.spyOn(button('full-auto-publish-btn'), 'click');
    const semi = vi.spyOn(button('semi-auto-publish-btn'), 'click');
    button().click();
    expect(semi).toHaveBeenCalledTimes(1);
    expect(full).not.toHaveBeenCalled();
    expect((document.getElementById('unified-publish-mode') as HTMLInputElement).value).toBe('draft');
  });

  it('preserves an explicit full-auto choice made before the delayed initialization', () => {
    initContentModeHelpAndSmartPublish();
    select().value = 'full-auto';
    select().dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(1500);
    expect(select().value).toBe('full-auto');
    expect(select('publish-mode-select').value).toBe('full-auto');
    expect(button('generate-manual-btn').disabled).toBe(true);
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('풀오토');
  });

  it('honors an article-import request for semi-auto before initialization', () => {
    select().value = 'full-auto';
    (window as any).__pendingPublishMode = 'semi-auto';
    initContentModeHelpAndSmartPublish();
    vi.advanceTimersByTime(1500);
    expect(select().value).toBe('semi-auto');
    expect((window as any).__pendingPublishMode).toBeUndefined();
  });

  it('uses semi-auto when both mode selectors have no valid selection', () => {
    select().value = '';
    select('publish-mode-select').value = '';
    initContentModeHelpAndSmartPublish();
    vi.advanceTimersByTime(1500);
    expect(select().value).toBe('semi-auto');
    expect(button().disabled).toBe(true);
  });

  it('routes to semi-auto when selectors are missing instead of starting full automation', () => {
    select().remove();
    select('publish-mode-select').remove();
    initContentModeHelpAndSmartPublish();
    vi.advanceTimersByTime(1500);
    (document.getElementById('unified-generated-title') as HTMLInputElement).value = '원고 제목';
    (document.getElementById('unified-generated-content') as HTMLTextAreaElement).value = '원고 본문';
    (window as any).markContentGenerated();
    const full = vi.spyOn(button('full-auto-publish-btn'), 'click');
    const semi = vi.spyOn(button('semi-auto-publish-btn'), 'click');
    button().click();
    expect(semi).toHaveBeenCalledTimes(1);
    expect(full).not.toHaveBeenCalled();
  });

  it('keeps the explicit current mode through content clearing and synchronizes either selector', () => {
    initContentModeHelpAndSmartPublish();
    vi.advanceTimersByTime(1500);
    select('publish-mode-select').value = 'full-auto';
    select('publish-mode-select').dispatchEvent(new Event('change'));
    (window as any).markContentCleared();
    expect(select().value).toBe('full-auto');
    select().value = 'semi-auto';
    select().dispatchEvent(new Event('change'));
    (window as any).markContentCleared();
    expect(select('publish-mode-select').value).toBe('semi-auto');
    expect(button().disabled).toBe(true);
    expect(document.getElementById('publish-mode-desc')?.textContent).toContain('반자동');
  });

  const setEditor = (title: string, body: string, event?: string) => {
    for (const [id, value] of [['unified-generated-title', title], ['unified-generated-content', body]]) {
      const field = document.getElementById(id) as HTMLInputElement;
      field.value = value;
      if (event) field.dispatchEvent(new Event(event, { bubbles: true }));
    }
  };

  it.each(['input', 'change'])('recognizes manual %s with existing imported state and disables either cleared field', event => {
    initContentModeHelpAndSmartPublish();
    (window as any).currentStructuredContent = { selectedTitle: '이전 제목', bodyPlain: '이전 본문' };
    setEditor('현재 제목', '현재 본문', event);
    expect(button().disabled).toBe(false);
    setEditor('  ', '현재 본문', event);
    expect(button().disabled).toBe(true);
    setEditor('현재 제목', '\n  ', event);
    expect(button().disabled).toBe(true);
  });

  it('recognizes fields populated before initialization without a generation marker', () => {
    setEditor('가져온 제목', '가져온 본문');
    initContentModeHelpAndSmartPublish();
    expect(button().disabled).toBe(false);
  });

  it('refreshes programmatic imports and resets from the current fields', () => {
    initContentModeHelpAndSmartPublish();
    setEditor('복구 제목', '복구 본문');
    (window as any).updatePublishButtonVisibility?.();
    expect(button().disabled).toBe(false);
    setEditor('', '');
    (window as any).updatePublishButtonVisibility?.();
    expect(button().disabled).toBe(true);
  });

  it('does not mark generation started or an empty completion as publishable', () => {
    initContentModeHelpAndSmartPublish();
    button('generate-manual-btn').click();
    expect(button().disabled).toBe(true);
    (window as any).markContentGenerated();
    expect(button().disabled).toBe(true);
  });

  it('reads paste contents after the native insertion and checks again before dispatch', () => {
    initContentModeHelpAndSmartPublish();
    document.getElementById('unified-generated-content')!.dispatchEvent(new Event('paste'));
    setEditor('붙여넣기 제목', '붙여넣기 본문');
    vi.advanceTimersByTime(0);
    expect(button().disabled).toBe(false);
    const semi = vi.spyOn(button('semi-auto-publish-btn'), 'click');
    setEditor('붙여넣기 제목', ''); // A programmatic clear can precede its refresh event.
    button().click();
    expect(semi).not.toHaveBeenCalled();
    expect(button().disabled).toBe(true);
  });

  it('requires an explicit full-auto value and normalizes invalid runtime requests', () => {
    for (const value of [undefined, null, '', 'draft', 'publish', 'schedule', 'unknown', 'semi-auto']) {
      expect(resolvePublishAutomationMode(value)).toBe('semi-auto');
    }
    expect(resolvePublishAutomationMode('full-auto')).toBe('full-auto');
    initContentModeHelpAndSmartPublish();
    (window as any).syncPublishMode('unknown');
    expect(select().value).toBe('semi-auto');
    expect(button().disabled).toBe(true);
  });

  it('reads only the visible draft and trims its title and body', () => {
    setEditor('  현재 제목  ', '\n 현재 본문 \n');
    expect(readSemiAutoEditorDraft()).toEqual({ title: '현재 제목', content: '현재 본문', ready: true });
    document.getElementById('unified-generated-title')!.remove();
    document.getElementById('unified-generated-content')!.remove();
    expect(readSemiAutoEditorDraft()).toEqual({ title: '', content: '', ready: false });
  });

  it.each([['', '현재 본문'], ['현재 제목', ' \n ']])('refuses an empty editor at the actual handler instead of restoring stale cache (%s)', async (title, body) => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    (window as any).currentStructuredContent = { selectedTitle: '이전 제목', bodyPlain: '이전 본문' };
    setEditor(title, body);
    await handleSemiAutoPublish();
    expect(alert).toHaveBeenCalledWith('제목과 본문을 모두 입력해주세요.');
    expect((document.getElementById('unified-generated-title') as HTMLInputElement).value).toBe(title);
    expect((document.getElementById('unified-generated-content') as HTMLTextAreaElement).value).toBe(body);
  });

  it('keeps the publish control disabled during a run and recalculates after stop is hidden', () => {
    initContentModeHelpAndSmartPublish();
    const stop = button('unified-stop-btn');
    stop.style.display = 'flex';
    button().style.display = 'none';
    setEditor('입력 제목', '입력 본문', 'input');
    expect(button().disabled).toBe(true);
    expect(button().style.display).toBe('none');
    stop.style.display = 'none';
    (window as any).syncPublishMode('semi-auto');
    expect(button().disabled).toBe(false);
  });

  it('disables a previous ready draft as soon as new generation clears the editor', () => {
    initContentModeHelpAndSmartPublish();
    setEditor('이전 제목', '이전 본문', 'input');
    expect(button().disabled).toBe(false);
    clearSemiAutoFieldsBeforeGeneration();
    expect(button().disabled).toBe(true);
  });

  it('keeps an incomplete draft preview visible while requiring both fields to publish', () => {
    initContentModeHelpAndSmartPublish();
    setEditor('', '제목 없이 작성 중인 본문', 'input');
    expect(button().disabled).toBe(true);
    expect(document.getElementById('unified-preview-section')!.style.display).toBe('block');
    setEditor('', '', 'input');
    expect(document.getElementById('unified-preview-section')!.style.display).toBe('none');
  });
});
