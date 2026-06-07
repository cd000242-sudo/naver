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
  });

  it('checks controls again after prompt input and before clicking generate', () => {
    expect(captureCode).toMatch(/await ensureDropshotControls\(page, onLog\);\s*[\r\n]+\s*\/\/ 5\. Click generate/);
  });

  it('can close cached Dropshot browser contexts after sequential tests', () => {
    expect(sessionCode).toMatch(/closeBrowserCache/);
    expect(sessionCode).toMatch(/await .*\.close\(\)/);
  });
});
