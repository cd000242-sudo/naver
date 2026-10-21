import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
const html = readFileSync('public/index.html', 'utf8');
const window = new Window();
window.document.body.innerHTML = html;
const doc = window.document;

describe('thumbnail studio editing surface', () => {
  it('gives preview, templates, editing and delivery separate accessible regions', () => {
    expect(doc.querySelector('#subtab-thumbnail .thumb-studio-workspace')).not.toBeNull();
    expect(doc.querySelector('#subtab-thumbnail .thumb-studio-preview')).not.toBeNull();
    expect(doc.querySelector('#subtab-thumbnail .thumb-studio-inspector')).not.toBeNull();
    expect(doc.querySelectorAll('.thumb-preset-btn')).toHaveLength(5);
    expect(Array.from(doc.querySelectorAll('.thumb-preset-btn')).map(x => x.getAttribute('data-preset'))).toEqual(['modern', 'minimal', 'vibrant', 'nature', 'dark']);
    expect(doc.querySelector('#thumb-studio-status')?.getAttribute('role')).toBe('status');
  });
  it('retains live editor controls and all five apply destinations once', () => {
    const ids = ['thumbnail-canvas', 'thumb-main-text', 'thumb-sub-text', 'thumb-font-family', 'thumb-font-size', 'thumb-text-color', 'thumb-text-align', 'thumb-text-shadow', 'thumb-text-outline', 'thumb-text-highlight', 'thumb-outline-settings', 'thumb-outline-color', 'thumb-outline-width', 'thumb-highlight-settings', 'thumb-highlight-color', 'thumb-highlight-opacity', 'thumb-bg-upload-btn', 'thumb-bg-storage-btn', 'thumb-bg-ai-btn', 'thumb-bg-ai-prompt', 'thumb-bg-file-input', 'thumb-bg-color', 'thumb-aspect-ratio', 'thumb-bg-mode', 'thumb-overlay-enable', 'thumb-overlay-settings', 'thumb-overlay-color', 'thumb-overlay-opacity', 'thumb-overlay-type', 'thumb-bg-blur', 'thumb-bg-brightness', 'thumb-canvas-container', 'thumb-canvas-size-text', 'thumb-apply-target', 'thumb-reset-btn', 'thumb-download-btn', 'thumb-apply-btn', 'thumb-undo', 'thumb-redo', 'thumb-fit-text', 'thumb-safe-area'];
    for (const id of ids) expect(doc.querySelectorAll(`#${id}`), id).toHaveLength(1);
    expect(Array.from(doc.querySelectorAll('#thumb-apply-target option')).map(x => x.getAttribute('value'))).toEqual(['image-tab', 'full-auto', 'continuous', 'ma-semi-auto', 'ma-full-auto']);
    expect(doc.querySelector('#subtab-thumbnail')?.textContent).not.toContain('1번 소제목');
  });
  it('removes retired options and explains the saved AI mark setting', () => {
    for (const id of ['image-thumbnail-quality-high', 'image-heading-text-include', 'image-look-editorial']) expect(doc.getElementById(id)).toBeNull();
    expect(doc.querySelector('#image-ai-mark-all')?.getAttribute('aria-describedby')).toContain('image-ai-mark-status');
    expect(doc.querySelector('#image-ai-mark-status')?.getAttribute('aria-live')).toBe('polite');
    expect(doc.querySelector('#image-source-select option[selected]')?.getAttribute('value')).toBe('openai-image');
  });
  it('names every visible editable studio field and avoids nested interactive labels', () => {
    for (const input of doc.querySelectorAll('#subtab-thumbnail input:not([type="file"]), #subtab-thumbnail textarea, #subtab-thumbnail select')) {
      const id = input.id;
      expect(Boolean(doc.querySelector(`label[for="${id}"]`) || input.closest('label') || input.getAttribute('aria-label')), id).toBe(true);
    }
  });
});
