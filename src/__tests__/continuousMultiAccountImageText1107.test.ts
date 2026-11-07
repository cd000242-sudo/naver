// @vitest-environment happy-dom
/**
 * [2026-11-07] 사장님: 단일발행 풀오토에 넣은 "제목(썸네일) 텍스트 포함 · 소제목 텍스트 포함" 두 체크를
 * 연속발행과 다중계정 풀오토 설정에도 맞춘다.
 * They are NOT new settings and NOT per queue item / per account: the title box edits localStorage
 * `thumbnailTextInclude`, the heading box edits config.headingImageTextInclude (the values the image tab and the
 * full-auto image window already use), so every box follows every other box in both directions.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HEADING_TEXT_SETTING_IDS, headingTextSettingInstall, headingTextSettingResetForTest,
} from '../renderer/modules/headingImageTextSetting.js';
import { IMG_SYNC_THUMBNAIL_CHECKBOX_IDS } from '../runtime/imageSettingsSync.js';
import { imgSyncInstallListeners } from '../renderer/modules/imageSettingsSyncUi.js';
import { resolvePipelineConfig } from '../renderer/modules/pipelineConfig.js';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const html = read('public/index.html');

const CONT_THUMB = 'continuous-include-thumbnail-text';
const CONT_HEADING = 'continuous-include-heading-text';
const CONT_MODAL_THUMB = 'continuous-modal-include-thumbnail-text';
const CONT_MODAL_HEADING = 'continuous-modal-include-heading-text';
const MA_THUMB = 'ma-setting-thumbnail-text-option';
const MA_HEADING = 'ma-setting-heading-text-option';
const LEGACY_MA_THUMB = 'ma-setting-include-thumbnail-text';
const NEW_HEADING_IDS = [CONT_HEADING, CONT_MODAL_HEADING, MA_HEADING];
const MEANING = /<input[^>]*id="([^"]*(?:thumbnail-text|heading-text|heading-image-text)[^"]*)"/g;

const flush = () => new Promise((r) => setTimeout(r, 0));
const box = (id: string) => document.getElementById(id) as HTMLInputElement;
function click(el: HTMLInputElement): void {
  el.checked = !el.checked;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function region(from: string, to: string): string {
  const a = html.indexOf(from);
  const b = html.indexOf(to, a + 1);
  return a >= 0 && b > a ? html.slice(a, b) : '';
}
/** The block this change added around a heading box: from the comment right above it to the end of its folded text. */
function addedBlock(id: string): string {
  const at = html.indexOf(`id="${id}"`);
  return at < 0 ? '' : html.slice(html.lastIndexOf('<!--', at), html.indexOf('</details>', at) + '</details>'.length);
}
function inputTag(id: string): string {
  const m = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  return m ? m[0] : '';
}
const idsIn = (markup: string) => [...markup.matchAll(MEANING)].map((m) => m[1]);

const continuousMain = () => region('id="continuous-open-image-settings-btn"', 'id="continuous-cta-type"');
const continuousModal = () => region('id="continuous-settings-modal"', 'id="continuous-modal-subtab-schedule-content"');
const maBasic = () => region('id="ma-modal-subtab-basic-content"', 'id="ma-modal-subtab-schedule-content"');

describe('markup: continuous publishing', () => {
  it('main panel: one heading box right after the thumbnail box, short name, long text folded', () => {
    const own = continuousMain();
    expect(html.split(`id="${CONT_HEADING}"`)).toHaveLength(2);
    expect(inputTag(CONT_HEADING)).toMatch(/type="checkbox"/);
    expect(own.indexOf(`id="${CONT_HEADING}"`)).toBeGreaterThan(own.indexOf(`id="${CONT_THUMB}"`));
    expect(own).toContain('소제목 텍스트 포함');
    expect(own).toMatch(/<details[\s\S]*설명 보기[\s\S]*<\/details>/);
  });

  it('main panel shows one box per meaning', () => {
    expect(idsIn(continuousMain()).sort()).toEqual([CONT_HEADING, CONT_THUMB].sort());
  });

  it('settings window: one heading box right after the thumbnail box', () => {
    const own = continuousModal();
    expect(html.split(`id="${CONT_MODAL_HEADING}"`)).toHaveLength(2);
    expect(inputTag(CONT_MODAL_HEADING)).toMatch(/type="checkbox"/);
    expect(own.indexOf(`id="${CONT_MODAL_HEADING}"`)).toBeGreaterThan(own.indexOf(`id="${CONT_MODAL_THUMB}"`));
    expect(own).toContain('소제목 텍스트 포함');
  });

  it('settings window shows one box per meaning', () => {
    expect(idsIn(continuousModal()).sort()).toEqual([CONT_MODAL_HEADING, CONT_MODAL_THUMB].sort());
  });
});

describe('markup: multi-account full-auto settings window', () => {
  it('has one title(thumbnail) box and one heading box with short Korean names, long text folded', () => {
    const own = maBasic();
    expect(html.split(`id="${MA_THUMB}"`)).toHaveLength(2);
    expect(html.split(`id="${MA_HEADING}"`)).toHaveLength(2);
    expect(inputTag(MA_THUMB)).toMatch(/type="checkbox"/);
    expect(inputTag(MA_HEADING)).toMatch(/type="checkbox"/);
    expect(own).toContain('제목(썸네일) 텍스트 포함');
    expect(own).toContain('소제목 텍스트 포함');
    expect(own).toMatch(/<details[\s\S]*설명 보기[\s\S]*<\/details>/);
  });

  it('sits in the basic tab, under the image-settings button and above the tone select', () => {
    const own = maBasic();
    const imageBtn = own.indexOf('id="ma-open-image-settings-btn"');
    const thumb = own.indexOf(`id="${MA_THUMB}"`);
    const tone = own.indexOf('id="ma-setting-tone"');
    expect(imageBtn).toBeGreaterThan(-1);
    expect(thumb).toBeGreaterThan(imageBtn);
    expect(own.indexOf(`id="${MA_HEADING}"`)).toBeGreaterThan(thumb);
    expect(own.indexOf(`id="${MA_HEADING}"`)).toBeLessThan(tone);
  });

  it('shows one box per meaning', () => {
    expect(idsIn(maBasic()).sort()).toEqual([MA_HEADING, MA_THUMB].sort());
  });

  it('does not reuse the legacy per-account id (its code resets / restores it per account and ORs it into the run)', () => {
    expect(html).not.toContain(`id="${LEGACY_MA_THUMB}"`);
  });
});

describe('shared ids: the new boxes join the existing sync lists', () => {
  it('thumbnail list has the multi-account box, heading list has all three new boxes (no new setting key)', () => {
    expect(IMG_SYNC_THUMBNAIL_CHECKBOX_IDS).toContain(MA_THUMB);
    for (const id of NEW_HEADING_IDS) expect(HEADING_TEXT_SETTING_IDS, id).toContain(id);
  });

  it('no storage key, data-setting or per-item field was introduced for the new boxes', () => {
    const own = [CONT_HEADING, CONT_MODAL_HEADING].map(addedBlock).join('') + region('id="ma-image-text-options"', '<!-- /ma-image-text-options -->');
    expect(own).toContain(MA_THUMB);
    expect(own).toContain(CONT_MODAL_HEADING);
    expect(own).not.toMatch(/localStorage|setItem|data-setting/);
    for (const file of ['src/renderer/modules/headingImageTextSetting.ts', 'src/runtime/imageSettingsSync.ts']) {
      expect(read(file)).not.toMatch(/(continuous|ma)(Thumbnail|Heading)Text/i);
    }
    for (const file of ['src/renderer/modules/continuousPublishing.ts', 'src/renderer/modules/multiAccountManager.ts']) {
      expect(read(file)).not.toMatch(/(item|queueItem)\.(includeHeading\w*|headingText\w*|headingImageText\w*)/);
    }
  });
});

describe('title (thumbnail) box of the multi-account window: same value as every other title box', () => {
  beforeEach(() => {
    localStorage.clear();
    imgSyncInstallListeners();
    document.body.innerHTML = [MA_THUMB, 'thumbnail-text-option', 'thumbnail-text-include', 'fullauto-thumbnail-text-option', CONT_THUMB, CONT_MODAL_THUMB]
      .map((id) => inputTag(id) || `<input type="checkbox" id="${id}">`).join('');
  });

  it('checking it writes thumbnailTextInclude and every other box follows', () => {
    click(box(MA_THUMB));
    expect(localStorage.getItem('thumbnailTextInclude')).toBe('true');
    for (const id of IMG_SYNC_THUMBNAIL_CHECKBOX_IDS) expect(box(id).checked, id).toBe(true);
  });

  it('unchecking removes the key (director "auto") and every other box follows', () => {
    click(box(MA_THUMB));
    click(box(MA_THUMB));
    expect(localStorage.getItem('thumbnailTextInclude')).toBeNull();
    for (const id of IMG_SYNC_THUMBNAIL_CHECKBOX_IDS) expect(box(id).checked, id).toBe(false);
  });

  it('the continuous box drives the multi-account box (other direction)', () => {
    click(box(CONT_THUMB));
    expect(box(MA_THUMB).checked).toBe(true);
    click(box(CONT_MODAL_THUMB));
    expect(box(MA_THUMB).checked).toBe(false);
  });

  it('the value reaches the multi-account and the continuous run through the one pipeline key', () => {
    click(box(MA_THUMB));
    expect(resolvePipelineConfig('multi-account').image.thumbnailTextInclude).toBe(true);
    expect(resolvePipelineConfig('continuous').image.thumbnailTextInclude).toBe(true);
    click(box(MA_THUMB));
    expect(resolvePipelineConfig('multi-account').image.thumbnailTextInclude).toBe(false);
  });
});

describe('heading boxes (continuous main, continuous window, multi-account window): same config value', () => {
  const allHeading = ['heading-image-text-option', 'heading-image-text-include', 'fullauto-heading-text-option', ...NEW_HEADING_IDS];
  beforeEach(() => {
    headingTextSettingResetForTest();
    document.body.innerHTML = allHeading.map((id) => inputTag(id) || `<input type="checkbox" id="${id}">`).join('');
  });

  it('every new box shows the saved config value on open', async () => {
    await headingTextSettingInstall({ getConfig: async () => ({ headingImageTextInclude: true }) }, () => undefined);
    for (const id of allHeading) expect(box(id).checked, id).toBe(true);
  });

  for (const id of NEW_HEADING_IDS) {
    it(`a click on ${id} saves only headingImageTextInclude and every other box follows`, async () => {
      const saveConfig = vi.fn(async (update: { headingImageTextInclude: boolean }) => ({ ...update }));
      const notify = vi.fn();
      await headingTextSettingInstall({ getConfig: async () => ({}), saveConfig }, notify);
      click(box(id));
      await flush();
      expect(saveConfig).toHaveBeenCalledTimes(1);
      expect(saveConfig).toHaveBeenCalledWith({ headingImageTextInclude: true });
      for (const other of allHeading) expect(box(other).checked, other).toBe(true);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('소제목 글자를 그대로'), 'success');
    });

    it(`a failed save puts ${id} back and says so`, async () => {
      const notify = vi.fn();
      await headingTextSettingInstall({ getConfig: async () => ({}), saveConfig: async () => ({ success: false }) }, notify);
      click(box(id));
      await flush();
      expect(box(id).checked).toBe(false);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했습니다'), 'error');
    });
  }
});

describe('publish path (4 hops): the values the new boxes edit are the ones generation reads', () => {
  it('hop 1a: continuous reads the title value from the pipeline key per run / per item, not from the queue item', () => {
    const continuous = read('src/renderer/modules/continuousPublishing.ts');
    expect(continuous).toMatch(/const includeThumbnailText = startPipelineCfg\.image\.thumbnailTextInclude;/);
    expect(continuous).toMatch(/const itemPipelineCfg = resolvePipelineConfig\('continuous'\);/);
    expect(continuous).toMatch(/thumbnailTextInclude: includeThumbnailText,/);
  });

  it('hop 1b: multi-account reads the title value from the pipeline key per item (its own queue field is only OR-ed, never the source)', () => {
    const ma = read('src/renderer/modules/multiAccountManager.ts');
    expect(ma).toMatch(/const itemPipelineCfg = resolvePipelineConfig\('multi-account'\);/);
    expect(ma).toMatch(/thumbnailTextInclude: itemPipelineCfg\.image\.thumbnailTextInclude \|\| queueItem\.includeThumbnailText === true,/);
  });

  it('hop 2: both flows draw article images through runFullAutoImages -> generateImagesForAutomation -> generateImagesWithCostSafety', () => {
    const continuous = read('src/renderer/modules/continuousPublishing.ts');
    const ma = read('src/renderer/modules/multiAccountManager.ts');
    expect(continuous).toMatch(/runFullAutoImages\(\{[\s\S]*?\}, generateImagesForAutomation\)/);
    expect(ma).toMatch(/runFullAutoImages\(\{[\s\S]*?\}, generateImagesForAutomation\)/);
    const inner = ma.slice(ma.indexOf('async function generateImagesForAutomationInner'), ma.indexOf('async function initMultiAccountPublishModal'));
    expect(inner.match(/await generateImagesWithCostSafety\(\{/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('hop 3: the renderer boundary marks article section images, preload forwards the options untouched, main spreads them', () => {
    const costAndAutoGen = read('src/renderer/modules/costAndAutoGen.ts');
    expect(costAndAutoGen).toMatch(/options = enrichImageGenerationOptionsWithArticleContext\(options\);/);
    expect(costAndAutoGen).toMatch(/articleSectionImages: true,/);
    expect(read('src/preload.ts')).toMatch(/ipcRenderer\.invoke\('automation:generateImages', options\)/);
    expect(read('src/main.ts')).toMatch(/const imageOptions: GenerateImagesOptions = \{\s*\.\.\.options,/);
  });

  it('hop 4: main reads config.headingImageTextInclude on every generation (the value the heading boxes save)', () => {
    const generator = read('src/imageGenerator.ts');
    expect(generator).toMatch(/\(await loadConfig\(\)\)\?\.headingImageTextInclude === true/);
    expect(generator).toMatch(/headingTextEligible && await readHeadingImageTextSetting\(\)/);
  });
});
