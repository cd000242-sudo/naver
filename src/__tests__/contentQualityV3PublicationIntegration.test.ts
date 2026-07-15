import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');

function between(start: string, end: string): string {
  const startIndex = main.indexOf(start);
  const endIndex = main.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return main.slice(startIndex, endIndex);
}

describe('Content Quality V3 publication-boundary main wiring', () => {
  it('captures and enforces every Gemini-capable main generation flow', () => {
    expect(main.match(/beginContentQualityV3Publication\(/g) ?? []).toHaveLength(3);
    expect(main.match(/enforceContentQualityV3PublicationBoundary\(/g) ?? []).toHaveLength(3);

    const smartScheduler = between(
      'async function prepareSmartScheduledContent(',
      'smartScheduler.setPublishCallback(',
    );
    expect(smartScheduler).toMatch(/generateStructuredContentWithProductPolicy\([\s\S]*?beginContentQualityV3Publication\(generated\)/);
    expect(smartScheduler).toMatch(/enforceContentQualityV3PublicationBoundary\([\s\S]*?return \{/);

    const multiAccount = between(
      "ipcMain.handle('multiAccount:publish'",
      "'automation:generateStructuredContent'",
    );
    expect(multiAccount).toMatch(/generateStructuredContentWithProductPolicy\([\s\S]*?beginContentQualityV3Publication\(generated\)/);
    expect(multiAccount).toMatch(/enforceContentQualityV3PublicationBoundary\(\s*structuredContent,[\s\S]*?const payload = \{/);

    const primary = between(
      "'automation:generateStructuredContent'",
      'registerConfigHandlers({',
    );
    expect(primary).toMatch(/let content = await withRetry\([\s\S]*?beginContentQualityV3Publication\(content\)/);
    expect(primary).toMatch(/collectedImages[\s\S]*?enforceContentQualityV3PublicationBoundary\(\s*content,[\s\S]*?return \{ success: true, content, imageCount \}/);
  });

  it('keeps the auxiliary Gemini path on its dedicated legacy generator', () => {
    const auxiliary = between(
      "ipcMain.handle('automation:generateContent'",
      "ipcMain.handle('apiKey:validate'",
    );

    expect(auxiliary).toMatch(/if \(provider === 'gemini'\) \{[\s\S]*?generateBlogContent\(/);
    expect(auxiliary).toMatch(/else \{[\s\S]*?generateStructuredContentWithProductPolicy\(/);
    expect(auxiliary).not.toContain('beginContentQualityV3Publication(');
    expect(auxiliary).not.toContain('enforceContentQualityV3PublicationBoundary(');
  });

  it('does not let V3 enforcement change legacy object identity', () => {
    expect(main).toMatch(/enforceContentQualityV3PublicationBoundary\([^,]+,\s*[^)]+\)/);
  });
});
