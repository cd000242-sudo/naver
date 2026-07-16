import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const mainSource = fs.readFileSync(path.resolve(__dirname, '..', 'main.ts'), 'utf8');
const start = mainSource.indexOf("ipcMain.handle('multiAccount:publish'");
const end = mainSource.indexOf("ipcMain.handle('multiAccount:cancel'", start);
const handlerSource = mainSource.slice(start, end);

describe('multi-account publish quota wiring', () => {
  it('uses a rollback-safe lease for cancel, failure, and exception exits', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(handlerSource).toContain('let accountQuotaLease: ScheduledPublishQuotaLease | undefined;');
    expect(handlerSource).toContain('accountQuotaLease = await acquireScheduledPublishQuota({');
    expect(handlerSource).toContain('accountQuotaLease.commit();');
    expect(handlerSource).toMatch(/finally\s*\{[\s\S]*?await accountQuotaLease\?\.rollback\(\)/);
    expect(handlerSource).not.toContain('accountPreConsumed');
  });
});
