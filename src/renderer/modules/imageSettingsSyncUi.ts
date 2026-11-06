// src/renderer/modules/imageSettingsSyncUi.ts
// Screen side of the image-settings sync: every screen that shows the engine, the OpenAI model/quality or the
// thumbnail-copy switch repaints from storage when another screen changes it. Storage rules live in
// src/runtime/imageSettingsSync.ts. Inline bundle = one scope, so top-level names carry the imgSync prefix.

import {
  IMAGE_SETTINGS_CHANGED_EVENT,
  IMG_SYNC_ENGINE_COMPAT_KEY,
  IMG_SYNC_ENGINE_KEY,
  IMG_SYNC_THUMBNAIL_CHECKBOX_IDS,
  IMG_SYNC_THUMBNAIL_TEXT_KEY,
  imgSyncReadChange,
  imgSyncReadEngine,
  imgSyncReadThumbnailText,
  imgSyncWriteThumbnailText,
  type ImageSettingsChange,
} from '../../runtime/imageSettingsSync.js';

/** Marks a `change` event the painter fired itself, so the image tab handler can skip its own side effects. */
export const IMG_SYNC_PAINT_FLAG = 'blnImageSettingsPaint';

const IMG_SYNC_OPENAI_MODELS = ['gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'];
const IMG_SYNC_OPENAI_QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max'];
const IMG_SYNC_RATIO_SELECTS: ReadonlyArray<readonly [string, string]> = [
  ['thumbnail-ratio-select', 'thumbnailImageRatio'],
  ['subheading-ratio-select', 'subheadingImageRatio'],
];
let imgSyncListenersInstalled = false;
let imgSyncPaintedEngine: string | null = null;

function imgSyncStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Every thumbnail-copy checkbox that exists right now shows the one stored value. */
export function imgSyncPaintThumbnailChecks(): void {
  const store = imgSyncStorage();
  if (!store || typeof document === 'undefined') return;
  const on = imgSyncReadThumbnailText(store);
  for (const id of IMG_SYNC_THUMBNAIL_CHECKBOX_IDS) {
    const box = document.getElementById(id) as HTMLInputElement | null;
    if (box && box.checked !== on) box.checked = on;
  }
}

/** The engine drop-down only displays the stored engine; it never writes it back. */
export function imgSyncPaintEngine(): void {
  const store = imgSyncStorage();
  if (!store || typeof document === 'undefined') return;
  const engine = imgSyncReadEngine(store);
  if (!engine) return;
  (window as any).globalImageSource = engine;
  const select = document.getElementById('image-source-select') as HTMLSelectElement | null;
  const engineChanged = imgSyncPaintedEngine !== null && imgSyncPaintedEngine !== engine;
  imgSyncPaintedEngine = engine;
  if (select && Array.from(select.options).some((option) => option.value === engine) && (select.value !== engine || engineChanged)) {
    select.value = engine;
    // The row panels (login box, model row) listen to `change`; the flag keeps the tab's own side effects out.
    const repaint = new Event('change');
    (repaint as Event & Record<string, unknown>)[IMG_SYNC_PAINT_FLAG] = true;
    select.dispatchEvent(repaint);
  }
  const openaiBox = document.getElementById('openai-image-model-selection-container');
  if (openaiBox) openaiBox.style.display = engine === 'openai-image' ? 'block' : 'none';
}

/** OpenAI model / quality radios follow the stored pair (config and storage are written together). */
export function imgSyncPaintOpenAI(): void {
  const store = imgSyncStorage();
  if (!store || typeof document === 'undefined') return;
  const pairs: Array<[string, string, string[]]> = [
    ['openai-image-model', 'openaiImageModel', IMG_SYNC_OPENAI_MODELS],
    ['openai-image-quality', 'openaiImageQuality', IMG_SYNC_OPENAI_QUALITIES],
  ];
  for (const [name, key, allowed] of pairs) {
    const value = store.getItem(key) || '';
    if (!allowed.includes(value)) continue;
    const radio = document.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;
    if (radio && !radio.checked) radio.checked = true;
  }
}

/** Ratio selects of the full-auto window are re-read each time (they were filled once, at creation). */
export function imgSyncPaintRatios(): void {
  const store = imgSyncStorage();
  if (!store || typeof document === 'undefined') return;
  for (const [id, key] of IMG_SYNC_RATIO_SELECTS) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    const saved = store.getItem(key) || (key === 'subheadingImageRatio' ? store.getItem('imageRatio') : null) || '1:1';
    if (select && select.value !== saved) select.value = saved;
  }
}

const IMG_SYNC_WIDE_BOX_ID = 'issue-collect-wide-checkbox';
const IMG_SYNC_WIDE_KEY = 'issueCollectWide';

/** 'AI 자동 수집' breadth checkbox: remembered across restarts, off (news / official only) by default. */
export function imgSyncPaintWideCollect(): void {
  const store = imgSyncStorage();
  const box = typeof document === 'undefined' ? null : document.getElementById(IMG_SYNC_WIDE_BOX_ID) as HTMLInputElement | null;
  if (store && box) box.checked = store.getItem(IMG_SYNC_WIDE_KEY) === 'true';
}

function imgSyncRefreshSummary(): void {
  try { (window as any).refreshFullAutoImageSummary?.(); } catch { /* the summary line is optional */ }
}

/** Repaint the image tab (engine, OpenAI pair, thumbnail copy) — also used when the user switches to the tab. */
export function imgSyncRefreshImageTab(): void {
  imgSyncPaintEngine();
  imgSyncPaintOpenAI();
  imgSyncPaintThumbnailChecks();
  imgSyncPaintWideCollect();
  imgSyncRefreshSummary();
}

function imgSyncApplyChange(change: ImageSettingsChange): void {
  if (change.key === IMG_SYNC_ENGINE_KEY || change.key === IMG_SYNC_ENGINE_COMPAT_KEY) imgSyncPaintEngine();
  else if (change.key === IMG_SYNC_THUMBNAIL_TEXT_KEY) imgSyncPaintThumbnailChecks();
  else if (change.key === 'openaiImageModel' || change.key === 'openaiImageQuality') imgSyncPaintOpenAI();
  else if (IMG_SYNC_RATIO_SELECTS.some(([, key]) => key === change.key)) imgSyncPaintRatios();
  imgSyncRefreshSummary();
}

/** One-time wiring: checkboxes write the shared key as they change; other screens repaint on the change event. */
export function imgSyncInstallListeners(): void {
  if (imgSyncListenersInstalled || typeof document === 'undefined' || typeof window === 'undefined') return;
  imgSyncListenersInstalled = true;
  document.addEventListener('change', (event) => {
    const box = event.target as HTMLInputElement | null;
    const store = imgSyncStorage();
    if (box && store && box.id === IMG_SYNC_WIDE_BOX_ID) { store.setItem(IMG_SYNC_WIDE_KEY, String(box.checked)); return; }
    if (!box || !store || box.tagName !== 'INPUT' || !IMG_SYNC_THUMBNAIL_CHECKBOX_IDS.includes(box.id)) return;
    imgSyncWriteThumbnailText(store, box.checked, `checkbox:${box.id}`);
  });
  window.addEventListener(IMAGE_SETTINGS_CHANGED_EVENT, (event) => {
    const change = imgSyncReadChange(event);
    if (change) imgSyncApplyChange(change);
  });
  imgSyncPaintThumbnailChecks();
}

if (typeof window !== 'undefined') {
  (window as any).imgSyncRefreshImageTab = imgSyncRefreshImageTab;
  (window as any).imgSyncPaintThumbnailChecks = imgSyncPaintThumbnailChecks;
  (window as any).imgSyncPaintRatios = imgSyncPaintRatios;
}

/**
 * The engine drop-down can now show 📂 내 폴더 (display only). The tab's "generate" buttons draw AI images, so with that
 * choice they stop with a message instead of failing inside the generator. Returns true when generation must not run.
 */
export function imgSyncBlockLocalFolderGeneration(source: string, log: (message: string) => void): boolean {
  if (source !== 'local-folder') return false;
  log('📂 생성 엔진이 "내 폴더(순서대로)"로 되어 있어 AI 이미지를 만들지 않습니다. AI로 만들려면 생성 엔진을 바꿔 주세요 (내 폴더 사진은 발행할 때 순서대로 쓰입니다).');
  return true;
}
