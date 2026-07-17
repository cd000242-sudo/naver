import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Dropshot unlimited mode safety', () => {
  const browserCode = read('image/dropshotBrowser.ts');
  const captureCode = read('image/dropshotCapture.ts');
  const sessionCode = read('image/dropshotSession.ts');
  const coreCode = read('image/dropshotCore.ts');
  const headlessCode = read('image/dropshotHeadlessSession.ts');

  it('reads unlimited switch state and zero-cost generate button state', () => {
    expect(browserCode).toMatch(/readDropshotControlState/);
    expect(browserCode).toMatch(/unlimitedModeOn/);
    expect(browserCode).toMatch(/zeroCost/);
    expect(browserCode).toMatch(/generateButtonText/);
    expect(browserCode).toMatch(/\\uBB34\\uC81C\\uD55C/);
  });

  it('refuses generation when zero-cost mode is not confirmed', () => {
    expect(browserCode).toMatch(/refusing to generate to avoid coin spend/);
    expect(browserCode).toMatch(/throw new Error/);
    expect(browserCode).not.toContain('controls 설정 오류 (무시)');
  });

  it('checks controls again after prompt input and before clicking generate', () => {
    const promptCheck = captureCode.indexOf('const actualPrompt =');
    const controlsCheck = captureCode.indexOf('await ensureDropshotControls(page, onLog);', promptCheck);
    const settledBaseline = captureCode.indexOf('await collectStableDropshotCandidateKeys(page)', controlsCheck);
    const generateClick = captureCode.indexOf('await clickGenerate(page)', settledBaseline);
    expect(promptCheck).toBeGreaterThan(-1);
    expect(controlsCheck).toBeGreaterThan(promptCheck);
    expect(settledBaseline).toBeGreaterThan(controlsCheck);
    expect(generateClick).toBeGreaterThan(settledBaseline);
  });

  it('can close cached Dropshot browser contexts after sequential tests', () => {
    expect(sessionCode).toMatch(/closeBrowserCache/);
    expect(sessionCode).toMatch(/withCleanupTimeout/);
    expect(sessionCode).toMatch(/closeTrackedDropshotContext/);
    expect(sessionCode).toMatch(/Keep ownership so a later shutdown\/abort pass/);
  });

  it('uses the server session verdict and never treats workspace text as login proof', () => {
    expect(browserCode).toMatch(/fetch\('\/api\/auth\/session'/);
    expect(browserCode).toMatch(/session\?\.user\?\.id/);
    expect(browserCode).toMatch(/credentials:\s*'include'/);
    expect(browserCode).not.toMatch(/CognitoIdentityServiceProvider/);
    expect(browserCode).not.toMatch(/document\.cookie/);
    expect(browserCode).not.toMatch(/storageState\(\)/);
    expect(browserCode).not.toMatch(/hasAccountChrome/);
    expect(browserCode).not.toMatch(/hasWorkspaceNav/);
  });

  it('rechecks zero-cost controls after adopting the hidden interactive context', () => {
    const cachedAuth = coreCode.indexOf('if (!(await isLoggedIn(page)))');
    const cachedWorkspace = coreCode.indexOf('if (!(await openDropshotImageWorkspace(page, onLog)))', cachedAuth);
    const cachedReturn = coreCode.indexOf('return page;', cachedWorkspace);
    expect(cachedAuth).toBeGreaterThan(-1);
    expect(cachedWorkspace).toBeGreaterThan(cachedAuth);
    expect(cachedReturn).toBeGreaterThan(cachedWorkspace);

    const initialBoard = coreCode.indexOf('await navigateToDropshotBoard(headlessProbePage, onLog)');
    const initialAuth = coreCode.indexOf('await isLoggedIn(headlessProbePage)', initialBoard);
    const initialWorkspace = coreCode.indexOf('await openDropshotImageWorkspace(headlessProbePage, onLog)', initialBoard);
    const initialControls = coreCode.indexOf('await ensureDropshotControls(headlessProbePage, onLog)', initialWorkspace);
    const initialCache = coreCode.indexOf('setCached(context, headlessProbePage);', initialControls);
    expect(initialBoard).toBeGreaterThan(-1);
    expect(initialAuth).toBeGreaterThan(initialBoard);
    expect(initialWorkspace).toBeGreaterThan(initialBoard);
    expect(initialControls).toBeGreaterThan(initialWorkspace);
    expect(initialCache).toBeGreaterThan(initialControls);

    const visibleAuth = coreCode.indexOf('if (await isLoggedIn(page))', initialCache);
    const visibleMinimize = coreCode.indexOf('await minimizeDropshotWindow(page, onLog)', visibleAuth);
    const visibleCache = coreCode.indexOf('setCached(context, page)', visibleMinimize);
    const visibleWorkspace = coreCode.indexOf('await openDropshotImageWorkspace(page, onLog)', visibleCache);
    const visibleControls = coreCode.indexOf('await ensureDropshotControls(page, onLog)', visibleWorkspace);
    expect(visibleAuth).toBeGreaterThan(initialCache);
    expect(visibleMinimize).toBeGreaterThan(visibleAuth);
    expect(visibleCache).toBeGreaterThan(visibleMinimize);
    expect(visibleWorkspace).toBeGreaterThan(visibleCache);
    expect(visibleControls).toBeGreaterThan(visibleWorkspace);
    expect(coreCode).not.toContain('await reopenDropshotHeadlessGenerationContext(profileDir, onLog)');

    const helperStart = headlessCode.indexOf('async function openValidatedHeadlessContext');
    const hiddenLaunch = headlessCode.indexOf('launchBrowser(profileDir, true)', helperStart);
    const hiddenControls = headlessCode.indexOf('await ensureDropshotControls(page, onLog)', hiddenLaunch);
    const hiddenCache = headlessCode.indexOf('setCached(context, page);', hiddenControls);
    expect(helperStart).toBeGreaterThan(-1);
    expect(hiddenLaunch).toBeGreaterThan(helperStart);
    expect(hiddenControls).toBeGreaterThan(hiddenLaunch);
    expect(hiddenCache).toBeGreaterThan(hiddenControls);
    expect(headlessCode).not.toContain('minimizeDropshotWindow');
    expect(coreCode).toMatch(/clearCached\(\)/);
  });
});
