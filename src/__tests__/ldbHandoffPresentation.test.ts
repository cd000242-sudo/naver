// @vitest-environment happy-dom
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { deliverLdbPostsToWindow } from '../main/ldb-delivery.js';
import { revealLdbDraft } from '../renderer/modules/ldbHandoffPresentation.js';

function desktop() {
  const ipc = new EventEmitter();
  const operations: string[] = [];
  const window = { isDestroyed: () => false, isMinimized: () => true,
    restore: vi.fn(() => operations.push('restore')), show: vi.fn(() => operations.push('show')),
    moveTop: vi.fn(() => operations.push('moveTop')), focus: vi.fn(() => operations.push('focus')),
    webContents: { id: 4, isDestroyed: () => false, isLoading: () => false, send: vi.fn() } };
  const acknowledge = (ok: boolean, imported: number) => ipc.emit('ldb:import-posts-result', { sender: { id: 4 } },
    { requestId: window.webContents.send.mock.calls.at(-1)?.[2], ok, imported });
  return { ipc, window, acknowledge, operations };
}

function screen() {
  document.body.innerHTML = `<button class="tab-button" data-tab="unified"></button><button class="tab-button" data-tab="images"></button>
    <button class="pub-mode-tab" data-pubmode="single"></button><button id="images-subtab-manage"></button>
    <section id="tab-unified" hidden><div id="pub-mode-single-panel" hidden><section id="unified-semi-auto-section"></section></div></section>
    <section id="tab-images" hidden><section id="images-subpanel-manage" hidden><section id="prompts-container"></section></section></section>`;
  for (const tab of document.querySelectorAll<HTMLElement>('.tab-button')) tab.onclick = () => {
    document.querySelectorAll<HTMLElement>('.tab-button').forEach(value => value.classList.toggle('active', value === tab));
    for (const name of ['images', 'unified']) document.getElementById(`tab-${name}`)!.hidden = name !== tab.dataset.tab;
  };
  document.querySelector<HTMLElement>('.pub-mode-tab')!.onclick = () => { document.getElementById('pub-mode-single-panel')!.hidden = false; };
  document.getElementById('images-subtab-manage')!.onclick = () => { document.getElementById('images-subpanel-manage')!.hidden = false; };
  const article = document.getElementById('unified-semi-auto-section')!;
  const images = document.getElementById('prompts-container')!;
  article.scrollIntoView = vi.fn(); images.scrollIntoView = vi.fn();
  return { article, images };
}

describe('LDB handoff presentation', () => {
  it('restores, raises and focuses the desktop in order only after the renderer acknowledges delivery', async () => {
    const { ipc, window, acknowledge, operations } = desktop();
    const delivery = deliverLdbPostsToWindow(window, ipc, [{}]);
    expect(operations).toEqual([]);
    acknowledge(true, 1);
    await expect(delivery).resolves.toBe(1);
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce(); expect(window.focus).toHaveBeenCalledOnce();
    expect(operations).toEqual(['restore', 'show', 'moveTop', 'focus']);
  });
  it('raises an already visible app without restoring it or leaving it always on top', async () => {
    const { ipc, window, acknowledge, operations } = desktop();
    window.isMinimized = () => false;
    const delivery = deliverLdbPostsToWindow(window, ipc, [{}]);
    acknowledge(true, 1);
    await expect(delivery).resolves.toBe(1);
    expect(operations).toEqual(['show', 'moveTop', 'focus']);
  });
  it('does not steal focus for selection-only requests or rejected deliveries', async () => {
    const { ipc, window, acknowledge } = desktop();
    const selection = deliverLdbPostsToWindow(window, ipc, []); acknowledge(true, 0); await selection;
    const failed = deliverLdbPostsToWindow(window, ipc, [{}]); acknowledge(false, 0);
    await expect(failed).rejects.toThrow();
    expect(window.restore).not.toHaveBeenCalled(); expect(window.show).not.toHaveBeenCalled();
    expect(window.moveTop).not.toHaveBeenCalled(); expect(window.focus).not.toHaveBeenCalled();
  });
  it('reports a closed window instead of claiming a visible successful handoff', async () => {
    const { ipc, window, acknowledge } = desktop();
    const delivery = deliverLdbPostsToWindow(window, ipc, [{}]);
    window.isDestroyed = () => true; acknowledge(true, 1);
    await expect(delivery).rejects.toThrow(/앱/);
    expect(window.focus).not.toHaveBeenCalled();
  });
  it('opens the single article editor and scrolls/focuses its section without pressing publish', () => {
    const { article, images } = screen();
    revealLdbDraft({ images: [] }, document);
    expect(document.querySelector('.tab-button.active')?.getAttribute('data-tab')).toBe('unified');
    expect(document.getElementById('pub-mode-single-panel')!.hidden).toBe(false);
    expect(article.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
    expect(document.activeElement).toBe(article); expect(images.scrollIntoView).not.toHaveBeenCalled();
  });
  it('opens image management even if the generation studio was selected and shows received previews', () => {
    const { images } = screen();
    images.innerHTML = '<div class="prompt-item" data-heading-title="🖼️ 썸네일"><div class="generated-image"><img src="data:image/png;base64,AAAA"></div></div>';
    revealLdbDraft({ images: [{ heading: '🖼️ 썸네일' }] }, document);
    expect(document.querySelector('.tab-button.active')?.getAttribute('data-tab')).toBe('images');
    expect(document.getElementById('images-subpanel-manage')!.hidden).toBe(false);
    expect(images.scrollIntoView).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(images);
  });
  it('fails when any received image has no matched preview rather than acknowledging an empty screen', () => {
    screen();
    expect(() => revealLdbDraft({ images: [{ heading: '소제목' }] }, document)).toThrow(/미리보기/);
  });
  it('does not report successful navigation when the app UI is unavailable', () => {
    screen(); document.querySelector('.tab-button[data-tab="unified"]')!.remove();
    expect(() => revealLdbDraft({ images: [] }, document)).toThrow(/화면/);
  });
});
