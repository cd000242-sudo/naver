import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사장님 실측] "업데이트할 때마다 아이디 비밀번호 기억하기 체크가 초기화되네."
 *
 * 실제 설정 파일:
 *   settings.json(마스터)   rememberCredentials=true,  savedNaverId=있음, savedNaverPassword=있음
 *   settings_acct1.json(사용) rememberCredentials=false, savedNaverId='', savedNaverPassword=''
 *
 * 뿌리: rememberCredentials 의 false 가 두 가지를 뜻했다 —
 *   (가) 사용자가 체크를 해제했다  (나) 계정 파일이 갓 만들어져 기본값이다.
 * 계정 파일 병합이 (나)까지 "껐다"로 읽어 마스터 값을 영영 복구하지 못했고,
 * boolean 은 병합 루프의 aHas 판정에서 항상 "있음"이라 마스터가 덮지도 못했다.
 * 그래서 한 번 false 가 되면 영구히 고착됐다.
 *
 * 해법은 credentialClearIntent 와 같은 원칙 — 값이 아니라 **의도**를 따로 싣는다.
 */
describe('아이디·비밀번호 기억하기 — 업데이트 후에도 유지', () => {
  const config = read('configManager.ts');
  const save = read('renderer/modules/credentialsSave.ts');
  const form = read('renderer/modules/formUtilities.ts');

  it('"직접 껐다" 표시가 설정에 있다', () => {
    expect(config).toMatch(/credentialsOptOut\?: boolean;/);
  });

  it('자격증명 복구를 막는 기준이 false 가 아니라 명시적 의도다', () => {
    expect(config).toMatch(/&& naverCredentialsTurnedOff\s*\n?\s*\) continue;/);
    expect(config).toMatch(/const naverCredentialsTurnedOff = parsed\.credentialsOptOut === true/);
    // 예전 기준(false 면 무조건 막기)으로 되돌아가면 같은 고착이 재발한다.
    expect(config).not.toMatch(/&& parsed\.rememberCredentials === false\s*\n\s*\) continue;/);
  });

  it('직접 끄지 않은 false 는 되살린다 (boolean 은 병합 루프가 못 덮는다)', () => {
    expect(config).toMatch(/&& !naverCredentialsTurnedOff/);
    expect(config).toMatch(/parsed\.rememberCredentials !== true/);
  });

  it('빈 문자열로 남은 계정 파일은 "기본값" 으로 본다 (사장님 파일 모양)', () => {
    // settings_acct1.json: remember=false, savedNaverId='', savedNaverPassword=''
    // 직접 해제하면 값이 undefined 로 지워져 키가 사라진다 — 빈 문자열은 그 모양이 아니다.
    expect(config).toMatch(/hasEmptyNaverSlots/);
    expect(config).toMatch(/parsed\.savedNaverId\.trim\(\) === ''/);
  });

  it('체크 해제 시 의도를 남긴다', () => {
    for (const source of [save, form]) {
      expect(source).toMatch(/rememberCredentials: false,[\s\S]{0,220}credentialsOptOut: true,/);
    }
  });

  it('다시 체크하면 의도 표시를 지운다', () => {
    for (const source of [save, form]) {
      expect(source).toMatch(/rememberCredentials: true,[\s\S]{0,200}credentialsOptOut: false,/);
    }
  });

  it('의도 표시는 마스터에서 병합해 오지 않는다 (계정마다 다른 선택)', () => {
    const preserveBlock = config.slice(
      config.indexOf('const PRESERVE = ['),
      config.indexOf('let mergedCount'),
    );
    expect(preserveBlock).not.toMatch(/credentialsOptOut/);
  });
});
