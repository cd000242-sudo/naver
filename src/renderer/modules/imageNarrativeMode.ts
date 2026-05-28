/**
 * imageNarrativeMode.ts
 *
 * Main entry point for the "photo-start" content source toggle.
 * Manages the orthogonal axis toggle (keyword / image) and coordinates
 * the upload, review, and quick-mode sub-modules.
 *
 * Phase 3 — SPEC-IMAGE-NARRATIVE-2026
 */

import type { NarrativePlan, VisionProvider, InferenceMode } from '../../imageNarrative/types.js';
import { initImageNarrativeUpload, getUploadedImages, clearUploadedImages } from './imageNarrativeUpload.js';
import { initImageNarrativeReview, showReviewPanel, hideReviewPanel } from './imageNarrativeReview.js';
import { executeFullAutoFlow } from './fullAutoFlow.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which content source the user has selected. */
export type ContentSource = 'keyword' | 'image';

/** State shared by sub-modules (immutable updates only). */
export interface ImageNarrativeState {
  readonly source: ContentSource;
  readonly provider: VisionProvider;
  readonly mode: InferenceMode;
  readonly isInferring: boolean;
  readonly plan: NarrativePlan | null;
}

// ---------------------------------------------------------------------------
// Module-level state (single mutable reference, never mutated in place)
// ---------------------------------------------------------------------------

let _state: ImageNarrativeState = {
  source: 'keyword',
  provider: 'gemini',
  mode: 'auto',
  isInferring: false,
  plan: null,
};

/** Returns a copy of the current module state. */
export function getImageNarrativeState(): ImageNarrativeState {
  return { ..._state };
}

function setState(patch: Partial<ImageNarrativeState>): void {
  _state = { ..._state, ...patch };
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the image-narrative toggle section.
 * Must be called inside DOMContentLoaded.
 */
export function initImageNarrativeMode(): void {
  const toggleKeyword = document.getElementById('source-toggle-keyword');
  const toggleImage = document.getElementById('source-toggle-image');
  const narrativeArea = document.getElementById('image-narrative-area');

  if (!toggleKeyword || !toggleImage || !narrativeArea) {
    console.warn('[ImageNarrativeMode] Toggle elements not found — skipping init');
    return;
  }

  initImageNarrativeUpload();
  initImageNarrativeReview();
  _bindProviderRadios();
  _bindInferButton();
  _bindToggleButtons(toggleKeyword, toggleImage, narrativeArea);

  // Apply initial state
  handleSourceToggle('keyword');
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

/**
 * Switches the content source and updates the UI accordingly.
 * "keyword" hides the image-narrative area; "image" slides it down.
 */
export function handleSourceToggle(source: ContentSource): void {
  setState({ source, plan: null });

  const narrativeArea = document.getElementById('image-narrative-area');
  const keywordSection = document.getElementById('keyword-start-section');
  const toggleKeyword = document.getElementById('source-toggle-keyword');
  const toggleImage = document.getElementById('source-toggle-image');

  if (!narrativeArea) return;

  if (source === 'image') {
    narrativeArea.style.display = 'block';
    narrativeArea.classList.add('image-narrative-area--visible');
    if (keywordSection) keywordSection.style.opacity = '0.5';
    _setToggleActive(toggleImage, toggleKeyword);
  } else {
    narrativeArea.style.display = 'none';
    narrativeArea.classList.remove('image-narrative-area--visible');
    if (keywordSection) keywordSection.style.opacity = '1';
    _setToggleActive(toggleKeyword, toggleImage);
    clearUploadedImages();
    hideReviewPanel();
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/** Returns the currently selected Vision provider. */
export function getSelectedProvider(): VisionProvider {
  return _state.provider;
}

function _bindProviderRadios(): void {
  const radios = document.querySelectorAll<HTMLInputElement>(
    'input[name="vision-provider"]'
  );
  radios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const value = radio.value as VisionProvider;
      setState({ provider: value });
      _updateProviderWarning(value);
    });
  });
}

function _updateProviderWarning(provider: VisionProvider): void {
  const warningEl = document.getElementById('vision-provider-warning');
  if (!warningEl) return;

  const warnings: Partial<Record<VisionProvider, string>> = {
    claude: '⚠️ Claude Sonnet은 비용이 Gemini 대비 약 8배입니다. 신중하게 사용하세요.',
    deepinfra: '⚠️ DeepInfra Llama는 한국어 지명/음식 인식이 미검증입니다.',
  };

  const msg = warnings[provider];
  warningEl.textContent = msg ?? '';
  warningEl.style.display = msg ? 'block' : 'none';
}

// ---------------------------------------------------------------------------
// Infer button
// ---------------------------------------------------------------------------

function _bindInferButton(): void {
  const btn = document.getElementById('image-narrative-infer-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    await _startInference();
  });
}

async function _startInference(): Promise<void> {
  if (_state.isInferring) return;

  const images = getUploadedImages();
  if (images.length < 3) {
    _showToast('최소 3장 이상의 이미지를 업로드해 주세요.', 'error');
    return;
  }

  setState({ isInferring: true, plan: null });
  _setInferButtonState(true);

  try {
    // Delegate to main process via IPC (Phase 4 will wire fullAutoFlow)
    const result = await (window as any).electronAPI?.inferImages?.({
      images: images.map((img) => ({
        imageId: img.id,
        imageBase64: img.base64,
        mimeType: img.mimeType,
        exif: img.exif,
      })),
      provider: _state.provider,
      mode: _state.mode,
    });

    if (!result || result.error) {
      throw new Error(result?.error ?? 'Vision 추론 실패');
    }

    const plan = result.plan as NarrativePlan;
    setState({ plan, isInferring: false });
    showReviewPanel(plan, images);
  } catch (err) {
    console.error('[ImageNarrativeMode] Inference failed:', err);
    _showToast(`추론 실패: ${(err as Error).message}`, 'error');
    setState({ isInferring: false });
  } finally {
    _setInferButtonState(false);
  }
}

function _setInferButtonState(loading: boolean): void {
  const btn = document.getElementById('image-narrative-infer-btn');
  if (!btn) return;
  (btn as HTMLButtonElement).disabled = loading;
  btn.textContent = loading ? '⏳ 추론 중...' : '🔍 추론 시작';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _bindToggleButtons(
  toggleKeyword: HTMLElement,
  toggleImage: HTMLElement,
  narrativeArea: HTMLElement
): void {
  toggleKeyword.addEventListener('click', () => handleSourceToggle('keyword'));
  toggleImage.addEventListener('click', () => handleSourceToggle('image'));
}

function _setToggleActive(active: HTMLElement | null, inactive: HTMLElement | null): void {
  active?.classList.add('source-toggle-btn--active');
  active?.setAttribute('aria-pressed', 'true');
  inactive?.classList.remove('source-toggle-btn--active');
  inactive?.setAttribute('aria-pressed', 'false');
}

function _showToast(message: string, type: 'error' | 'info' = 'info'): void {
  // Delegates to the global toastManager if available
  const tm = (window as any).toastManager;
  if (tm?.show) {
    tm.show(message, type);
  } else {
    console.warn('[ImageNarrativeMode] Toast:', message);
  }
}

// ---------------------------------------------------------------------------
// Public API for Phase 4 integration
// ---------------------------------------------------------------------------

/** Returns the current NarrativePlan (null if not yet inferred). */
export function getNarrativePlan(): NarrativePlan | null {
  return _state.plan;
}

/** Programmatically sets the inferred plan (used by fullAutoFlow in Phase 4). */
export function setNarrativePlan(plan: NarrativePlan): void {
  setState({ plan });
}

/** Returns true when "image" source is active. */
export function isImageSourceActive(): boolean {
  return _state.source === 'image';
}

// ---------------------------------------------------------------------------
// Phase 4: publish button wire-up
// ---------------------------------------------------------------------------

/**
 * Binds the "publish" button in the image-narrative area.
 * When clicked, collects uploaded images + current settings and delegates to
 * executeFullAutoFlow with contentMode === 'image-narrative'.
 *
 * Must be called after initImageNarrativeMode().
 */
export function bindImageNarrativePublish(): void {
  const btn = document.getElementById('image-narrative-publish-btn');
  if (!btn) {
    console.warn('[ImageNarrativeMode] Publish button not found — skipping bind');
    return;
  }

  btn.addEventListener('click', async () => {
    await _handlePublish();
  });
}

async function _handlePublish(): Promise<void> {
  const images = getUploadedImages();
  if (images.length < 3) {
    _showToast('최소 3장 이상의 이미지를 업로드해 주세요.', 'error');
    return;
  }

  // Build the formData payload for executeFullAutoFlow
  const formData: Record<string, unknown> = {
    contentMode: 'image-narrative',
    imageNarrative: {
      images: images.map((img) => ({
        imageId: img.id,
        imageBase64: img.base64,
        mimeType: img.mimeType,
      })),
      provider: _state.provider,
      mode: _state.mode,
    },
    // Carry through any global form settings if available
    category: _readFormField('unified-category'),
    toneStyle: _readFormField('unified-tone-style'),
    targetChars: _readTargetChars(),
  };

  try {
    await executeFullAutoFlow(formData);
  } catch (err) {
    console.error('[ImageNarrativeMode] Publish failed:', err);
    _showToast(`발행 실패: ${(err as Error).message}`, 'error');
  }
}

function _readFormField(id: string): string | undefined {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el?.value?.trim() || undefined;
}

function _readTargetChars(): number | undefined {
  const el = document.getElementById('unified-target-chars') as HTMLSelectElement | null;
  if (!el) return undefined;
  const n = parseInt(el.value, 10);
  return Number.isNaN(n) ? undefined : n;
}
