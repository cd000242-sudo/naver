/**
 * imageNarrativeReview.ts
 *
 * White-box review UI for Vision inference results.
 * Allows per-image caption editing, location/category/time override,
 * highlights low-confidence items in red, and prompts user input for
 * confidence < 0.6 images.
 *
 * Phase 3 — SPEC-IMAGE-NARRATIVE-2026
 */

import type {
  NarrativePlan,
  InferenceResponse,
  InferenceMode,
} from '../../imageNarrative/types.js';
import type { UploadedImage } from './imageNarrativeUpload.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** User-editable overlay for a single image's inference result. */
export interface ReviewEdit {
  readonly imageId: string;
  caption: string;
  locationHint: string;
  category: InferenceMode;
  takenAt: string;
  /** User-supplied description for low-confidence images. */
  userDescription: string;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _plan: NarrativePlan | null = null;
let _reviewImages: readonly UploadedImage[] = [];
let _edits: Map<string, ReviewEdit> = new Map();

/** Returns the user's edits for all images (used by builder in Phase 4). */
export function getReviewEdits(): ReadonlyMap<string, ReviewEdit> {
  return _edits;
}

/** Returns true when all low-confidence items have user descriptions. */
export function isReviewComplete(): boolean {
  if (!_plan) return false;
  for (const res of _plan.orderedResults) {
    if (res.result.confidence < 0.6) {
      const edit = _edits.get(res.imageId);
      if (!edit?.userDescription.trim()) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initImageNarrativeReview(): void {
  const panel = document.getElementById('image-narrative-review-panel');
  if (!panel) return;

  // "Generate content" button (Phase 4 will wire fullAutoFlow)
  const generateBtn = document.getElementById('image-narrative-generate-btn');
  generateBtn?.addEventListener('click', () => {
    if (!isReviewComplete()) {
      _showToast('빨간색으로 표시된 항목에 설명을 입력해 주세요.', 'error');
      return;
    }
    _dispatchGenerateEvent();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Shows the review panel populated with inference results.
 * Called from imageNarrativeMode after successful inference.
 */
export function showReviewPanel(
  plan: NarrativePlan,
  images: readonly UploadedImage[]
): void {
  _plan = plan;
  _reviewImages = images;
  _edits = new Map(
    plan.orderedResults.map((res) => [
      res.imageId,
      {
        imageId: res.imageId,
        caption: res.result.description_ko,
        locationHint: res.result.location_hint,
        category: res.result.scene_type,
        takenAt: _findExifTime(res.imageId),
        userDescription: '',
      },
    ])
  );

  _renderReviewPanel();

  const panel = document.getElementById('image-narrative-review-panel');
  if (panel) {
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (plan.needsUserReview) {
    _showToast('빨간 항목을 확인하고 설명을 입력해 주세요.', 'info');
  }
}

/** Hides and resets the review panel. */
export function hideReviewPanel(): void {
  const panel = document.getElementById('image-narrative-review-panel');
  if (panel) {
    panel.style.display = 'none';
    panel.innerHTML = '';
  }
  _plan = null;
  _edits = new Map();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function _renderReviewPanel(): void {
  const panel = document.getElementById('image-narrative-review-panel');
  if (!panel || !_plan) return;

  const warningsHtml = _plan.warnings.length > 0
    ? `<div class="image-narrative-review-warnings">
        ${_plan.warnings.map((w) => `<p>⚠️ ${w}</p>`).join('')}
       </div>`
    : '';

  const cardsHtml = _plan.orderedResults
    .map((res) => _renderCard(res))
    .join('');

  panel.innerHTML = `
    <div class="image-narrative-review-header">
      <h3>📋 Vision 추론 결과 확인</h3>
      <p class="image-narrative-review-subtitle">
        항목을 클릭해서 수정하세요. 빨간 항목은 신뢰도가 낮아 사용자 확인이 필요합니다.
      </p>
    </div>
    ${warningsHtml}
    <div class="image-narrative-review-grid">
      ${cardsHtml}
    </div>
    <div class="image-narrative-review-actions">
      <button id="image-narrative-generate-btn" class="btn-primary">
        ✏️ 글 생성하기 (반자동 편집)
      </button>
      <button id="image-narrative-publish-btn" class="btn-secondary">
        🚀 바로 풀오토 발행
      </button>
    </div>
    <p class="image-narrative-review-actions-hint" style="font-size:0.75rem; color:var(--text-muted); margin:0.4rem 0 0; line-height:1.5;">
      <strong>글 생성하기</strong>: 반자동 편집 탭으로 보내 검토 후 직접 발행 · <strong>풀오토 발행</strong>: 생성부터 네이버 발행까지 한 번에
    </p>
  `;

  _bindCardEvents();

  // Re-bind action buttons since innerHTML replaced them
  const generateBtn = document.getElementById('image-narrative-generate-btn');
  generateBtn?.addEventListener('click', () => {
    if (!isReviewComplete()) {
      _showToast('빨간색으로 표시된 항목에 설명을 입력해 주세요.', 'error');
      return;
    }
    _dispatchGenerateEvent();
  });

  const publishBtn = document.getElementById('image-narrative-publish-btn');
  publishBtn?.addEventListener('click', () => {
    if (!isReviewComplete()) {
      _showToast('빨간색으로 표시된 항목에 설명을 입력해 주세요.', 'error');
      return;
    }
    _dispatchPublishEvent();
  });
}

function _renderCard(res: InferenceResponse): string {
  const edit = _edits.get(res.imageId)!;
  const img = _reviewImages.find((i) => i.id === res.imageId);
  const lowConfidence = res.result.confidence < 0.6;
  const cardClass = lowConfidence
    ? 'image-narrative-review-card image-narrative-review-card--needs-review'
    : 'image-narrative-review-card';

  const confidencePct = Math.round(res.result.confidence * 100);
  const confidenceColor = lowConfidence ? '#ef4444' : '#4ade80';
  const thumbnailHtml = img
    ? `<img src="${img.previewUrl}" alt="${img.fileName}" class="image-narrative-review-card__thumb" />`
    : '<div class="image-narrative-review-card__thumb image-narrative-review-card__thumb--missing">?</div>';

  const moodHtml = res.result.mood_keywords.length > 0
    ? `<div class="image-narrative-review-card__moods">
        ${res.result.mood_keywords.map((m) => `<span class="image-narrative-mood-tag">${m}</span>`).join('')}
       </div>`
    : '';

  const userInputHtml = lowConfidence
    ? `<div class="image-narrative-review-card__user-input">
        <label>이 사진은 무엇인가요? (필수)</label>
        <input
          type="text"
          class="image-narrative-user-desc"
          data-image-id="${res.imageId}"
          placeholder="예: 제주 올레길 10코스 해변"
          value="${_escapeAttr(edit.userDescription)}"
        />
       </div>`
    : '';

  return `
    <div class="${cardClass}" data-image-id="${res.imageId}">
      ${thumbnailHtml}
      <div class="image-narrative-review-card__body">
        <div class="image-narrative-review-card__confidence" style="color: ${confidenceColor}">
          신뢰도 ${confidencePct}%${lowConfidence ? ' ⚠️' : ''}
        </div>

        <label>캡션</label>
        <textarea
          class="image-narrative-caption-input"
          data-image-id="${res.imageId}"
          rows="2"
        >${_escapeText(edit.caption)}</textarea>

        <div class="image-narrative-review-card__meta">
          <div>
            <label>장소</label>
            <input
              type="text"
              class="image-narrative-location-input"
              data-image-id="${res.imageId}"
              value="${_escapeAttr(edit.locationHint)}"
              placeholder="장소 미확인"
            />
          </div>
          <div>
            <label>카테고리</label>
            <select class="image-narrative-category-select" data-image-id="${res.imageId}">
              ${_renderCategoryOptions(edit.category)}
            </select>
          </div>
          <div>
            <label>촬영 시각</label>
            <input
              type="text"
              class="image-narrative-time-input"
              data-image-id="${res.imageId}"
              value="${_escapeAttr(edit.takenAt)}"
              placeholder="EXIF 없음"
            />
          </div>
        </div>

        ${moodHtml}
        ${userInputHtml}
      </div>
    </div>`;
}

const CATEGORY_LABELS: Record<InferenceMode, string> = {
  travel: '여행',
  food: '음식/맛집',
  lodging: '숙박',
  daily: '일상',
  review: '리뷰',
  cafe: '카페',
  auto: '자동',
};

function _renderCategoryOptions(selected: InferenceMode): string {
  return (Object.entries(CATEGORY_LABELS) as [InferenceMode, string][])
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Event binding
// ---------------------------------------------------------------------------

function _bindCardEvents(): void {
  const panel = document.getElementById('image-narrative-review-panel');
  if (!panel) return;

  panel.querySelectorAll<HTMLTextAreaElement>('.image-narrative-caption-input').forEach((el) => {
    el.addEventListener('input', () => {
      _patchEdit(el.dataset.imageId!, { caption: el.value });
    });
  });

  panel.querySelectorAll<HTMLInputElement>('.image-narrative-location-input').forEach((el) => {
    el.addEventListener('input', () => {
      _patchEdit(el.dataset.imageId!, { locationHint: el.value });
    });
  });

  panel.querySelectorAll<HTMLSelectElement>('.image-narrative-category-select').forEach((el) => {
    el.addEventListener('change', () => {
      _patchEdit(el.dataset.imageId!, { category: el.value as InferenceMode });
    });
  });

  panel.querySelectorAll<HTMLInputElement>('.image-narrative-time-input').forEach((el) => {
    el.addEventListener('input', () => {
      _patchEdit(el.dataset.imageId!, { takenAt: el.value });
    });
  });

  panel.querySelectorAll<HTMLInputElement>('.image-narrative-user-desc').forEach((el) => {
    el.addEventListener('input', () => {
      _patchEdit(el.dataset.imageId!, { userDescription: el.value });
      _updateCardReviewState(el.dataset.imageId!);
    });
  });
}

function _patchEdit(imageId: string, patch: Partial<ReviewEdit>): void {
  const existing = _edits.get(imageId);
  if (!existing) return;
  _edits.set(imageId, { ...existing, ...patch });
}

function _updateCardReviewState(imageId: string): void {
  const edit = _edits.get(imageId);
  const card = document.querySelector<HTMLElement>(
    `.image-narrative-review-card[data-image-id="${imageId}"]`
  );
  if (!card || !edit) return;

  const res = _plan?.orderedResults.find((r) => r.imageId === imageId);
  if (!res || res.result.confidence >= 0.6) return;

  if (edit.userDescription.trim()) {
    card.classList.remove('image-narrative-review-card--needs-review');
  } else {
    card.classList.add('image-narrative-review-card--needs-review');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _findExifTime(imageId: string): string {
  const img = _reviewImages.find((i) => i.id === imageId);
  return img?.exif?.takenAt ?? '';
}

function _escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function _showToast(message: string, type: 'error' | 'info'): void {
  const tm = (window as any).toastManager;
  if (tm?.show) {
    tm.show(message, type);
  } else {
    console.warn('[ImageNarrativeReview] Toast:', message);
  }
}

function _dispatchGenerateEvent(): void {
  document.dispatchEvent(
    new CustomEvent('imageNarrative:generate', {
      detail: { edits: Object.fromEntries(_edits), plan: _plan },
    })
  );
}

/** Full-auto: generate AND publish in one shot (Phase 5). */
function _dispatchPublishEvent(): void {
  document.dispatchEvent(
    new CustomEvent('imageNarrative:publish', {
      detail: { edits: Object.fromEntries(_edits), plan: _plan },
    })
  );
}
