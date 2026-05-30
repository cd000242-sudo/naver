/**
 * imageGenStudioLightbox.ts
 *
 * Result-viewing UI for the image-generation studio (split from imageGenStudio.ts
 * to keep each file under the 300-line limit):
 *  - Fullscreen lightbox (DROPSHOT_PORTING_KIT.md §12.7; ESC closes, ←/→ navigate)
 *  - Results modal open/close
 *  - Progress bar + reset on new generation
 *  - Download-all
 */

let _srcs: string[] = [];
let _index = -1;

/** Opens the lightbox at `index` over the given image source list. */
export function openStudioLightbox(srcs: string[], index: number): void {
  _srcs = srcs;
  _index = index;
  _render();
  const box = document.getElementById('imgstudio-lightbox');
  if (box) box.style.display = 'flex';
}

function _render(): void {
  const img = document.getElementById('imgstudio-lightbox-img') as HTMLImageElement | null;
  if (img && _srcs[_index]) img.src = _srcs[_index];
}

function _close(): void {
  _index = -1;
  const box = document.getElementById('imgstudio-lightbox');
  if (box) box.style.display = 'none';
}

function _nav(delta: number): void {
  if (_index < 0 || _srcs.length === 0) return;
  _index = (_index + delta + _srcs.length) % _srcs.length;
  _render();
}

function _onKey(e: KeyboardEvent): void {
  if (_index < 0) return;
  if (e.key === 'Escape') _close();
  else if (e.key === 'ArrowLeft') _nav(-1);
  else if (e.key === 'ArrowRight') _nav(1);
}

/** Wires keyboard + inline onclick handlers. Call once during studio init. */
export function initStudioLightbox(): void {
  document.addEventListener('keydown', _onKey);
  (window as any).imgStudioCloseLightbox = _close;
  (window as any).imgStudioNavLightbox = _nav;
  (window as any).imgStudioCloseResults = closeResults;
}

// ---------------------------------------------------------------------------
// 결과 모달 + 진행률 + 전체 다운로드
// ---------------------------------------------------------------------------

export function openResults(): void {
  const modal = document.getElementById('imgstudio-results-modal');
  if (modal) modal.style.display = 'flex';
}

export function closeResults(): void {
  const modal = document.getElementById('imgstudio-results-modal');
  if (modal) modal.style.display = 'none';
}

export function setProgress(done: number, total: number): void {
  const bar = document.getElementById('imgstudio-progress-bar');
  const text = document.getElementById('imgstudio-progress-text');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  if (bar) bar.style.width = `${pct}%`;
  if (text) text.textContent = `${done} / ${total}장 (${pct}%)`;
}

/** 새 생성 시작 시 이전 결과(미리보기/진행률/다운로드 버튼)를 초기화하고 진행률을 0으로 준비. */
export function resetResultsUi(total: number): void {
  const preview = document.getElementById('imgstudio-preview');
  if (preview) preview.style.display = 'none';
  const previewImg = document.getElementById('imgstudio-preview-img') as HTMLImageElement | null;
  if (previewImg) previewImg.src = '';
  const dlAll = document.getElementById('imgstudio-download-all-btn');
  if (dlAll) dlAll.style.display = 'none';
  const progress = document.getElementById('imgstudio-progress');
  if (progress) progress.style.display = 'block';
  setProgress(0, total);
}

/** 결과 이미지 전체를 순차 다운로드. */
export function downloadAll(srcs: string[]): void {
  srcs.forEach((src, i) => {
    const a = document.createElement('a');
    a.href = src;
    a.download = `studio-${i + 1}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}
