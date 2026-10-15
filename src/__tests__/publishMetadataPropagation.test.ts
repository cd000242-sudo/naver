import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { applyPreviousPostPolicy } from '../shared/previousPostPolicy';

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
    expect(code).toMatch(/function parsePublishHashtagsWithManualPriority/);
    expect(code).toMatch(/function readSelectedPreviousPostForPublish/);
    expect(code).toMatch(/selectPreviousPost\(loadGeneratedPosts\(\) \|\| \[\], resolveRendererPublicationScope\(\),/);
    expect(code).toMatch(/excludePostId:\s*currentPostId \|\| undefined/);
    expect(code).toMatch(/previousPostSelection:\s*selectedPreviousPost\.selection/);
    expect(code).toMatch(/previousPostRequestedUrl:\s*selectedPreviousPost\.requestedUrl/);
    expect(code).toMatch(/hashtags:\s*publishHashtags/);
    expect(code).toMatch(/generatedHashtags:\s*publishHashtags\.join\(' '\)/);
    expect(code).toMatch(/previousPostUrl:\s*selectedPreviousPost\.url \|\| undefined/);
    expect(code).toMatch(/hashtags:\s*multiPublishHashtags/);
    expect(code).toMatch(/structuredContent:[\s\S]{0,180}?hashtags:\s*multiPublishHashtags/);
  });

  it('does not append AI or keyword hashtags when the visible edit field already has hashtags', () => {
    const code = read('renderer/modules/publishingHandlers.ts');

    expect(code).toMatch(/const visibleHashtagsInput = .*unified-generated-hashtags/);
    expect(code).toMatch(/parsePublishHashtagsWithManualPriority\(\s*visibleHashtagsInput,\s*structuredContent\?\.hashtags,\s*keywords,\s*title,\s*\)/);
    expect(code).toMatch(/parsePublishHashtagsWithManualPriority\(\s*mainSettings\.generatedHashtags,\s*\(window as any\)\.currentStructuredContent\?\.hashtags,\s*mainSettings\.keywords,\s*preferredTitle,\s*\)/);
    expect(code).toMatch(/const visibleSemiAutoHashtags = .*unified-generated-hashtags/);
    expect(code).toMatch(/parsePublishHashtagsWithManualPriority\(\s*visibleSemiAutoHashtags \|\| hashtagsStr,\s*structuredContent\?\.hashtags,\s*\)/);
  });

  it('validates previous-post scope before forwarding CTA and editor link metadata', () => {
    const fullAutoCode = read('renderer/modules/fullAutoFlow.ts');
    const multiAccountCode = read('renderer/modules/multiAccountManager.ts');
    const publishingHandlersCode = read('renderer/modules/publishingHandlers.ts');

    expect(fullAutoCode).toMatch(/const resolved = resolveRendererPreviousPostPayload\(/);
    expect(fullAutoCode).toMatch(/formData = autoLinkPreviousPost\(\{ \.\.\.formData, postId:/);
    for (const field of ['blogId', 'categoryId', 'previousPostCandidate', 'previousPostSelection', 'previousPostRequestedUrl']) {
      expect(fullAutoCode.includes(`${field}: formData.${field}`), `full-auto IPC carries ${field}`).toBe(true);
    }
    expect(fullAutoCode).toMatch(/previousPostUrl:\s*formData\.previousPostUrl \|\| undefined/);
    expect(publishingHandlersCode).toMatch(/const resolvedContentModeForPublish = \(earlyAffiliateLink \|\| isShoppingConnectModeActive\(\)\) \? 'affiliate' : selectedContentModeForPublish/);
    expect(publishingHandlersCode).toMatch(/contentMode:\s*resolvedContentModeForPublish/);
    expect(publishingHandlersCode).toMatch(/readSelectedPreviousPostForPublish\(\s*resolvedContentModeForPublish/);
    expect(publishingHandlersCode).toMatch(/contentMode:\s*semiAutoContentMode/);
    expect(publishingHandlersCode).toMatch(/readSelectedPreviousPostForPublish\(\s*semiAutoContentMode/);
    expect(multiAccountCode).toMatch(/const scopedPublishOptions = applyPreviousPostPolicy\(publishOptions, loadGeneratedPosts\(\), publicationScope\)/);
    expect(multiAccountCode).toMatch(/multiAccountPublish\(\[queueItem\.accountId\], scopedPublishOptions\)/);
    expect(multiAccountCode).toMatch(/previousPostUrl:\s*queueItem\?\.previousPostUrl \|\| \(queueItem\.ctaType === 'previous-post' \? queueItem\?\.ctaUrl : undefined\)/);
  });

  it('keeps hashtags and content while forwarding only the latest eligible category link', () => {
    const payload = { ctaType: 'previous-post', previousPostSelection: 'auto', hashtags: ['수동태그'], structuredContent: { content: '원고 그대로', hashtags: ['수동태그'] } };
    const makePost = (postId: string, categoryId: string, publishedAt: string) => ({
      title: `글 ${postId}`, publishedUrl: `https://blog.naver.com/myblog/${postId}`,
      publishedBlogId: 'myblog', publishedCategoryId: categoryId, publishedAt, publishMode: 'publish', isPublished: true,
    });
    const matching = makePost('101', '12', '2026-01-02T00:00:00Z');
    const result = applyPreviousPostPolicy(payload, [
      makePost('100', '12', '2026-01-01T00:00:00Z'), matching,
      makePost('102', '99', '2026-01-03T00:00:00Z'),
    ], { blogId: 'myblog', categoryId: '12' });
    expect(result).toMatchObject({
      hashtags: payload.hashtags, structuredContent: payload.structuredContent,
      previousPostUrl: matching.publishedUrl, previousPostTitle: matching.title,
      ctaLink: matching.publishedUrl, previousPostCandidate: matching, previousPostSelection: 'auto',
    });
    expect(payload).not.toHaveProperty('previousPostUrl');
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
      tailActions.indexOf('export async function insertTailLinkCardBlock')
    );

    expect(tailActions).toContain("export const PREVIOUS_POST_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'");
    expect(tailHelper).toMatch(/safeKeyboardType\(page,\s*PREVIOUS_POST_SEPARATOR/);
    expect(tailHelper).toMatch(/safeKeyboardType\(page,\s*previousPostUrl/);
    expect(tailHelper).toMatch(/waitForLinkCard\(15000,\s*500\)/);
    expect(tailHelper).toMatch(/removeBareUrlTextAfterLinkCard/);
    expect(tailHelper).not.toMatch(/effectiveCtas\.some\(\(cta\) => cta\.link && cta\.link === previousPostUrl\)/);
    expect(code).toMatch(/previousPostTailInserted = previousPostTailInserted \|\| previousResult\.inserted/);
    expect(code).toMatch(/await applyTailHashtagsAfterCards\(\{/);
    expect(hashtagTail).toMatch(/const hashtagGapEnterCount = getHashtagGapEnterCount\(linkCardInsertedBeforeHashtags\)/);
    expect(hashtagTail).toMatch(/ensureTailTypingReady/);
    expect(hashtagTail).toMatch(/POST_TAIL_INCOMPLETE/);
    expect(hashtagTail).not.toMatch(/keyboard\.press\('End'\)[\s\S]{0,400}applyHashtagsInBody/);
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
