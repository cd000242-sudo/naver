// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initContentModeHelpAndSmartPublish, resolvePublishAutomationMode } from '../renderer/modules/tailUIUtils';

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
      <button id="full-auto-publish-btn"></button><button id="semi-auto-publish-btn"></button>
      <input id="unified-publish-mode" value="draft"><section id="unified-semi-auto-section"></section>
      <section id="content-generation-tabs"></section><p id="publish-mode-top-desc"></p><p id="publish-mode-desc"></p>`;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
    for (const key of ['__pendingPublishMode', 'markContentGenerated', 'markContentCleared', 'syncPublishMode']) delete (window as any)[key];
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
});
