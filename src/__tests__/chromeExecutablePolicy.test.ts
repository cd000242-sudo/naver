import { describe, expect, it } from 'vitest';
import {
  findChromeExecutable,
  getChromeExecutableCandidates,
} from '../automation/chromeExecutablePolicy';

describe('chromeExecutablePolicy', () => {
  it('builds Windows Chrome candidates including user-local install path', () => {
    expect(
      getChromeExecutableCandidates({
        platform: 'win32',
        homeDir: 'C:\\Users\\tester',
        localAppData: 'C:\\Users\\tester\\AppData\\Local',
      }),
    ).toEqual([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    ]);
  });

  it('builds macOS and Linux Chrome candidates', () => {
    expect(getChromeExecutableCandidates({ platform: 'darwin', homeDir: '/Users/tester' })).toEqual([
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ]);

    expect(getChromeExecutableCandidates({ platform: 'linux', homeDir: '/home/tester' })).toEqual([
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]);
  });

  it('finds the first existing candidate without touching the real filesystem', () => {
    const found = findChromeExecutable({
      platform: 'win32',
      homeDir: 'C:\\Users\\tester',
      localAppData: 'C:\\Users\\tester\\AppData\\Local',
      exists: (value) => value.includes('AppData\\Local'),
    });

    expect(found).toBe('C:\\Users\\tester\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe');
  });

  it('falls back to Windows registry App Paths when candidates are missing', () => {
    const found = findChromeExecutable({
      platform: 'win32',
      homeDir: 'C:\\Users\\tester',
      exists: (value) => value === 'D:\\Chrome\\chrome.exe',
      exec: () => '    (기본값)    REG_SZ    D:\\Chrome\\chrome.exe',
    });

    expect(found).toBe('D:\\Chrome\\chrome.exe');
  });
});
