/**
 * NAVER FULL AUTO — wiring guards: every unattended flow uses the one image core (T23), the UI shows
 * writing mode and image strategy separately (T21, T22), and the renderer bundle can see the core.
 *
 * The flows live in god files that cannot run under node, so these are source contracts; the behaviour
 * of the shared core itself is tested in fullAutoImage*.test.ts.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const publishing = read('src/renderer/modules/publishingHandlers.ts');
const continuous = read('src/renderer/modules/continuousPublishing.ts');
const multiAccount = read('src/renderer/modules/multiAccountManager.ts');
const costAndAutoGen = read('src/renderer/modules/costAndAutoGen.ts');
const main = read('src/main.ts');
const html = read('public/index.html');

describe('T23: one image core for one-click full auto, the reservation queue and multi-account', () => {
  it.each([
    ['one-click full auto', publishing, 'generateImagesForAutomationSafely'],
    ['reservation queue', continuous, 'generateImagesForAutomation'],
    ['multi-account queue', multiAccount, 'generateImagesForAutomation'],
  ])('%s runs runFullAutoImages over the shared automation loop', (_name, source, loop) => {
    expect(source).toMatch(new RegExp(`runFullAutoImages\\(\\{[\\s\\S]{0,1500}?\\}, ${loop}\\)`));
    expect(source).toContain('recheckFullAutoDecisionBeforePublish(');
  });

  it('the automation loop records every slot and keeps going after a failed one', () => {
    expect(multiAccount).toContain("options.continueOnImageFailure === true && Boolean(scopedItems)");
    expect(multiAccount).toMatch(/reportSlot\(itemIndex, \{ state: 'SUCCESS', image: normalizedImages\[0\] \}\)/);
    expect(multiAccount).toMatch(/reportSlot\(itemIndex, \{ state: 'FAILED', reason:/);
    // Thumbnail items get the homefeed director request; every item gets the policy ratios / 800 target.
    expect(multiAccount).toContain('buildFullAutoDirectorRequest(imagePolicy, options.directorContext || {})');
    expect(multiAccount).toContain('buildFullAutoImageCallOptions(imagePolicy)');
  });

  it('a held post is never handed to publishing', () => {
    expect(publishing).toMatch(/finalDecision\.decision !== 'AUTO_PUBLISH'[\s\S]{0,900}?return;/);
    expect(continuous).toMatch(/itemDecision\.decision !== 'AUTO_PUBLISH'[\s\S]{0,700}?continue;/);
    expect(multiAccount).toMatch(/maDecision\.decision !== 'AUTO_PUBLISH'[\s\S]{0,1400}?continue;/);
  });

  it('multi-account forwards the user\'s "no images" and the scope, so main never regenerates them', () => {
    expect(multiAccount).toContain("skipImages: (queueItem.imageSource === 'skip') || queueItem.__maSkipImagesDecided === true");
    expect(multiAccount).toContain('headingImageMode: queueItem.__maHeadingImageMode || itemPipelineCfg.image.headingImageMode');
  });

  it('main crops every image of a homefeed call to the requested square', () => {
    expect(main).toMatch(/runWithSquareImageTarget\(\(options as any\)\.targetSquareSize, \(\) =>\s*generateImagesWithThumbnailDirector/);
  });

  it('the renderer guard does not let a stale global "thumbnail-only" override a per-job scope', () => {
    expect(costAndAutoGen).toContain("options?.headingScopeFromPolicy !== true && rawPipeline.headingImageMode === 'thumbnail-only'");
  });

  it('a preset director request still gets this article\'s CARD_PROMISE', () => {
    expect(costAndAutoGen).toMatch(/options\.thumbnailDirector\.cardPromise \|\| !cardPromise[\s\S]{0,120}?\{ \.\.\.options\.thumbnailDirector, cardPromise \}/);
  });
});

describe('reservation queue behaviour (spec §19-§21)', () => {
  it('each queued item freezes its own image strategy / scope / text mode', () => {
    expect(continuous).toContain('...readContinuousImageChoicesForQueue(),');
    expect(continuous).toMatch(/resolveFullAutoImagePolicyFromPipeline\(itemPipelineCfg, \{\s*strategy: item\.imageStrategy,\s*headingScope: item\.headingImageScope,\s*thumbnailTextMode: item\.thumbnailTextMode,/);
  });

  it('the image-failure breaker counts posts, not the retry of the same post', () => {
    expect(continuous).toContain("const alreadyCountedThisItem = (item as any)._imgFailCounted === true;");
    expect(continuous).toContain('(window as any).__continuousImgFailStreak = 0;\n  let heldForImageReviewCount = 0;'.replace(/\n/g, continuous.includes('\r\n') ? '\r\n' : '\n'));
  });

  it('each run starts every post uncounted for the breaker (the in-run retry still counts once)', () => {
    expect(continuous).toContain('continuousQueueV2.forEach((queued) => { delete (queued as any)._imgFailCounted; });');
  });

  it('the master "이미지 없음 / 글만 발행" switch is never silent for queued posts', () => {
    expect(continuous).toContain("queueImagesOff && item.status === 'pending' ? { ...item, imageSource: 'skip' } : item");
    expect(continuous).toContain('방금 넣은 글은 이미지 없이 발행됩니다');
    expect(continuous).toMatch(/if \(skipImages\) \{\s*item\.imageProgress = \{ done: 0, planned: 0 \};/);
  });

  it('an edited reservation time is stored in the field the run reads', () => {
    expect(continuous).toMatch(/scheduleDate = dateVal;\s*scheduleTime = timeVal;/);
  });

  it('the writing mode the user picked is restored after a queue run', () => {
    expect(continuous).toContain('continuousContentModeSnapshot.unified');
    expect(continuous).toMatch(/unifiedModeEl\.value = continuousContentModeSnapshot\.unified/);
  });

  it('homefeed / business / custom titles are not given an SEO keyword prefix unless ticked', () => {
    expect(continuous).toMatch(/function continuousItemUsesKeywordPrefix[\s\S]{0,300}?mode === 'seo' \|\| mode === 'mate' \|\| mode === 'affiliate'/);
    expect(continuous).toContain("const prefixKeyword = continuousItemUsesKeywordPrefix(item) ? keyword : '';");
  });

  it('T21: queue rows show when / mode / image strategy / text / images / final status', () => {
    expect(continuous).toContain('const rowStatus = describeFullAutoQueueItem(');
    for (const field of ['rowStatus.imageStrategyLabel', 'rowStatus.textStatus', 'rowStatus.imageStatus', 'rowStatus.finalStatus', 'rowStatus.when']) {
      expect(continuous).toContain(field);
    }
    expect(continuous).toContain("'image-review': '#fb923c'");
  });
});

describe('T22: settings and publish UI keep writing mode and image strategy apart', () => {
  it('the queue panel has image strategy, H2 scope and thumbnail text selects (defaults: homefeed / all / AUTO)', () => {
    expect(html).toMatch(/id="continuous-image-strategy-select"[\s\S]{0,400}?<option value="naver-homefeed" selected>/);
    expect(html).toMatch(/id="continuous-heading-scope-select"[\s\S]{0,400}?<option value="all" selected>/);
    expect(html).toMatch(/id="continuous-thumbnail-text-mode-select"[\s\S]{0,400}?<option value="auto" selected>/);
    expect(html).toContain('(글쓰기 모드와 별개)');
  });

  it('the publish panel shows both lines', () => {
    expect(html).toContain('id="unified-fullauto-image-summary"');
    const tail = read('src/renderer/modules/tailUIUtils.ts');
    expect(tail).toContain('✍️ 글쓰기 모드:');
    expect(tail).toContain('🖼️ 이미지:');
  });

  it('reopening the settings shows the text mode the policy really applies (legacy "포함" → include)', () => {
    const settings = read('src/renderer/components/HeadingImageSettings.ts');
    expect(settings).toContain("(localStorage.getItem('thumbnailTextInclude') === 'true' ? 'include' : 'auto')");
  });

  it('a held one-click post drops the reuse caches; the preview keeps the old thumbnail-tile rule', () => {
    expect(publishing).toMatch(/modal\.showError\('🖼️ 이미지 검토 필요', reviewMessage\);[\s\S]{0,400}?clearFullAutoContentRetryCache[\s\S]{0,80}?clearPublishContentRetryCache\(\);/);
    expect(costAndAutoGen).toContain("isThumbnail: /^🖼️?\\s*썸네일$/u.test(String(image.heading || '').trim()),");
  });

  it('the image settings modal has the full-auto strategy section and saves it', () => {
    const settings = read('src/renderer/components/HeadingImageSettings.ts');
    for (const id of ['fullauto-image-strategy-select', 'fullauto-thumbnail-text-mode-select', 'fullauto-real-asset-first', 'fullauto-real-pair']) {
      expect(settings).toContain(`id="${id}"`);
    }
    for (const key of ['fullAutoImageStrategy', 'fullAutoThumbnailTextMode', 'fullAutoRealAssetFirst', 'fullAutoRealPair']) {
      expect(settings).toContain(`localStorage.setItem('${key}'`);
    }
  });
});

describe('renderer bundle registration', () => {
  it('every image/fullAuto module the renderer imports is inlined by copy-static', () => {
    const copyStatic = read('scripts/copy-static.mjs');
    for (const file of ['fullAutoImagePolicy', 'fullAutoImageSlots', 'fullAutoPublishDecision', 'fullAutoImageRequest', 'fullAutoImageRunner', 'fullAutoQueueStatus', 'fullAutoImageAsset']) {
      expect(copyStatic).toContain(`'image/fullAuto/${file}.js'`);
    }
  });
});
