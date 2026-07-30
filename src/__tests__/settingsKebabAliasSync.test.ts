import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { syncMasterIntoAccountSettings } from '../main/userDataMigration';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-30] 사용자 실측 재현: 네이버 검색 API Client Secret을 정상 입력했는데
 * 앱이 "없다"고 판단해 실시간 수집이 30초 타임아웃으로 죽던 버그.
 *
 * 원인: 설정은 같은 값을 camelCase와 kebab-case 두 형태로 저장하는데,
 * 마스터 settings.json에는 secret이 kebab(naver-client-secret)으로만 있었고
 * 계정 동기화의 PRESERVE_FIELDS는 camelCase만 나열해 그 값을 보지 못했다.
 * (ID는 camelCase로도 있어 동기화됨 → 이 비대칭이 "ID는 있고 Secret만 없는"
 * 상태를 만들었다.)
 */
describe('settings kebab-case alias sync', () => {
  it('마스터에 kebab 형태로만 있는 Secret이 계정 파일로 동기화된다 (실측 재현)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-sync-'));
    // 실측 형태 그대로: 마스터는 ID=camel, Secret=kebab만 보유
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({
      naverClientId: 'ID_20_CHARS_XXXXXXXX',
      'naver-client-secret': 'SECRET_16_CHARS_',
    }), 'utf8');
    // 계정 파일: ID는 있으나 Secret은 어떤 표기로도 없음
    writeFileSync(join(dir, 'settings_acct.json'), JSON.stringify({
      naverClientId: 'ID_20_CHARS_XXXXXXXX',
      'naver-client-id': 'ID_20_CHARS_XXXXXXXX',
    }), 'utf8');

    const result = syncMasterIntoAccountSettings(dir);
    expect(result.files).toBe(1);

    const acct = JSON.parse(readFileSync(join(dir, 'settings_acct.json'), 'utf8'));
    // configManager는 camel → kebab 순으로 읽으므로 어느 표기로든 값이 있으면 된다
    const resolvedSecret = acct.naverClientSecret || acct['naver-client-secret'];
    expect(resolvedSecret).toBe('SECRET_16_CHARS_');
  });

  it('계정 파일에 이미 값이 있으면 마스터가 덮어쓰지 않는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'settings-sync-keep-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({
      'naver-client-secret': 'MASTER_SECRET',
    }), 'utf8');
    writeFileSync(join(dir, 'settings_acct.json'), JSON.stringify({
      naverClientSecret: 'ACCOUNT_SECRET',
    }), 'utf8');

    syncMasterIntoAccountSettings(dir);
    const acct = JSON.parse(readFileSync(join(dir, 'settings_acct.json'), 'utf8'));
    expect(acct.naverClientSecret).toBe('ACCOUNT_SECRET');
  });

  it('별칭 조회 헬퍼가 3개 병합 지점 모두에 적용됐다', () => {
    const migration = read('main/userDataMigration.ts');
    expect(migration).toContain('function toKebabKey');
    expect(migration).toContain('function readPreservedField');
    // camelCase 직접 조회로 되돌리면 이 버그가 재발한다
    expect(migration).not.toMatch(/const mv = master\[k\];/);
    expect(migration).not.toMatch(/const srcV = src\[k\];/);
    expect(migration).toMatch(/readPreservedField\(master, k\)/);
    expect(migration).toMatch(/readPreservedField\(src, k\)/);
  });
});

/**
 * [2026-07-30] 그라운딩 비용 보호: UI는 "Gemini 그라운딩은 비용이 높아 자동
 * 폴백에서 제외 — 필요할 때만 직접 선택"이라고 약속하는데, 크롤링 수집 폴백만
 * 그 약속을 지키지 않고 무조건 호출했다.
 */
describe('grounding fallback cost gate', () => {
  it('수집 폴백의 그라운딩은 명시적 옵트인 전용이다', () => {
    const assembler = read('sourceAssembler.ts');
    expect(assembler).toContain('allowGroundingFallback?: boolean');
    expect(assembler).toContain('options.allowGroundingFallback === true');
    expect(assembler).toMatch(/if \(!allowGroundingFallback\) \{[\s\S]{0,220}Gemini 그라운딩 폴백 생략/);
  });

  it('핸들러는 팩트체크 엔진이 그라운딩일 때만 옵트인한다', () => {
    const handlers = read('main/ipc/miscHandlers.ts');
    expect(handlers).toMatch(/factCheckEngine[\s\S]{0,80}=== 'gemini-grounding'/);
    expect(handlers).toContain('allowGroundingFallback,');
  });
});
