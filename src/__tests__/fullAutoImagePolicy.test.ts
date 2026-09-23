/**
 * NAVER FULL AUTO — image strategy is its own setting, never the writing mode (spec §1, §2, §22, T22).
 */
import { describe, expect, it } from 'vitest';
import {
  FULL_AUTO_DEFAULT_IMAGE_STRATEGY,
  describeFullAutoImagePolicy,
  fullAutoDirectorTextMode,
  fullAutoScopeToHeadingImageMode,
  parseFullAutoHeadingScope,
  resolveFullAutoImagePolicy,
} from '../image/fullAuto/fullAutoImagePolicy';
import { resolveFullAutoImagePolicyFromPipeline, resolvePipelineConfig, type PipelineConfig } from '../renderer/modules/pipelineConfig';

function pipeline(image: Partial<PipelineConfig['image']> = {}): PipelineConfig {
  return {
    flow: 'full-auto',
    resolvedAt: 0,
    image: {
      headingImageMode: 'all',
      thumbnailTextInclude: false,
      textOnlyPublish: false,
      imageSource: 'nano-banana-2',
      imageModel: '',
      imageStyle: 'realistic',
      imageRatio: '16:9',
      thumbnailImageRatio: '16:9',
      subheadingImageRatio: '16:9',
      fallbackPolicy: 'engine-only',
      fullAutoImageStrategy: 'naver-homefeed',
      fullAutoRealAssetFirst: true,
      fullAutoRealPair: true,
      ...image,
    },
    shopping: { subImageMode: 'collected', aiImageEngine: 'nano-banana-2', aiImageModel: '', autoThumbnail: false },
    disclosure: { enabledSetting: null, text: '', defaultText: '' },
    safety: { adbIpChangeEnabled: false, adbIpChangeEvery: 1 },
  };
}

describe('FULL AUTO image strategy', () => {
  it('defaults to the Naver homefeed strategy: 800x800, thumbnail + every H2, AUTO text, real assets first', () => {
    const policy = resolveFullAutoImagePolicy();
    expect(FULL_AUTO_DEFAULT_IMAGE_STRATEGY).toBe('naver-homefeed');
    expect(policy.strategy).toBe('naver-homefeed');
    expect(policy.imagesEnabled).toBe(true);
    expect(policy.thumbnail).toEqual({ enabled: true, ratio: '1:1', textMode: 'auto' });
    expect(policy.sections).toEqual({ scope: 'all', headingImageMode: 'all', ratio: '1:1' });
    expect(policy.squareSize).toBe(800);
    expect(policy.realAssetFirst).toBe(true);
    expect(policy.realPair).toBe(true);
  });

  it('T22: the writing mode is not an input — an SEO post and a homefeed post get the same homefeed images', () => {
    // resolveFullAutoImagePolicy has no contentMode parameter; the pipeline adapter ignores it too.
    const seoRun = resolveFullAutoImagePolicyFromPipeline(pipeline(), {});
    const homefeedRun = resolveFullAutoImagePolicyFromPipeline(pipeline(), {});
    expect(seoRun).toEqual(homefeedRun);
    expect(seoRun.strategy).toBe('naver-homefeed');
    // Old 16:9 ratios in the settings do not leak into the homefeed strategy.
    expect(seoRun.thumbnail.ratio).toBe('1:1');
    expect(seoRun.sections.ratio).toBe('1:1');
  });

  it('only an explicit strategy change uses the user image settings (ratios, legacy checkbox)', () => {
    const custom = resolveFullAutoImagePolicyFromPipeline(pipeline({ fullAutoImageStrategy: 'user-settings', thumbnailTextInclude: true }));
    expect(custom.strategy).toBe('user-settings');
    expect(custom.squareSize).toBeNull();
    expect(custom.thumbnail.ratio).toBe('16:9');
    expect(custom.sections.ratio).toBe('16:9');
    expect(custom.thumbnail.textMode).toBe('include');
    const noText = resolveFullAutoImagePolicy({ strategy: 'user-settings', thumbnailTextInclude: false });
    expect(noText.thumbnail.textMode).toBe('none');
  });

  it('T13-T16: heading scope ALL / ODD / EVEN / NONE maps to the app vocabulary, NONE keeps the thumbnail', () => {
    expect(parseFullAutoHeadingScope('all')).toBe('all');
    expect(parseFullAutoHeadingScope('odd-only')).toBe('odd');
    expect(parseFullAutoHeadingScope('even')).toBe('even');
    expect(parseFullAutoHeadingScope('thumbnail-only')).toBe('none');
    expect(parseFullAutoHeadingScope('none')).toBe('none');
    expect(parseFullAutoHeadingScope('weird')).toBeNull();
    expect(fullAutoScopeToHeadingImageMode('odd')).toBe('odd-only');
    expect(fullAutoScopeToHeadingImageMode('even')).toBe('even-only');
    expect(fullAutoScopeToHeadingImageMode('none')).toBe('thumbnail-only');
    const none = resolveFullAutoImagePolicy({ headingScope: 'none' });
    expect(none.imagesEnabled).toBe(true);
    expect(none.thumbnail.enabled).toBe(true);
    expect(none.sections.headingImageMode).toBe('thumbnail-only');
  });

  it('the image settings window decides the H2 scope: a saved "홀수만" / "썸네일만" is followed, never widened', () => {
    expect(resolveFullAutoImagePolicyFromPipeline(pipeline({ headingImageMode: 'odd-only' })).sections.scope).toBe('odd');
    expect(resolveFullAutoImagePolicyFromPipeline(pipeline({ headingImageMode: 'even-only' })).sections.scope).toBe('even');
    expect(resolveFullAutoImagePolicyFromPipeline(pipeline({ headingImageMode: 'thumbnail-only' })).sections.scope).toBe('none');
    expect(resolveFullAutoImagePolicyFromPipeline(pipeline({ headingImageMode: 'all' })).sections.scope).toBe('all');
  });

  it('thumbnail text follows the "썸네일 텍스트 포함" checkbox: ticked = include, off = AUTO on homefeed', () => {
    expect(resolveFullAutoImagePolicyFromPipeline(pipeline({ thumbnailTextInclude: true })).thumbnail.textMode).toBe('include');
    expect(resolveFullAutoImagePolicyFromPipeline(pipeline({ thumbnailTextInclude: false })).thumbnail.textMode).toBe('auto');
    // The continuous run passes its own reading of the checkbox.
    expect(resolveFullAutoImagePolicyFromPipeline(pipeline(), { thumbnailTextInclude: true }).thumbnail.textMode).toBe('include');
  });

  it('a thumbnail text value saved by v2.11.299 no longer overrides the checkbox (that select is gone)', () => {
    const saved: Record<string, string> = { fullAutoThumbnailTextMode: 'none', thumbnailTextInclude: 'true' };
    (globalThis as any).localStorage = { getItem: (key: string) => (key in saved ? saved[key] : null) };
    try {
      expect(resolveFullAutoImagePolicyFromPipeline(resolvePipelineConfig('continuous')).thumbnail.textMode).toBe('include');
    } finally {
      delete (globalThis as any).localStorage;
    }
  });

  it('text-only publishing ("이미지 없음") turns images off entirely', () => {
    expect(resolveFullAutoImagePolicy({ textOnlyPublish: true }).imagesEnabled).toBe(false);
    expect(resolveFullAutoImagePolicy({ headingImageMode: 'none' }).imagesEnabled).toBe(false);
    expect(resolveFullAutoImagePolicy({ skipImages: true }).imagesEnabled).toBe(false);
    expect(describeFullAutoImagePolicy(resolveFullAutoImagePolicy({ textOnlyPublish: true }))).toContain('이미지 없음');
  });

  it('thumbnail text: explicit mode wins, the legacy checkbox only counts when ticked, AUTO otherwise', () => {
    expect(resolveFullAutoImagePolicy({ thumbnailTextMode: 'none', thumbnailTextInclude: true }).thumbnail.textMode).toBe('none');
    expect(resolveFullAutoImagePolicy({ thumbnailTextInclude: true }).thumbnail.textMode).toBe('include');
    expect(resolveFullAutoImagePolicy({ thumbnailTextInclude: false }).thumbnail.textMode).toBe('auto');
    expect(fullAutoDirectorTextMode(resolveFullAutoImagePolicy({ thumbnailTextMode: 'none' }))).toBe('exclude');
    expect(fullAutoDirectorTextMode(resolveFullAutoImagePolicy())).toBe('auto');
  });

  it('real photo options can be switched off', () => {
    const policy = resolveFullAutoImagePolicyFromPipeline(pipeline({ fullAutoRealAssetFirst: false, fullAutoRealPair: false }));
    expect(policy.realAssetFirst).toBe(false);
    expect(policy.realPair).toBe(false);
  });

  it('describes the policy in one Korean line for the publish panel and the queue', () => {
    expect(describeFullAutoImagePolicy(resolveFullAutoImagePolicy())).toBe('홈판/피드 최적화 · 썸네일 1 + 소제목 전체 · 800x800 · 썸네일 문구 AUTO');
    expect(describeFullAutoImagePolicy(resolveFullAutoImagePolicy({ headingScope: 'none' }))).toContain('소제목 이미지 없음');
  });
});
