// UA 가 실제로 실행되는 Chrome 과 어긋나지 않게 잠근다.
//
// 실측(2026-08-19): 이 PC 의 Chrome 은 151, UA 풀은 145~149 였고 시스템 Chrome(151)을
// 띄운 위에 147 이라고 적힌 UA 를 씌우고 있었다. 게다가 Chrome 110+ 는 UA 를 축약해
// `Chrome/151.0.0.0` 으로 보내는데 풀은 전체 빌드(`147.0.7592.79`)를 넣고 있었다 —
// 어떤 실제 Chrome 도 내보내지 않는 형태라 그 자체가 봇 신호다.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildNaverAutomationProfile } from '../automation/accountProfilePolicy';
import {
  detectChromeFullVersion, readChromeVersionFromLayout, resetChromeVersionCache,
} from '../automation/chromeVersionDetector';

/** 실제 Chrome 이 내보내는 형태. 실측값에서 그대로 가져왔다. */
const REAL_UA_151 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

describe('UA 형식 — 실제 Chrome 과 같은 축약형', () => {
  it('전체 빌드를 힌트로 줘도 UA 에는 major 만 들어간다', () => {
    const p = buildNaverAutomationProfile('someAccount', '151.0.7922.138');
    expect(p.userAgent).toBe(REAL_UA_151);
  });

  it('UA 에 전체 빌드 번호가 절대 들어가지 않는다 (봇 신호)', () => {
    for (const hint of ['151.0.7922.138', '149.0.7710.124', '']) {
      const p = buildNaverAutomationProfile('acc', hint);
      const version = p.userAgent.match(/Chrome\/([\d.]+) Safari/)?.[1] ?? '';
      // 실제 Chrome 은 major 뒤를 전부 0 으로 보낸다. 빌드 번호가 남아 있으면 봇 신호.
      expect(version.split('.').slice(1).join('.')).toBe('0.0.0');
    }
  });

  it('UA-CH 용 실제 빌드는 따로 보존한다', () => {
    const p = buildNaverAutomationProfile('acc', '151.0.7922.138');
    expect(p.fullVersion).toBe('151.0.7922.138');
    // UA 는 축약, fullVersion 은 전체 — 둘은 다른 값이어야 한다
    expect(p.userAgent).not.toContain(p.fullVersion);
  });

  it('힌트가 없어도 폴백 UA 는 형식이 올바르다', () => {
    const p = buildNaverAutomationProfile('acc');
    expect(p.userAgent).toMatch(/Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
    expect(p.fullVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('같은 계정은 같은 프로필을 받는다 (기존 계약 유지)', () => {
    const a = buildNaverAutomationProfile('leader_248', '151.0.7922.138');
    const b = buildNaverAutomationProfile('leader_248', '151.0.7922.138');
    expect(a).toEqual(b);
  });
});

describe('Chrome 버전 감지 — 고정 풀이 아니라 실제 설치본을 본다', () => {
  let dir: string;
  beforeEach(() => {
    resetChromeVersionCache();
    dir = mkdtempSync(join(tmpdir(), 'chrome-layout-'));
  });
  afterEach(() => {
    resetChromeVersionCache();
    rmSync(dir, { recursive: true, force: true });
  });

  it('설치 폴더의 버전 디렉터리를 읽는다', async () => {
    mkdirSync(join(dir, '151.0.7922.138'));
    writeFileSync(join(dir, 'chrome.exe'), '');
    expect(await readChromeVersionFromLayout(join(dir, 'chrome.exe'))).toBe('151.0.7922.138');
  });

  it('업데이트 직후 두 버전이 공존하면 실제 실행될 높은 쪽을 고른다', async () => {
    mkdirSync(join(dir, '151.0.7922.138'));
    mkdirSync(join(dir, '151.0.7922.140'));
    mkdirSync(join(dir, '149.0.7710.124'));
    writeFileSync(join(dir, 'chrome.exe'), '');
    expect(await readChromeVersionFromLayout(join(dir, 'chrome.exe'))).toBe('151.0.7922.140');
  });

  it('숫자 비교다 — 문자열 정렬이면 9 가 14 보다 크다고 본다', async () => {
    mkdirSync(join(dir, '9.0.1.1'));
    mkdirSync(join(dir, '14.0.1.1'));
    writeFileSync(join(dir, 'chrome.exe'), '');
    expect(await readChromeVersionFromLayout(join(dir, 'chrome.exe'))).toBe('14.0.1.1');
  });

  it('버전 디렉터리가 없으면 빈 문자열 — 폴백으로 흐른다', async () => {
    writeFileSync(join(dir, 'chrome.exe'), '');
    expect(await readChromeVersionFromLayout(join(dir, 'chrome.exe'))).toBe('');
  });

  it('없는 경로에도 던지지 않는다 (로그인을 막으면 안 된다)', async () => {
    expect(await readChromeVersionFromLayout(join(dir, 'nope', 'chrome.exe'))).toBe('');
    expect(await detectChromeFullVersion(async () => undefined)).toBe('');
  });

  it('감지 결과를 프로세스 수명 동안 재사용한다', async () => {
    mkdirSync(join(dir, '151.0.7922.138'));
    writeFileSync(join(dir, 'chrome.exe'), '');
    let calls = 0;
    const resolve = async () => { calls++; return join(dir, 'chrome.exe'); };
    expect(await detectChromeFullVersion(resolve)).toBe('151.0.7922.138');
    expect(await detectChromeFullVersion(resolve)).toBe('151.0.7922.138');
    expect(calls).toBe(1);
  });

  it('CHROME_VERSION_HINT 가 있으면 그것을 우선한다', async () => {
    const saved = process.env.CHROME_VERSION_HINT;
    process.env.CHROME_VERSION_HINT = '152.0.8000.10';
    try {
      expect(await detectChromeFullVersion(async () => join(dir, 'chrome.exe'))).toBe('152.0.8000.10');
    } finally {
      if (saved === undefined) delete process.env.CHROME_VERSION_HINT;
      else process.env.CHROME_VERSION_HINT = saved;
    }
  });

  it('형식이 틀린 힌트는 무시한다 (UA 가 깨지면 더 나쁘다)', async () => {
    const saved = process.env.CHROME_VERSION_HINT;
    process.env.CHROME_VERSION_HINT = '151';
    try {
      expect(await detectChromeFullVersion(async () => undefined)).toBe('');
    } finally {
      if (saved === undefined) delete process.env.CHROME_VERSION_HINT;
      else process.env.CHROME_VERSION_HINT = saved;
    }
  });
});
