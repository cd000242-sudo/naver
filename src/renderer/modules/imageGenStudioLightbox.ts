/**
 * imageGenStudioLightbox.ts
 *
 * Fullscreen lightbox for the image-generation studio (DROPSHOT_PORTING_KIT.md §12.7).
 * Split from imageGenStudio.ts to keep each file under the 300-line limit.
 *
 * Keyboard: ESC closes, ←/→ navigate.
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
}
