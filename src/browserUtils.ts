import fs from 'fs';
import path from 'path';
import os from 'os';

function getSystemChromiumCandidates(): string[] {
  const home = os.homedir();

  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  if (process.platform === 'linux') {
    return [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];
  }

  return [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
}

function getPuppeteerCacheRoots(): string[] {
  const home = os.homedir();
  const roots = [
    path.join(home, '.cache', 'puppeteer', 'chrome'),
    path.join(home, 'Library', 'Caches', 'puppeteer', 'chrome'),
    path.join(home, 'AppData', 'Local', 'puppeteer', 'chrome'),
  ];
  // [2026-06-23] Managed (auto-downloaded) Chrome lives in Electron userData/browsers
  // so getChromiumExecutablePath() can find it after browserInstaller downloads it.
  // require('electron') only resolves in the main process — ignore elsewhere.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    const userData: string | undefined = electron?.app?.getPath?.('userData');
    if (userData) roots.unshift(path.join(userData, 'browsers', 'chrome'));
  } catch {
    // not an Electron main context — system/default caches still apply
  }
  return roots;
}

function getPuppeteerChromeCandidates(cacheRoot: string, version: string): string[] {
  return [
    path.join(cacheRoot, version, 'chrome-win64', 'chrome.exe'),
    path.join(cacheRoot, version, 'chrome-win', 'chrome.exe'),
    path.join(cacheRoot, version, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    path.join(cacheRoot, version, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
    path.join(cacheRoot, version, 'chrome-linux64', 'chrome'),
  ];
}

/**
 * Resolve a usable Chromium/Chrome executable for Puppeteer and Playwright.
 * Packaged macOS builds cannot rely on Windows-only paths, so system Chrome
 * and Puppeteer cache locations are checked per platform before the library
 * default is used.
 */
export async function getChromiumExecutablePath(): Promise<string | undefined> {
  // [2026-06-23] 재현용 플래그 — BLN_FORCE_NO_SYSTEM_CHROME=1 로 실행하면 시스템 Chrome을
  // 건너뛴다. 개발자 PC(Chrome 설치됨)에서 'Chrome 없는 고객' 환경을 그대로 재현해
  // dev↔배포 차이(브라우저 변인)를 로컬에서 테스트하기 위함.
  const skipSystemChrome = process.env.BLN_FORCE_NO_SYSTEM_CHROME === '1';
  if (skipSystemChrome) {
    console.log('[BrowserUtils] BLN_FORCE_NO_SYSTEM_CHROME=1 → 시스템 Chrome 건너뜀 (Chrome 없는 고객 환경 재현)');
  } else {
    for (const chromePath of getSystemChromiumCandidates()) {
      if (fs.existsSync(chromePath)) {
        console.log(`[BrowserUtils] system browser found: ${chromePath}`);
        return chromePath;
      }
    }
  }

  for (const cacheRoot of getPuppeteerCacheRoots()) {
    if (!fs.existsSync(cacheRoot)) continue;

    try {
      const versions = fs.readdirSync(cacheRoot);
      for (const version of versions) {
        for (const chromePath of getPuppeteerChromeCandidates(cacheRoot, version)) {
          if (fs.existsSync(chromePath)) {
            console.log(`[BrowserUtils] puppeteer cache browser found: ${chromePath}`);
            return chromePath;
          }
        }
      }
    } catch {
      // Ignore unreadable cache directories and continue to the next strategy.
    }
  }

  try {
    const puppeteer = await import('puppeteer');
    const defaultPath = (puppeteer as any).executablePath?.();
    if (defaultPath && fs.existsSync(defaultPath)) {
      console.log(`[BrowserUtils] puppeteer default browser found: ${defaultPath}`);
      return defaultPath;
    }
  } catch {
    // Ignore and let the caller fall back to the automation library default.
  }

  console.log('[BrowserUtils] browser executable not found; using library default.');
  return undefined;
}
