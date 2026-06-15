import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

describe('publish metadata propagation', () => {
  it('does not let empty runOptions hashtags suppress structuredContent hashtags', () => {
    const code = read('automation/runOptionsPolicy.ts');

    expect(code).toMatch(/export function normalizePublishHashtags\(\.\.\.sources: any\[\]\): string\[\]/);
    expect(code).toMatch(/const hashtags = normalizePublishHashtags\(runOptions\.hashtags,\s*structured\?\.hashtags\)/);
    expect(code).not.toMatch(/runOptions\.hashtags \?\?\s*structured\?\.hashtags/);
  });

  it('passes hashtags and selected previous-post metadata from unified publish handlers', () => {
    const code = read('renderer/modules/publishingHandlers.ts');

    expect(code).toMatch(/function parsePublishHashtags/);
    expect(code).toMatch(/function readSelectedPreviousPostForPublish/);
    expect(code).toMatch(/function findPreviousPostForPublish/);
    expect(code).toMatch(/shouldAutoLinkPreviousPostForMode/);
    expect(code).toMatch(/hashtags:\s*publishHashtags/);
    expect(code).toMatch(/generatedHashtags:\s*publishHashtags\.join\(' '\)/);
    expect(code).toMatch(/previousPostUrl:\s*selectedPreviousPost\.url \|\| undefined/);
    expect(code).toMatch(/hashtags:\s*multiPublishHashtags/);
    expect(code).toMatch(/structuredContent:[\s\S]{0,180}?hashtags:\s*multiPublishHashtags/);
  });

  it('syncs previous-post CTA URL into the editor previousPostUrl field', () => {
    const fullAutoCode = read('renderer/modules/fullAutoFlow.ts');
    const multiAccountCode = read('renderer/modules/multiAccountManager.ts');
    const publishingHandlersCode = read('renderer/modules/publishingHandlers.ts');

    expect(fullAutoCode).toMatch(/formData\.previousPostUrl = validUrl/);
    expect(fullAutoCode).toMatch(/const isStandardContentMode = \['seo', 'homefeed', 'custom', 'business', 'affiliate'\]/);
    expect(publishingHandlersCode).toMatch(/const resolvedContentModeForPublish = \(earlyAffiliateLink \|\| isShoppingConnectModeActive\(\)\) \? 'affiliate' : selectedContentModeForPublish/);
    expect(publishingHandlersCode).toMatch(/contentMode:\s*resolvedContentModeForPublish/);
    expect(publishingHandlersCode).toMatch(/readSelectedPreviousPostForPublish\(\s*resolvedContentModeForPublish/);
    expect(publishingHandlersCode).toMatch(/contentMode:\s*semiAutoContentMode/);
    expect(publishingHandlersCode).toMatch(/readSelectedPreviousPostForPublish\(\s*semiAutoContentMode/);
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
    const tailActions = read('automation/editorTailActions.ts');
    const tailHelper = tailActions.slice(
      tailActions.indexOf('export async function insertPreviousPostTailBlock'),
      tailActions.length
    );
    const hashtagTail = tailActions.slice(
      tailActions.indexOf('export async function applyTailHashtagsAfterCards'),
      tailActions.length
    );

    expect(tailActions).toContain("export const PREVIOUS_POST_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'");
    expect(tailHelper).toMatch(/safeKeyboardType\(page,\s*PREVIOUS_POST_SEPARATOR/);
    expect(tailHelper).toMatch(/safeKeyboardType\(page,\s*previousPostUrl/);
    expect(tailHelper).toMatch(/waitForLinkCard\(15000,\s*500\)/);
    expect(tailHelper).toMatch(/removeBareUrlTextAfterLinkCard/);
    expect(tailHelper).not.toMatch(/effectiveCtas\.some\(\(cta\) => cta\.link && cta\.link === previousPostUrl\)/);
    expect(code).toMatch(/previousPostTailInserted = previousPostTailInserted \|\| previousResult\.inserted/);
    expect(code).toMatch(/await applyTailHashtagsAfterCards\(\{/);
    expect(hashtagTail).toMatch(/const hashtagGapEnterCount = getHashtagGapEnterCount\(previousPostTailInserted\)/);
    expect(hashtagTail.indexOf('page.keyboard.press')).toBeLessThan(hashtagTail.indexOf('applyHashtagsInBody'));
  });

  it('keeps CTA placement selection available in the unified publish panel', () => {
    const code = read('renderer/renderer.ts');
    const block = code.slice(
      code.indexOf("document.getElementById('unified-cta-position')"),
      code.indexOf('// AI로 CTA 생성 버튼')
    );

    expect(block).toMatch(/wrapper\.style\.display = ''/);
    expect(block).toMatch(/ctaPositionSelect\.disabled = false/);
    expect(block).toMatch(/ctaPositionSelect\.style\.opacity = '1'/);
    expect(block).not.toMatch(/wrapper\.style\.display = 'none'/);
  });
});
