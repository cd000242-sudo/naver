import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  attachMainProcessBeforePublishCommit,
  beginMainProcessEditorCommitCandidate,
  bindMainProcessEditorCommitCandidate,
  bindMainProcessEditorVisibleSnapshot,
  invokeMainProcessBeforePublishCommit,
  recordMainProcessEditorCommitSemantic,
} from '../automation/publishCommitHook.js';

const root = path.resolve(__dirname, '..');
const automationSource = fs.readFileSync(path.join(root, 'naverBlogAutomation.ts'), 'utf8');
const publishHelpersSource = fs.readFileSync(
  path.join(root, 'automation', 'publishHelpers.ts'),
  'utf8',
);
const editorHelpersSource = fs.readFileSync(
  path.join(root, 'automation', 'editorHelpers.ts'),
  'utf8',
);
const ctaHelpersSource = fs.readFileSync(
  path.join(root, 'automation', 'ctaHelpers.ts'),
  'utf8',
);
const blogExecutorSource = fs.readFileSync(
  path.join(root, 'main', 'services', 'BlogExecutor.ts'),
  'utf8',
);

function methodBlock(start: string, end: string): string {
  const startIndex = automationSource.indexOf(start);
  const endIndex = automationSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return automationSource.slice(startIndex, endIndex);
}

describe('Content Quality V3 main-only publish commit hook', () => {
  it('keeps the hook outside serializable run options and invokes it exactly once', async () => {
    const options = { title: 'title', content: 'body' };
    const resolved = { skipImages: true };
    const hook = vi.fn(async () => undefined);

    attachMainProcessBeforePublishCommit(options, hook);
    beginMainProcessEditorCommitCandidate(options, resolved, { structured: false });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'title', text: 'title' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'body-source', text: 'body' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'hashtags', values: [] });
    bindMainProcessEditorCommitCandidate(options, resolved);

    expect(Object.keys(options)).toEqual(['title', 'content']);
    expect(JSON.stringify(options)).toBe('{"title":"title","content":"body"}');
    await expect(invokeMainProcessBeforePublishCommit(options)).resolves.toBeUndefined();
    await expect(invokeMainProcessBeforePublishCommit(options))
      .rejects.toThrow('[content-quality-v3-publish-commit] hook_replayed');
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook.mock.calls[0][0]).toMatchObject({
      validatedArticle: {
        title: 'title',
        bodyPlain: 'body',
        introduction: '',
        headings: [],
        conclusion: '',
        hashtags: [],
      },
      userSupplements: [],
      deterministicAdornments: [],
    });
    expect(Object.isFrozen(hook.mock.calls[0][0])).toBe(true);
    expect(Object.isFrozen(hook.mock.calls[0][0].validatedArticle)).toBe(true);
  });

  it('does nothing for legacy options that have no trusted main-side hook', async () => {
    await expect(invokeMainProcessBeforePublishCommit({ title: 'legacy' }))
      .resolves.toBeUndefined();
  });

  it('rejects a concurrent second invocation while the first hook is still running', async () => {
    const options = { title: 'title', content: 'body' };
    const resolved = {};
    let releaseHook: (() => void) | undefined;
    const hook = vi.fn(() => new Promise<void>((resolve) => {
      releaseHook = resolve;
    }));
    attachMainProcessBeforePublishCommit(options, hook);
    beginMainProcessEditorCommitCandidate(options, resolved, { structured: false });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'title', text: 'title' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'body-source', text: 'body' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'hashtags', values: [] });
    bindMainProcessEditorCommitCandidate(options, resolved);

    const first = invokeMainProcessBeforePublishCommit(options);
    await expect(invokeMainProcessBeforePublishCommit(options))
      .rejects.toThrow('[content-quality-v3-publish-commit] hook_replayed');
    expect(hook).toHaveBeenCalledTimes(1);
    releaseHook?.();
    await expect(first).resolves.toBeUndefined();
  });

  it('deep-freezes the writer semantic ledger and rejects cleanup/reassignment after bind', async () => {
    const options = { title: 'renderer-safe', content: 'renderer-safe-body' };
    const resolved = {};
    const hook = vi.fn(async () => undefined);
    attachMainProcessBeforePublishCommit(options, hook);
    beginMainProcessEditorCommitCandidate(options, resolved, { structured: true });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'title', text: 'actual title' });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'body-source',
      text: 'actual narrative',
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'introduction',
      text: 'actual introduction',
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'heading-title',
      index: 0,
      text: 'actual heading',
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'heading-body',
      index: 0,
      text: 'actual local cleanBody',
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'conclusion',
      text: 'actual conclusion',
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'hashtags',
      values: ['actual-tag'],
    });
    recordMainProcessEditorCommitSemantic(resolved, {
      kind: 'user-supplement',
      supplementKind: 'cta',
      text: 'actual CTA claim',
    });
    bindMainProcessEditorCommitCandidate(options, resolved, {
      status: 'success',
      generationTime: '1s',
      selectedTitle: 'stale title',
      bodyPlain: 'stale body',
      content: 'stale body',
      titleAlternatives: [],
      titleCandidates: [],
      bodyHtml: 'stale body',
      headings: [{ title: '1. actual heading', content: '' }],
      hashtags: [],
      images: [],
      metadata: {},
      quality: {},
    });

    await expect(Promise.resolve().then(() => recordMainProcessEditorCommitSemantic(
      resolved,
      { kind: 'body-source', text: 'UNSAFE reassignment after bind' },
    ))).rejects.toThrow('[content-quality-v3-publish-commit] candidate_reassigned');
    await expect(Promise.resolve().then(() => bindMainProcessEditorCommitCandidate(
      options,
      resolved,
    ))).rejects.toThrow('[content-quality-v3-publish-commit] candidate_reassigned');

    await invokeMainProcessBeforePublishCommit(options);
    expect(hook.mock.calls[0][0]).toMatchObject({
      validatedArticle: {
        title: 'actual title',
        bodyPlain: 'actual narrative',
        introduction: 'actual introduction',
        headings: [{ title: 'actual heading', content: 'actual local cleanBody' }],
        conclusion: 'actual conclusion',
        hashtags: ['actual-tag'],
      },
      sourceHeadingTitles: ['1. actual heading'],
      userSupplements: [{ kind: 'cta', text: 'actual CTA claim' }],
    });
  });

  it('fails closed when an attached hook reaches commit without a bound writer candidate', async () => {
    const options = { title: 'title', content: 'body' };
    attachMainProcessBeforePublishCommit(options, async () => undefined);

    await expect(invokeMainProcessBeforePublishCommit(options))
      .rejects.toThrow('[content-quality-v3-publish-commit] candidate_missing');
  });

  it('fails closed when a V3 commit reaches the final click without a fresh visible-editor snapshot', async () => {
    const options = { title: 'title', content: 'body' };
    const resolved = { skipImages: true };
    const hook = vi.fn(async () => undefined);

    attachMainProcessBeforePublishCommit(options, hook, { requiresVisibleSnapshot: true });
    beginMainProcessEditorCommitCandidate(options, resolved, { structured: false });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'title', text: 'title' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'body-source', text: 'body' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'hashtags', values: [] });
    bindMainProcessEditorCommitCandidate(options, resolved);

    await expect(invokeMainProcessBeforePublishCommit(options))
      .rejects.toThrow('[content-quality-v3-publish-commit] visible_snapshot_missing');
    expect(hook).not.toHaveBeenCalled();
  });

  it('copies and deep-freezes the fresh visible snapshot before invoking the trusted hook', async () => {
    const options = { title: 'title', content: 'body' };
    const resolved = { skipImages: true };
    const hook = vi.fn(async () => undefined);
    const snapshot = {
      title: 'title',
      bodyText: 'body',
      linkCards: [] as Array<{ text: string; urls: string[]; transformed: boolean }>,
      bareUrls: [] as string[],
      externalAnchorUrls: [] as string[],
      opaqueVisualCount: 0,
    };
    attachMainProcessBeforePublishCommit(options, hook, { requiresVisibleSnapshot: true });
    beginMainProcessEditorCommitCandidate(options, resolved, { structured: false });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'title', text: 'title' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'body-source', text: 'body' });
    recordMainProcessEditorCommitSemantic(resolved, { kind: 'hashtags', values: [] });
    bindMainProcessEditorCommitCandidate(options, resolved);
    bindMainProcessEditorVisibleSnapshot(options, snapshot);
    snapshot.bodyText = 'mutated after bind';

    await invokeMainProcessBeforePublishCommit(options);
    const candidate = hook.mock.calls[0][0];
    expect(candidate.visibleSnapshot?.bodyText).toBe('body');
    expect(Object.isFrozen(candidate.visibleSnapshot)).toBe(true);
    expect(Object.isFrozen(candidate.visibleSnapshot?.linkCards)).toBe(true);
  });

  it.each([
    { customBannerPath: 'C:/opaque/custom-banner.png' },
    { useAiBanner: true },
    { autoBannerGenerate: true },
    { images: [{ filePath: 'C:/opaque/editor-image.png' }] },
    { collectedImages: [{ filePath: 'C:/opaque/collected-image.png' }] },
    { thumbnailPath: 'C:/opaque/thumbnail.png' },
    { useAiTableImage: true },
    {
      contentMode: 'affiliate',
      affiliateLink: 'https://example.test/product',
      skipImages: false,
    },
    { contentMode: 'affiliate', skipImages: true, skipCta: true },
    {
      contentMode: 'seo',
      affiliateLink: 'https://example.test/product',
      skipCta: true,
      skipImages: false,
      images: [],
    },
    {
      contentMode: 'business',
      businessInfo: { name: '텍스트만 업체' },
      skipImages: false,
      images: [],
    },
  ])('blocks unattested V3 raster input before any writer can insert it: %o', opaqueRaster => {
    const options = { title: 'title', content: 'body' };
    const resolved = { skipImages: true, ...opaqueRaster };

    attachMainProcessBeforePublishCommit(options, async () => undefined, {
      requiresVisibleSnapshot: true,
    });

    expect(() => beginMainProcessEditorCommitCandidate(
      options,
      resolved,
      { structured: false },
    )).toThrow('[content-quality-v3-publish-commit] opaque_raster_not_allowed');
  });

  it('requires skipImages=true for every strict V3 writer, closing unknown raster producers', () => {
    const options = { title: 'title', content: 'body' };
    attachMainProcessBeforePublishCommit(options, async () => undefined, {
      requiresVisibleSnapshot: true,
    });

    expect(() => beginMainProcessEditorCommitCandidate(
      options,
      { contentMode: 'seo', images: [] },
      { structured: false },
    )).toThrow('[content-quality-v3-publish-commit] opaque_raster_not_allowed');
  });

  it('allows only a text-only V3 writer until a raster producer attestation exists', () => {
    const options = { title: 'title', content: 'body' };
    const resolved = {
      customBannerPath: '',
      useAiBanner: false,
      autoBannerGenerate: false,
      images: [],
      collectedImages: [],
      thumbnailPath: '',
      skipImages: true,
      skipCta: true,
    };

    attachMainProcessBeforePublishCommit(options, async () => undefined, {
      requiresVisibleSnapshot: true,
    });

    expect(() => beginMainProcessEditorCommitCandidate(
      options,
      resolved,
      { structured: false },
    )).not.toThrow();
  });

  it.each([
    { ctas: [{ text: '상세 보기', link: 'https://example.test/cta' }], skipCta: false },
    { ctaLink: 'https://example.test/cta', skipCta: false },
  ])('blocks V3 external cards whose remote thumbnail pixels have no attestation: %o', surface => {
    const options = { title: 'title', content: 'body' };
    const resolved = { skipImages: true, ...surface };
    attachMainProcessBeforePublishCommit(options, async () => undefined, {
      requiresVisibleSnapshot: true,
    });

    expect(() => beginMainProcessEditorCommitCandidate(
      options,
      resolved,
      { structured: false },
    )).toThrow('[content-quality-v3-publish-commit] unsupported_external_surface');
  });

  it('blocks the unsupported previous-post auto-tail before its social-proof hook is typed', () => {
    const options = { title: 'title', content: 'body' };
    const resolved = {
      skipImages: true,
      previousPostUrl: 'https://example.test/previous',
    };
    attachMainProcessBeforePublishCommit(options, async () => undefined, {
      requiresVisibleSnapshot: true,
    });

    expect(() => beginMainProcessEditorCommitCandidate(
      options,
      resolved,
      { structured: false },
    )).toThrow('[content-quality-v3-publish-commit] unsupported_auto_tail');
  });

  it('passes the trusted run-options identity into publishBlogPost from both editor paths', () => {
    const runPostOnly = methodBlock(
      'async runPostOnly(runOptions: RunOptions = {}, keepBrowserOpen: boolean = true)',
      'async closeBrowser()',
    );
    const run = methodBlock(
      'async run(runOptions: RunOptions = {})',
      'private async verifyImmediatePublishOutcome(',
    );

    for (const source of [runPostOnly, run]) {
      const editorIndex = source.lastIndexOf('this.applyStructuredContent(resolvedOptions)');
      const publishIndex = source.indexOf(
        'await this.publishBlogPost(\n          resolvedOptions.publishMode,\n          resolvedOptions.scheduleDate,\n          resolvedOptions.scheduleMethod,\n          runOptions,\n        )',
      );
      expect(editorIndex).toBeGreaterThanOrEqual(0);
      expect(publishIndex).toBeGreaterThan(editorIndex);
      expect(source).toMatch(
        /bindMainProcessEditorCommitCandidate\(\s*runOptions,\s*resolvedOptions,/,
      );
      expect(source).not.toContain('invokeMainProcessBeforePublishCommit(runOptions)');
    }
  });

  it('records every user-controlled writer surface and keeps enhanced CTA input text non-visible', () => {
    const structuredWriter = editorHelpersSource.slice(
      editorHelpersSource.indexOf('export async function applyStructuredContent('),
    );
    expect(structuredWriter).toMatch(
      /inputTitle\(resolved\.title\);[\s\S]*?kind: 'title'/,
    );
    expect(structuredWriter).toMatch(
      /const appliedIntroduction = await self\.typeBodyWithRetry\([\s\S]*?structured\.introduction\.trim\(\)[\s\S]*?kind: 'introduction'[\s\S]*?text: appliedIntroduction/,
    );
    expect(structuredWriter).toMatch(
      /const appliedHeadingTitle = await self\.typeSubtitleWithRetry\([\s\S]*?kind: 'heading-title'[\s\S]*?text: appliedHeadingTitle/,
    );
    expect(structuredWriter).toMatch(
      /appliedHeadingBody = await self\.typeBodyWithRetry\(bodyFrame, page, cleanBody, 19\);[\s\S]*?kind: 'heading-body'[\s\S]*?text: appliedHeadingBody/,
    );
    expect(structuredWriter).toMatch(
      /appliedHeadingBody = await self\.typeBodyWithRetry\(cFrame, page, cBody, 19\);[\s\S]*?kind: 'heading-body'[\s\S]*?text: appliedHeadingBody/,
    );
    expect(structuredWriter).toMatch(
      /appliedConclusion = await self\.typeBodyWithRetry\([\s\S]*?structured\.conclusion\.trim\(\)[\s\S]*?kind: 'conclusion'[\s\S]*?text: appliedConclusion/,
    );
    expect(editorHelpersSource).toContain("supplementKind: 'custom-ftc'");
    expect(structuredWriter.match(/recordAppliedFtcDisclosure\(resolved,/g)).toHaveLength(2);
    expect(structuredWriter.match(/supplementKind: 'cta'/g)?.length).toBeGreaterThanOrEqual(3);
    const hashtagApplyIndex = structuredWriter.lastIndexOf('await applyTailHashtagsAfterCards({');
    const hashtagRecordIndex = structuredWriter.lastIndexOf("kind: 'hashtags'");
    expect(hashtagApplyIndex).toBeGreaterThanOrEqual(0);
    expect(hashtagRecordIndex).toBeGreaterThan(hashtagApplyIndex);

    const enhancedStart = ctaHelpersSource.indexOf('export async function insertEnhancedCta(');
    const enhancedEnd = ctaHelpersSource.indexOf(
      'export async function insertCtaLink(',
      enhancedStart,
    );
    const enhanced = ctaHelpersSource.slice(enhancedStart, enhancedEnd);
    expect(enhanced.match(/\bhookText\b/g)).toHaveLength(2);
    expect(enhanced).not.toMatch(/safeKeyboardType\([^\n]*hookText/);
    expect(enhanced).toContain('const ctaHook = pickCtaHook();');
  });

  it('suppresses dynamic official-site auto-tail insertion only for strict V3 writers', () => {
    const structuredWriter = editorHelpersSource.slice(
      editorHelpersSource.indexOf('export async function applyStructuredContent('),
    );
    expect(structuredWriter).toContain(
      'const strictEditorCommit = isMainProcessEditorCommitStrict(resolved);',
    );
    expect(structuredWriter.match(/strictEditorCommit\s*\?\s*NO_TAIL_LINK_RESULT/g))
      .toHaveLength(2);
  });

  it('keeps text-only V3 verification as an explicit strict opt-in and defaults customer publishing to advisory mode', () => {
    const cycleStart = blogExecutorSource.indexOf('export async function runFullPostCycle(');
    const cycle = blogExecutorSource.slice(cycleStart);
    const guardIndex = cycle.indexOf('assertMainProcessEditorCommitTextOnly(effectivePayload);');
    const browserIndex = cycle.indexOf('getOrCreateBrowserSession(account)');
    const imageIndex = cycle.indexOf('processImages(effectivePayload)');

    expect(cycleStart).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(browserIndex).toBeGreaterThan(guardIndex);
    expect(imageIndex).toBeGreaterThan(guardIndex);
    expect(blogExecutorSource).toContain('skipImages: payload.skipImages,');
    expect(cycle).toContain('resolveContentQualityV3ProductionPublishSafetyMode(process.env)');
    expect(cycle).toContain('stripContentQualityV3PublishMetadata(effectivePayload)');
    expect(cycle).toContain('콘텐츠 안전·품질 V3 검증 경고: 글·이미지는 유지하고 발행을 계속합니다.');
    expect(cycle.match(/hasContentQualityV3ProvenanceSignal\(effectivePayload\)/g))
      .toHaveLength(3);
    expect(cycle).toContain(
      "const requiredMarker = contentQualityV3SafetyMode === 'strict' && acceptedV3Provenance;",
    );
    expect(cycle).not.toMatch(
      /const requiredMarker = effectivePayload\._contentQualityV3Required/,
    );
    expect(cycle).toMatch(
      /if \(contentQualityV3SafetyMode === 'strict'\) \{[\s\S]*?if \(requiredMarker && effectivePayload\.publishMode !== 'draft'\) \{[\s\S]*?assertMainProcessEditorCommitTextOnly\(effectivePayload\);/,
    );
  });

  it('keeps every mode-specific consume immediately before its irreversible final click', () => {
    const publishBlogPost = methodBlock(
      'async publishBlogPost(',
      'private async applyPlainContent(',
    );
    const commitClosure = publishBlogPost.slice(
      publishBlogPost.indexOf('const beforeIrreversibleCommit = async'),
      publishBlogPost.indexOf('// ✅ [2026-02-07 FIX]'),
    );
    const prePublishBlockIndex = publishBlogPost.indexOf('PRE_PUBLISH_BLOCKED:');
    const imagePreparationIndex = publishBlogPost.indexOf(
      'applyDocumentWidthToAllImagesBeforePublish(this, frame)',
    );
    const firstCommitIndex = publishBlogPost.indexOf('await beforeIrreversibleCommit();');

    expect(prePublishBlockIndex).toBeGreaterThanOrEqual(0);
    expect(imagePreparationIndex).toBeGreaterThan(prePublishBlockIndex);
    expect(firstCommitIndex).toBeGreaterThan(imagePreparationIndex);
    expect(commitClosure.match(/collectEditorVisibleSnapshot\(/g)).toHaveLength(2);
    expect(commitClosure).toMatch(
      /bindMainProcessEditorVisibleSnapshot\(runOptions, validatedSnapshot\);[\s\S]*?invokeMainProcessBeforePublishCommit\(runOptions\);[\s\S]*?assertEditorVisibleSnapshotUnchanged\(validatedSnapshot, finalSnapshot\);/,
    );
    expect(publishBlogPost.match(/await beforeIrreversibleCommit\(\);/g)).toHaveLength(3);
    expect(publishBlogPost).not.toMatch(
      /await beforeIrreversibleCommit\(\);\s*await saveButton\.click\(\)/,
    );
    expect(publishBlogPost.match(
      /await beforeIrreversibleCommit\(\);\s*this\.immediatePublishCommitAttempted = true;\s*await confirmPublishButton\.click\(\)/g,
    )).toHaveLength(3);
    expect(publishBlogPost).toContain(
      'await this.publishScheduled(scheduleDate, beforeIrreversibleCommit);',
    );

    const scheduled = publishHelpersSource.slice(
      publishHelpersSource.indexOf('export async function publishScheduled('),
    );
    const scheduledCommitIndex = scheduled.indexOf('await beforeIrreversibleCommit?.();');
    const missingButtonIndex = scheduled.lastIndexOf(
      'if (!confirmButton) {',
      scheduledCommitIndex,
    );
    const scheduledClickIndex = scheduled.indexOf('await confirmButton.click();');
    expect(missingButtonIndex).toBeGreaterThanOrEqual(0);
    expect(scheduledCommitIndex).toBeGreaterThan(missingButtonIndex);
    expect(scheduledClickIndex).toBeGreaterThan(scheduledCommitIndex);
    expect(scheduled.slice(scheduledCommitIndex, scheduledClickIndex).trim())
      .toMatch(/^await beforeIrreversibleCommit\?\.\(\);\s*confirmationAttempted = true;$/);
  });
});
