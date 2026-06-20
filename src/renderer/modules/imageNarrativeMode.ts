/**
 * imageNarrativeMode.ts
 *
 * Main entry point for the "photo-start" content source toggle.
 * Manages the orthogonal axis toggle (keyword / image) and coordinates
 * the upload, review, and quick-mode sub-modules.
 *
 * Phase 3 — SPEC-IMAGE-NARRATIVE-2026
 */

import type {
  ImageNarrativeContext,
  NarrativePlan,
  VisionProvider,
  InferenceMode,
} from '../../imageNarrative/types.js';
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

function _getProgressModal(): any | null {
  return (window as any).aiProgressModal || (window as any).currentProgressModal || null;
}

function _readManualTitle(): string | undefined {
  const title = _readFormField('image-narrative-manual-title');
  return title ? title.slice(0, 120) : undefined;
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
  _bindInferButton();
  _bindReviewGenerateEvent();
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/**
 * Returns the Vision provider hint sent with the payload. The main process
 * derives the real provider from the global AI engine (routeTextToVision), so
 * this is only a fallback hint — there is no longer a separate provider picker.
 */
export function getSelectedProvider(): VisionProvider {
  return _modeState.provider;
}

let _reviewGenerateBound = false;

function _bindReviewGenerateEvent(): void {
  if (_reviewGenerateBound) return;
  _reviewGenerateBound = true;

  // "글 생성하기" → 반자동 편집까지만 (generateOnly), 발행 보류
  document.addEventListener('imageNarrative:generate', async (event) => {
    const detail = (event as CustomEvent).detail ?? {};
    if (detail.plan) {
      setState({ plan: detail.plan as NarrativePlan });
    }
    await _handlePublish(detail.edits, true);
  });

  // "바로 풀오토 발행" → 생성 + 배치 + 네이버 발행 원스톱 (Phase 5)
  document.addEventListener('imageNarrative:publish', async (event) => {
    const detail = (event as CustomEvent).detail ?? {};
    if (detail.plan) {
      setState({ plan: detail.plan as NarrativePlan });
    }
    await _handlePublish(detail.edits, false);
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
  const context = _readPhotoContext();
  if (images.length < 3) {
    _showToast('최소 3장 이상의 이미지를 업로드해 주세요.', 'error');
    return;
  }

  setState({ isInferring: true, plan: null });
  _setInferButtonState(true);
  const manualTitle = _readManualTitle();
  const progress = _getProgressModal();

  try {
    // Modal에 실시간 단계 애니메이션을 위임한다. 추론은 단일 IPC 호출(블로킹)이라
    // 수동 update만 쓰면 24%에서 멈춰 보임 → autoAnimate custom steps로 살아있게 표시.
    // 최소화(⬇)/닫기(✕)/하단 FAB 복원은 aiProgressModal에 내장되어 있다.
    progress?.show?.('📸 사진으로 글생성', {
      autoAnimate: true,
      mode: 'custom',
      icon: '📸',
      initialLog: `업로드한 사진 ${images.length}장을 분석합니다.`,
      steps: [
        { percent: 12, step: '🖼️ 사진 확인 중...' },
        { percent: 28, step: '👁️ Vision AI가 사진을 분석 중...' },
        { percent: 45, step: '🧩 장면·맥락 추론 중...' },
        { percent: 64, step: '📝 사진 순서로 이야기 구성 중...' },
        { percent: 80, step: '✍️ 블로그 글 작성 중...' },
      ],
    });
    progress?.addLog?.('사진 분석 엔진: 메인 AI 글생성 엔진과 동일하게 사용');
    if (manualTitle) progress?.addLog?.(`사용자 지정 제목: ${manualTitle}`);

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
      context,
      manualTitle,
    });

    if (!result || !result.success) {
      throw new Error(result?.message ?? 'Vision 추론 실패');
    }

    const plan = result.plan as NarrativePlan;
    setState({ plan, isInferring: false });
    showReviewPanel(plan, images);
    progress?.complete?.(true, {
      successTitle: '사진 추론 완료',
      successIcon: '✅',
      successLog: '리뷰 패널에 사진별 추론 결과를 표시했습니다.',
    });
  } catch (err) {
    console.error('[ImageNarrativeMode] Inference failed:', err);
    progress?.complete?.(false, {
      failureTitle: '사진 추론 실패',
      failureIcon: '❌',
      failureLog: (err as Error).message,
    });
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

/**
 * Generates the article from photos and routes it through the full-auto flow.
 *
 * @param generateOnly When true ("글 생성하기"), stops at the semi-auto editor:
 *   the body lands in the unified edit tabs and images are placed in the image
 *   manager by heading, but nothing is published — the user reviews then publishes
 *   manually. When false ("바로 풀오토 발행"), generates and publishes in one shot.
 */
async function _handlePublish(reviewEdits?: unknown, generateOnly = false): Promise<void> {
  const images = getUploadedImages();
  if (images.length < 3) {
    _showToast('최소 3장 이상의 이미지를 업로드해 주세요.', 'error');
    return;
  }
  if (_modeState.plan && !isReviewComplete()) {
    _showToast('빨간색으로 표시된 항목에 설명을 입력한 뒤 진행해 주세요.', 'error');
    return;
  }

  const edits = reviewEdits ?? Object.fromEntries(getReviewEdits());
  const context = _readPhotoContext();
  const manualTitle = _readManualTitle();

  // Build the formData payload for executeFullAutoFlow
  const formData: Record<string, unknown> = {
    contentMode: 'image-narrative',
    _generateOnly: generateOnly,
    imageNarrative: {
      images: images.map((img) => ({
        imageId: img.id,
        imageBase64: img.base64,
        mimeType: img.mimeType,
      })),
      provider: _modeState.provider,
      mode: _modeState.mode,
      context,
      manualTitle,
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
    if (generateOnly) {
      _showToast('글 생성 완료 — 반자동 편집 탭에서 확인 후 발행하세요.', 'info');
    }
  } catch (err) {
    console.error('[ImageNarrativeMode] Flow failed:', err);
    _showToast(`${generateOnly ? '글 생성' : '발행'} 실패: ${(err as Error).message}`, 'error');
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

function _readPhotoContext(): ImageNarrativeContext | undefined {
  const context: ImageNarrativeContext = {
    timeHint: _readFormField('image-narrative-context-time'),
    mainPeople: _readFormField('image-narrative-context-people'),
    place: _readFormField('image-narrative-context-place'),
    occasion: _readFormField('image-narrative-context-occasion'),
    notes: _readFormField('image-narrative-context-notes'),
  };
  return Object.values(context).some(Boolean) ? context : undefined;
}
