// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerator } from '../renderer/modules/thumbnailGenerator';

let generator: any;
let ctx: any;
let canvas: HTMLCanvasElement;
const input = (id: string, value: string) => {
  const el = document.getElementById(id) as HTMLInputElement;
  el.focus(); el.value = value; el.dispatchEvent(new Event('input'));
};
beforeEach(() => {
  (ThumbnailGenerator as any).listenersBound = false;
  (ThumbnailGenerator as any).current = null;
  document.body.innerHTML = `<div id="thumb-canvas-wrap"><canvas id="thumbnail-canvas" width="760" height="400"></canvas><div id="thumb-safe-guide"></div></div>
  <textarea id="thumb-main-text"></textarea><input id="thumb-sub-text"><input id="thumb-font-size"><span id="thumb-font-size-value"></span>
  <button id="thumb-undo"></button><button id="thumb-redo"></button><button id="thumb-fit-text"></button><input type="checkbox" id="thumb-safe-area" checked>
  <span id="thumb-studio-status"></span><span id="thumb-template-name"></span><span id="thumb-canvas-size-text"></span>
  <button class="thumb-preset-btn" data-preset="minimal"><span>페이퍼</span></button>
  <button id="thumb-bg-ai-btn">생성</button><input id="thumb-bg-ai-prompt">
  <select id="image-source-select"><option value="openai-image">덕테이프</option><option value="leonardoai">Leonardo</option></select>
  <button id="thumb-download-btn"></button><button id="thumb-apply-btn"></button>
  <select id="thumb-apply-target"><option value="full-auto">풀오토</option></select>
  <select id="thumb-aspect-ratio"><option value="1.91:1">가로</option><option value="1:1">정사각</option></select>`;
  ctx = new Proxy({ font: '', measureText(text: string) { return { width: Array.from(text).length * (parseFloat(this.font.match(/[\d.]+px/)?.[0] || '48') * 0.9) }; } }, {
    get(target: any, key) { return key in target ? target[key] : (target[key] = vi.fn(() => ({ addColorStop: vi.fn() }))); },
  });
  canvas = document.getElementById('thumbnail-canvas') as HTMLCanvasElement;
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,export');
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal('toastManager', { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() });
  vi.stubGlobal('appendLog', vi.fn());
  localStorage.clear();
  generator = new ThumbnailGenerator();
});

describe('thumbnail studio editing integration', () => {
  it('uses the selected image engine and restores the premium button label', async () => {
    const generate = vi.fn().mockResolvedValue({ success: false, message: 'mock' });
    vi.stubGlobal('generateImagesWithCostSafety', generate);
    localStorage.setItem('globalImageSource', 'openai-image');
    localStorage.setItem('fullAutoImageSource', 'leonardoai');
    document.getElementById('thumb-bg-ai-btn')!.click();
    await vi.waitFor(() => expect(generate).toHaveBeenCalled());
    expect(generate.mock.calls[0][0].provider).toBe('leonardoai');
    expect(document.getElementById('thumb-bg-ai-btn')!.textContent).toBe('생성');
  });
  it('applies a nested template click without losing the title and restores edits with undo/redo', () => {
    input('thumb-main-text', '내가 직접 쓴 제목');
    document.querySelector<HTMLSpanElement>('.thumb-preset-btn span')!.click();
    expect(generator.settings.mainText).toBe('내가 직접 쓴 제목');
    expect(generator.settings.bgColor).toBe('#f3efe7');
    document.getElementById('thumb-undo')!.click();
    expect(generator.settings.bgColor).toBe('#172033');
    expect(generator.settings.mainText).toBe('내가 직접 쓴 제목');
    document.getElementById('thumb-redo')!.click();
    expect(generator.settings.bgColor).toBe('#f3efe7');
  });
  it('moves left-aligned text horizontally and undo restores its anchor', () => {
    input('thumb-main-text', '짧은 제목');
    document.querySelector<HTMLSpanElement>('.thumb-preset-btn span')!.click();
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 760, height: 400, right: 760, bottom: 400, toJSON() {} });
    generator.onMouseDown(new MouseEvent('mousedown', { clientX: 60, clientY: 200 }));
    generator.onMouseMove(new MouseEvent('mousemove', { clientX: 100, clientY: 200 }));
    generator.onMouseUp();
    expect(ctx.fillText.mock.lastCall[1]).toBe(80);
    document.getElementById('thumb-undo')!.click();
    expect(ctx.fillText.mock.lastCall[1]).toBe(40);
  });
  it('restores square dimensions, photo identity and drag positions through undo', () => {
    const photo = { src: 'photo', width: 1000, height: 700 };
    generator.backgroundImage = photo; generator.bgPos = { x: 23, y: 18 }; generator.render();
    const select = document.getElementById('thumb-aspect-ratio') as HTMLSelectElement;
    select.value = '1:1'; select.dispatchEvent(new Event('change'));
    expect(canvas.height).toBe(760);
    document.getElementById('thumb-undo')!.click();
    expect(canvas.height).toBe(400);
    expect(generator.backgroundImage).toBe(photo);
    expect(generator.bgPos).toEqual({ x: 23, y: 18 });
  });
  it('scales the safe guide to the actual 40px layout margin in both aspect ratios', () => {
    const guide = document.getElementById('thumb-safe-guide')!;
    expect(parseFloat(guide.style.top)).toBeCloseTo(10);
    expect(parseFloat(guide.style.left)).toBeCloseTo(40 / 760 * 100);
    const select = document.getElementById('thumb-aspect-ratio') as HTMLSelectElement;
    select.value = '1:1'; select.dispatchEvent(new Event('change'));
    expect(parseFloat(guide.style.top)).toBeCloseTo(40 / 760 * 100);
    expect(guide.style.bottom).toBe(guide.style.top);
    expect(guide.style.right).toBe(guide.style.left);
  });
  it('fits long main and sub text without truncation and keeps guides out of PNG/apply', () => {
    input('thumb-main-text', '긴 한국어 제목입니다. '.repeat(15));
    input('thumb-sub-text', '부제도 길면 여러 줄로 정리합니다.');
    const before = generator.settings.mainText;
    document.getElementById('thumb-fit-text')!.click();
    expect(generator.settings.fontSize).toBeLessThan(48);
    expect(generator.settings.mainText).toBe(before);
    expect(document.getElementById('thumb-studio-status')!.textContent).not.toContain('넘');
    document.getElementById('thumb-download-btn')!.click();
    document.getElementById('thumb-apply-btn')!.click();
    expect(canvas.toDataURL).toHaveBeenCalledTimes(2);
    expect((window as any).presetThumbnails['full-auto'].isThumbnail).toBe(true);
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(document.getElementById('thumb-safe-guide')!.hidden).toBe(false);
  });
});
