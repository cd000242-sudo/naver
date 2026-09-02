/**
 * Full-screen image viewer for the progress modal grid: one image at a time, ‹ › to move,
 * arrow keys, Escape/backdrop/X to close.
 *
 * [2026-09-02 사장님] "클릭하면 전체보기로 보이고 우측·좌측 화살표를 누르면 다음 이미지를 볼 수 있어야."
 * 기존 전체보기는 한 장만 띄우고 닫는 오버레이였다(ProgressModal.openFullImagePreview).
 * 목록을 통째로 받아 자리(index)를 옮긴다. 오버레이 class 는 그대로 둔다 — 모달 정리 코드가 그 이름으로 지운다.
 */
export interface ProgressViewerImage {
  readonly src: string;
  readonly heading: string;
}

const PROGRESS_VIEWER_OVERLAY_CLASS = 'progress-full-image-preview-overlay';

function makeProgressViewerButton(label: string, ariaLabel: string, extraCss: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', ariaLabel);
  button.textContent = label;
  button.style.cssText = 'position:fixed; z-index:2147483647; border:1px solid rgba(255,255,255,0.35); border-radius:10px; '
    + 'background:rgba(15,23,42,0.85); color:white; font-size:26px; line-height:1; cursor:pointer; '
    + 'display:flex; align-items:center; justify-content:center; user-select:none; ' + extraCss;
  return button;
}

export function openProgressImageViewer(images: readonly ProgressViewerImage[], startIndex: number): void {
  const list = (images || []).filter((image) => image && typeof image.src === 'string' && image.src.trim());
  if (!list.length) return;
  document.querySelectorAll(`.${PROGRESS_VIEWER_OVERLAY_CLASS}`).forEach((el) => el.remove());

  const total = list.length;
  let current = Math.min(Math.max(0, Math.floor(startIndex || 0)), total - 1);

  const overlay = document.createElement('div');
  overlay.className = PROGRESS_VIEWER_OVERLAY_CLASS;
  overlay.tabIndex = -1;
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483647; display:flex; align-items:center; justify-content:center; '
    + 'padding:2rem; background:rgba(0,0,0,0.94); cursor:zoom-out; isolation:isolate; pointer-events:auto;';

  const imageEl = document.createElement('img');
  imageEl.style.cssText = 'max-width:94vw; max-height:86vh; object-fit:contain; border-radius:8px; box-shadow:0 20px 70px rgba(0,0,0,0.65); cursor:default;';

  const caption = document.createElement('div');
  caption.style.cssText = 'position:fixed; left:50%; bottom:18px; transform:translateX(-50%); z-index:2147483647; color:white; '
    + 'font-size:13px; font-weight:700; background:rgba(15,23,42,0.85); padding:6px 12px; border-radius:8px; max-width:80vw; '
    + 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

  const closeButton = makeProgressViewerButton('X', 'Close preview', 'top:18px; right:18px; width:48px; height:48px; font-size:20px;');
  const prevButton = makeProgressViewerButton('‹', 'Previous image', 'left:18px; top:50%; transform:translateY(-50%); width:52px; height:64px;');
  const nextButton = makeProgressViewerButton('›', 'Next image', 'right:18px; top:50%; transform:translateY(-50%); width:52px; height:64px;');

  function render(): void {
    const image = list[current];
    imageEl.src = image.src;
    imageEl.alt = image.heading || '';
    caption.textContent = total > 1 ? `${image.heading || ''}  ${current + 1} / ${total}` : (image.heading || '');
  }
  function step(delta: number): void {
    if (total < 2) return;
    current = (current + delta + total) % total;
    render();
  }
  function closeViewer(): void {
    window.removeEventListener('keydown', handleKeydown, true);
    overlay.remove();
  }
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { closeViewer(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  }

  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeViewer(); });
  imageEl.addEventListener('click', (event) => event.stopPropagation());
  closeButton.addEventListener('click', (event) => { event.stopPropagation(); closeViewer(); });
  prevButton.addEventListener('click', (event) => { event.stopPropagation(); step(-1); });
  nextButton.addEventListener('click', (event) => { event.stopPropagation(); step(1); });

  overlay.appendChild(imageEl);
  overlay.appendChild(caption);
  overlay.appendChild(closeButton);
  if (total > 1) {
    overlay.appendChild(prevButton);
    overlay.appendChild(nextButton);
  }
  document.body.appendChild(overlay);
  window.addEventListener('keydown', handleKeydown, true);
  render();
  overlay.focus();
}
