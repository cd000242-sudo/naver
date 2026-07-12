import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('../image/flowGenerator.ts', import.meta.url), 'utf8');

describe('Flow workspace landing integration', () => {
  it('tries the landing CTA before opening a manual login window', () => {
    expect(source).toContain('async function tryEnterFlowWorkspace');
    const sessionCheck = source.indexOf('let loggedIn = await isLoggedInToFlow(page)');
    const autoEntry = source.indexOf('loggedIn = await tryEnterFlowWorkspace(page)', sessionCheck);
    const visibleLogin = source.indexOf("flowLog('[Flow] ⚠️ 로그인 필요", sessionCheck);
    expect(sessionCheck).toBeGreaterThanOrEqual(0);
    expect(autoEntry).toBeGreaterThan(sessionCheck);
    expect(autoEntry).toBeLessThan(visibleLogin);
  });
});
