// SPEC-NAVER-IMAGE-2026 — the renderer keeps the director's flags on the image tab thumbnail slot.
// The image tab's per-heading function keeps only the URL of a result, so without this chain a number
// card would get a second title overlay at publish and a real-photo composite would be AI-marked.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

describe('renderer wiring for the thumbnail director', () => {
  const wrapper = read('renderer/modules/costAndAutoGen.ts');
  const imageTab = read('renderer/modules/headingImageGen.ts');

  it('the wrapper records the returned flags at the single IPC point', () => {
    expect(wrapper).toMatch(/const ipcResult = await Promise\.race\(\[\s*window\.api\.generateImages\(options\)/);
    expect(wrapper).toMatch(/rememberThumbDirectorMeta\(options, ipcResult\);\s*return ipcResult;/);
  });

  it('baked text and real photos are only offered on the image tab slot of the bound article', () => {
    expect(wrapper).toMatch(/const imageTabSlot = canUseStructuredContext && String\(items\[0\]\?\.heading \|\| ''\)\.trim\(\) === THUMB_DIRECTOR_SLOT;/);
    expect(wrapper).toMatch(/allowBakedText: imageTabSlot/);
    expect(wrapper).toMatch(/realImages: imageTabSlot \? readThumbDirectorRealImages\(\) : \[\]/);
  });

  it('the manual thumbnail editors never opt in (their own background prompt stays)', () => {
    expect(wrapper).toMatch(/THUMB_DIRECTOR_TOOL_HEADINGS = new Set\(\['thumbnail-bg', '썸네일 배경'\]\)/);
    expect(wrapper).toMatch(/options\?\.styleHint === 'background'\) return false;/);
    expect(wrapper).toMatch(/!isThumbDirectorItem\(items\[0\], options\)\) return options\.thumbnailDirector;/);
    // the two call sites the rule exists for
    expect(read('renderer/modules/thumbnailGenerator.ts')).toMatch(/heading: 'thumbnail-bg'/);
    expect(read('renderer/modules/thumbnailPreview.ts')).toMatch(/heading: '썸네일 배경'/);
  });

  it("a regeneration or a saved manual prompt keeps the user's prompt (keepPrompt)", () => {
    expect(wrapper).toMatch(/if \(options\?\.regenerate === true\) return true;/);
    expect(wrapper).toMatch(/getManualEnglishPromptOverrideForHeading\(heading\)/);
    expect(wrapper).toMatch(/\{ keepPrompt: true \}/);
  });

  it('the main multi-account thumbnail opts in explicitly', () => {
    expect(read('main.ts')).toMatch(/thumbnailDirector: \{\}, \/\/ opt-in: this is the article thumbnail/);
  });

  it('real photos are only sent while the thumbnail slot is empty', () => {
    expect(wrapper).toMatch(/if \(Array\.isArray\(current\) && current\.length > 0\) return \[\];/);
  });

  it('image tab text mode: checked → include, explicit "false" → exclude, otherwise AUTO (V1 §9)', () => {
    expect(wrapper).toMatch(/\.\.\.\(imageTabSlot \? \{ textMode: readThumbDirectorTextMode\(\) \} : \{\}\)/);
    expect(wrapper).toMatch(/if \(raw === 'false'\) return 'exclude';/);
    expect(wrapper).toMatch(/return 'auto';/);
  });

  it('the director notice reaches the image tab log', () => {
    expect(wrapper).toMatch(/if \(image\.directorNotice\) \{[\s\S]{0,120}appendLog\(`💡 \$\{String\(image\.directorNotice\)\}`, 'images-log-output'\)/);
  });

  it('the image management tab has the 고품질 썸네일 checkbox, saved as thumbnailQualityMode', () => {
    const html = read('../public/index.html');
    const tab = read('renderer/modules/imageManagementTab.ts');
    expect(html).toMatch(/id="image-thumbnail-quality-high"/);
    expect(tab).toMatch(/saveConfig\?\.\(\{ thumbnailQualityMode: thumbnailQualityCheckbox\.checked \? 'high' : 'standard' \}\)/);
    expect(tab).toMatch(/cfg\?\.thumbnailQualityMode === 'high'/);
  });

  it('the image tab merges the flags at its single return and carries them through normalization', () => {
    expect(imageTab).toMatch(/\.\.\.takeThumbnailDirectorMeta\(headingForImage, imageUrl\),\s*url: imageUrl,/);
    expect(imageTab).toMatch(/\.\.\.\(img\?\.disableTextOverlay === true \? \{ disableTextOverlay: true \} : \{\}\)/);
    expect(imageTab).toMatch(/\.\.\.\(img\?\.isCollected === true \? \{ isCollected: true \} : \{\}\)/);
  });

  it('the thumbnail mirror keeps a real-photo provider instead of the selected engine', () => {
    const mirror = imageTab.indexOf("heading: '🖼️ 썸네일',\r\n                isThumbnail: true,") >= 0
      ? imageTab.indexOf("heading: '🖼️ 썸네일',\r\n                isThumbnail: true,")
      : imageTab.indexOf("heading: '🖼️ 썸네일',\n                isThumbnail: true,");
    expect(mirror).toBeGreaterThan(-1);
    expect(imageTab.slice(mirror, mirror + 400)).toContain('provider: img.provider || imageSource,');
  });
});
