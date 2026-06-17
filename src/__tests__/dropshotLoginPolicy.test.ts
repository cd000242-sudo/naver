import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src', 'image', 'dropshotLogin.ts'), 'utf8');

describe('Dropshot login success policy', () => {
  it('does not treat a closed login window as a successful saved session', () => {
    const earlyFailureIndex = source.indexOf('if (!detected) {');
    const headlessCacheIndex = source.indexOf('const hctx: any = await launchBrowser(profileDir, true);');

    expect(earlyFailureIndex).toBeGreaterThan(-1);
    expect(headlessCacheIndex).toBeGreaterThan(-1);
    expect(earlyFailureIndex).toBeLessThan(headlessCacheIndex);

    expect(source).toContain('pages.length === 0');
    const earlyFailureBlock = source.slice(earlyFailureIndex, headlessCacheIndex);
    expect(earlyFailureBlock).toContain('userClosed');
    expect(earlyFailureBlock).toContain('clearCached();');
    expect(earlyFailureBlock).toContain('loggedIn: false');
    expect(earlyFailureBlock).toContain('로그인 창이 닫혔지만 로그인 완료 신호가 감지되지 않았습니다');
  });

  it('stores the Dropshot session only after the final headless token check passes', () => {
    const finalCheckIndex = source.indexOf('const finalLoggedIn = await isLoggedIn(hpage);');
    const setCachedIndex = source.indexOf('setCached(hctx, hpage);');

    expect(finalCheckIndex).toBeGreaterThan(-1);
    expect(setCachedIndex).toBeGreaterThan(-1);
    expect(finalCheckIndex).toBeLessThan(setCachedIndex);

    const finalCheckBlock = source.slice(finalCheckIndex, setCachedIndex);
    expect(finalCheckBlock).toContain('if (!finalLoggedIn)');
    expect(finalCheckBlock).toContain('await hctx.close();');
    expect(finalCheckBlock).toContain('clearCached();');
    expect(finalCheckBlock).toContain('loggedIn: false');
  });
});
