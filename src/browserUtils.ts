import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * ✅ Puppeteer Chromium 경로 찾기 (배포 환경 지원 - 시스템 Chrome/Edge 우선 사용)
 * 여러 파일에 흩어져 있던 로직을 통합하여 관리합니다.
 */
export async function getChromiumExecutablePath(): Promise<string | undefined> {
    // 1. 시스템에 설치된 Chrome 경로들 (Windows)
    const systemChromePaths = [
        // Windows 기본 설치 경로들
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        // Edge도 Chromium 기반이므로 사용 가능
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];

    // 시스템 Chrome 먼저 확인 (가장 안정적)
    for (const chromePath of systemChromePaths) {
        if (fs.existsSync(chromePath)) {
            console.log(`[BrowserUtils] ✅ 시스템 브라우저 발견: ${chromePath}`);
            return chromePath;
        }
    }

    // 2. Puppeteer 캐시 경로 확인 (~/.cache/puppeteer/)
    const puppeteerCachePaths = [
        path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'),
        path.join(os.homedir(), 'AppData', 'Local', 'puppeteer', 'chrome'),
    ];

    for (const cachePath of puppeteerCachePaths) {
        if (fs.existsSync(cachePath)) {
            try {
                const versions = fs.readdirSync(cachePath);
                for (const version of versions) {
                    const chromePath = path.join(cachePath, version, 'chrome-win64', 'chrome.exe');
                    if (fs.existsSync(chromePath)) {
                        console.log(`[BrowserUtils] ✅ Puppeteer 캐시 브라우저 발견: ${chromePath}`);
                        return chromePath;
                    }
                    const chromePath2 = path.join(cachePath, version, 'chrome-win', 'chrome.exe');
                    if (fs.existsSync(chromePath2)) {
                        console.log(`[BrowserUtils] ✅ Puppeteer 캐시 브라우저 발견: ${chromePath2}`);
                        return chromePath2;
                    }
                }
            } catch (e) {
                // 무시
            }
        }
    }

    // 3. Puppeteer 기본 경로 시도
    try {
        const puppeteer = await import('puppeteer');
        const defaultPath = (puppeteer as any).executablePath?.();
        if (defaultPath && fs.existsSync(defaultPath)) {
            console.log(`[BrowserUtils] ✅ Puppeteer 기본 경로: ${defaultPath}`);
            return defaultPath;
        }
    } catch (e) {
        // 무시
    }

    console.log(`[BrowserUtils] ⚠️ 브라우저를 찾을 수 없음. Puppeteer 기본값에 의존...`);
    return undefined;
}
