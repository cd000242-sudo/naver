// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindImageAiDisclosureSetting } from '../renderer/modules/imageAiDisclosureSetting';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(api: any) {
  document.body.innerHTML = '<input id="image-ai-mark-all" type="checkbox"><span id="image-ai-mark-status" role="status"></span>';
  const checkbox = document.querySelector('input')!;
  const status = document.querySelector('span')!;
  const notify = vi.fn();
  const bind = () => bindImageAiDisclosureSetting(checkbox, status, api, notify);
  return { checkbox, status, notify, bind };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('AI disclosure setting responds immediately and persists truthfully', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  it('captures clicks before initial config resolves and never restores stale state over them', async () => {
    const initial = deferred<any>();
    const save = deferred<any>();
    const api = { getConfig: vi.fn(() => initial.promise), saveConfig: vi.fn(() => save.promise) };
    const ui = fixture(api); ui.bind();
    ui.checkbox.click();
    expect(api.saveConfig).toHaveBeenCalledWith({ aiMarkAllImages: true });
    expect(ui.checkbox.disabled).toBe(true);
    expect(ui.status.textContent).toContain('저장');
    initial.resolve({ aiMarkAllImages: false }); await settle();
    expect(ui.checkbox.checked).toBe(true);
    save.resolve({ aiMarkAllImages: true }); await settle();
    expect(ui.checkbox.disabled).toBe(false);
    expect(ui.status.textContent).toContain('모든 이미지');
  });
  it.each([true, false])('recovers the actual persisted baseline when initial read overlaps failed save (loadFirst=%s)', async (loadFirst) => {
    const initial = deferred<any>();
    const save = deferred<any>();
    const ui = fixture({ getConfig: () => initial.promise, saveConfig: () => save.promise });
    ui.bind(); ui.checkbox.click();
    if (loadFirst) { initial.resolve({ aiMarkAllImages: true }); await settle(); }
    save.reject(new Error('save failed')); await settle();
    if (!loadFirst) { initial.resolve({ aiMarkAllImages: true }); await settle(); }
    expect(ui.checkbox.checked).toBe(true);
    expect(ui.checkbox.disabled).toBe(false);
    expect(ui.status.textContent).toContain('저장하지 못');
  });
  it('does not let a late initial read undo a successful save', async () => {
    const initial = deferred<any>();
    const ui = fixture({ getConfig: () => initial.promise, saveConfig: async () => ({ aiMarkAllImages: true }) });
    ui.bind(); ui.checkbox.click(); await settle();
    initial.resolve({ aiMarkAllImages: false }); await settle();
    expect(ui.checkbox.checked).toBe(true);
    expect(ui.status.textContent).toContain('모든 이미지');
  });
  it('binds once even when the image tab initializes repeatedly', async () => {
    const api = { getConfig: vi.fn(async () => ({ aiMarkAllImages: false })), saveConfig: vi.fn(async () => ({ aiMarkAllImages: true })) };
    const ui = fixture(api); ui.bind(); ui.bind(); await settle(); ui.checkbox.click(); await settle();
    expect(api.getConfig).toHaveBeenCalledTimes(1);
    expect(api.saveConfig).toHaveBeenCalledTimes(1);
  });
  it('restores an enabled persisted value and can save it off', async () => {
    const api = { getConfig: vi.fn(async () => ({ aiMarkAllImages: true })), saveConfig: vi.fn(async () => ({ aiMarkAllImages: false })) };
    const ui = fixture(api); ui.bind(); await settle();
    expect(ui.checkbox.checked).toBe(true);
    ui.checkbox.click(); await settle();
    expect(api.saveConfig).toHaveBeenCalledWith({ aiMarkAllImages: false });
    expect(ui.status.textContent).toContain('자동 판정');
  });
  it.each([
    ['rejection', () => Promise.reject(new Error('disk unavailable'))],
    ['negative result', async () => ({ success: false })],
    ['mismatched persisted value', async () => ({ aiMarkAllImages: false })],
  ])('rolls back and exposes save failure: %s', async (_name, saveConfig) => {
    const ui = fixture({ getConfig: async () => ({ aiMarkAllImages: false }), saveConfig });
    ui.bind(); await settle(); ui.checkbox.click(); await settle();
    expect(ui.checkbox.checked).toBe(false);
    expect(ui.checkbox.disabled).toBe(false);
    expect(ui.status.textContent).toContain('저장하지 못');
    expect(ui.notify).toHaveBeenCalledWith(expect.stringContaining('저장하지 못'), 'error');
  });
  it('shows an unavailable connection instead of pretending optional API calls saved', async () => {
    const ui = fixture({ getConfig: async () => ({ aiMarkAllImages: false }) });
    ui.bind(); await settle(); ui.checkbox.click(); await settle();
    expect(ui.checkbox.checked).toBe(false);
    expect(ui.status.textContent).toContain('저장하지 못');
  });
  it('keeps interaction usable after config load fails', async () => {
    const ui = fixture({ getConfig: async () => { throw new Error('load failed'); }, saveConfig: async () => ({ aiMarkAllImages: true }) });
    ui.bind(); await settle();
    expect(ui.status.textContent).toContain('불러오지 못');
    ui.checkbox.click(); await settle();
    expect(ui.checkbox.checked).toBe(true);
    expect(ui.status.textContent).toContain('모든 이미지');
  });
});
