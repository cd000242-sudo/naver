import { describe, expect, it } from 'vitest';
import { isDirectLaunchLewordAsset, selectLewordReleaseAsset, type LewordReleaseAsset } from '../utils/lewordReleaseAssets';

function asset(name: string): LewordReleaseAsset {
  return {
    name,
    browser_download_url: `https://example.test/${encodeURIComponent(name)}`,
    size: 100
  };
}

describe('LEWORD release asset selection', () => {
  it('selects Windows setup exe names with spaces, dots, or hyphens', () => {
    const assets = [
      asset('LEWORD-Portable-1.0.7.exe'),
      asset('LEWORD Setup 1.0.7.exe'),
      asset('LEWORD.Setup.1.0.7.zip')
    ];

    expect(selectLewordReleaseAsset(assets, 'win32')?.name).toBe('LEWORD Setup 1.0.7.exe');
  });

  it('falls back to a Windows setup zip when no exe exists', () => {
    const assets = [
      asset('LEWORD.Setup.1.0.7.zip'),
      asset('latest.yml')
    ];

    expect(selectLewordReleaseAsset(assets, 'win32')?.name).toBe('LEWORD.Setup.1.0.7.zip');
  });

  it('selects macOS dmg over Windows exe assets', () => {
    const assets = [
      asset('LEWORD Setup 1.0.7.exe'),
      asset('LEWORD-1.0.7-arm64.dmg')
    ];

    expect(selectLewordReleaseAsset(assets, 'darwin', 'arm64')?.name).toBe('LEWORD-1.0.7-arm64.dmg');
  });

  it('prefers universal macOS dmg, then matching architecture', () => {
    const assets = [
      asset('LEWORD-1.0.7-x64.dmg'),
      asset('LEWORD-1.0.7-arm64.dmg'),
      asset('LEWORD-1.0.7-universal.dmg')
    ];

    expect(selectLewordReleaseAsset(assets, 'darwin', 'arm64')?.name).toBe('LEWORD-1.0.7-universal.dmg');
  });

  it('only direct-launches Windows exe assets', () => {
    expect(isDirectLaunchLewordAsset(asset('LEWORD Setup 1.0.7.exe'), 'win32')).toBe(true);
    expect(isDirectLaunchLewordAsset(asset('LEWORD-1.0.7-arm64.dmg'), 'darwin')).toBe(false);
    expect(isDirectLaunchLewordAsset(asset('LEWORD.Setup.1.0.7.zip'), 'win32')).toBe(false);
  });
});
