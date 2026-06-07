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
import { initImageNarrativeUpload, getUploadedImages } from './imageNarrativeUpload.js';
import {
  getReviewEdits,
  initImageNarrativeReview,
  isReviewComplete,
  showReviewPanel,
} from './imageNarrativeReview.js';
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

let _modeState: ImageNarrativeState = {
  source: 'keyword',
  provider: 'gemini',
  mode: 'auto',
  isInferring: false,
  plan: null,
};

/** Returns a copy of the current module state. */
export function getImageNarrativeState(): ImageNarrativeState {
  return { ..._modeState };
}

function setState(patch: Partial<ImageNarrativeState>): void {
  _modeState = { ..._modeState, ...patch };
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the image-narrative toggle section.
 * Must be called inside DOMContentLoaded.
 */
export function initImageNarrativeMode(): void {
  // The photo-source UI now lives inside the unified generation-tabs
  // ("사진으로 생성" tab). The old standalone keyword/image toggle was removed,
  // so init no longer depends on those buttons existing — only on the upload
  // area and its sub-modules.
  const narrativeArea = document.getElementById('image-narrative-area');
  if (!narrativeArea) {
    console.warn('[ImageNarrativeMode] image-narrative-area not found — skipping init');
    return;
  }

  initImageNarrativeUpload();
  initImageNarrativeReview();
  _bindProviderRadios();
  _bindInferButton();
  _bindReviewGenerateEvent();
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/** Returns the currently selected Vision provider. */
export function getSelectedProvider(): VisionProvider {
  return _modeState.provider;
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
    claude: 'Claude Vision is not available in this build. Use Gemini or OpenAI.',
  };

  const msg = warnings[provider];
  warningEl.textContent = msg ?? '';
  warningEl.style.display = msg ? 'block' : 'none';
}

let _reviewGenerateBound = false;

function _bindReviewGenerateEvent(): void {
  if (_reviewGenerateBound) return;
  _reviewGenerateBound = true;

  document.addEventListener('imageNarrative:generate', async (event) => {
    const detail = (event as CustomEvent).detail ?? {};
    if (detail.plan) {
      setState({ plan: detail.plan as NarrativePlan });
    }
    await _handlePublish(detail.edits);
  });
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
  if (_modeState.isInferring) return;

  const images = getUploadedImages();
  if (images.length < 3) {
    _showToast('최소 3장 이상의 이미지를 업로드해 주세요.', 'error');
    return;
  }

  setState({ isInferring: true, plan: null });
  _setInferButtonState(true);

  try {
    // ✅ [SPEC-IMAGE-NARRATIVE] 표준 IPC 채널로 통일 (Quick Mode와 동일).
    // 이전: 존재하지 않는 electronAPI.inferImages → 항상 undefined → "Vision 추론 실패".
    const result = await (window as any).api?.inferAndWrite?.({
      images: images.map((img) => ({
        imageId: img.id,
        imageBase64: img.base64,
        mimeType: img.mimeType,
      })),
      provider: _modeState.provider,
      mode: _modeState.mode,
    });

    if (!result || !result.success) {
      throw new Error(result?.message ?? 'Vision 추론 실패');
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
  return _modeState.plan;
}

/** Programmatically sets the inferred plan (used by fullAutoFlow in Phase 4). */
export function setNarrativePlan(plan: NarrativePlan): void {
  setState({ plan });
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

async function _handlePublish(reviewEdits?: unknown): Promise<void> {
  const images = getUploadedImages();
  if (images.length < 3) {
    _showToast('최소 3장 이상의 이미지를 업로드해 주세요.', 'error');
    return;
  }
  if (_modeState.plan && !isReviewComplete()) {
    _showToast('Please complete the photo review fields before publishing.', 'error');
    return;
  }

  const edits = reviewEdits ?? Object.fromEntries(getReviewEdits());

  // Build the formData payload for executeFullAutoFlow
  const formData: Record<string, unknown> = {
    contentMode: 'image-narrative',
    imageNarrative: {
      images: images.map((img) => ({
        imageId: img.id,
        imageBase64: img.base64,
        mimeType: img.mimeType,
      })),
      provider: _modeState.provider,
      mode: _modeState.mode,
      plan: _modeState.plan ?? undefined,
      reviewEdits: edits,
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
