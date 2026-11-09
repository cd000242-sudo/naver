import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncImageTabFromFullAuto } from '../renderer/modules/fullAutoFlow';

// 2026-11-10: a full-auto run that is stopped midway left the image management tab empty even though the
// thumbnail already existed. executeFullAutoFlow registered images in ImageManager only; nothing in that
// flow built the tab's heading cards (autoAnalyzeHeadings) or painted images into them
// (updatePromptItemsWithImages, which also injects the thumbnail card) — the semi-auto flow and
// generateImagesForContent did, the main full-auto flow did not.

const content = { selectedTitle: '제목', introduction: '도입부', headings: [{ title: '소제목 1' }, { title: '소제목 2' }] };
const thumbnail = { heading: '🖼️ 썸네일', isThumbnail: true, filePath: 'C:\\img\\thumb.png' };

function stubTab(images: any[]) {
  const calls: string[] = [];
  vi.stubGlobal('ImageManager', { getAllImages: () => images });
  vi.stubGlobal('autoAnalyzeHeadings', vi.fn(async () => { calls.push('analyze'); }));
  vi.stubGlobal('displayGeneratedImages', vi.fn(() => { calls.push('grid'); }));
  vi.stubGlobal('updatePromptItemsWithImages', vi.fn(() => { calls.push('cards'); }));
  return calls;
}

describe('syncImageTabFromFullAuto', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('builds the heading cards first, then paints the registered images into them', () => {
    const calls = stubTab([thumbnail]);
    syncImageTabFromFullAuto(content, { rebuildCards: true });
    expect((globalThis as any).autoAnalyzeHeadings).toHaveBeenCalledWith(content, { localOnly: true });
    expect(calls).toEqual(['analyze', 'grid', 'cards']);
    expect((globalThis as any).updatePromptItemsWithImages).toHaveBeenCalledWith([thumbnail]);
  });

  it('only repaints when the cards already exist', () => {
    const calls = stubTab([thumbnail]);
    syncImageTabFromFullAuto(content);
    expect(calls).toEqual(['grid', 'cards']);
  });

  it('leaves the tab alone when there is nothing to paint', () => {
    const calls = stubTab([]);
    syncImageTabFromFullAuto(content);
    expect(calls).toEqual([]);
  });

  it('never throws — a stop or publish path must not fail because the tab could not be refreshed', () => {
    stubTab([thumbnail]);
    vi.stubGlobal('updatePromptItemsWithImages', () => { throw new Error('tab missing'); });
    vi.stubGlobal('autoAnalyzeHeadings', () => { throw new Error('analysis failed'); });
    expect(() => syncImageTabFromFullAuto(content, { rebuildCards: true })).not.toThrow();
    expect(() => syncImageTabFromFullAuto(null)).not.toThrow();
  });
});

describe('executeFullAutoFlow wiring', () => {
  const source = readFileSync('src/renderer/modules/fullAutoFlow.ts', 'utf8');
  const flow = source.slice(source.indexOf('async function executeFullAutoFlow('), source.indexOf('async function executeSemiAutoFlow('));

  it('builds the cards as soon as the article is shown, before any image is generated', () => {
    const built = flow.indexOf('syncImageTabFromFullAuto(structuredContent, { rebuildCards: true })');
    expect(built).toBeGreaterThan(flow.indexOf('await displayContentInAllTabs(structuredContent)'));
    expect(built).toBeLessThan(flow.indexOf('registerFullAutoThumbnailImage(thumbResult.images[0]'));
  });

  it('paints right after the thumbnail and after the body images are registered', () => {
    const thumb = flow.indexOf('registerFullAutoThumbnailImage(thumbResult.images[0]');
    expect(flow.indexOf('syncImageTabFromFullAuto(structuredContent);', thumb)).toBeGreaterThan(thumb);
    const body = flow.indexOf('ImageManager.syncGeneratedImagesArray?.();');
    expect(flow.indexOf('syncImageTabFromFullAuto(structuredContent);', body)).toBeGreaterThan(body);
  });

  it('flushes what exists into the tab when the run stops or fails', () => {
    const handler = flow.slice(flow.indexOf("console.error('[FullAutoFlow] 오류:', error);"));
    expect(handler.indexOf('syncImageTabFromFullAuto(window.currentStructuredContent)')).toBeGreaterThan(-1);
    expect(handler.indexOf('syncImageTabFromFullAuto(')).toBeLessThan(handler.indexOf('throw error;'));
  });
});
