// 패키징 전 민감정보 초기화 목록이 실제 민감정보 목록과 어긋나지 않게 잠근다.
//
// 왜: 두 목록을 손으로 관리하다 11개가 빠져 있었다(2026-08-19 실측). 그중 네이버
// 검색 키·API HUB 키·검색광고 키가 포함돼, 빌드 머신의 개발자 키가 패키지에
//섞여 나갈 여지가 있었다. 새 키를 추가하면서 초기화를 잊으면 여기서 걸린다.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { getSensitiveFields } from '../security/encryptionMigrator';

const ROOT = resolve(__dirname, '..', '..');
const scrub = require(join(ROOT, 'scripts', 'reset-config-for-pack.js')) as {
  SENSITIVE_CONFIG_FIELDS: string[];
  KEBAB_SECRET_ALIASES: string[];
};

/** camelCase → kebab-case (configManager 호환 레이어와 같은 규칙). */
function toKebab(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

describe('패키징 전 민감정보 초기화', () => {
  it('암호화 대상 민감정보가 모두 초기화 목록에 있다', () => {
    const sensitive = getSensitiveFields();
    const scrubbed = new Set(scrub.SENSITIVE_CONFIG_FIELDS);
    const missing = sensitive.filter((f) => !scrubbed.has(f));
    expect(missing).toEqual([]);
  });

  it('네이버 키 4종이 빠짐없이 들어 있다 — 개인 키가 배포본에 섞이면 안 된다', () => {
    for (const field of [
      'naverClientId', 'naverClientSecret',
      'naverHubClientId', 'naverHubClientSecret',
      'naverDatalabClientId', 'naverDatalabClientSecret',
      'naverAdApiKey', 'naverAdSecretKey', 'naverAdCustomerId',
    ]) {
      expect(scrub.SENSITIVE_CONFIG_FIELDS).toContain(field);
    }
  });

  it('케밥 별칭도 함께 지운다 — 설정은 두 형태로 저장된다', () => {
    const aliases = new Set(scrub.KEBAB_SECRET_ALIASES);
    const needsAlias = scrub.SENSITIVE_CONFIG_FIELDS.filter((f) => f.endsWith('ApiKey')
      || f.endsWith('ClientId') || f.endsWith('ClientSecret')
      || f.endsWith('SecretKey') || f.endsWith('CustomerId'));
    const missing = needsAlias.map(toKebab).filter((k) => !aliases.has(k));
    expect(missing).toEqual([]);
  });

  it('초기화가 목록을 통째로 순회한다 — 개별 대입으로 되돌아가면 실패', () => {
    const source = readFileSync(join(ROOT, 'scripts', 'reset-config-for-pack.js'), 'utf-8');
    expect(source).toMatch(/SENSITIVE_CONFIG_FIELDS\.forEach/);
    expect(source).toMatch(/KEBAB_SECRET_ALIASES\.forEach/);
  });
});

describe('사용자 개인 키는 코드에 없다', () => {
  it('네이버 키 필드에 문자열 리터럴을 박아둔 곳이 0건', () => {
    const files = [
      'src/naver/apiCredentials.ts',
      'src/naver/apiClient.ts',
      'src/configManager.ts',
      'src/renderer/utils/settingsModal.ts',
    ];
    const hardcoded = /naver(Hub)?(Client|Ad)(Id|Secret|ApiKey|SecretKey|CustomerId)\s*[:=]\s*['"][A-Za-z0-9_-]{6,}['"]/;
    const offenders = files.filter((p) => hardcoded.test(readFileSync(join(ROOT, p), 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('자격증명은 사용자 설정과 환경변수에서만 온다', () => {
    const creds = readFileSync(join(ROOT, 'src', 'naver', 'apiCredentials.ts'), 'utf-8');
    // 값의 출처는 payload(사용자 설정) 또는 process.env 뿐이어야 한다.
    const sources = creds.match(/clean\(([^)]*)\)/g) || [];
    for (const s of sources) {
      expect(s).toMatch(/payload|process\.env|value/);
    }
    expect(creds).not.toMatch(/=\s*['"][A-Za-z0-9_-]{10,}['"]/);
  });
});

describe('초기화 스크립트는 require 만으로 실행되지 않는다', () => {
  it('main 가드가 있다 — 테스트가 부작용으로 빌드 머신 설정을 지우면 안 된다', () => {
    const source = readFileSync(join(ROOT, 'scripts', 'reset-config-for-pack.js'), 'utf-8');
    expect(source).toMatch(/if \(require\.main !== module\) return;/);
    // 가드는 목록 export 뒤, 실행 본문 앞에 있어야 한다.
    expect(source.indexOf('module.exports')).toBeLessThan(source.indexOf('require.main !== module'));
    expect(source.indexOf('require.main !== module')).toBeLessThan(source.indexOf('배포용 설정 초기화 시작'));
  });

  it('require 해도 renderer 백업 파일이 생기지 않는다', () => {
    // 이 테스트 파일 상단에서 이미 require 했다. 그 부작용이 없어야 한다.
    expect(existsSync(join(ROOT, 'src', 'renderer', 'renderer.ts.pre-pack-backup'))).toBe(false);
  });
});
