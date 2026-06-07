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
  return [
    path.join(home, '.cache', 'puppeteer', 'chrome'),
    path.join(home, 'Library', 'Caches', 'puppeteer', 'chrome'),
    path.join(home, 'AppData', 'Local', 'puppeteer', 'chrome'),
  ];
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
  for (const chromePath of getSystemChromiumCandidates()) {
    if (fs.existsSync(chromePath)) {
      console.log(`[BrowserUtils] system browser found: ${chromePath}`);
      return chromePath;
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
