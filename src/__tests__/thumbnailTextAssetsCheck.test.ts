// SPEC-NAVER-IMAGE-2026 — thumbnail text rules, real asset resolver, deterministic quality check.
import { describe, expect, it } from 'vitest';
import {
  THUMBNAIL_TEXT_MAX_CHARS,
  decideThumbnailText,
  deriveThumbnailText,
  isFullTitleCopy,
  normalizeThumbnailTextMode,
  resolveThumbnailOverlayText,
} from '../image/director/thumbnailText';
import { classifyImageAsset, isRealAssetPriorityTopic, resolveRealAssets } from '../image/director/realAssetResolver';
import { checkSectionPlan, checkThumbnailPlan } from '../image/director/imageQualityCheck';

const exists = (p: string) => !p.includes('missing');

describe('thumbnailText', () => {
  it('maps the stored setting to include / exclude / auto', () => {
    expect(normalizeThumbnailTextMode('true')).toBe('include');
    expect(normalizeThumbnailTextMode(false)).toBe('exclude');
    expect(normalizeThumbnailTextMode(null)).toBe('auto');
    expect(normalizeThumbnailTextMode('auto')).toBe('auto');
  });

  it('derives a short phrase: number → quote → first clause; short titles stay as they are', () => {
    expect(deriveThumbnailText('EV3 실구매가, 보조금 빼니 334만원 차이')).toBe('334만원 차이');
    expect(deriveThumbnailText("박서함 \"소희 양말도 신었어요\" 팬심 고백의 기억과 그날의 이야기")).toBe('소희 양말도 신었어요');
    expect(deriveThumbnailText('소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억')).toBe('소희 양말 신던 중학생이었다');
    expect(deriveThumbnailText('제주 봄 산책길')).toBe('제주 봄 산책길');
  });

  it('never copies a long title, and the overlay text always fits the card budget', () => {
    const titles = [
      '연말정산 미리보기로 13월의 월급 30만원 더 받는 방법',
      '겨울 이불 세탁법 세탁기로 해도 되는지 드라이클리닝해야 하는지 총정리',
      '소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억',
    ];
    for (const title of titles) {
      const text = resolveThumbnailOverlayText(title);
      expect(isFullTitleCopy(text, title)).toBe(false);
      expect(text.length).toBeLessThanOrEqual(THUMBNAIL_TEXT_MAX_CHARS);
    }
    expect(isFullTitleCopy('소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억', '소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억')).toBe(true);
  });

  it('AUTO: numbers and issue hooks get a short phrase; products and places without numbers do not', () => {
    const decide = (title: string, kind: any, realPhotoCover = false) => decideThumbnailText({ mode: 'auto', title, realPhotoCover, kind });
    expect(decide('청년월세 20만원 받는 법', 'info')).toMatchObject({ include: true });
    expect(decide('소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억', 'issue', true)).toMatchObject({ include: true, text: '소희 양말 신던 중학생이었다' });
    expect(decide('제주 유채꽃 축제, 주차와 셔틀버스 이용법 총정리', 'travel')).toMatchObject({ include: false });
    expect(decideThumbnailText({ mode: 'exclude', title: '청년월세 20만원 받는 법', realPhotoCover: false, kind: 'info' }).include).toBe(false);
  });
});

describe('realAssetResolver', () => {
  it('classifies user files, consented collections, web hits, AI images and URLs', () => {
    const c = (entry: any) => classifyImageAsset(entry, exists);
    expect(c({ filePath: 'C:/a.jpg', provider: 'local' })).toMatchObject({ assetClass: 'USER_ASSET', composable: true });
    expect(c({ filePath: 'C:/b.jpg', source: 'issue-endgame', isCollected: true })).toMatchObject({ assetClass: 'SOURCE_ASSET', composable: true });
    expect(c({ filePath: 'C:/c.jpg', provider: 'naver', source: 'auto-search' })).toMatchObject({ assetClass: 'REFERENCE_ONLY', composable: false });
    expect(c({ filePath: 'C:/d.png', provider: 'openai-image' })).toMatchObject({ assetClass: 'AI_ASSET', composable: false });
    expect(c({ filePath: 'https://news/x.jpg', provider: 'local' })).toMatchObject({ assetClass: 'REFERENCE_ONLY' });
    expect(c({ filePath: 'C:/missing.jpg', provider: 'local' })).toMatchObject({ composable: false });
    expect(c({ filePath: 'C:/t.png', provider: 'comparison-table' })).toMatchObject({ assetClass: 'INFOGRAPHIC' });
    expect(c({ filePath: 'C:/u.png', provider: 'mystery' })).toMatchObject({ assetClass: 'REFERENCE_ONLY' });
  });

  it('article URLs are always reference-only; composable keeps slot order, max 2', () => {
    const inventory = resolveRealAssets({
      placed: [{ filePath: 'C:/1.jpg', provider: 'local' }, { filePath: 'C:/2.jpg', provider: 'openai-image' }, { filePath: 'C:/3.jpg', provider: 'local-folder' }, { filePath: 'C:/4.jpg', provider: 'local' }],
      sourceUrls: ['https://news/a.jpg', 'https://news/b.jpg'],
    }, exists);
    expect(inventory.composable).toEqual(['C:/1.jpg', 'C:/3.jpg']);
    expect(inventory.counts).toMatchObject({ USER_ASSET: 3, AI_ASSET: 1, REFERENCE_ONLY: 2 });
  });

  it('real-photo-first topics', () => {
    expect(isRealAssetPriorityTopic('소희 양말 신던 중학생이었다…박서함 팬심 고백에 담긴 기억')).toBe(true);
    expect(isRealAssetPriorityTopic('셀토스 두 트림 실구매가 차이')).toBe(true);
    expect(isRealAssetPriorityTopic('제주 유채꽃 축제 주차 정보')).toBe(true);
    expect(isRealAssetPriorityTopic('청년월세 20만원 신청 자격')).toBe(false);
  });
});

describe('imageQualityCheck (metadata only, no model call)', () => {
  const ok = { title: '청년월세 20만원 받는 법', text: '20만원', width: 800, height: 800, realAssetPriority: false, realAssetAvailable: false, usedRealAsset: false, aiDepictsRealPerson: false };

  it('GOOD for a clean plan; FAIL for size, whole-title copy, ignored real photo, fake person', () => {
    expect(checkThumbnailPlan(ok).verdict).toBe('GOOD');
    expect(checkThumbnailPlan({ ...ok, width: 1280, height: 720 }).reasons.join()).toContain('800x800');
    expect(checkThumbnailPlan({ ...ok, text: ok.title }).reasons.join()).toContain('제목 전체');
    expect(checkThumbnailPlan({ ...ok, realAssetPriority: true, realAssetAvailable: true }).reasons.join()).toContain('실제 이미지가 있는데');
    expect(checkThumbnailPlan({ ...ok, aiDepictsRealPerson: true }).verdict).toBe('FAIL');
  });

  it('section sets: adjacent repeats and early repeats fail', () => {
    expect(checkSectionPlan(['scene', 'closeup', 'procedure']).verdict).toBe('GOOD');
    expect(checkSectionPlan(['scene', 'scene', 'procedure']).verdict).toBe('FAIL');
    expect(checkSectionPlan(['scene', 'closeup', 'scene']).verdict).toBe('FAIL');
  });
});
