import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * SPEC-STABILITY-2026 Phase 7.4
 *
 * Characterization guards before splitting the remaining god files.
 * These tests intentionally lock high-risk seams that caused live regressions:
 * content generation exports, preload/main IPC bridges, editor navigation/title
 * selectors, image matching, and tail insertion after rich paste.
 */
const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8');

const expectAll = (source: string, needles: string[]) => {
  for (const needle of needles) {
    expect(source, `missing "${needle}"`).toContain(needle);
  }
};

describe('Phase 7.4 characterization - contentGenerator public surface', () => {
  it('keeps the exported content generation API available for existing callers', () => {
    const src = read('src', 'contentGenerator.ts');
    const exportedFunctions = [
      'stripInternalMarkers',
      'removeOrdinalHeadingLabelsFromBody',
      'finalizeStructuredContent',
      'applyPreset',
      'detectBannedHeadingPatterns',
      'validateShoppingConnectContent',
      'buildModeBasedPrompt',
      'validateBusinessContent',
      'getGeminiRateLimitPatienceMs',
      'getGeminiRateLimitWaitMs',
      'buildGeminiModelChain',
      'findRelevantOfficialSite',
      'researchWithPerplexity',
      'researchWithGeminiGrounding',
      'generateStructuredContent',
      'generateContentsInParallel',
    ];

    const reExportedFunctions = new Set([
      'stripInternalMarkers',
      'removeOrdinalHeadingLabelsFromBody',
      'buildGeminiModelChain',
    ]);

    for (const name of exportedFunctions) {
      if (reExportedFunctions.has(name)) {
        expect(src).toMatch(new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`));
      } else {
        expect(src).toMatch(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`));
      }
    }

    expectAll(src, [
      'classifyGeminiBillingBlock',
      'isGeminiPrepaidCreditsDepletedError',
      "from './geminiBillingBlock.js'",
    ]);
    expect(src).toMatch(/export\s+const\s+CONTENT_PRESETS\b/);
    expect(src).toMatch(/export\s+const\s+GEMINI_RATE_LIMIT_MIN_WAIT_MS\b/);
    expect(src).toMatch(/export\s+const\s+GEMINI_RATE_LIMIT_MAX_SINGLE_WAIT_MS\b/);
  });

  it('keeps post-generation validation and recent-winner prompt wiring in the generation path', () => {
    const src = read('src', 'contentGenerator.ts');
    expectAll(src, [
      'validateContent as runValidationPipeline',
      'function runPostGenValidator(',
      "from './contentRecentWinnersBlock.js'",
      'runPostGenValidator(finalContent, source)',
      'buildRecentWinnersBlock(source)',
      'buildFullPrompt(',
    ]);
  });
});

describe('Phase 7.4 characterization - preload/main IPC bridge', () => {
  it('keeps renderer API names paired with their main-process channels', () => {
    const preload = read('src', 'preload.ts');
    const main = read('src', 'main.ts');

    expectAll(preload, [
      'generateStructuredContent:',
      "ipcRenderer.invoke('automation:generateStructuredContent'",
      'matchImagesToHeadings:',
      "ipcRenderer.invoke('image:matchToHeadings'",
      'matchImages:',
      "ipcRenderer.invoke('automation:matchImages'",
      'collectImagesFromShopping:',
      "ipcRenderer.invoke('image:collectFromShopping'",
      'multiAccountPublish:',
      "ipcRenderer.invoke('multiAccount:publish'",
      "ipcRenderer.invoke('image:downloadAndSaveMultiple'",
    ]);

    expectAll(main, [
      "'automation:generateStructuredContent'",
      "'automation:matchImages'",
      "'multiAccount:publish'",
      'registerImageMatchHandlers()',
      'registerImageCollectShoppingHandlers()',
      'registerImageDownloadHandlers()',
      'registerBlobHandlers()',
    ]);
  });

  it('keeps extracted IPC handler modules owning the channels consumed by preload', () => {
    const imageMatch = read('src', 'main', 'ipc', 'imageMatchHandlers.ts');
    const imageCollectShopping = read('src', 'main', 'ipc', 'imageCollectShoppingHandlers.ts');
    const imageDownload = read('src', 'main', 'ipc', 'imageDownloadHandlers.ts');

    expect(imageMatch).toContain("'image:matchToHeadings'");
    expect(imageCollectShopping).toContain("'image:collectFromShopping'");
    expect(imageDownload).toContain("'image:downloadAndSave'");
    expect(imageDownload).toContain("'image:downloadAndSaveMultiple'");
  });
});

describe('Phase 7.4 characterization - Naver editor automation contracts', () => {
  it('keeps manual-login-to-write-editor recovery and title diagnostics', () => {
    const automation = read('src', 'naverBlogAutomation.ts');
    const titleHelpers = read('src', 'automation', 'editorTitleHelpers.ts');

    expectAll(automation, [
      "from './automation/accountProfilePolicy.js'",
      "from './automation/chromeExecutablePolicy.js'",
      'hashAutomationAccountId(this.options.naverId)',
      'buildNaverAutomationProfile(this.options.naverId, envHint)',
      'isDeviceConfirmUrl(page.url())',
      'isDeviceConfirmBodyText(text)',
      'GoBlogWrite.naver',
      'PostWriteForm',
      'manual login detected on blog domain; moving to write editor',
      'findEditorTitleInputElement(frame, page, 60000',
      'shouldRetryEditorReadiness(snapshot)',
      '에디터 프레임은 열렸지만 내부 문서가 비어 있습니다',
      'collectEditorTitleDiagnostics(frame, page)',
      'setTitleByDomEvent(titleElement, titleText)',
    ]);

    expect(automation).not.toContain('private async findTitleInputElement(');
    expect(automation).not.toContain('private async readEditorTitleText(');
    expect(automation).not.toContain('private async setTitleByDomEvent(');
    expect(automation).not.toContain('private async collectEditorTitleDiagnostics(');
    expect(automation).not.toContain('private async verifyImageInDOM(');
    expect(automation).not.toContain('private async findElement(');
    expect(automation).not.toContain('private async findNextBodyElement(');
    expect(automation).not.toContain('private async debugPublishModal(');
    expect(automation).not.toContain('private async insertImageViaUploadButton(');
    expect(automation).not.toContain('private async setImageSizeToDocumentWidth(');
    expect(automation).not.toContain('private async insertSingleImage(');
    expect(automation).not.toContain('private async insertImages(');
    expect(automation).not.toContain('private generateAltWithSource(');
    expect(automation).not.toContain('private async applyCaption(');
    expect(automation).not.toContain('private async insertCtaHtmlAtTop(');
    expect(automation).not.toContain('private async insertCtaHtmlInMiddle(');
    expect(automation).not.toContain('private async insertCtaHtmlAtBottom(');
    expect(automation).toContain('return await ctaHelpers.insertEnhancedCta(');
    expect(automation).not.toContain('🔗 [이전글] 같은 카테고리 이전글 삽입 중');
    expect(automation).toContain('await imageHelpers.applyDocumentWidthToAllImagesBeforePublish(this, frame)');
    expect(automation).not.toContain('private hashAccountId(');
    expect(automation).not.toContain('private stripRepeatedHookBlocks(');
    expect(automation).not.toContain('private enforceOrdinalLineBreaks(');
    expect(automation).not.toContain('private isDeviceConfirmUrl(');
    expect(automation).not.toContain('private findChromeExecutable(');
    expect(automation).not.toContain('private validateScheduleDate(');
    expect(automation).toContain('return editorHelpers.extractBodyForHeading(');
    expect(automation).not.toContain('heading.content에서 직접 추출 성공');

    expectAll(titleHelpers, [
      'export async function findEditorTitleInputElement',
      'export async function readEditorTitleText',
      'export async function setTitleByDomEvent',
      'export async function collectEditorTitleDiagnostics',
      "'.se-section-documentTitle'",
      "'[data-name=\"documentTitle\"]'",
      "'[class*=\"documentTitle\"]'",
      "'[contenteditable=\"true\"]'",
      "'page.editor.documentTitle'",
      "target.dispatchEvent(new InputEvent('input'",
    ]);

    const editorHelpers = read('src', 'automation', 'editorHelpers.ts');
    expectAll(editorHelpers, [
      "from './bodyTextCleanupPolicy.js'",
      'stripRepeatedHookBlocks(structured.bodyPlain)',
      'enforceOrdinalLineBreaks(structured.bodyPlain)',
      'stripRepeatedHookBlocks(cleanedContent)',
      'enforceOrdinalLineBreaks(cleanedContent)',
    ]);

    const imageHelpers = read('src', 'automation', 'imageHelpers.ts');
    expectAll(imageHelpers, [
      'export async function applyDocumentWidthToAllImagesBeforePublish',
      "recordSilentFailure('image:width-apply')",
      '이미지 문서 너비 적용 중 오류',
    ]);
  });

  it('keeps run options that carry hashtags, previous-post links, CTA placement, and thumbnail text', () => {
    const automation = read('src', 'naverBlogAutomation.ts');
    const runOptionsPolicy = read('src', 'automation', 'runOptionsPolicy.ts');
    const fullAuto = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const publishingHandlers = read('src', 'renderer', 'modules', 'publishingHandlers.ts');

    expectAll(automation, [
      'return resolveNaverRunOptions({',
      'defaults: this.options',
    ]);

    expectAll(runOptionsPolicy, [
      'normalizePublishHashtags(runOptions.hashtags, structured?.hashtags)',
      "ctaPosition: runOptions.ctaPosition || 'bottom'",
      'includeThumbnailText: runOptions.includeThumbnailText || false',
      'previousPostTitle: runOptions.previousPostTitle',
      'previousPostUrl: runOptions.previousPostUrl',
    ]);

    expectAll(fullAuto, [
      'hashtags: structuredContent.hashtags',
      "ctaPosition: formData.ctaPosition || 'bottom'",
      'previousPostTitle: formData.previousPostTitle || undefined',
      'previousPostUrl: formData.previousPostUrl || undefined',
      'includeThumbnailText: formData.includeThumbnailText ?? false',
    ]);

    expectAll(publishingHandlers, [
      'previousPostTitle: selectedPreviousPost.title || undefined',
      'previousPostUrl: selectedPreviousPost.url || undefined',
      'hashtags: publishHashtags',
      'generatedHashtags: publishHashtags.join',
      'ctaPosition: ctaPosition',
      'includeThumbnailText',
    ]);
  });

  it('keeps rich-paste tail recovery, previous-post card insertion, and hashtag typing after the body', () => {
    const editorHelpers = read('src', 'automation', 'editorHelpers.ts');

    expectAll(editorHelpers, [
      'insertPreviousPostTailBlock',
      'ensureTailTypingReady',
      'applyTailHashtagsAfterCards({',
      'expectedHashtags: hashtagsToApply',
      'expectedLinkCardMin',
      'expectedDividerMin',
    ]);
  });

  it('keeps publishHelpers scoped to active category and schedule helper ownership', () => {
    const publishHelpers = read('src', 'automation', 'publishHelpers.ts');

    expect(publishHelpers).toContain('export async function publishScheduled');
    expect(publishHelpers).toContain("from './scheduleDatePolicy.js'");
    expect(publishHelpers).toContain('validateScheduleDate(scheduleDate)');
    expect(publishHelpers).not.toContain('export async function publishBlogPost');
    expect(publishHelpers).not.toMatch(/\bfindElement,\s*\n/);
    expect(publishHelpers).not.toMatch(/\bwaitForElement,\s*\n/);
    expect(publishHelpers).not.toMatch(/\bgetSelectorStrings,\s*\n/);
  });

  it('keeps file-cookie restore wired in the fallback browser startup path', () => {
    const automation = read('src', 'naverBlogAutomation.ts');

    expect(automation).toMatch(
      /this\.page\s*=\s*await\s+this\.browser\.newPage\(\);[\s\S]{0,900}?await\s+this\.loadCookies\(\);/,
    );
  });
});
