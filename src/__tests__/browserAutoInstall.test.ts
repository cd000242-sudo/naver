import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guards for Chromium auto-provisioning (2026-06-23).
 *
 * Root cause of "dev works / deployed fails": the developer has system Chrome, so
 * automation works; a client WITHOUT Chrome falls through to a different engine and
 * SmartEditor never types the body (+0 chars). Confirmed by the developer's own
 * deployed-file SUCCESS while Chrome-less customers fail on the same build.
 *
 * Fix: clients lacking a real Chrome download the SAME pinned Chrome the developer
 * tests with, once, into userData. These guards lock the contract.
 */
describe('chromium auto-install', () => {
  const installer = read('browserInstaller.ts');
  const browserUtils = read('browserUtils.ts');
  const mainSrc = read('main.ts');

  it('reuses an existing browser before downloading (no needless 150MB pull)', () => {
    // getChromiumExecutablePath must be consulted before install() runs.
    const existingIdx = installer.indexOf('getChromiumExecutablePath()');
    const installIdx = installer.indexOf('browsers.install(');
    expect(existingIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeGreaterThan(-1);
    expect(existingIdx).toBeLessThan(installIdx);
  });

  it('pins a deterministic Chrome build so every client matches the developer', () => {
    expect(installer).toMatch(/PINNED_CHROME_BUILD = '\d+\.\d+\.\d+\.\d+'/);
  });

  it('points downstream launches at the downloaded browser', () => {
    expect(installer).toContain('process.env.PUPPETEER_EXECUTABLE_PATH = installed.executablePath');
  });

  it('is idempotent — concurrent/repeat calls share one download', () => {
    expect(installer).toContain('if (ensurePromise) return ensurePromise');
  });

  it('clears the cached promise on failure so a later attempt can retry', () => {
    expect(installer).toContain('ensurePromise = null');
  });

  it('exposes the managed userData cache to getChromiumExecutablePath', () => {
    expect(browserUtils).toContain("path.join(userData, 'browsers', 'chrome')");
  });

  it('ensures the browser before both single and multi-account publishing', () => {
    const ensureCalls = (mainSrc.match(/ensureChromiumAvailable\(/g) || []).length;
    expect(ensureCalls).toBeGreaterThanOrEqual(2);
  });
});
