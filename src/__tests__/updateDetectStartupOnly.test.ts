import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard: 버전 감지/강제 업데이트 게이트는 앱 시작 동기화에서만 (2026-06-23).
 *
 * User report: "앱 사용(발행) 도중 갑자기 새 버전을 감지해서 자동 업데이트된다." Auto-download
 * itself is desired; the problem was DETECTION happening mid-session. Root cause: performServerSync
 * runs every 5 min in the background, and its minVersion version-gate re-triggered an update check
 * (waitForUpdateCheck → checkForUpdates) mid-publish whenever a new minVersion was pushed.
 *
 * Fix: the version gate runs only on the startup sync (!isBackground). Periodic background syncs
 * verify license/notice/block but skip version detection — the app keeps running on the current
 * version until the next launch, when the startup sync detects and applies the update.
 */
describe('update detection is startup-only', () => {
  const main = read('main.ts');

  it('gates the minVersion version-check on !isBackground (startup sync only)', () => {
    expect(main).toMatch(/if \(!isBackground && syncResult\.versionCheckEnabled !== false && syncResult\.minVersion\)/);
  });

  it('keeps auto-download enabled in the updater (download is desired, only detection timing changed)', () => {
    const updater = read('updater.ts');
    expect(updater).toContain('au.autoDownload = true');
  });
});
