import { describe, expect, it } from 'vitest';
import {
  CLEARABLE_CREDENTIAL_FIELDS,
  CLEAR_INTENT_FIELD,
  isIntentionallyCleared,
  readClearIntent,
} from '../content/credentialClearIntent';

/**
 * [2026-08-29 실측] "저장된 로그인 정보 삭제"를 눌러도 다른 라이선스 계정으로
 * 로그인할 수 없었다. 설정 파일이 이랬다:
 *   계정 파일 : rememberLicenseCredentials=false, savedLicenseUserId=있음
 *   마스터    : rememberLicenseCredentials=true,  savedLicenseUserId=있음
 * 빈 문자열로 지우면 PRESERVE 방어가 디스크 값으로 되돌렸고, 마스터가 자동로그인을 다시 켰다.
 */
describe('credentialClearIntent', () => {
  it('reads only the credential fields — API keys can never be cleared this way', () => {
    const intent = readClearIntent({
      [CLEAR_INTENT_FIELD]: ['savedLicenseUserId', 'geminiApiKey', 'openaiApiKey'],
    });
    expect(intent).toEqual(['savedLicenseUserId']);
  });

  it('returns nothing when no intent is present', () => {
    expect(readClearIntent({})).toEqual([]);
    expect(readClearIntent(null)).toEqual([]);
    expect(readClearIntent({ [CLEAR_INTENT_FIELD]: 'not-an-array' })).toEqual([]);
  });

  it('marks a field as intentionally cleared only when listed', () => {
    const cleared = readClearIntent({ [CLEAR_INTENT_FIELD]: ['savedLicensePassword'] });
    expect(isIntentionallyCleared('savedLicensePassword', cleared)).toBe(true);
    expect(isIntentionallyCleared('savedLicenseUserId', cleared)).toBe(false);
    expect(isIntentionallyCleared('geminiApiKey', cleared)).toBe(false);
  });

  it('covers both license and Naver credentials, and nothing else', () => {
    expect([...CLEARABLE_CREDENTIAL_FIELDS]).toEqual([
      'savedLicenseUserId', 'savedLicensePassword', 'savedNaverId', 'savedNaverPassword',
    ]);
  });

  it('the login screen sends the intent, not just empty strings', () => {
    const html = require('node:fs').readFileSync('public/login.html', 'utf-8');
    expect(html).toContain("__clearCredentialFields: ['savedLicenseUserId', 'savedLicensePassword']");
  });
});

/**
 * configManager 의 세 지점이 실제로 고쳐졌는지 소스로 잠근다.
 * 셋 중 하나라도 되돌아가면 로그아웃이 다시 무효가 된다.
 */
describe('configManager 배선 잠금', () => {
  const src = require('node:fs').readFileSync('src/configManager.ts', 'utf-8');

  it('does not force remember back on when the user explicitly turned it off', () => {
    // 이전: rememberLicenseCredentials !== true  → false 여도 true 로 덮었다
    expect(src).not.toMatch(/rememberLicenseCredentials !== true/);
    expect(src).not.toMatch(/rememberCredentials !== true/);
    expect(src).toMatch(/parsed\.rememberLicenseCredentials === undefined/);
    expect(src).toMatch(/parsed\.rememberCredentials === undefined/);
  });

  it('skips the save-time preserve guard for intentionally cleared fields', () => {
    expect(src).toMatch(/if \(isIntentionallyCleared\(k, clearedCredentialFields\)\) continue;/);
  });

  it('does not refill credentials from master once remember is off', () => {
    expect(src).toMatch(/rememberLicenseCredentials === false\s*\)\s*continue;/);
    expect(src).toMatch(/rememberCredentials === false\s*\)\s*continue;/);
  });
});
