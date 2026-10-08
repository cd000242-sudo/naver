// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachImagePickerPreview } from '../renderer/modules/imagePickerPreview.js';

const source = 'file:///C:/images/article/1.png';
function fixture(selected = false) {
  const grid = document.createElement('div');
  grid.style.overflow = 'auto';
  grid.scrollTop = 320;
  const item = document.createElement('div');
  const select = document.createElement('button');
  select.textContent = '그리드에서 선택';
  const onSelect = vi.fn(() => { selected = true; });
  select.addEventListener('click', onSelect);
  item.append(select);
  grid.append(item);
  document.body.append(grid);
  const button = attachImagePickerPreview(item, {
    src: source, title: '소제목 이미지', onSelect: () => select.click(), isSelected: () => selected,
  });
  return { grid, item, button, onSelect };
}
function control(action: string) { return document.querySelector<HTMLButtonElement>(`[data-preview-action="${action}"]`)!; }
afterEach(() => {
  control('close')?.click();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('image picker large preview', () => {
  it('opens a large named dialog without selecting or changing the grid scroll', () => {
    const { button, onSelect, grid } = fixture();
    button.click();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe(source);
    expect(onSelect).not.toHaveBeenCalled();
    expect(grid.scrollTop).toBe(320);
    expect(control('close')).toBe(document.activeElement);
    expect(button.textContent).toContain('크게 보기');
  });
  it('keeps the selection and restores focus, scrolling and page overflow on close', () => {
    document.body.style.overflow = 'auto';
    const { button, onSelect, grid } = fixture(true);
    button.click();
    expect(control('select').disabled).toBe(true);
    control('close').click();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    expect(grid.scrollTop).toBe(320);
    expect(document.body.style.overflow).toBe('auto');
  });
  it('selects only from the explicit preview action and closes once', () => {
    const { button, onSelect } = fixture();
    button.click();
    const pick = control('select');
    pick.click();
    pick.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it('enlarges the image canvas and resets it to the viewport without selecting', () => {
    const { button, onSelect } = fixture();
    button.click();
    const canvas = document.querySelector<HTMLElement>('[data-preview-canvas]')!;
    control('zoom-in').click();
    expect(canvas.style.width).toBe('150%');
    expect(canvas.style.height).toBe('150%');
    control('fit').click();
    expect(canvas.style.width).toBe('100%');
    expect(control('zoom-out').disabled).toBe(true);
    for (let i = 0; i < 7; i++) control('zoom-in').click();
    expect(canvas.style.width).toBe('300%');
    expect(control('zoom-in').disabled).toBe(true);
    control('zoom-out').click();
    expect(canvas.style.width).toBe('250%');
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('handles Escape and traps Tab without closing the underlying picker', () => {
    const { button, onSelect } = fixture();
    const otherEscape = vi.fn();
    document.addEventListener('keydown', otherEscape);
    button.click();
    control('select').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(control('close'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(control('select'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(otherEscape).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    document.removeEventListener('keydown', otherEscape);
  });
  it('opens only one preview and never interprets an image name as markup', () => {
    const first = fixture();
    first.button.click();
    const second = fixture();
    second.button.click();
    expect(document.querySelectorAll('[data-image-picker-preview]')).toHaveLength(1);
    control('close').click();
    expect(document.body.style.overflow).toBe('');
    const item = document.createElement('div');
    document.body.append(item);
    attachImagePickerPreview(item, { src: source, title: '<img src=x onerror=alert(1)>', onSelect: vi.fn() }).click();
    expect(document.querySelectorAll('[data-image-picker-preview] img')).toHaveLength(1);
    expect(document.querySelector('[data-preview-title]')?.textContent).toBe('<img src=x onerror=alert(1)>');
  });
  it('shows a readable image loading failure and allows closing without selection', () => {
    const { button, onSelect } = fixture();
    button.click();
    const img = document.querySelector<HTMLImageElement>('[data-image-picker-preview] img')!;
    img.dispatchEvent(new Event('error'));
    expect(document.querySelector('[role="status"]')?.textContent).toContain('이미지를 불러오지 못했습니다');
    expect(control('select').disabled).toBe(true);
    control('close').click();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('keeps keyboard focus inside the preview and dismisses from the backdrop without selection', () => {
    const { button, onSelect } = fixture();
    button.click();
    button.focus();
    expect(document.activeElement).toBe(control('close'));
    document.querySelector<HTMLElement>('[data-image-picker-preview]')!.click();
    expect(document.activeElement).toBe(button);
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelector('[data-image-picker-preview]')).toBeNull();
  });
  it('can close safely if the underlying picker was removed while previewing', () => {
    const { button, grid, onSelect } = fixture();
    button.click();
    grid.remove();
    expect(() => control('close').click()).not.toThrow();
    expect(document.body.style.overflow).toBe('');
    expect(document.querySelector('[data-image-picker-preview]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('allows keyboard users to focus the enlarged image viewport for scrolling', () => {
    fixture().button.click();
    const viewport = document.querySelector<HTMLElement>('[data-preview-viewport]')!;
    expect(viewport.getAttribute('role')).toBe('region');
    expect(viewport.getAttribute('aria-label')).toContain('이미지');
    expect(viewport.tabIndex).toBe(0);
    control('zoom-in').click();
    control('close').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(viewport);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(control('zoom-out'));
  });
});
