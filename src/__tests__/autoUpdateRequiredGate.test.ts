import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('required-version auto update gate', () => {
  it('lets required-version checks wait longer than normal startup checks', () => {
    const updater = readSource('src/updater.ts');

    expect(updater).toMatch(/waitForUpdateCheck\(timeoutMs: number = 3000\)/);
    expect(updater).toMatch(/safeTimeoutMs/);
    expect(updater).toMatch(/setTimeout\([\s\S]*safeTimeoutMs\)/);
    expect(updater).toMatch(/isUpdateInProgress[\s\S]{0,120}Promise\.resolve\(true\)/);
  });

  it('tries electron auto-update before falling back to the manual release page', () => {
    const main = readSource('src/main.ts');
    const versionGate = main.slice(
      main.indexOf('if (versionCompare < 0)'),
      main.indexOf("return { allowed: false, error: 'VERSION_TOO_OLD' };")
    );

    expect(versionGate).toMatch(/waitForUpdateCheck\(30000\)/);
    expect(versionGate).toMatch(/VERSION_TOO_OLD_UPDATING/);
    expect(versionGate).toMatch(/waitForUpdateCheck\(45000\)/);
    expect(versionGate).toMatch(/if \(result\.response === 1\)[\s\S]{0,160}shell\.openExternal/);
  });

  it('does not quit while the updater is already handling a required update', () => {
    const main = readSource('src/main.ts');

    expect(main.match(/VERSION_TOO_OLD_UPDATING/g)?.length).toBeGreaterThanOrEqual(4);
    expect(main).toMatch(/Pre-launch sync paused while auto-update is in progress/);
    expect(main).toMatch(/Periodic sync paused while auto-update is in progress/);
    expect(main).toMatch(/Background sync paused while auto-update is in progress/);
  });

  it('marks uploaded GitHub releases as latest and verifies the latest pointer', () => {
    const uploadRelease = readSource('scripts/upload-release.js');
    const releaseAll = readSource('scripts/release-all.js');

    expect(uploadRelease).toMatch(/make_latest:\s*['"]true['"]/);
    expect(uploadRelease).toMatch(/method:\s*['"]PATCH['"][\s\S]{0,240}make_latest/);
    expect(releaseAll).toMatch(/verifyLatestReleasePointer/);
    expect(releaseAll).toMatch(/\/repos\/cd000242-sudo\/naver\/releases\/latest/);
    expect(releaseAll).toMatch(/release\.tag_name === `v\$\{version\}`/);
  });

  it('treats GitHub 5xx update errors as transient retries instead of fatal dialogs', () => {
    const updater = readSource('src/updater.ts');
    const errorHandler = updater.slice(
      updater.indexOf("updater.on('error'"),
      updater.indexOf('// ??IPC', updater.indexOf("updater.on('error'"))
    );

    expect(updater).toMatch(/isTransientGitHubUpdateError/);
    expect(updater).toMatch(/Gateway Time-out\|504\|502\|503/);
    expect(errorHandler).toMatch(/isTransientGitHubUpdateError\(error\)/);
    expect(errorHandler).toMatch(/reason:\s*['"]github-transient['"]/);
    expect(errorHandler).toMatch(/scheduleTransientUpdateRetry\(\)/);
    expect(errorHandler.indexOf('isTransientGitHubUpdateError')).toBeLessThan(errorHandler.indexOf('dialog.showMessageBox'));
  });
});
