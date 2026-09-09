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
    expect(src).toMatch(/parsed\.rememberLicenseCredentials === undefined/);
    /*
     * [2026-09-09] 네이버 쪽 판정 기준이 "false 인가" 에서 "직접 껐는가" 로 바뀌었다.
     *   업데이트마다 체크가 풀리던 사고 — 계정 파일의 기본값 false 까지 "껐다" 로 읽어
     *   마스터의 아이디/비번을 영영 복구하지 못했다(사장님 실측).
     * 지키려는 계약은 그대로다: 직접 끈 사람의 자동로그인을 되살리지 않는다.
     * 그 판정을 naverCredentialsTurnedOff 가 맡는다.
     */
    expect(src).toMatch(/const naverCredentialsTurnedOff = parsed\.credentialsOptOut === true/);
    expect(src).toMatch(/parsed\.rememberCredentials === false && !hasEmptyNaverSlots/);
  });

  it('skips the save-time preserve guard for intentionally cleared fields', () => {
    expect(src).toMatch(/if \(isIntentionallyCleared\(k, clearedCredentialFields\)\) continue;/);
  });

  it('does not refill credentials from master once remember is off', () => {
    expect(src).toMatch(/rememberLicenseCredentials === false\s*\)\s*continue;/);
    // [2026-09-09] 네이버는 같은 계약을 naverCredentialsTurnedOff 로 판정한다.
    expect(src).toMatch(/&& naverCredentialsTurnedOff\s*\)\s*continue;/);
  });

  it('직접 끈 사람(키가 아예 없음)은 여전히 복구하지 않는다', () => {
    // 체크 해제 저장은 값을 undefined 로 지운다 → 키가 사라진다.
    // 그 모양이면 마커가 없어도 "직접 껐다" 로 본다.
    expect(src).toMatch(/hasEmptyNaverSlots/);
    expect(src).toMatch(/savedNaverId === 'string' && parsed\.savedNaverId\.trim\(\) === ''/);
  });
});
