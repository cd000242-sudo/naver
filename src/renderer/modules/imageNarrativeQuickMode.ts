/**
 * imageNarrativeQuickMode.ts
 *
 * 3-panel single-page layout for the Quick Mode entry point.
 * Minimizes options (defaults only) to let users go from photos
 * to published post in the fastest possible path.
 *
 * Panels:
 *   1. Photo upload
 *   2. Inference confirmation
 *   3. Publish
 *
 * Phase 3 — SPEC-IMAGE-NARRATIVE-2026
 */

import { initImageNarrativeUpload, getUploadedImages, clearUploadedImages, addFiles, UPLOAD_MIN } from './imageNarrativeUpload.js';
import { showReviewPanel, hideReviewPanel, isReviewComplete } from './imageNarrativeReview.js';
import type { NarrativePlan } from '../../imageNarrative/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuickModePanel = 1 | 2 | 3;

interface QuickModeState {
  readonly currentPanel: QuickModePanel;
  readonly isInferring: boolean;
  readonly plan: NarrativePlan | null;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _quickState: QuickModeState = {
  currentPanel: 1,
  isInferring: false,
  plan: null,
};

function setState(patch: Partial<QuickModeState>): void {
  _quickState = { ..._quickState, ...patch };
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the Quick Mode module.
 * Wires the sidebar/header entry-point link and sets up the overlay modal.
 */
export function initImageNarrativeQuickMode(): void {
  _bindEntryLink();
  _ensureModalExists();
}

function _bindEntryLink(): void {
  const link = document.getElementById('quick-mode-photo-link');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    openQuickMode();
  });
}

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

/** Opens the Quick Mode overlay and resets to panel 1. */
export function openQuickMode(): void {
  const modal = _getModal();
  if (!modal) return;

  clearUploadedImages();
  hideReviewPanel();
  setState({ currentPanel: 1, isInferring: false, plan: null });

  _renderModal();
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

/** Closes the Quick Mode overlay. */
export function closeQuickMode(): void {
  const modal = _getModal();
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  clearUploadedImages();
  hideReviewPanel();
}

// ---------------------------------------------------------------------------
// Panel navigation
// ---------------------------------------------------------------------------

function _goToPanel(panel: QuickModePanel): void {
  setState({ currentPanel: panel });
  _renderPanelState();
}

function _renderPanelState(): void {
  const modal = _getModal();
  if (!modal) return;

  // Update step indicator
  [1, 2, 3].forEach((n) => {
    const step = modal.querySelector<HTMLElement>(`[data-quick-step="${n}"]`);
    if (!step) return;
    step.classList.toggle('quick-mode-step--active', n === _quickState.currentPanel);
    step.classList.toggle('quick-mode-step--done', n < _quickState.currentPanel);
  });

  // Show/hide panels
  [1, 2, 3].forEach((n) => {
    const panel = modal.querySelector<HTMLElement>(`[data-quick-panel="${n}"]`);
    if (!panel) return;
    panel.style.display = n === _quickState.currentPanel ? 'flex' : 'none';
  });

  // Update navigation buttons
  const prevBtn = modal.querySelector<HTMLButtonElement>('#quick-mode-prev-btn');
  const nextBtn = modal.querySelector<HTMLButtonElement>('#quick-mode-next-btn');

  if (prevBtn) prevBtn.style.display = _quickState.currentPanel > 1 ? 'inline-flex' : 'none';
  if (nextBtn) {
    if (_quickState.currentPanel === 3) {
      nextBtn.textContent = '🚀 발행하기';
    } else {
      nextBtn.textContent = _quickState.currentPanel === 1 ? '추론 시작 →' : '발행 설정 →';
    }
  }
}

// ---------------------------------------------------------------------------
// Panel 2: Inference
// ---------------------------------------------------------------------------

async function _runQuickInference(): Promise<void> {
  if (_quickState.isInferring) return;

  const images = getUploadedImages();
  if (images.length < UPLOAD_MIN) {
    _showToast(`최소 ${UPLOAD_MIN}장의 이미지를 추가해 주세요.`, 'error');
    return;
  }

  setState({ isInferring: true });
  _setNextBtnLoading(true);

  try {
    // [v2.11.5 FIX] Quick Mode 가 호출하던 electronAPI.inferImages 는 preload에 노출 안 됨 →
    //   항상 undefined 반환 → throw "Vision 추론 실패". 표준 채널 window.api.inferAndWrite 로 통일.
    //   응답 스키마도 main 핸들러와 정합 (success/message/plan/content/imageMap).
    const result = await (window as any).api?.inferAndWrite?.({
      images: images.map((img) => ({
        imageId: img.id,
        imageBase64: img.base64,
        mimeType: img.mimeType,
      })),
      provider: 'gemini', // Quick mode defaults to Gemini Flash
      mode: 'auto',
    });

    if (!result || !result.success) {
      throw new Error(result?.message ?? 'Vision 추론 실패');
    }

    const plan = result.plan as NarrativePlan;
    if (!plan) {
      throw new Error('추론 응답에 plan 객체가 누락되었습니다.');
    }
    setState({ plan, isInferring: false });

    // Render review inside panel 2
    const reviewContainer = document.getElementById('quick-mode-review-container');
    if (reviewContainer) {
      reviewContainer.innerHTML = '<div id="image-narrative-review-panel"></div>';
    }
    showReviewPanel(plan, images);
    _goToPanel(2);
  } catch (err) {
    console.error('[QuickMode] Inference failed:', err);
    _showToast(`추론 실패: ${(err as Error).message}`, 'error');
    setState({ isInferring: false });
  } finally {
    _setNextBtnLoading(false);
  }
}

// ---------------------------------------------------------------------------
// Panel 3: Publish
// ---------------------------------------------------------------------------

function _renderPublishPanel(): void {
  const panel = document.querySelector<HTMLElement>('[data-quick-panel="3"]');
  if (!panel || !_quickState.plan) return;

  panel.innerHTML = `
    <div class="quick-mode-publish-summary">
      <h3>발행 설정</h3>
      <p>추론된 카테고리: <strong>${_quickState.plan.mode}</strong></p>
      <p>사진 수: <strong>${getUploadedImages().length}장</strong></p>
      <div class="quick-mode-publish-actions">
        <button id="quick-mode-final-publish-btn" class="btn-primary btn-large">
          🚀 바로 발행하기
        </button>
        <p class="quick-mode-hint">기본 설정(SEO 모드, 1500자, 즉시 발행)으로 발행됩니다.</p>
      </div>
    </div>
  `;

  document.getElementById('quick-mode-final-publish-btn')?.addEventListener('click', () => {
    document.dispatchEvent(
      new CustomEvent('imageNarrative:quickPublish', {
        detail: { plan: _quickState.plan, images: getUploadedImages() },
      })
    );
    closeQuickMode();
  });
}

// ---------------------------------------------------------------------------
// Modal DOM
// ---------------------------------------------------------------------------

function _ensureModalExists(): void {
  if (document.getElementById('quick-mode-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'quick-mode-modal';
  modal.className = 'quick-mode-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
  document.body.appendChild(modal);
}

function _renderModal(): void {
  const modal = _getModal();
  if (!modal) return;

  modal.innerHTML = `
    <div class="quick-mode-backdrop"></div>
    <div class="quick-mode-3panel">
      <!-- Header -->
      <div class="quick-mode-header">
        <h2>📸 사진→글 (Quick Mode)</h2>
        <button id="quick-mode-close-btn" class="quick-mode-close" aria-label="닫기">×</button>
      </div>

      <!-- Step indicator -->
      <div class="quick-mode-steps">
        <div class="quick-mode-step quick-mode-step--active" data-quick-step="1">
          <span class="quick-mode-step__num">1</span>
          <span>사진 업로드</span>
        </div>
        <div class="quick-mode-step-separator"></div>
        <div class="quick-mode-step" data-quick-step="2">
          <span class="quick-mode-step__num">2</span>
          <span>추론 확인</span>
        </div>
        <div class="quick-mode-step-separator"></div>
        <div class="quick-mode-step" data-quick-step="3">
          <span class="quick-mode-step__num">3</span>
          <span>발행</span>
        </div>
      </div>

      <!-- Panel 1: Upload -->
      <div class="quick-mode-panel" data-quick-panel="1" style="display: flex;">
        <div id="quick-upload-drop-zone" class="image-narrative-upload-zone">
          <p>📁 이미지를 드래그하거나 아래 버튼으로 선택하세요</p>
          <p style="font-size: 0.8rem; color: var(--text-muted)">JPG / PNG / HEIC, 3~30장, 최대 10MB/장</p>
        </div>
        <div class="quick-mode-upload-btns">
          <input type="file" id="quick-file-input" multiple accept="image/*,.heic" style="display:none" />
          <button id="quick-file-btn" class="btn-secondary">📂 파일 선택</button>
          <input type="file" id="quick-folder-input" webkitdirectory multiple accept="image/*,.heic" style="display:none" />
          <button id="quick-folder-btn" class="btn-secondary">🗂️ 폴더 선택</button>
        </div>
        <div id="quick-upload-status" style="font-size: 0.85rem; color: var(--text-muted);">
          0장 업로드됨
        </div>
        <div id="quick-thumbnail-grid" class="image-narrative-thumbnail-grid"></div>
      </div>

      <!-- Panel 2: Review -->
      <div class="quick-mode-panel" data-quick-panel="2" style="display: none; flex-direction: column;">
        <div id="quick-mode-review-container" style="overflow-y: auto; flex: 1;">
          <p style="color: var(--text-muted);">추론 결과가 여기에 표시됩니다.</p>
        </div>
      </div>

      <!-- Panel 3: Publish -->
      <div class="quick-mode-panel" data-quick-panel="3" style="display: none;">
        <!-- Rendered dynamically -->
      </div>

      <!-- Navigation -->
      <div class="quick-mode-nav">
        <button id="quick-mode-prev-btn" class="btn-secondary" style="display: none;">← 이전</button>
        <button id="quick-mode-next-btn" class="btn-primary">추론 시작 →</button>
      </div>
    </div>
  `;

  // Bind close
  document.getElementById('quick-mode-close-btn')?.addEventListener('click', closeQuickMode);
  modal.querySelector('.quick-mode-backdrop')?.addEventListener('click', closeQuickMode);

  // Bind upload inputs (reuse upload module via direct wiring)
  _bindQuickUpload();

  // Bind navigation
  document.getElementById('quick-mode-next-btn')?.addEventListener('click', _onNextClick);
  document.getElementById('quick-mode-prev-btn')?.addEventListener('click', _onPrevClick);
}

function _bindQuickUpload(): void {
  const dropZone = document.getElementById('quick-upload-drop-zone');
  const fileInput = document.getElementById('quick-file-input') as HTMLInputElement | null;
  const fileBtn = document.getElementById('quick-file-btn');
  const folderInput = document.getElementById('quick-folder-input') as HTMLInputElement | null;
  const folderBtn = document.getElementById('quick-folder-btn');

  // [v2.11.4 FIX] 파일/폴더/드래그 — 실제 file 객체를 imageNarrativeUpload.addFiles에 forward.
  //   기존: _syncQuickUploadStatus만 호출하고 file 객체를 어디에도 안 넘김 → getUploadedImages 영원히 0건.
  //   조치: 각 핸들러가 await addFiles(...) 호출 후 count 갱신.
  fileBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const files = Array.from(fileInput?.files ?? []);
    if (files.length > 0) {
      await addFiles(files);
      if (fileInput) fileInput.value = '';
    }
    _syncQuickUploadStatus();
  });

  folderBtn?.addEventListener('click', () => folderInput?.click());
  folderInput?.addEventListener('change', async () => {
    const files = Array.from(folderInput?.files ?? []);
    if (files.length > 0) {
      await addFiles(files);
      if (folderInput) folderInput.value = '';
    }
    _syncQuickUploadStatus();
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('image-narrative-upload-zone--drag-over');
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('image-narrative-upload-zone--drag-over');
  });
  dropZone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('image-narrative-upload-zone--drag-over');
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      await addFiles(files);
    }
    _syncQuickUploadStatus();
  });
}

function _syncQuickUploadStatus(): void {
  const count = getUploadedImages().length;
  const statusEl = document.getElementById('quick-upload-status');
  if (statusEl) statusEl.textContent = `${count}장 업로드됨`;
}

async function _onNextClick(): Promise<void> {
  if (_quickState.currentPanel === 1) {
    await _runQuickInference();
  } else if (_quickState.currentPanel === 2) {
    if (!isReviewComplete()) {
      _showToast('빨간 항목을 먼저 채워주세요.', 'error');
      return;
    }
    _renderPublishPanel();
    _goToPanel(3);
  } else if (_quickState.currentPanel === 3) {
    document.getElementById('quick-mode-final-publish-btn')?.click();
  }
}

function _onPrevClick(): void {
  if (_quickState.currentPanel > 1) {
    _goToPanel((_quickState.currentPanel - 1) as QuickModePanel);
  }
}

function _setNextBtnLoading(loading: boolean): void {
  const btn = document.getElementById('quick-mode-next-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? '⏳ 추론 중...' : '추론 시작 →';
}

function _getModal(): HTMLElement | null {
  return document.getElementById('quick-mode-modal');
}

function _showToast(message: string, type: 'error' | 'info'): void {
  const tm = (window as any).toastManager;
  if (tm?.show) {
    tm.show(message, type);
  } else {
    console.warn('[QuickMode] Toast:', message);
  }
}
