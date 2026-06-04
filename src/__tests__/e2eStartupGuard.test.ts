import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('E2E startup guard', () => {
  it('keeps Electron baseline tests isolated from external license and server gates', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.ts'), 'utf-8');

    expect(mainSource).toContain("process.env.E2E_TEST === '1'");
    expect(mainSource).toMatch(/async function ensureLicenseValid\(\): Promise<boolean> \{[\s\S]*isE2ETestMode\(\)[\s\S]*return true;/);
    expect(mainSource).toMatch(/async function checkLicense\(\): Promise<boolean> \{[\s\S]*isE2ETestMode\(\)[\s\S]*return true;/);
    expect(mainSource).toMatch(/if \(!isE2ETestMode\(\)\) \{[\s\S]*performServerSync\(false\)/);
  });
});
