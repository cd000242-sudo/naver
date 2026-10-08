/** Large, read-only preview shared by the replacement and addition image pickers. */
export interface ImagePickerPreviewOptions {
  src: string;
  title: string;
  onSelect: () => void;
  isSelected?: () => boolean;
}

let closeImagePickerPreview: (() => void) | undefined;
const previewButtonStyle = 'min-height:48px; padding:10px 16px; border:1px solid #64748b; border-radius:10px; background:#24364f; color:#fff; font-size:17px; font-weight:700; cursor:pointer;';

export function attachImagePickerPreview(container: HTMLElement, options: ImagePickerPreviewOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-picker-preview-button';
  button.textContent = '🔍 크게 보기';
  button.setAttribute('aria-label', `${options.title} 크게 보기`);
  button.style.cssText = `${previewButtonStyle}width:100%; margin-top:6px;`;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openImagePickerPreview(options, button);
  });
  container.append(button);
  return button;
}

function openImagePickerPreview(options: ImagePickerPreviewOptions, returnFocus: HTMLElement): void {
  closeImagePickerPreview?.();
  const previousOverflow = document.body.style.overflow;
  let closed = false;
  let zoom = 1;
  const overlay = document.createElement('div');
  overlay.dataset.imagePickerPreview = '';
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483000; background:rgba(2,6,23,.92); display:flex; align-items:center; justify-content:center; padding:12px; box-sizing:border-box;';
  overlay.innerHTML = `
    <section role="dialog" aria-modal="true" aria-labelledby="image-picker-preview-title" aria-describedby="image-picker-preview-help"
      style="width:min(1400px,100%);height:calc(100vh - 24px);max-height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;background:#0f172a;color:#fff;border:1px solid #64748b;border-radius:16px;">
      <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;">
        <h2 id="image-picker-preview-title" data-preview-title style="margin:0;font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></h2>
        <button type="button" data-preview-action="close" style="${previewButtonStyle}flex-shrink:0;">✕ 닫기</button>
      </header>
      <p id="image-picker-preview-help" style="margin:0;font-size:17px;line-height:1.5;color:#cbd5e1;">크게 보고 확인하세요. 확대하면 스크롤로 구석까지 볼 수 있습니다.</p>
      <div data-preview-viewport role="region" aria-label="이미지 확대 영역 · 방향키로 이동" tabindex="0" style="flex:1;min-height:0;overflow:auto;background:#020617;border-radius:10px;">
        <div data-preview-canvas style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
          <img alt="" style="display:block;width:100%;height:100%;object-fit:contain;">
        </div>
      </div>
      <p role="status" aria-live="polite" hidden style="margin:0;font-size:18px;color:#fecaca;"></p>
      <footer style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
          <button type="button" data-preview-action="zoom-out" style="${previewButtonStyle}">− 축소</button>
          <output data-preview-scale aria-live="polite" style="min-width:50px;text-align:center;font-size:18px;">100%</output>
          <button type="button" data-preview-action="zoom-in" style="${previewButtonStyle}">＋ 확대</button>
          <button type="button" data-preview-action="fit" style="${previewButtonStyle}">화면에 맞춤</button>
        </div>
        <button type="button" data-preview-action="select" style="${previewButtonStyle}background:#15803d;border-color:#4ade80;">이 이미지 선택</button>
      </footer>
    </section>`;
  const control = (action: string) => overlay.querySelector<HTMLButtonElement>(`[data-preview-action="${action}"]`)!;
  const image = overlay.querySelector('img')!;
  const viewport = overlay.querySelector<HTMLElement>('[data-preview-viewport]')!;
  const canvas = overlay.querySelector<HTMLElement>('[data-preview-canvas]')!;
  overlay.querySelector('[data-preview-title]')!.textContent = options.title;
  image.alt = options.title;
  const disable = (button: HTMLButtonElement, disabled: boolean) => {
    button.disabled = disabled;
    button.style.opacity = disabled ? '.5' : '1';
    button.style.cursor = disabled ? 'default' : 'pointer';
  };
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('focusin', onFocus, true);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (closeImagePickerPreview === close) closeImagePickerPreview = undefined;
    if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  };
  const updateZoom = (next: number) => {
    zoom = Math.min(3, Math.max(1, next));
    canvas.style.width = `${zoom * 100}%`;
    canvas.style.height = `${zoom * 100}%`;
    overlay.querySelector('[data-preview-scale]')!.textContent = `${zoom * 100}%`;
    disable(control('zoom-out'), zoom === 1);
    disable(control('zoom-in'), zoom === 3);
    if (zoom === 1) { viewport.scrollTop = 0; viewport.scrollLeft = 0; }
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (event.key === 'Tab') {
      const focusable = Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
      const current = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? current - 1 : current + 1;
      event.preventDefault();
      event.stopImmediatePropagation();
      focusable[(next + focusable.length) % focusable.length]?.focus();
    }
  };
  const onFocus = (event: FocusEvent) => {
    if (!overlay.contains(event.target as Node)) control('close').focus({ preventScroll: true });
  };
  control('close').addEventListener('click', close);
  control('zoom-in').addEventListener('click', () => updateZoom(zoom + .5));
  control('zoom-out').addEventListener('click', () => updateZoom(zoom - .5));
  control('fit').addEventListener('click', () => updateZoom(1));
  const alreadySelected = options.isSelected?.() === true;
  if (alreadySelected) control('select').textContent = '✓ 이미 선택됨';
  disable(control('select'), alreadySelected);
  control('select').addEventListener('click', () => {
    if (closed || control('select').disabled) return;
    close();
    options.onSelect();
  });
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  image.addEventListener('error', () => {
    const status = overlay.querySelector<HTMLElement>('[role="status"]')!;
    status.hidden = false;
    status.textContent = '이미지를 불러오지 못했습니다. 닫고 다른 이미지를 확인해 주세요.';
    disable(control('select'), true);
  });
  image.src = options.src;
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';
  closeImagePickerPreview = close;
  window.addEventListener('keydown', onKeydown, true);
  window.addEventListener('focusin', onFocus, true);
  updateZoom(1);
  control('close').focus({ preventScroll: true });
}
