// @vitest-environment happy-dom
/**
 * [2026-11-03] 사장님: "썸네일 텍스트 포함 아래 체크박스 하나 더 — 소제목 텍스트 포함하기, 소제목 텍스트가 그대로".
 * The image tab checkbox and the full-auto modal checkbox write one config value (headingImageTextInclude) that main
 * already reads per generation; a failed save puts the box back.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEADING_TEXT_SETTING_IDS, headingTextSettingInstall, headingTextSettingPaint, headingTextSettingResetForTest,
} from '../renderer/modules/headingImageTextSetting.js';

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8').replace(/\r\n/g, '\n');
const flush = () => new Promise((r) => setTimeout(r, 0));

function boxes(): HTMLInputElement[] {
  document.body.innerHTML = HEADING_TEXT_SETTING_IDS.map((id) => `<input type="checkbox" id="${id}">`).join('');
  return HEADING_TEXT_SETTING_IDS.map((id) => document.getElementById(id) as HTMLInputElement);
}
function toggle(box: HTMLInputElement): void {
  box.checked = !box.checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('소제목 텍스트 포함하기 (config.headingImageTextInclude)', () => {
  beforeEach(() => headingTextSettingResetForTest());

  it('shows the saved value on both checkboxes', async () => {
    const [tab, modal] = boxes();
    await headingTextSettingInstall({ getConfig: async () => ({ headingImageTextInclude: true }) }, () => undefined);
    expect(tab.checked).toBe(true);
    expect(modal.checked).toBe(true);
  });

  it('a click saves only headingImageTextInclude and the other checkbox follows', async () => {
    const [tab, modal] = boxes();
    const saveConfig = vi.fn(async (u: { headingImageTextInclude: boolean }) => ({ ...u }));
    const notify = vi.fn();
    await headingTextSettingInstall({ getConfig: async () => ({}), saveConfig }, notify);
    toggle(tab);
    await flush();
    expect(saveConfig).toHaveBeenCalledWith({ headingImageTextInclude: true });
    expect(modal.checked).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('소제목 글자를 그대로'), 'success');
  });

  it('a failed save puts the box back and says so', async () => {
    const [tab] = boxes();
    const notify = vi.fn();
    await headingTextSettingInstall({ getConfig: async () => ({}), saveConfig: async () => ({ success: false }) }, notify);
    toggle(tab);
    await flush();
    expect(tab.checked).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했습니다'), 'error');
  });

  it('the modal checkbox created later is painted from the cached value', async () => {
    document.body.innerHTML = '';
    await headingTextSettingInstall({ getConfig: async () => ({ headingImageTextInclude: true }) }, () => undefined);
    document.body.innerHTML = '<input type="checkbox" id="heading-image-text-include">';
    headingTextSettingPaint();
    expect((document.getElementById('heading-image-text-include') as HTMLInputElement).checked).toBe(true);
  });

  it('markup: right under the thumbnail copy checkbox in the image tab, and in the full-auto modal (painted on open)', () => {
    const html = read('public/index.html');
    const container = html.slice(html.indexOf('<div id="thumbnail-text-option-container">'), html.indexOf('AI 이미지 관련성 검증 제거'));
    expect(container.indexOf('id="thumbnail-text-option"')).toBeGreaterThan(-1);
    expect(container.indexOf('id="heading-image-text-option"')).toBeGreaterThan(container.indexOf('id="thumbnail-text-option"'));
    expect(container).toContain('소제목 텍스트 포함하기');
    const settings = read('src/renderer/components/HeadingImageSettings.ts');
    expect(settings).toContain('id="heading-image-text-include"');
    const open = settings.slice(settings.indexOf('export function openHeadingImageModal'), settings.indexOf('export function openHeadingImageModal') + 600);
    expect(open).toContain('headingTextSettingPaint();');
    expect(read('scripts/copy-static.mjs')).toContain("'headingImageTextSetting.js'");
  });
});
