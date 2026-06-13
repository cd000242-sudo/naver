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
      'function buildRecentWinnersBlock(',
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
      'GoBlogWrite.naver',
      'PostWriteForm',
      'manual login detected on blog domain; moving to write editor',
      'findEditorTitleInputElement(frame, page, 60000',
      'collectEditorTitleDiagnostics(frame, page)',
      'setTitleByDomEvent(titleElement, titleText)',
    ]);

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
  });

  it('keeps run options that carry hashtags, previous-post links, CTA placement, and thumbnail text', () => {
    const automation = read('src', 'naverBlogAutomation.ts');
    const fullAuto = read('src', 'renderer', 'modules', 'fullAutoFlow.ts');
    const publishingHandlers = read('src', 'renderer', 'modules', 'publishingHandlers.ts');

    expectAll(automation, [
      'const hashtags = normalizeHashtags(',
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
});
