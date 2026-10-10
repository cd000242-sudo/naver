// [2026-10-10] 카테고리 2단계(블로그 화면 읽기) 크롬 실행 옵션 — 앱의 크롬·엣지 경로 찾기를 쓰는지 확인한다.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveCategoryBrowserLaunch } from '../main/blogCategoryBrowser';

describe('resolveCategoryBrowserLaunch', () => {
  it('앱이 찾은 크롬·엣지 경로로 숨긴 창을 띄운다', async () => {
    const find = vi.fn(async () => 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
    const options = await resolveCategoryBrowserLaunch(find);
    expect(find).toHaveBeenCalledTimes(1);
    expect(options).toEqual({
      headless: true,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    });
  });

  it('찾은 크롬이 없으면 null — 퍼피티어 기본값(개발용 캐시)으로 띄우지 않는다', async () => {
    expect(await resolveCategoryBrowserLaunch(async () => undefined)).toBeNull();
    expect(await resolveCategoryBrowserLaunch(async () => '   ')).toBeNull();
  });

  it('main 의 카테고리 2단계가 이 옵션으로 띄운다(경로 없는 launch 금지)', () => {
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    const start = main.indexOf('async function fetchLdbBlogCategories');
    const body = main.slice(start, main.indexOf('// ✅ 다중계정 동시발행', start));
    expect(body).toMatch(/resolveCategoryBrowserLaunch\(getChromiumExecutablePath\)/);
    expect(body).not.toMatch(/puppeteerWithStealth\.launch\(\{/);
  });
});
