import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

describe('publish metadata propagation', () => {
  it('does not let empty runOptions hashtags suppress structuredContent hashtags', () => {
    const code = read('naverBlogAutomation.ts');

    expect(code).toMatch(/const normalizeHashtags = \(\.\.\.sources: any\[\]\): string\[\]/);
    expect(code).toMatch(/const hashtags = normalizeHashtags\(\s*runOptions\.hashtags,\s*structured\?\.hashtags,\s*\)/);
    expect(code).not.toMatch(/runOptions\.hashtags \?\?\s*structured\?\.hashtags/);
  });

  it('passes hashtags and selected previous-post metadata from unified publish handlers', () => {
    const code = read('renderer/modules/publishingHandlers.ts');

    expect(code).toMatch(/function parsePublishHashtags/);
    expect(code).toMatch(/function readSelectedPreviousPostForPublish/);
    expect(code).toMatch(/hashtags:\s*publishHashtags/);
    expect(code).toMatch(/generatedHashtags:\s*publishHashtags\.join\(' '\)/);
    expect(code).toMatch(/previousPostUrl:\s*selectedPreviousPost\.url \|\| undefined/);
    expect(code).toMatch(/hashtags:\s*multiPublishHashtags/);
    expect(code).toMatch(/structuredContent:[\s\S]{0,180}?hashtags:\s*multiPublishHashtags/);
  });

  it('syncs previous-post CTA URL into the editor previousPostUrl field', () => {
    const fullAutoCode = read('renderer/modules/fullAutoFlow.ts');
    const multiAccountCode = read('renderer/modules/multiAccountManager.ts');

    expect(fullAutoCode).toMatch(/formData\.previousPostUrl = validUrl/);
    expect(fullAutoCode).toMatch(/const isStandardContentMode = \['seo', 'homefeed', 'custom', 'business', 'affiliate'\]/);
    expect(multiAccountCode).toMatch(/queueItem\.previousPostUrl = queueItem\.ctaUrl/);
    expect(multiAccountCode).toMatch(/previousPostUrl:\s*queueItem\?\.previousPostUrl \|\| \(queueItem\.ctaType === 'previous-post' \? queueItem\?\.ctaUrl : undefined\)/);
  });

  it('preserves generated hashtags in the main multi-account IPC path', () => {
    const code = read('main.ts');

    expect(code).toMatch(/const normalizePublishHashtags = \(\.\.\.sources: any\[\]\): string\[\]/);
    expect(code).toMatch(/const mergedHashtags = normalizePublishHashtags\(options\?\.hashtags, preGenerated\.hashtags, structuredContent\?\.hashtags\)/);
    expect(code).toMatch(/hashtags:\s*normalizePublishHashtags\(options\?\.hashtags, structuredContent\?\.hashtags, preGenerated\?\.hashtags\)/);
    expect(code).toMatch(/previousPostUrl:\s*options\?\.previousPostUrl \|\| \(options\?\.ctaType === 'previous-post' \? \(options\?\.ctaUrl \|\| options\?\.ctaLink\) : undefined\)/);
  });

  it('appends previous-post cards before typed hashtags in the editor tail', () => {
    const code = read('automation/editorHelpers.ts');
    const tailHelper = code.slice(
      code.indexOf('async function insertPreviousPostTailBlock'),
      code.indexOf('// ── Local utility')
    );
    const hashtagTail = code.slice(
      code.indexOf('const hashtagGapEnterCount'),
      code.indexOf('// 7. CTA 버튼 최종 확인')
    );

    expect(code).toContain("const PREVIOUS_POST_SEPARATOR = '--------------------------------------------------------------'");
    expect(tailHelper).toMatch(/safeKeyboardType\(page,\s*PREVIOUS_POST_SEPARATOR/);
    expect(tailHelper).toMatch(/safeKeyboardType\(page,\s*previousPostUrl/);
    expect(tailHelper).toMatch(/waitForLinkCard\(15000,\s*500\)/);
    expect(tailHelper).toMatch(/removeBareUrlTextAfterLinkCard/);
    expect(code).toMatch(/previousPostTailInserted = previousPostTailInserted \|\| previousResult\.inserted/);
    expect(hashtagTail).toMatch(/const hashtagGapEnterCount = previousPostTailInserted \? 5 : 3/);
    expect(hashtagTail.indexOf('page.keyboard.press')).toBeLessThan(hashtagTail.indexOf('applyHashtagsInBody'));
  });
});
