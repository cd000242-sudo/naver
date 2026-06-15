export interface NaverAutomationProfile {
  userAgent: string;
  screen: { width: number; height: number };
}

const CHROME_VERSION_POOL = [
  '145.0.7480.66',
  '145.0.7480.135',
  '146.0.7530.41',
  '146.0.7530.123',
  '147.0.7592.79',
  '147.0.7592.155',
  '148.0.7666.50',
  '148.0.7666.137',
  '149.0.7710.42',
  '149.0.7710.124',
];

const SCREEN_CONFIGS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1680, height: 1050 },
  { width: 1280, height: 720 },
  { width: 1360, height: 768 },
];

export function hashAutomationAccountId(accountId: string): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function fnv1aAccountHash(accountId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < accountId.length; i++) {
    hash ^= accountId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function buildNaverAutomationProfile(
  accountId: string,
  chromeVersionHint = '',
): NaverAutomationProfile {
  const hash = fnv1aAccountHash(accountId);
  const chromeVersions = chromeVersionHint ? [chromeVersionHint] : CHROME_VERSION_POOL;
  const version = chromeVersions[hash % chromeVersions.length];
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
  const hash2 = Math.imul(hash, 0x9e3779b9) >>> 0;
  const screen = SCREEN_CONFIGS[hash2 % SCREEN_CONFIGS.length];

  return { userAgent, screen };
}
