/**
 * imageNarrativeUpload.ts
 *
 * Handles drag-and-drop, file-select, and folder-select image upload for the
 * image-narrative flow. Validates file count (3–30), size (≤10 MB/image),
 * and detects HEIC format.
 *
 * Phase 3 — SPEC-IMAGE-NARRATIVE-2026
 */

import type { ImageExif } from '../../imageNarrative/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadedImage {
  /** Stable ID (filename or hash) for downstream reference. */
  readonly id: string;
  /** Raw base64-encoded image data (no data: URI prefix). */
  readonly base64: string;
  readonly mimeType: string;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  /** Object URL for thumbnail preview. */
  readonly previewUrl: string;
  /** EXIF metadata if available (may be empty). */
  readonly exif: ImageExif;
  /** True when HEIC was auto-converted to JPEG. */
  readonly wasConverted: boolean;
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

export const UPLOAD_MIN = 3;
export const UPLOAD_MAX = 30;
const MAX_BYTES_PER_IMAGE = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _uploadImages: UploadedImage[] = [];

/** Returns a defensive copy of uploaded images. */
export function getUploadedImages(): readonly UploadedImage[] {
  return [..._uploadImages];
}

/** Clears all uploaded images and resets the thumbnail grid. */
export function clearUploadedImages(): void {
  _uploadImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
  _uploadImages = [];
  _renderThumbnails();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export function initImageNarrativeUpload(): void {
  _bindDropZone();
  _bindFileInput();
  _bindFolderInput();
}

// ---------------------------------------------------------------------------
// Drop zone
// ---------------------------------------------------------------------------

function _bindDropZone(): void {
  const zone = document.getElementById('image-narrative-drop-zone');
  if (!zone) return;

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('image-narrative-upload-zone--drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('image-narrative-upload-zone--drag-over');
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('image-narrative-upload-zone--drag-over');
    const files = Array.from(e.dataTransfer?.files ?? []);
    await _handleFiles(files);
  });
}

// ---------------------------------------------------------------------------
// File / folder input
// ---------------------------------------------------------------------------

function _bindFileInput(): void {
  const btn = document.getElementById('image-narrative-file-btn');
  const input = document.getElementById('image-narrative-file-input') as HTMLInputElement | null;
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = Array.from(input.files ?? []);
    await _handleFiles(files);
    input.value = '';
  });
}

function _bindFolderInput(): void {
  const btn = document.getElementById('image-narrative-folder-btn');
  const input = document.getElementById('image-narrative-folder-input') as HTMLInputElement | null;
  if (!btn || !input) return;

  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = Array.from(input.files ?? []);
    await _handleFiles(files);
    input.value = '';
  });
}

// ---------------------------------------------------------------------------
// Core file processing
// ---------------------------------------------------------------------------

async function _handleFiles(files: File[]): Promise<void> {
  const imageFiles = files.filter((f) => _isAcceptedImage(f));

  if (imageFiles.length === 0) {
    _showStatus('이미지 파일(JPG/PNG/HEIC 등)을 업로드해 주세요.', 'error');
    return;
  }

  const combined = [..._uploadImages, ...imageFiles.map(() => null)]; // placeholder count
  const available = UPLOAD_MAX - _uploadImages.length;

  if (available <= 0) {
    _showStatus(`최대 ${UPLOAD_MAX}장까지 업로드 가능합니다.`, 'error');
    return;
  }

  const toProcess = imageFiles.slice(0, available);
  const processed: UploadedImage[] = [];

  for (const file of toProcess) {
    if (file.size > MAX_BYTES_PER_IMAGE) {
      _showStatus(`${file.name}: 파일 크기가 10MB를 초과합니다. 건너뜁니다.`, 'error');
      continue;
    }
    try {
      const uploaded = await _processFile(file);
      processed.push(uploaded);
    } catch (err) {
      console.error('[ImageNarrativeUpload] Failed to process file:', file.name, err);
      _showStatus(`${file.name} 처리 실패: ${(err as Error).message}`, 'error');
    }
  }

  _uploadImages = [..._uploadImages, ...processed];
  _renderThumbnails();
  _updateUploadStatus();
}

/**
 * Returns true for files with accepted MIME types or HEIC file extensions.
 * Browser may not detect HEIC MIME type correctly on all platforms.
 */
export function _isAcceptedImage(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext);
}

/**
 * Returns true when the file is a HEIC/HEIF image.
 * Checks both MIME type and extension.
 */
export function isHeicFile(file: File): boolean {
  if (file.type === 'image/heic' || file.type === 'image/heif') return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'heic' || ext === 'heif';
}

async function _processFile(file: File): Promise<UploadedImage> {
  let processedFile: File = file;
  let wasConverted = false;

  // Delegate HEIC conversion to main process via IPC
  if (isHeicFile(file)) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64Input = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );
      const converted = await (window as any).electronAPI?.convertHeic?.({ base64: base64Input });
      if (converted?.base64) {
        const bytes = Uint8Array.from(atob(converted.base64), (c) => c.charCodeAt(0));
        processedFile = new File([bytes], file.name.replace(/\.heic?$/i, '.jpg'), {
          type: 'image/jpeg',
        });
        wasConverted = true;
      }
    } catch (err) {
      console.warn('[ImageNarrativeUpload] HEIC conversion failed, using original:', err);
    }
  }

  const arrayBuffer = await processedFile.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = btoa(String.fromCharCode(...bytes));
  const previewUrl = URL.createObjectURL(processedFile);

  // Extract EXIF via main process (sharp)
  let exif: ImageExif = {};
  try {
    const exifResult = await (window as any).electronAPI?.extractExif?.({ base64, mimeType: processedFile.type });
    if (exifResult) exif = exifResult;
  } catch {
    // EXIF extraction is best-effort; non-fatal
  }

  return {
    id: `${file.name}-${file.lastModified}-${file.size}`,
    base64,
    mimeType: processedFile.type || 'image/jpeg',
    fileName: processedFile.name,
    fileSizeBytes: processedFile.size,
    previewUrl,
    exif,
    wasConverted,
  };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function _renderThumbnails(): void {
  const grid = document.getElementById('image-narrative-thumbnail-grid');
  if (!grid) return;

  if (_uploadImages.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = _uploadImages
    .map(
      (img, idx) => `
      <div class="image-narrative-thumbnail" data-idx="${idx}">
        <img src="${img.previewUrl}" alt="${img.fileName}" loading="lazy" />
        <button
          class="image-narrative-thumbnail__remove"
          aria-label="이미지 제거"
          data-remove-idx="${idx}"
        >×</button>
        ${img.wasConverted ? '<span class="image-narrative-thumbnail__badge">HEIC→JPG</span>' : ''}
      </div>`
    )
    .join('');

  // Bind remove buttons
  grid.querySelectorAll<HTMLButtonElement>('[data-remove-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.removeIdx);
      _removeImage(idx);
    });
  });
}

function _removeImage(idx: number): void {
  const removed = _uploadImages[idx];
  if (removed) URL.revokeObjectURL(removed.previewUrl);
  _uploadImages = _uploadImages.filter((_, i) => i !== idx);
  _renderThumbnails();
  _updateUploadStatus();
}

function _updateUploadStatus(): void {
  _updateInferButtonState();
  const statusEl = document.getElementById('image-narrative-upload-count');
  if (statusEl) {
    statusEl.textContent = `${_uploadImages.length}장 업로드됨 (최소 ${UPLOAD_MIN}장, 최대 ${UPLOAD_MAX}장)`;
  }
}

function _updateInferButtonState(): void {
  const btn = document.getElementById('image-narrative-infer-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = _uploadImages.length < UPLOAD_MIN;
}

function _showStatus(message: string, type: 'error' | 'info'): void {
  const el = document.getElementById('image-narrative-upload-status');
  if (!el) return;
  el.textContent = message;
  el.className = `image-narrative-upload-status image-narrative-upload-status--${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'image-narrative-upload-status';
  }, 4000);
}
