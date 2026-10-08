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

  // [2026-10-09] The wall-clock 5-minute sync cron had no E2E guard: whenever a gate run crossed a :x0/:x5 boundary
  // it posted action=sync into the license fixture and failed license-session-takeover (335 gate, twice).
  it('the periodic 5-minute server sync never runs in E2E mode', () => {
    const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.ts'), 'utf-8').replace(/\r\n/g, '\n');
    const start = mainSource.indexOf("cron.schedule('*/5 * * * *'");
    expect(start).toBeGreaterThan(-1);
    const body = mainSource.slice(start, mainSource.indexOf('performServerSync(true)', start));
    expect(body).toMatch(/if \(isE2ETestMode\(\)\) return;/);
  });
});
