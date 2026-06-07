import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getChromiumExecutablePath } from '../browserUtils';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const originalPlatform = process.platform;

function mockPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  mockPlatform(originalPlatform);
});

describe('mac URL generation speed policy', () => {
  it('resolves macOS Chrome paths before falling back to automation defaults', () => {
    const source = read('src/browserUtils.ts');

    expect(source).toContain("process.platform === 'darwin'");
    expect(source).toContain('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    expect(source).toContain("path.join(home, 'Library', 'Caches', 'puppeteer', 'chrome')");
    expect(source).toContain('chrome-mac-arm64');
    expect(source).toContain('chrome-mac-x64');
  });

  it('executes the macOS system Chrome resolver path on darwin', async () => {
    mockPlatform('darwin');
    vi.spyOn(os, 'homedir').mockReturnValue('/Users/tester');
    const expectedPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const existsSpy = vi.spyOn(fs, 'existsSync').mockImplementation((target) => String(target) === expectedPath);

    await expect(getChromiumExecutablePath()).resolves.toBe(expectedPath);
    expect(existsSpy).toHaveBeenCalledWith(expectedPath);
  });

  it('executes the macOS Puppeteer cache resolver path on darwin', async () => {
    mockPlatform('darwin');
    vi.spyOn(os, 'homedir').mockReturnValue('/Users/tester');
    const cacheRoot = path.join('/Users/tester', 'Library', 'Caches', 'puppeteer', 'chrome');
    const expectedPath = path.join(cacheRoot, 'mac-build', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');

    vi.spyOn(fs, 'existsSync').mockImplementation((target) => {
      const value = String(target);
      return value === cacheRoot || value === expectedPath;
    });
    vi.spyOn(fs, 'readdirSync').mockReturnValue(['mac-build'] as any);

    await expect(getChromiumExecutablePath()).resolves.toBe(expectedPath);
  });

  it('uses the Naver blog mobile PostView path before launching Playwright', () => {
    const source = read('src/naverBlogCrawler.ts');
    const fastPathIndex = source.indexOf('mobile PostView fast path start');
    const launchIndex = source.indexOf('chromium.launch');

    expect(fastPathIndex).toBeGreaterThanOrEqual(0);
    expect(launchIndex).toBeGreaterThanOrEqual(0);
    expect(fastPathIndex).toBeLessThan(launchIndex);
    expect(source).toContain('NAVER_BLOG_MOBILE_FIRST_TIMEOUT_MS = 12000');
    expect(source).toContain('timeout: NAVER_BLOG_PLAYWRIGHT_GOTO_TIMEOUT_MS');
    expect(source).toContain('headless: true');
  });

  it('requires rich Naver mobile PostView content before accepting the fast path', () => {
    const source = read('src/naverBlogCrawler.ts');

    expect(source).toContain('NAVER_BLOG_FAST_PATH_MIN_CHARS = 500');
    expect(source).toContain('NAVER_BLOG_FAST_PATH_MIN_PARAGRAPHS = 3');
    expect(source).toContain('async function parseNaverBlogMobileHtml');
    expect(source).toContain('assessNaverBlogCrawlQuality(parsed.content)');
    expect(source).toContain('mobile PostView rich crawl success');
    expect(source).toContain('clearTimeout(timeoutId);');
  });

  it('does not wait for network idle on the smart crawler article paths', () => {
    const source = read('src/crawler/smartCrawler.ts');

    expect(source).toContain("waitUntil: 'domcontentloaded'");
    expect(source).not.toContain("waitUntil: 'networkidle2'");
    expect(source).not.toContain("waitUntil: 'networkidle'");
  });

  it('caps URL article fetches so slow sites do not stall the whole generation step', () => {
    const source = read('src/sourceAssembler.ts');

    expect(source).toContain('function createTimeoutSignal');
    expect(source).toContain('signal: createTimeoutSignal(15000)');
    expect(source).toContain('signal: createTimeoutSignal(10000)');
    expect(source).toContain('timeout: 20000');
  });

  it('keeps URL source crawling deep enough for article generation', () => {
    const source = read('src/sourceAssembler.ts');

    expect(source).toContain('const MIN_URL_SOURCE_CHARS = 500');
    expect(source).toContain('function hasUsableSourceDepth');
    expect(source).toContain('hasUsableSourceDepth(blogResult.content)');
    expect(source).toContain('URL 본문 수집이 너무 얕습니다');
    expect(source).not.toContain('crawlResult.content.length > 50');
  });

  it('routes continuous and multi-account URL jobs through the shared source assembler path', () => {
    const continuous = read('src/renderer/modules/continuousPublishing.ts');
    const multiAccount = read('src/renderer/modules/multiAccountManager.ts');

    expect(continuous).toContain('generateContentFromUrl(combinedUrls');
    expect(continuous).toContain('generateContentFromUrl(item.value');
    expect(multiAccount).toContain('contentPayload.assembly.rssUrl = [queueItem.sourceUrl]');
    expect(multiAccount).toContain("apiClient.call('generateStructuredContent'");
  });
});
