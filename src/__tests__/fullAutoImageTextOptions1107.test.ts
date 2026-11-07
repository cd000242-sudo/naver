// @vitest-environment happy-dom
/**
 * [2026-11-07] 사장님: "풀오토 발행에서는 제목이랑 소제목 텍스트 포함 체크박스가 따로없어요 추가하세요".
 * The one-click full-auto screen (단일발행 · 풀오토 모드) shows both switches itself. They are NOT new settings:
 * the title (thumbnail) box edits localStorage `thumbnailTextInclude` and the heading box edits
 * config.headingImageTextInclude — the same values the image tab and the full-auto image window already use —
 * so the boxes follow each other in both directions.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEADING_TEXT_SETTING_IDS, headingTextSettingInstall, headingTextSettingResetForTest,
} from '../renderer/modules/headingImageTextSetting.js';
import { IMG_SYNC_THUMBNAIL_CHECKBOX_IDS } from '../runtime/imageSettingsSync.js';
import { imgSyncInstallListeners } from '../renderer/modules/imageSettingsSyncUi.js';
import { initContentModeHelpAndSmartPublish } from '../renderer/modules/tailUIUtils.js';
import { resolvePipelineConfig } from '../renderer/modules/pipelineConfig.js';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const html = read('public/index.html');

const BOX_START = '<div id="fullauto-image-text-options"';
const BOX_END = '<!-- /fullauto-image-text-options -->';
const THUMB_ID = 'fullauto-thumbnail-text-option';
const HEADING_ID = 'fullauto-heading-text-option';
const flush = () => new Promise((r) => setTimeout(r, 0));
const box = (id: string) => document.getElementById(id) as HTMLInputElement;
function click(el: HTMLInputElement): void {
  el.checked = !el.checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function ownMarkup(): string {
  const from = html.indexOf(BOX_START);
  const to = html.indexOf(BOX_END);
  return from >= 0 && to > from ? html.slice(from, to) : '';
}

describe('markup: the full-auto publish screen', () => {
  it('has exactly one title(thumbnail) box and one heading box, short Korean names', () => {
    expect(html.split(`id="${THUMB_ID}"`)).toHaveLength(2);
    expect(html.split(`id="${HEADING_ID}"`)).toHaveLength(2);
    const own = ownMarkup();
    expect(own).toContain('제목(썸네일) 텍스트 포함');
    expect(own).toContain('소제목 텍스트 포함');
    expect(own).toMatch(new RegExp(`<input[^>]*type="checkbox"[^>]*id="${THUMB_ID}"|<input[^>]*id="${THUMB_ID}"[^>]*type="checkbox"`));
    expect(own).toMatch(new RegExp(`<input[^>]*type="checkbox"[^>]*id="${HEADING_ID}"|<input[^>]*id="${HEADING_ID}"[^>]*type="checkbox"`));
  });

  it('sits in the publish settings, above the start button, and is hidden until full-auto is chosen', () => {
    const panel = html.indexOf('id="unified-only-publish-settings"');
    const own = html.indexOf(BOX_START);
    const startButton = html.indexOf('id="publish-btn-container"');
    expect(panel).toBeGreaterThan(-1);
    expect(own).toBeGreaterThan(panel);
    expect(own).toBeLessThan(startButton);
    expect(html.slice(own, own + 400)).toMatch(/style="[^"]*display:\s*none/);
  });

  it('the publish panel shows only one box per meaning (no second thumbnail / heading copy beside it)', () => {
    const panelStart = html.indexOf('id="unified-only-publish-settings"');
    const panelEnd = html.indexOf('id="unified-preview-section"');
    const panel = html.slice(panelStart, panelEnd);
    const ids = [...panel.matchAll(/<input[^>]*id="([^"]*(?:thumbnail-text|heading-text|heading-image-text)[^"]*)"/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual([HEADING_ID, THUMB_ID].sort());
  });

  it('the long explanation is folded (설명 보기), not printed on the screen', () => {
    expect(ownMarkup()).toMatch(/<details[\s\S]*설명 보기[\s\S]*<\/details>/);
  });
});

describe('shared ids: the new boxes join the existing sync lists', () => {
  it('thumbnail list and heading list include them (no new setting key)', () => {
    expect(IMG_SYNC_THUMBNAIL_CHECKBOX_IDS).toContain(THUMB_ID);
    expect(HEADING_TEXT_SETTING_IDS).toContain(HEADING_ID);
  });
});

describe('only shown for 풀오토 mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete (window as any).__pendingPublishMode;
    const select = (id: string) => html.match(new RegExp(`<select id="${id}"[\\s\\S]*?</select>`))![0];
    document.body.innerHTML = `${select('publish-mode-top-select')}${select('publish-mode-select')}
      ${html.match(/<button type="button" id="unified-publish-btn"[\s\S]*?<\/button>/)![0]}
      <button id="generate-from-url-btn"></button><button id="generate-manual-btn"></button>
      <button id="full-auto-publish-btn"></button><button id="semi-auto-publish-btn"></button><button id="unified-stop-btn" style="display:none"></button>
      <input id="unified-generated-title"><textarea id="unified-generated-content"></textarea><input id="unified-publish-mode" value="draft"><section id="unified-semi-auto-section"></section>
      <section id="unified-preview-section"></section><section id="content-generation-tabs"></section><p id="publish-mode-top-desc"></p><p id="publish-mode-desc"></p>
      ${ownMarkup()}`;
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
    for (const key of ['__pendingPublishMode', 'markContentGenerated', 'markContentCleared', 'syncPublishMode', 'updatePublishButtonVisibility', 'currentStructuredContent']) delete (window as any)[key];
  });

  it('hidden in 반자동, shown in 풀오토, hidden again when switched back', () => {
    const own = () => document.getElementById('fullauto-image-text-options') as HTMLElement;
    const top = () => document.getElementById('publish-mode-top-select') as HTMLSelectElement;
    expect(own()).not.toBeNull();
    initContentModeHelpAndSmartPublish();
    vi.advanceTimersByTime(1500);
    expect(own().style.display).toBe('none');
    top().value = 'full-auto';
    top().dispatchEvent(new Event('change'));
    expect(own().style.display).not.toBe('none');
    top().value = 'semi-auto';
    top().dispatchEvent(new Event('change'));
    expect(own().style.display).toBe('none');
  });
});

describe('title (thumbnail) box: same value as the image tab, the full-auto window and continuous', () => {
  beforeEach(() => {
    localStorage.clear();
    imgSyncInstallListeners();
    document.body.innerHTML = [THUMB_ID, 'thumbnail-text-option', 'thumbnail-text-include', 'continuous-include-thumbnail-text', 'continuous-modal-include-thumbnail-text']
      .map((id) => `<input type="checkbox" id="${id}">`).join('');
  });

  it('checking it writes thumbnailTextInclude and every other box follows', () => {
    click(box(THUMB_ID));
    expect(localStorage.getItem('thumbnailTextInclude')).toBe('true');
    for (const id of IMG_SYNC_THUMBNAIL_CHECKBOX_IDS) expect(box(id).checked, id).toBe(true);
  });

  it('unchecking removes the key (director "auto") and every other box follows', () => {
    click(box(THUMB_ID));
    click(box(THUMB_ID));
    expect(localStorage.getItem('thumbnailTextInclude')).toBeNull();
    for (const id of IMG_SYNC_THUMBNAIL_CHECKBOX_IDS) expect(box(id).checked, id).toBe(false);
  });

  it('the image tab box drives the full-auto box (other direction)', () => {
    click(box('thumbnail-text-option'));
    expect(box(THUMB_ID).checked).toBe(true);
    click(box('continuous-include-thumbnail-text'));
    expect(box(THUMB_ID).checked).toBe(false);
  });

  it('the value reaches every publish flow through the one pipeline key', () => {
    click(box(THUMB_ID));
    expect(resolvePipelineConfig('full-auto').image.thumbnailTextInclude).toBe(true);
    expect(resolvePipelineConfig('continuous').image.thumbnailTextInclude).toBe(true);
    expect(resolvePipelineConfig('multi-account').image.thumbnailTextInclude).toBe(true);
    click(box(THUMB_ID));
    expect(resolvePipelineConfig('full-auto').image.thumbnailTextInclude).toBe(false);
  });
});

describe('heading box: same config value as the image tab and the full-auto window', () => {
  beforeEach(() => {
    headingTextSettingResetForTest();
    document.body.innerHTML = [HEADING_ID, 'heading-image-text-option', 'heading-image-text-include']
      .map((id) => `<input type="checkbox" id="${id}">`).join('');
  });

  it('shows the saved config value on open', async () => {
    await headingTextSettingInstall({ getConfig: async () => ({ headingImageTextInclude: true }) }, () => undefined);
    for (const id of HEADING_TEXT_SETTING_IDS) expect(box(id).checked, id).toBe(true);
  });

  it('a click saves only headingImageTextInclude and the other boxes follow', async () => {
    const saveConfig = vi.fn(async (update: { headingImageTextInclude: boolean }) => ({ ...update }));
    const notify = vi.fn();
    await headingTextSettingInstall({ getConfig: async () => ({}), saveConfig }, notify);
    click(box(HEADING_ID));
    await flush();
    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig).toHaveBeenCalledWith({ headingImageTextInclude: true });
    expect(box('heading-image-text-option').checked).toBe(true);
    expect(box('heading-image-text-include').checked).toBe(true);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('소제목 글자를 그대로'), 'success');
  });

  it('a failed save puts the box back and says so', async () => {
    const notify = vi.fn();
    await headingTextSettingInstall({ getConfig: async () => ({}), saveConfig: async () => ({ success: false }) }, notify);
    click(box(HEADING_ID));
    await flush();
    expect(box(HEADING_ID).checked).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했습니다'), 'error');
  });
});

describe('publish path: the values the new boxes edit are the ones generation reads', () => {
  it('one-click full auto reads the thumbnail value from the pipeline key and builds article-section image calls', () => {
    const publishing = read('src/renderer/modules/publishingHandlers.ts');
    expect(publishing).toMatch(/const includeThumbnailText = pipelineCfg\.image\.thumbnailTextInclude;/);
    const costAndAutoGen = read('src/renderer/modules/costAndAutoGen.ts');
    expect(costAndAutoGen).toMatch(/articleSectionImages: true,/);
  });

  it('main reads config.headingImageTextInclude per generation (the value the heading box saves)', () => {
    const generator = read('src/imageGenerator.ts');
    expect(generator).toMatch(/\(await loadConfig\(\)\)\?\.headingImageTextInclude === true/);
    expect(generator).toMatch(/headingTextEligible && await readHeadingImageTextSetting\(\)/);
  });

  it('no new storage key was introduced for the two boxes', () => {
    const own = ownMarkup();
    expect(own).not.toMatch(/localStorage|setItem|data-setting/);
    for (const file of ['src/renderer/modules/headingImageTextSetting.ts', 'src/runtime/imageSettingsSync.ts']) {
      expect(read(file)).not.toMatch(/fullauto(Thumbnail|Heading)Text/i);
    }
  });
});
