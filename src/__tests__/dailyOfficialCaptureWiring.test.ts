import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('daily official capture handoff in the main publication boundary', () => {
  it('loads only private daily capture context after final headings and before AI or editor entry', () => {
    const source = readFileSync(resolve('src/main.ts'), 'utf8');
    const start = source.indexOf("if (dailyContext?.imageMode === 'official-capture')");
    expect(start).toBeGreaterThan(source.indexOf('let generatedImages = options?.generatedImages'));
    const block = source.slice(start, source.indexOf('if (!options?.skipImages', start));
    for (const field of ['jobId: dailyContext.jobId', 'accountId', 'blogId: account.blogId', 'categoryId:', 'captureCategory: dailyContext.captureCategory', 'sourceUrl: dailyContext.source.value', 'title:', 'fullAutoFinalHeadingTitles(structuredContent)']) expect(block).toContain(field);
    expect(block).toContain('ensureDailyOfficialCaptureBatch(');
    expect(block).toContain('signal: dailyContext.signal');
    expect(block).toContain('assertDailyPublishingImages(');
    expect(block).toContain('generatedThumbnailPath = captures.find(image => image.isThumbnail)?.filePath');
    expect(block).not.toContain('catch');
    expect(source.indexOf('AutomationService.executePostCycle(approvedPayload', start)).toBeGreaterThan(start);
  });
});
