export interface NaverAutomationProfile {
  /** 실제 Chrome 과 같은 축약 형태: `Chrome/151.0.0.0`. */
  userAgent: string;
  /** UA-CH(fullVersionList/uaFullVersion)용 실제 빌드: `151.0.7922.138`. */
  fullVersion: string;
  screen: { width: number; height: number };
}

// 감지 실패 시에만 쓰는 최후 폴백. 실제 값은 chromeVersionDetector 가 넘긴다.
// 여기 값이 낡아도 감지가 되는 한 쓰이지 않는다.
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
  const fullVersion = chromeVersions[hash % chromeVersions.length];
  // Chrome 110+ 은 UA 를 축약해 내보낸다 — 실측(2026-08-19) 크롬 151 의 실제 UA 는
  // `Chrome/151.0.0.0` 이다. 전체 빌드 번호를 UA 에 넣으면 그 자체가 봇 신호가 된다.
  const majorVersion = fullVersion.split('.')[0];
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`;
  const hash2 = Math.imul(hash, 0x9e3779b9) >>> 0;
  const screen = SCREEN_CONFIGS[hash2 % SCREEN_CONFIGS.length];

  return { userAgent, fullVersion, screen };
}
