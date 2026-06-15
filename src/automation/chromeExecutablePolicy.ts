import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

type SupportedPlatform = NodeJS.Platform | string;

export interface ChromeCandidateInput {
  platform?: SupportedPlatform;
  homeDir?: string;
  localAppData?: string;
}

export interface ChromeExecutableLookupInput extends ChromeCandidateInput {
  exists?: (value: string) => boolean;
  exec?: (command: string) => string;
}

export function getChromeExecutableCandidates(input: ChromeCandidateInput = {}): string[] {
  const platform = input.platform || os.platform();
  const homeDir = input.homeDir || os.homedir();
  const localAppData = input.localAppData || process.env.LOCALAPPDATA || path.win32.join(homeDir, 'AppData', 'Local');

  if (platform === 'win32') {
    return [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.win32.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  }

  if (platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }

  if (platform === 'linux') {
    return [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ];
  }

  return [];
}

function findWindowsRegistryChromePath(
  exists: (value: string) => boolean,
  exec: (command: string) => string,
): string | undefined {
  try {
    const output = exec(
      'reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve',
    );
    const match = output.match(/REG_SZ\s+(.+)/);
    if (!match?.[1]) return undefined;

    const chromePath = match[1].trim();
    return exists(chromePath) ? chromePath : undefined;
  } catch {
    return undefined;
  }
}

export function findChromeExecutable(input: ChromeExecutableLookupInput = {}): string | undefined {
  const platform = input.platform || os.platform();
  const exists = input.exists || existsSync;
  const exec =
    input.exec ||
    ((command: string) => execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }));

  for (const chromePath of getChromeExecutableCandidates(input)) {
    try {
      if (exists(chromePath)) {
        return chromePath;
      }
    } catch {
      // Ignore unreadable paths and continue to the next candidate.
    }
  }

  if (platform === 'win32') {
    return findWindowsRegistryChromePath(exists, exec);
  }

  return undefined;
}
