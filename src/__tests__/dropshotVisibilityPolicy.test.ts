import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('Dropshot browser visibility policy', () => {
  const code = read('image/dropshotBrowser.ts');

  it('keeps post-login generation hidden unless debug visibility is explicitly allowed', () => {
    expect(code).toMatch(/interface DropshotLaunchOptions/);
    expect(code).toMatch(/allowForceVisible\?: boolean/);
    expect(code).toMatch(/options\.allowForceVisible === true/);
    expect(code).toMatch(/const effectiveHeadless = forceVisible \? false : headless/);
  });

  it('minimizes a verified visible login context instead of destroying its subscription session', () => {
    expect(code).toMatch(/export async function minimizeDropshotWindow/);
    expect(code).toMatch(/Browser\.getWindowForTarget/);
    expect(code).toMatch(/windowState:\s*'minimized'/);
  });
});
