/**
 * SessionPersistence - 브라우저 세션 쿠키 저장/복원 및 세션 관리
 *
 * 기능:
 * - 계정별 쿠키 파일 저장/복원 (만료된 쿠키 자동 필터링)
 * - 네이버 로그인 상태 검증 (에디터 페이지 접근 기반)
 * - 세션 워밍업 (봇 감지 우회를 위한 자연스러운 브라우징 패턴)
 * - 세션 수명 조회 및 삭제
 */

import { Page, CookieParam, Cookie } from 'puppeteer';
import { app } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as os from 'os';

// ─── 타입 정의 ───────────────────────────────────────────────

interface SessionCookieData {
  readonly cookies: readonly CookieParam[];
  readonly savedAt: string; // ISO timestamp
  readonly accountId: string;
}

// ─── 유틸리티 ────────────────────────────────────────────────

/**
 * 세션 저장 기본 디렉토리 반환
 * Electron app이 준비되어 있으면 userData 사용, 아니면 홈 디렉토리 폴백
 */
function getSessionBaseDir(): string {
  try {
    if (app && app.isReady()) {
      return path.join(app.getPath('userData'), 'sessions');
    }
  } catch {
    // app이 아직 준비되지 않은 경우 폴백
  }
  return path.join(os.homedir(), '.naver-blog-automation', 'sessions');
}

/**
 * 계정별 세션 디렉토리 경로
 */
function getAccountSessionDir(accountId: string): string {
  return path.join(getSessionBaseDir(), accountId);
}

/**
 * 쿠키 파일 경로
 */
function getCookieFilePath(accountId: string): string {
  return path.join(getAccountSessionDir(accountId), 'cookies.json');
}

/**
 * 쿠키가 만료되었는지 확인
 * expires가 -1이면 세션 쿠키 (만료 없음)
 * expires가 0이면 즉시 만료
 * expires가 현재 시각(초) 이전이면 만료
 */
function isCookieExpired(cookie: CookieParam): boolean {
  if (cookie.expires === undefined || cookie.expires === -1) {
    return false; // 세션 쿠키: 만료 없음
  }
  if (cookie.expires === 0) {
    return true; // 즉시 만료
  }
  const nowInSeconds = Date.now() / 1000;
  return cookie.expires < nowInSeconds;
}

/**
 * 만료되지 않은 쿠키만 필터링
 */
function filterValidCookies(
  cookies: readonly CookieParam[]
): readonly CookieParam[] {
  return cookies.filter((cookie) => !isCookieExpired(cookie));
}

/**
 * Cookie 객체 배열을 CookieParam 배열로 변환
 * page.cookies()가 반환하는 Cookie 타입을 setCookie()가 받는 CookieParam 타입으로 변환
 */
function cookiesToParams(cookies: readonly Cookie[]): CookieParam[] {
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite as CookieParam['sameSite'],
  }));
}

/**
 * 지정 범위 내 랜덤 정수 반환
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 지정 범위 내 랜덤 딜레이 (ms)
 */
function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const delay = randomInt(minMs, maxMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ─── 핵심 함수 ───────────────────────────────────────────────

/**
 * 쿠키를 파일에 저장
 * - page.cookies()로 현재 쿠키를 획득
 * - 만료된 쿠키 제외
 * - JSON으로 직렬화하여 계정별 디렉토리에 저장
 */
export async function saveCookies(
  page: Page,
  accountId: string
): Promise<void> {
  try {
    const rawCookies = await page.cookies();
    const cookieParams = cookiesToParams(rawCookies);
    const validCookies = filterValidCookies(cookieParams);

    const cookieData: SessionCookieData = {
      cookies: validCookies,
      savedAt: new Date().toISOString(),
      accountId,
    };

    const sessionDir = getAccountSessionDir(accountId);
    await fs.mkdir(sessionDir, { recursive: true });

    const filePath = getCookieFilePath(accountId);
    await fs.writeFile(filePath, JSON.stringify(cookieData, null, 2), 'utf-8');

    console.log(
      `[SessionPersistence] 쿠키 저장 완료: ${accountId.substring(0, 3)}*** (${validCookies.length}개)`
    );
  } catch (error) {
    console.error(
      `[SessionPersistence] 쿠키 저장 실패: ${(error as Error).message}`
    );
  }
}

/**
 * 저장된 쿠키를 페이지에 복원
 * - 쿠키 파일 로드
 * - 만료된 쿠키 필터링
 * - page.setCookie()로 복원
 * @returns 복원 성공 여부
 */
export async function restoreCookies(
  page: Page,
  accountId: string
): Promise<boolean> {
  try {
    const filePath = getCookieFilePath(accountId);
    const raw = await fs.readFile(filePath, 'utf-8');
    const cookieData: SessionCookieData = JSON.parse(raw);

    const validCookies = filterValidCookies(cookieData.cookies);

    if (validCookies.length === 0) {
      console.log(
        `[SessionPersistence] 유효한 쿠키 없음: ${accountId.substring(0, 3)}***`
      );
      return false;
    }

    // setCookie는 spread로 개별 인자를 받음
    await page.setCookie(...(validCookies as CookieParam[]));

    console.log(
      `[SessionPersistence] 쿠키 복원 완료: ${accountId.substring(0, 3)}*** (${validCookies.length}개)`
    );
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') {
      console.log(
        `[SessionPersistence] 저장된 쿠키 없음: ${accountId.substring(0, 3)}***`
      );
    } else {
      console.error(
        `[SessionPersistence] 쿠키 복원 실패: ${err.message}`
      );
    }
    return false;
  }
}

/**
 * 네이버 로그인 상태 검증
 * - 블로그 글쓰기 페이지에 접근 시도
 * - 에디터가 로드되면 로그인 유효 (true)
 * - 로그인 페이지로 리다이렉트되면 로그인 만료 (false)
 * - 타임아웃 5초
 */
export async function isLoginValid(page: Page): Promise<boolean> {
  const WRITE_FORM_URL = 'https://blog.naver.com/GoBlogWriteForm';
  const TIMEOUT_MS = 5000;

  try {
    const response = await page.goto(WRITE_FORM_URL, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });

    const currentUrl = page.url();

    // 로그인 페이지로 리다이렉트된 경우
    if (
      currentUrl.includes('nid.naver.com') ||
      currentUrl.includes('login')
    ) {
      console.log(
        '[SessionPersistence] 로그인 만료: 로그인 페이지로 리다이렉트됨'
      );
      return false;
    }

    // 에디터 페이지에 정상 도달한 경우
    if (
      currentUrl.includes('blog.naver.com') &&
      !currentUrl.includes('login')
    ) {
      // 에디터 요소 존재 확인 (추가 검증)
      try {
        await page.waitForSelector(
          '#mainFrame, .se-viewer, .blog_editor, iframe[id="mainFrame"]',
          { timeout: 3000 }
        );
        console.log('[SessionPersistence] 로그인 유효: 에디터 로드 확인');
        return true;
      } catch {
        // 셀렉터를 못 찾아도 URL이 에디터 페이지면 유효로 판단
        console.log('[SessionPersistence] 로그인 유효: URL 기반 확인');
        return true;
      }
    }

    // 응답 상태 코드 확인
    if (response && response.status() >= 400) {
      console.log(
        `[SessionPersistence] 로그인 검증 실패: HTTP ${response.status()}`
      );
      return false;
    }

    return false;
  } catch (error) {
    console.error(
      `[SessionPersistence] 로그인 검증 중 오류: ${(error as Error).message}`
    );
    return false;
  }
}

/**
 * 세션 워밍업 - 봇 감지 우회를 위한 자연스러운 브라우징 패턴
 *
 * 순서:
 * 1. 블로그 홈 방문 (2-4초 체류)
 * 2. 이웃 새글 피드 방문 (1-3초 체류)
 * 3. 무작위 스크롤 (300-800px)
 */
export async function warmupSession(page: Page): Promise<void> {
  try {
    console.log('[SessionPersistence] 세션 워밍업 시작...');

    // 1단계: 블로그 홈 방문
    await page.goto('https://blog.naver.com', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    await randomDelay(2000, 4000);

    // 2단계: 이웃 새글 피드 방문
    await page.goto('https://section.blog.naver.com/BlogHome.naver', {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    await randomDelay(1000, 3000);

    // 3단계: 무작위 스크롤 (인간적 패턴)
    const scrollAmount = randomInt(300, 800);
    await page.evaluate((amount: number) => {
      window.scrollBy({ top: amount, behavior: 'smooth' });
    }, scrollAmount);
    await randomDelay(500, 1500);

    // 추가 스크롤 (위로 살짝)
    const scrollBack = randomInt(50, 200);
    await page.evaluate((amount: number) => {
      window.scrollBy({ top: -amount, behavior: 'smooth' });
    }, scrollBack);
    await randomDelay(300, 800);

    console.log('[SessionPersistence] 세션 워밍업 완료');
  } catch (error) {
    // 워밍업 실패는 치명적이지 않으므로 경고만 출력
    console.warn(
      `[SessionPersistence] 세션 워밍업 실패 (무시): ${(error as Error).message}`
    );
  }
}

/**
 * 마지막 쿠키 저장 시각으로부터 경과 시간(ms) 반환
 * @returns 경과 시간(ms), 쿠키 파일 없으면 null
 */
export async function getSessionAge(
  accountId: string
): Promise<number | null> {
  try {
    const filePath = getCookieFilePath(accountId);
    const raw = await fs.readFile(filePath, 'utf-8');
    const cookieData: SessionCookieData = JSON.parse(raw);

    const savedAt = new Date(cookieData.savedAt).getTime();
    if (isNaN(savedAt)) {
      return null;
    }

    return Date.now() - savedAt;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      console.error(
        `[SessionPersistence] 세션 수명 조회 실패: ${err.message}`
      );
    }
    return null;
  }
}

/**
 * 해당 계정의 세션 쿠키 파일 삭제
 */
export async function clearSession(accountId: string): Promise<void> {
  try {
    const sessionDir = getAccountSessionDir(accountId);
    await fs.rm(sessionDir, { recursive: true, force: true });
    console.log(
      `[SessionPersistence] 세션 삭제 완료: ${accountId.substring(0, 3)}***`
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code !== 'ENOENT') {
      console.error(
        `[SessionPersistence] 세션 삭제 실패: ${err.message}`
      );
    }
  }
}
