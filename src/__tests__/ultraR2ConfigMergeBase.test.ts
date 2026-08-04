import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-04] ULTRA 안정화 플랜 R2 — 설정 소거 P0.
 *
 * saveConfig()는 __userId(계정 전환 신호)를 동기 처리하면서 cachedConfig=null로
 * 만들고 그 필드를 제거한 뒤 _saveConfigImpl에 넘긴다. 그래서 impl 안의
 * `if (__userId)` 분기(디스크를 loadConfig로 읽어 머지 기반을 만드는 정상 경로)는
 * 도달하지 않고, else 분기가 `{...null, ...restUpdate}`로 실행된다.
 * 결과적으로 부분 업데이트 한 번이 전체 설정 파일을 빈 기반으로 재작성해
 * PRESERVE_KEYS 화이트리스트 밖 필드가 통째로 사라졌다.
 *
 * 계약: 부분 업데이트는 절대 빈 기반으로 전체 파일을 재작성하지 않는다.
 */
describe('R2: config 부분 업데이트가 빈 기반 재작성이 되지 않는다', () => {
  const src = read('configManager.ts');

  it('else 분기가 cachedConfig null일 때 디스크를 머지 기반으로 읽는다', () => {
    expect(src).toContain('const mergeBase = cachedConfig ?? await loadConfig();');
    expect(src).toMatch(/cachedConfig = \{\s*\.\.\.mergeBase,\s*\.\.\.restUpdate,\s*\};/);
  });

  it('null 스프레드로 직접 머지하던 형태가 남아있지 않다', () => {
    // `...cachedConfig,` 를 머지 기반으로 쓰는 else 분기가 재발하면 회귀
    expect(src).not.toMatch(/\} else \{\s*cachedConfig = \{\s*\.\.\.cachedConfig,\s*\.\.\.restUpdate,/);
  });

  it('계정 전환 신호는 여전히 동기 처리된다 (동시 loadConfig 경합 방지 의도 유지)', () => {
    expect(src).toMatch(/const \{ __userId, \.\.\.restUpdate \} = update as any;[\s\S]{0,300}_activeUserId = __userId;/);
  });
});
