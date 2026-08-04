import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-04] ULTRA 안정화 플랜 R1 — 보안·과금 P0 2건.
 *
 * R1-1: 공개 저장소에 SmartProxy 구독 자격증명이 리터럴로 박혀 있었다
 *       (asar 추출로도 탈취 가능). 자격증명은 환경변수 전용으로 전환.
 * R1-2: 이미지 관리 탭의 소제목 이미지 생성 체인에 dropshot(UI 기본 선택값,
 *       무료 구독)·nano-banana-2·nano-banana 분기가 없어, 최종 else가 최고가
 *       nano-banana-pro(₩185/장)로 조용히 대체 과금하고 있었다.
 */
describe('R1-1: 프록시 자격증명 하드코딩 제거', () => {
  const src = read('crawler/utils/proxyManager.ts');

  it('노출됐던 자격증명 리터럴이 소스에 없다', () => {
    expect(src).not.toContain('tT3=bhH71lailX8bWj');
    expect(src).not.toContain('user-sproqjsqtg-country-kr');
  });

  it('자격증명은 환경변수 전용 — 빈 문자열 폴백만 남는다', () => {
    expect(src).toMatch(/username:\s*process\.env\.SMARTPROXY_USER\s*\|\|\s*''/);
    expect(src).toMatch(/password:\s*process\.env\.SMARTPROXY_PASS\s*\|\|\s*''/);
  });

  it('미설정 시 다른 프록시로 대체하지 않고 명시 경고 후 직접 연결', () => {
    expect(src).toContain('SMARTPROXY_USER / SMARTPROXY_PASS 미설정');
    expect(src).toMatch(/if \(!isConfigured\(\)\) \{[\s\S]{0,400}return null;/);
  });
});

describe('R1-2: 이미지 엔진 select 무시 → 최고가 대체 과금 차단', () => {
  const src = read('renderer/modules/headingImageGen.ts');

  it('dropshot·nano-banana-2·nano-banana 분기가 존재한다', () => {
    const branches = src.match(
      /imageSource === 'dropshot' \|\| imageSource === 'nano-banana-2' \|\| imageSource === 'nano-banana'/g,
    );
    // 일괄 생성 + 개별 재생성 두 경로 모두
    expect(branches?.length).toBe(2);
  });

  it('그 분기는 선택값을 그대로 provider로 넘긴다 (고정 provider 금지)', () => {
    expect(src).toMatch(
      /imageSource === 'dropshot'[\s\S]{0,400}provider: imageSource,/g,
    );
  });

  it('알 수 없는 엔진을 nano-banana-pro로 대체하지 않는다', () => {
    expect(src).not.toContain('나노 바나나 프로(Gemini)로 대체');
    expect(src).not.toMatch(/알 수 없는 이미지 소스[\s\S]{0,200}provider: 'nano-banana-pro'/);
  });

  it('알 수 없는 엔진은 명시 실패로 중단한다 (자동 폴백 금지 정책)', () => {
    const explicitFailures = src.match(
      /자동 대체를 하지 않습니다\. 설정에서 엔진을 다시 선택해주세요\./g,
    );
    expect(explicitFailures?.length).toBe(2);
  });

  it('UI 기본 선택값이 여전히 dropshot이다 (분기 대상 확인)', () => {
    const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/<option value="dropshot"[^>]*selected>/);
  });
});
