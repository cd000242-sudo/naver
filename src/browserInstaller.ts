/**
 * Chromium auto-provisioning.
 *
 * "dev works / deployed fails" root cause: getChromiumExecutablePath() prefers a
 * system Chrome, which the developer always has. A client WITHOUT Chrome falls
 * through to a different/absent engine, so SmartEditor (caret/clipboard sensitive)
 * misbehaves and the body never types. This ensures every client that lacks a
 * real Chrome downloads the SAME pinned Chrome the developer tests with — once,
 * into userData — eliminating the browser variable.
 *
 * Clients that already have system Chrome keep using it (no needless 150MB pull).
 */
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getChromiumExecutablePath } from './browserUtils.js';

// Pinned to puppeteer 24.x's tested Chrome build → deterministic + known-compatible.
const PINNED_CHROME_BUILD = '148.0.7778.97';

export function getManagedBrowserCacheDir(): string {
  return path.join(app.getPath('userData'), 'browsers');
}

export type BrowserSetupProgress = (pct: number, message: string) => void;

let ensurePromise: Promise<string | undefined> | null = null;

/**
 * Returns a usable Chrome executable path, downloading a pinned Chrome into
 * userData if none is available. Idempotent: concurrent/repeat calls share one
 * download. On failure the cached promise is cleared so a later attempt retries.
 */
export async function ensureChromiumAvailable(
  onProgress?: BrowserSetupProgress,
): Promise<string | undefined> {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    // 1) An existing browser (system Chrome / prior managed install) wins — no download.
    const existing = await getChromiumExecutablePath();
    if (existing) {
      console.log(`[BrowserInstaller] 기존 브라우저 사용: ${existing}`);
      return existing;
    }

    console.log('[BrowserInstaller] 사용 가능한 브라우저 없음 → 고정 버전 Chrome 자동 다운로드 시작');
    onProgress?.(0, '발행용 브라우저(Chrome)를 준비하고 있어요... (최초 1회)');

    const browsers = await import('@puppeteer/browsers');
    const platform = browsers.detectBrowserPlatform();
    if (!platform) {
      throw new Error('지원하지 않는 플랫폼이라 브라우저를 자동 설치할 수 없습니다.');
    }

    const cacheDir = getManagedBrowserCacheDir();
    fs.mkdirSync(cacheDir, { recursive: true });

    // Pinned build first; fall back to the channel's current stable if the pin
    // is unavailable for this platform (e.g. retired build).
    let buildId = PINNED_CHROME_BUILD;
    try {
      buildId = await browsers.resolveBuildId(browsers.Browser.CHROME, platform, PINNED_CHROME_BUILD);
    } catch {
      try {
        buildId = await browsers.resolveBuildId(browsers.Browser.CHROME, platform, 'stable');
      } catch {
        // keep PINNED_CHROME_BUILD and let install() surface a clear error
      }
    }

    let lastPct = -1;
    const installed = await browsers.install({
      browser: browsers.Browser.CHROME,
      buildId,
      cacheDir,
      downloadProgressCallback: (downloadedBytes: number, totalBytes: number) => {
        const pct = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress?.(pct, `발행용 브라우저(Chrome) 다운로드 중... ${pct}%`);
        }
      },
    });

    console.log(`[BrowserInstaller] ✅ Chrome ${buildId} 설치 완료: ${installed.executablePath}`);
    onProgress?.(100, '브라우저 준비 완료');
    // Make every downstream launch (Puppeteer + Playwright) use it immediately.
    process.env.PUPPETEER_EXECUTABLE_PATH = installed.executablePath;
    return installed.executablePath;
  })().catch((err) => {
    ensurePromise = null; // allow a later retry instead of caching the failure
    console.error(`[BrowserInstaller] ❌ 브라우저 자동 설치 실패: ${(err as Error)?.message ?? err}`);
    throw err;
  });

  return ensurePromise;
}
