// src/main/blogCategoryBrowser.ts
// [2026-10-10] 블로그 카테고리 2단계(블로그 화면 읽기)용 크롬 실행 옵션.
//   경로 없이 띄우면 퍼피티어가 개발용 캐시(~/.cache/puppeteer)만 찾아, 그 캐시가 없는 일반 사용자 PC 에선
//   2단계가 늘 실패했다(아버지 노트북 "카테고리 조회 실패"). 앱이 발행에 쓰는 크롬·엣지 경로 찾기를 그대로 쓴다.

export interface CategoryBrowserLaunchOptions {
  headless: true;
  executablePath: string;
  args: string[];
}

export async function resolveCategoryBrowserLaunch(
  findExecutablePath: () => Promise<string | undefined>,
): Promise<CategoryBrowserLaunchOptions | null> {
  const executablePath = String((await findExecutablePath()) || '').trim();
  if (!executablePath) return null;
  return { headless: true, executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] };
}
