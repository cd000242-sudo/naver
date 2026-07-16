import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Dropshot browser visibility policy', () => {
  const code = read('image/dropshotBrowser.ts');
  const loginCode = read('image/dropshotLogin.ts');
  const coreCode = read('image/dropshotCore.ts');
  const headlessCode = read('image/dropshotHeadlessSession.ts');

  it('keeps post-login generation hidden unless debug visibility is explicitly allowed', () => {
    expect(code).toMatch(/interface DropshotLaunchOptions/);
    expect(code).toMatch(/allowForceVisible\?: boolean/);
    expect(code).toMatch(/options\.allowForceVisible === true/);
    expect(code).toMatch(/const effectiveHeadless = forceVisible \? false : headless/);
  });

  it('closes the successful visible login context without an immediate relaunch', () => {
    expect(loginCode).toContain('await closeLoginVerificationContext(ctx);');
    expect(loginCode).not.toContain('await minimizeDropshotWindow(page, onLog);');
    expect(loginCode).not.toContain('await reopenDropshotHeadlessGenerationContext(profileDir, onLog)');
  });

  it('hands an authenticated interactive generation session back to a hidden context', () => {
    expect(coreCode).not.toContain('await minimizeDropshotWindow(page, onLog)');
    expect(coreCode).toContain('await closeContext(context)');
    expect(coreCode).toContain('await reopenDropshotHeadlessGenerationContext(profileDir, onLog)');
    expect(headlessCode).toContain('launchBrowser(profileDir, true)');
    expect(headlessCode).toContain('setCached(context, page)');
  });
});
