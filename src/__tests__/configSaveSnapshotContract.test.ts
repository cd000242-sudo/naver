import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-02] 저장 본체가 await 뒤에 공유 캐시를 다시 읽지 않는다는 소스 계약.
 *
 * 경합 자체는 configManagerRegression.test.ts 가 재현한다. 그 파일은 fs 를 diskStore 로
 * 모킹해서 소스를 읽을 수 없으므로, 계약 문구는 여기서 잠근다.
 *
 * 왜 계약이 필요한가 — 흔한 수정이 더 나쁘기 때문이다.
 *   cachedConfig ?? {}  →  바로 뒤 writeFile 이 설정 파일을 {} 로 덮는다.
 *   API 키 · 네이버 계정이 전부 사라진다. 실측 크래시는 그 쓰기 직전에 멈춰 방어 역할을 했다.
 * 누군가 "null 만 막자" 며 저 한 줄로 되돌리면 여기가 빨개져야 한다.
 */

const src = readFileSync(resolve(__dirname, '..', 'configManager.ts'), 'utf-8').replace(/\r/g, '');

describe('저장 본체는 병합본을 스냅샷으로 붙든다', () => {
  it('가드 직후 스냅샷을 뜬다', () => {
    expect(src).toMatch(/if \(!cachedConfig\) cachedConfig = \{\};[\s\S]{0,1500}const configToPersist: AppConfig = cachedConfig;/u);
  });

  it('암호화 마이그레이션은 공유 캐시가 아니라 스냅샷을 받는다', () => {
    expect(src).toMatch(/const \{ config: persistedConfig, report \} = migrateConfigToEncrypted\(\s*configToPersist as unknown/u);
    // 되돌린 흔적 — 주 저장 migrate 호출이 cachedConfig 를 직접 받으면 안 된다
    expect(src).not.toMatch(/const \{ config: persistedConfig, report \} = migrateConfigToEncrypted\(\s*cachedConfig as unknown/u);
  });

  it('병합본이 비었는데 직전 설정에 키가 있으면 빈 파일을 쓰지 않고 멈춘다', () => {
    expect(src).toMatch(/Object\.keys\(configToPersist\)\.length === 0 && Object\.keys\(previousConfig\)\.length > 0/u);
    expect(src).toContain('기존 설정을 빈 파일로 덮어쓸 뻔했다');
  });

  it('흔한 수정(?? {})을 주 저장 쓰기 경로에 넣지 않았다', () => {
    const migrateAt = src.indexOf('const { config: persistedConfig, report } = migrateConfigToEncrypted(');
    const window = src.slice(Math.max(0, migrateAt - 400), migrateAt + 200);
    expect(window).not.toMatch(/cachedConfig \?\? \{\}/u);
  });
});
