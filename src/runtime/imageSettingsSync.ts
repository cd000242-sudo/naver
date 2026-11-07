/**
 * Single source of truth for the image settings the image-management tab and the main full-auto image window share.
 *
 * Storage rules (owner request: "pick it once, it must not need picking again"):
 *  - engine: localStorage `globalImageSource` is the base. `fullAutoImageSource` is written alongside for old readers
 *    and is only a fallback when the base is empty. Drop-downs only DISPLAY it; reading never rewrites storage.
 *  - thumbnail copy: localStorage `thumbnailTextInclude` is the only key; every checkbox writes it as it changes.
 *  - change notice: a same-window `bln:image-settings-changed` event (the browser `storage` event never fires in the
 *    window that wrote the value).
 * Pure helpers only (no DOM at import time) so the renderer inline bundle can load this file first.
 */
export const IMAGE_SETTINGS_CHANGED_EVENT = 'bln:image-settings-changed';
export const IMG_SYNC_ENGINE_KEY = 'globalImageSource';
export const IMG_SYNC_ENGINE_COMPAT_KEY = 'fullAutoImageSource';
export const IMG_SYNC_THUMBNAIL_TEXT_KEY = 'thumbnailTextInclude';
export const IMG_SYNC_SHOPPING_ENGINE_KEY = 'scAIImageEngine';

/** Engines the shopping-connect AI mode accepts (kept equal to the image tab's old rule). */
export const IMG_SYNC_SHOPPING_ENGINES: readonly string[] = ['nano-banana-2', 'openai-image', 'dropshot', 'codex-image'];

/** Every checkbox that edits the one thumbnail-copy key (image tab, full-auto window, full-auto publish screen, continuous, multi-account window). */
export const IMG_SYNC_THUMBNAIL_CHECKBOX_IDS: readonly string[] = [
  'thumbnail-text-option',
  'thumbnail-text-include',
  'fullauto-thumbnail-text-option',
  'continuous-include-thumbnail-text',
  'continuous-modal-include-thumbnail-text',
  'ma-setting-thumbnail-text-option',
];

export type ImgSyncStore = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>>;

export interface ImageSettingsChange {
  readonly key: string;
  readonly value: unknown;
  readonly source: string;
}

const IMG_SYNC_ENGINE_ALIASES: Readonly<Record<string, string>> = {
  'nano-banana-pro': 'nano-banana-2',
  'nano-banana': 'nano-banana-2',
  'dall-e-3': 'openai-image',
};

/** Empty / "null" / "undefined" become null; retired nano-banana variants map to the one that remains. */
export function imgSyncNormalizeEngine(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value === 'null' || value === 'undefined') return null;
  return IMG_SYNC_ENGINE_ALIASES[value] ?? value;
}

/**
 * The engine every flow uses. `globalImageSource` wins; the compat key is read only when it is empty or not in
 * `valid`. Never writes.
 */
export function imgSyncReadEngine(store: Pick<Storage, 'getItem'>, valid?: readonly string[]): string | null {
  for (const key of [IMG_SYNC_ENGINE_KEY, IMG_SYNC_ENGINE_COMPAT_KEY]) {
    const value = imgSyncNormalizeEngine(store.getItem(key));
    if (value && (!valid || valid.includes(value))) return value;
  }
  return null;
}

/** `scAIImageEngine` follows the engine only when the shopping AI mode can use it. */
export function imgSyncShoppingEngineFor(engine: string): string | null {
  return IMG_SYNC_SHOPPING_ENGINES.includes(engine) ? engine : null;
}

export function imgSyncReadThumbnailText(store: Pick<Storage, 'getItem'>): boolean {
  return store.getItem(IMG_SYNC_THUMBNAIL_TEXT_KEY) === 'true';
}

type ImgSyncEventTarget = { dispatchEvent(event: Event): boolean };

function imgSyncDefaultTarget(): ImgSyncEventTarget | undefined {
  return typeof window !== 'undefined' ? window : undefined;
}

/** Announce a change to every other screen in this window. A failing listener never breaks the writer. */
export function imgSyncNotify(key: string, value: unknown, source: string, target: ImgSyncEventTarget | undefined = imgSyncDefaultTarget()): void {
  if (!target) return;
  const detail: ImageSettingsChange = { key, value, source };
  try {
    if (typeof CustomEvent === 'function') {
      target.dispatchEvent(new CustomEvent(IMAGE_SETTINGS_CHANGED_EVENT, { detail }));
    } else {
      const event = new Event(IMAGE_SETTINGS_CHANGED_EVENT);
      (event as Event & { detail?: ImageSettingsChange }).detail = detail;
      target.dispatchEvent(event);
    }
  } catch (error) {
    console.warn('[ImageSettingsSync] 변경 알림 실패 (무시):', error);
  }
}

/**
 * Write the one thumbnail-copy key and tell the other checkboxes.
 * Unchecked removes the key instead of storing 'false': the thumbnail director reads a missing key as
 * "auto" and 'false' as "exclude", and the on-screen copy promises "꺼 두면 자동 판단" (2026-11-03 review).
 */
export function imgSyncWriteThumbnailText(store: ImgSyncStore, include: boolean, source: string, target?: ImgSyncEventTarget): void {
  if (include) store.setItem(IMG_SYNC_THUMBNAIL_TEXT_KEY, 'true');
  else if (store.removeItem) store.removeItem(IMG_SYNC_THUMBNAIL_TEXT_KEY);
  else store.setItem(IMG_SYNC_THUMBNAIL_TEXT_KEY, '');
  imgSyncNotify(IMG_SYNC_THUMBNAIL_TEXT_KEY, include, source, target ?? imgSyncDefaultTarget());
}

/** Read the change detail out of the event, or null when the event is not ours. */
export function imgSyncReadChange(event: Event): ImageSettingsChange | null {
  const detail = (event as Event & { detail?: Partial<ImageSettingsChange> }).detail;
  if (!detail || typeof detail.key !== 'string') return null;
  return { key: detail.key, value: detail.value, source: typeof detail.source === 'string' ? detail.source : '' };
}
