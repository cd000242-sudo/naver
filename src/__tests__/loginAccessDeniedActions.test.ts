import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const loginHtml = readFileSync(join(process.cwd(), 'public', 'login.html'), 'utf8');

describe('login access-denied renewal actions', () => {
  it('offers separate renew and purchase buttons for expired licenses', () => {
    expect(loginHtml).toContain('id="access-denied-renew-btn"');
    expect(loginHtml).toContain('id="access-denied-purchase-btn"');
    expect(loginHtml).not.toContain('id="access-denied-upgrade-btn"');

    const actionLinks = Array.from(
      loginHtml.matchAll(
        /id="access-denied-(renew|purchase)-btn"[^>]*href="https:\/\/cd000242-sudo\.github\.io\/naver\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/g,
      ),
    );
    expect(actionLinks.map((match) => match[1]).sort()).toEqual(['purchase', 'renew']);
  });

  it('routes renew and purchase clicks through the external browser bridge', () => {
    expect(loginHtml).toContain("const LICENSE_PURCHASE_URL = 'https://cd000242-sudo.github.io/naver/';");
    expect(loginHtml).toContain("ipcRenderer.invoke('openExternalUrl', LICENSE_PURCHASE_URL)");
    expect(loginHtml).toContain('라이선스 연장하기');
    expect(loginHtml).toContain('라이선스 구매하기');
  });
});
