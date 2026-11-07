import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IMAGE_SETTINGS_CHANGED_EVENT,
  IMG_SYNC_THUMBNAIL_CHECKBOX_IDS,
  imgSyncNormalizeEngine,
  imgSyncNotify,
  imgSyncReadChange,
  imgSyncReadEngine,
  imgSyncReadThumbnailText,
  imgSyncShoppingEngineFor,
  imgSyncWriteThumbnailText,
} from '../runtime/imageSettingsSync';
import { imgSyncBlockLocalFolderGeneration } from '../renderer/modules/imageSettingsSyncUi';

function makeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    data, writes,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => { writes.push(key); data.set(key, value); },
    removeItem: (key: string) => { writes.push(key); data.delete(key); },
  };
}

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('engine: one base, globalImageSource', () => {
  it('reads globalImageSource first, the compat key only as a fallback, and never writes', () => {
    const store = makeStore({ globalImageSource: 'flow', fullAutoImageSource: 'dropshot' });
    expect(imgSyncReadEngine(store)).toBe('flow');
    expect(makeStore({ fullAutoImageSource: 'dropshot' })).toBeTruthy();
    expect(imgSyncReadEngine(makeStore({ fullAutoImageSource: 'dropshot' }))).toBe('dropshot');
    expect(imgSyncReadEngine(makeStore({ globalImageSource: 'null', fullAutoImageSource: 'genspark' }))).toBe('genspark');
    expect(store.writes).toEqual([]);
  });
  it('keeps local-folder and maps retired nano-banana names', () => {
    expect(imgSyncReadEngine(makeStore({ globalImageSource: 'local-folder', fullAutoImageSource: 'openai-image' }))).toBe('local-folder');
    expect(imgSyncNormalizeEngine('nano-banana-pro')).toBe('nano-banana-2');
    expect(imgSyncNormalizeEngine('undefined')).toBeNull();
  });
  it('the shopping AI engine mirror only accepts the allowed engines', () => {
    expect(imgSyncShoppingEngineFor('openai-image')).toBe('openai-image');
    expect(imgSyncShoppingEngineFor('dropshot')).toBe('dropshot');
    expect(imgSyncShoppingEngineFor('codex-image')).toBe('codex-image');
    expect(imgSyncShoppingEngineFor('flow')).toBeNull();
    expect(imgSyncShoppingEngineFor('local-folder')).toBeNull();
  });
});

describe('change notice', () => {
  it('sends the key, value and source on the same-window event', () => {
    const seen: unknown[] = [];
    const target = { dispatchEvent: (event: Event) => { seen.push(imgSyncReadChange(event)); return true; } };
    imgSyncNotify('globalImageSource', 'flow', 'image-tab', target);
    expect(seen).toEqual([{ key: 'globalImageSource', value: 'flow', source: 'image-tab' }]);
    expect(IMAGE_SETTINGS_CHANGED_EVENT).toBe('bln:image-settings-changed');
  });
  it('a throwing listener never breaks the writer', () => {
    expect(() => imgSyncNotify('k', 1, 's', { dispatchEvent: () => { throw new Error('boom'); } })).not.toThrow();
  });
});

describe('thumbnail copy: one key', () => {
  it('writes thumbnailTextInclude and announces it', () => {
    const store = makeStore();
    const seen: unknown[] = [];
    imgSyncWriteThumbnailText(store, false, 'checkbox:thumbnail-text-option', { dispatchEvent: (e: Event) => { seen.push(imgSyncReadChange(e)); return true; } });
    expect(store.data.has('thumbnailTextInclude')).toBe(false); // unchecked = key removed = director 'auto'
    expect(imgSyncReadThumbnailText(store)).toBe(false);
    expect(seen).toEqual([{ key: 'thumbnailTextInclude', value: false, source: 'checkbox:thumbnail-text-option' }]);
  });
  it('covers the image tab, the full-auto window, the full-auto publish screen and both continuous checkboxes', () => {
    expect([...IMG_SYNC_THUMBNAIL_CHECKBOX_IDS].sort()).toEqual([
      'continuous-include-thumbnail-text', 'continuous-modal-include-thumbnail-text', 'fullauto-thumbnail-text-option', 'thumbnail-text-include', 'thumbnail-text-option',
    ]);
  });
});

describe('screens repaint from the change event (fake DOM)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('turning one thumbnail checkbox off turns every other one off', async () => {
    vi.resetModules();
    const boxes = Object.fromEntries(IMG_SYNC_THUMBNAIL_CHECKBOX_IDS.map((id) => [id, { id, tagName: 'INPUT', checked: true }]));
    const store = makeStore({ thumbnailTextInclude: 'true' });
    const docListeners: Array<(e: any) => void> = [];
    const winListeners: Record<string, Array<(e: any) => void>> = {};
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('document', {
      getElementById: (id: string) => (boxes as any)[id] ?? null,
      addEventListener: (_t: string, fn: (e: any) => void) => docListeners.push(fn),
    });
    vi.stubGlobal('window', {
      addEventListener: (t: string, fn: (e: any) => void) => { (winListeners[t] ||= []).push(fn); },
      dispatchEvent: (e: Event) => { (winListeners[e.type] || []).forEach((fn) => fn(e)); return true; },
    });
    const ui = await import('../renderer/modules/imageSettingsSyncUi');
    ui.imgSyncInstallListeners();

    boxes['thumbnail-text-option'].checked = false;
    docListeners.forEach((fn) => fn({ target: boxes['thumbnail-text-option'] }));

    expect(store.data.has('thumbnailTextInclude')).toBe(false); // unchecked = key removed = director 'auto'
    for (const id of IMG_SYNC_THUMBNAIL_CHECKBOX_IDS) expect(boxes[id].checked).toBe(false);
  });

  it('the engine drop-down only displays the stored engine and never rewrites storage', async () => {
    vi.resetModules();
    const store = makeStore({ globalImageSource: 'local-folder' });
    const select = { value: 'openai-image', options: [{ value: 'openai-image' }, { value: 'local-folder' }], dispatchEvent: vi.fn() };
    vi.stubGlobal('localStorage', store);
    vi.stubGlobal('document', { getElementById: (id: string) => (id === 'image-source-select' ? select : null) });
    vi.stubGlobal('window', {});
    const ui = await import('../renderer/modules/imageSettingsSyncUi');
    ui.imgSyncPaintEngine();
    expect(select.value).toBe('local-folder');
    expect(store.writes).toEqual([]);
  });

  it('the OpenAI radios follow the stored pair', async () => {
    vi.resetModules();
    const radios: Record<string, { checked: boolean }> = {
      'openai-image-model:gpt-image-2.5-flare': { checked: false },
      'openai-image-quality:high': { checked: false },
    };
    vi.stubGlobal('localStorage', makeStore({ openaiImageModel: 'gpt-image-2.5-flare', openaiImageQuality: 'high' }));
    vi.stubGlobal('document', {
      querySelector: (sel: string) => {
        const m = sel.match(/name="([^"]+)"\]\[value="([^"]+)"/);
        return m ? radios[`${m[1]}:${m[2]}`] ?? null : null;
      },
    });
    vi.stubGlobal('window', {});
    const ui = await import('../renderer/modules/imageSettingsSyncUi');
    ui.imgSyncPaintOpenAI();
    expect(radios['openai-image-model:gpt-image-2.5-flare'].checked).toBe(true);
    expect(radios['openai-image-quality:high'].checked).toBe(true);
  });
});

describe('wiring (source contracts)', () => {
  it('full-auto window: engine / style sub-windows re-read on open, shopping engine mirrored, changes announced', () => {
    const his = read('renderer/components/HeadingImageSettings.ts');
    expect(his).toMatch(/selectedSourceValue = currentSource;/);
    expect(his).toMatch(/selectedStyleValue = currentStyle;/);
    expect(his).toContain("safeLocalStorageSet('scAIImageEngine', shoppingEngine)");
    expect(his).toContain("imgSyncNotify('globalImageSource', normalized, 'full-auto-window')");
    expect(his).toContain("imgSyncNotify('openaiImageModel'");
    expect(his).toContain('imgSyncPaintRatios');
    expect(his).toContain('이미지 관리 탭과 같은 설정');
  });
  it('image tab: repaint events skip the dialogs, announce its own writes, and has the shared-settings note', () => {
    const imt = read('renderer/modules/imageManagementTab.ts');
    expect(imt).toContain('IMG_SYNC_PAINT_FLAG');
    expect(imt).toContain("imgSyncNotify('globalImageSource', normalizedSource, 'image-tab')");
    expect(imt).toContain("imgSyncNotify('globalImageSource', 'local-folder', 'image-tab')");
    const html = read('../public/index.html');
    expect(html).toContain('여기서 고른 설정은 풀오토·연속발행·다중계정에 그대로 쓰입니다');
    expect(html).toContain('<option value="local-folder"');
  });
  it('pipeline and DOM cache: storage is the base, the drop-down is display only', () => {
    const udc = read('renderer/modules/unifiedDOMCache.ts');
    expect(udc).not.toMatch(/localStorage\.setItem\('(fullAuto|global)ImageSource'/);
    const pc = read('renderer/modules/pipelineConfig.ts');
    expect(pc).not.toContain('readFullAutoImageModelFromUi');
    expect(pc).toMatch(/storedImageSource \|\| screenImageSource/);
  });
  it('no publish path ORs a checkbox into the thumbnail-copy switch', () => {
    for (const file of ['renderer/modules/publishingHandlers.ts', 'renderer/modules/fullAutoFlow.ts', 'renderer/modules/continuousPublishing.ts', 'renderer/renderer.ts']) {
      const src = read(file);
      expect(src, file).not.toMatch(/thumbnailTextInclude\s*\|\|\s*\n?\s*\(?document\.getElementById/);
      expect(src, file).not.toMatch(/getItem\('thumbnailTextInclude'\) === 'true' \|\|/);
    }
  });
  it('the tab refreshes when the user switches to it, and the new modules are registered in the bundle', () => {
    expect(read('renderer/renderer.ts')).toContain("targetTab === 'images'");
    const copy = readFileSync(resolve(__dirname, '../../scripts/copy-static.mjs'), 'utf8');
    expect(copy.indexOf("'imageSettingsSync.js'")).toBeGreaterThan(-1);
    expect(copy.indexOf("'imageSettingsSyncUi.js'")).toBeLessThan(copy.indexOf("'imageManagementTab.js'"));
    const fp = read('contentQualityV3/candidateRuntimeFingerprint.ts');
    expect(fp).toContain("'src/runtime/imageSettingsSync.ts'");
    expect(fp).toContain("'src/renderer/modules/imageSettingsSyncUi.ts'");
  });
});

describe('other engine writers and the local-folder display option', () => {
  it('shopping sub-tab, multi-account and shopping utils announce their engine writes', () => {
    expect(read('renderer/modules/continuousPublishing.ts')).toContain("imgSyncNotify('globalImageSource', normalizedValue, 'shopping-subtab')");
    expect(read('renderer/modules/multiAccountManager.ts')).toContain("imgSyncNotify('globalImageSource', value, 'shopping-ma')");
    expect(read('renderer/utils/shoppingConnectUtils.ts')).toContain("imgSyncNotify('globalImageSource', normalizedEngine, 'shopping-engine')");
  });
  it('the tab generate buttons stop with a message when the display-only 내 폴더 option is shown', () => {
    const logs: string[] = [];
    expect(imgSyncBlockLocalFolderGeneration('local-folder', (m) => logs.push(m))).toBe(true);
    expect(imgSyncBlockLocalFolderGeneration('openai-image', (m) => logs.push(m))).toBe(false);
    expect(logs).toHaveLength(1);
    const gen = read('renderer/modules/headingImageGen.ts');
    expect(gen.match(/imgSyncBlockLocalFolderGeneration\(imageSource/g)).toHaveLength(3);
  });
});
