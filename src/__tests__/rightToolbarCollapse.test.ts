// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const script = readFileSync(resolve(__dirname, '../../public/floating-scroll.js'), 'utf8');
// Use the same Storage instance as renderer modules and spies in this test realm.
const runScript = () => new Function('document', 'window', script)(document, globalThis);
const storageKey = 'rightToolbarCollapsed';
const toolbar = () => document.getElementById('right-floating-buttons')!;
const toggle = () => document.getElementById('right-toolbar-toggle') as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = `<header><div id="right-floating-buttons" style="display:flex">
    <button id="settings-btn">환경설정</button>
    <button id="license-badge" style="display:none">라이선스</button>
    <button id="image-shortcut-btn">이미지</button>
    <button id="publish-shortcut-btn">발행</button>
  </div></header>`;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('right toolbar collapse', () => {
  it('starts expanded without a left toolbar and exposes a native accessible toggle', () => {
    runScript();
    expect(toggle()).toBeInstanceOf(HTMLButtonElement);
    expect(toggle().type).toBe('button');
    expect(toggle().textContent).toContain('도구 접기');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe(toolbar().id);
    expect(toolbar().hidden).toBe(false);
    expect(toggle().parentElement).toBe(document.body);
  });

  it('hides the entire toolbar, remembers state, and leaves top shortcuts available', () => {
    runScript();
    toggle().click();
    expect(toolbar().hidden).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toContain('도구 펼치기');
    expect(localStorage.getItem(storageKey)).toBe('true');
    for (const id of ['image-shortcut-btn', 'publish-shortcut-btn']) {
      expect(document.getElementById(id)?.parentElement?.id).toBe('top-shortcuts');
    }
    toggle().click();
    expect(toolbar().hidden).toBe(false);
    expect(localStorage.getItem(storageKey)).toBe('false');
    expect(document.getElementById('license-badge')?.style.display).toBe('none');
    expect(document.getElementById('settings-btn')?.style.display).toBe('');
  });

  it('restores collapsed state on initialization', () => {
    localStorage.setItem(storageKey, 'true');
    runScript();
    expect(toolbar().hidden).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('treats an invalid saved value as expanded', () => {
    localStorage.setItem(storageKey, 'broken');
    runScript();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('still works if reading or writing preferences is unavailable', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(runScript).not.toThrow();
    toggle().click();
    expect(toolbar().hidden).toBe(true);
    toggle().click();
    expect(toolbar().hidden).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });

  it('does not duplicate controls or toggle handlers if initialized again', () => {
    runScript();
    runScript();
    expect(document.querySelectorAll('#right-toolbar-toggle')).toHaveLength(1);
    toggle().click();
    expect(toolbar().hidden).toBe(true);
  });

  it('does not add a control when no toolbar exists', () => {
    document.body.innerHTML = '';
    expect(runScript).not.toThrow();
    expect(toggle()).toBeNull();
  });
});
