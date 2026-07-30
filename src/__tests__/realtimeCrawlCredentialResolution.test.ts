import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-30] 실시간 정보 수집 30초 타임아웃 (라이브 실측).
 *
 * 증상: 키워드 글 생성에서 "[실시간 크롤링] 30초 타임아웃 초과" → 근거 없이 글 생성.
 * 원인 2개:
 *   1) 사용자 설정에 naverClientSecret이 없음 (사용자 조치 필요)
 *   2) content:collectFromPlatforms 핸들러가 검색 API 키가 아니라 데이터랩 키만
 *      넘김 → Secret을 정상 입력해도 빠른 경로(0.5초)가 스킵되고
 *      모바일 파싱(URL당 10초 ×2) + Gemini Grounding 폴백으로 빠져 30초 초과.
 *
 * 이 테스트는 (2)를 잠근다. 자격증명 해석 순서는 configManager와 동일해야 한다.
 */
describe('realtime crawl credential resolution', () => {
  it('수집 핸들러는 검색 API 키를 우선 사용하고 데이터랩을 폴백으로 쓴다', () => {
    const handlers = read('main/ipc/miscHandlers.ts');
    expect(handlers).toContain('config.naverClientId || config.naverDatalabClientId');
    expect(handlers).toContain('config.naverClientSecret || config.naverDatalabClientSecret');
    // 데이터랩 단독 사용 재도입 금지 (회귀 방지)
    expect(handlers).not.toMatch(/clientId:\s*config\.naverDatalabClientId,\s*\n\s*clientSecret:\s*config\.naverDatalabClientSecret,/);
  });

  it('자격증명이 불완전하면 원인을 로그로 알린다 (조용한 30초 낭비 금지)', () => {
    const handlers = read('main/ipc/miscHandlers.ts');
    expect(handlers).toMatch(/if \(!crawlClientId \|\| !crawlClientSecret\) \{/);
    expect(handlers).toContain('네이버 검색 API Client Secret을 입력하세요');
  });

  it('configManager와 동일한 해석 순서 (검색 → 데이터랩)', () => {
    const configManager = read('configManager.ts');
    // 기준 구현: ncid/ncsec가 검색 우선, 데이터랩 폴백
    expect(configManager).toContain('config.naverClientId || config.naverDatalabClientId');
    expect(configManager).toContain('config.naverClientSecret || config.naverDatalabClientSecret');
  });
});
