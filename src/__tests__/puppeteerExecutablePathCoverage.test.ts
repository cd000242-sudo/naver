import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

function countMatches(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length || 0;
}

describe('puppeteer executable path coverage', () => {
  it('keeps sourceAssembler fallback launches on the managed Chrome resolver', () => {
    const source = read('sourceAssembler.ts');

    expect(source).not.toContain('puppeteer.default.launch({ headless: true })');
    expect(countMatches(
      source,
      /const executablePath = await getChromiumExecutablePath\(\);[\s\S]{0,450}puppeteer\.default\.launch\(\{[\s\S]{0,260}executablePath/g,
    )).toBeGreaterThanOrEqual(2);
  });

  it('keeps imageLibrary crawl launches on the managed Chrome resolver', () => {
    const source = read('imageLibrary.ts');
    const launchCount = countMatches(source, /puppeteer\.launch\(\{/g);
    const coveredLaunchCount = countMatches(
      source,
      /const executablePath = await getChromiumExecutablePath\(\);[\s\S]{0,350}puppeteer\.launch\(\{[\s\S]{0,220}executablePath/g,
    );

    expect(source).toContain("import { getChromiumExecutablePath } from './browserUtils.js';");
    expect(launchCount).toBeGreaterThan(0);
    expect(coveredLaunchCount).toBe(launchCount);
  });

  it('keeps product crawler fallback launches on the managed Chrome resolver', () => {
    const source = read('crawler/productSpecCrawler.ts');

    expect(source).toMatch(
      /const executablePath = await getChromiumExecutablePath\(\);[\s\S]{0,350}puppeteer\.default\.launch\(\{[\s\S]{0,220}executablePath/,
    );
  });

  it('keeps Naver image scraping on the managed Chrome resolver', () => {
    const source = read('image/naverImageGenerator.ts');

    expect(source).toContain("import { getChromiumExecutablePath } from '../browserUtils.js';");
    expect(source).toMatch(
      /const executablePath = await getChromiumExecutablePath\(\);[\s\S]{0,350}this\.puppeteer\.launch\(\{[\s\S]{0,220}executablePath/,
    );
  });
});
