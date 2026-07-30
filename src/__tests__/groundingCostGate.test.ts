import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import {
  describeGroundingDecision,
  isGroundingExplicitlyEnabled,
} from '../content/groundingCostPolicy';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-30] 실금전 피해 회귀 잠금: 이틀에 ₩15,000+ 그라운딩 과금.
 *
 * googleSearch 도구 부착 지점이 7곳이었고 그중 6곳이 무게이트 또는 기본 ON:
 *   - contentGenerator 본문 생성: enableSearchGrounding !== false = 기본 ON (₩50/글)
 *   - gemini.ts 2곳: 주석 "상시 활성화" — 게이트 없음
 *   - researchWithGeminiGrounding: 함수 내부 게이트 없음 (호출자 2곳)
 *   - findRelevantOfficialSite: 무게이트
 * 정책: 옵트인 전용 + fail-closed.
 */
describe('grounding cost gate (옵트인 전용)', () => {
  it('기본값은 OFF — 설정 키가 없으면 과금하지 않는다', () => {
    expect(isGroundingExplicitlyEnabled(undefined)).toBe(false);
    expect(isGroundingExplicitlyEnabled(null)).toBe(false);
    expect(isGroundingExplicitlyEnabled({})).toBe(false);
    // 과거 opt-out 시절 기본값(키 부재)이 ON이던 회귀 차단
    expect(isGroundingExplicitlyEnabled({ enableSearchGrounding: undefined })).toBe(false);
  });

  it('사용자가 명시적으로 켠 경우에만 ON', () => {
    expect(isGroundingExplicitlyEnabled({ factCheckEngine: 'gemini-grounding' })).toBe(true);
    expect(isGroundingExplicitlyEnabled({ enableSearchGrounding: true })).toBe(true);
    // 다른 팩트체크 엔진은 그라운딩을 켜지 않는다 (저비용 선택 존중)
    for (const engine of ['auto', 'crawl', 'naver', 'gpt-claude', 'perplexity', 'off']) {
      expect(isGroundingExplicitlyEnabled({ factCheckEngine: engine }), engine).toBe(false);
    }
    expect(isGroundingExplicitlyEnabled({ enableSearchGrounding: false })).toBe(false);
  });

  it('결정 로그에 비용을 명시한다', () => {
    expect(describeGroundingDecision(true)).toContain('₩50');
    expect(describeGroundingDecision(false)).toContain('비용 보호');
  });

  it('본문 생성 경로가 opt-out(!== false)에서 옵트인으로 전환됐다', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toContain('const configGrounding = isGroundingExplicitlyEnabled(config as any)');
    // 기본 ON 표현 재도입 금지
    expect(gen).not.toMatch(/enableSearchGrounding\s*!==\s*false/);
  });

  it('researchWithGeminiGrounding는 함수 레벨에서 fail-closed 차단한다', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(/isGroundingExplicitlyEnabled\(groundingCfg as any\)[\s\S]{0,200}return \{ content: '', title: '', sources: \[\], success: false \}/);
    expect(gen).toContain('설정 확인 실패 → 비용 보호로 생략');
  });

  it('공식 사이트 조회도 게이트를 통과해야 한다', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(/\[공식사이트 검색\][\s\S]{0,80}describeGroundingDecision\(false\)/);
  });

  it('gemini.ts의 "상시 활성화" 2지점이 조건부로 바뀌었다', () => {
    const gemini = read('gemini.ts');
    const conditional = gemini.match(/\.\.\.\(await isGeminiGroundingAllowed\(\) \? \{ tools: \[\{ googleSearch: \{\} \}\] \} : \{\}\),/g) || [];
    expect(conditional.length).toBe(2);
    // 무조건 부착 재도입 금지
    expect(gemini).not.toMatch(/^\s*tools: \[\{ googleSearch: \{\} \}\],\s*$/m);
    expect(gemini).toContain('비용 보호로 OFF');
  });

  it('수집 폴백 그라운딩도 옵트인 (v2.11.149에서 도입, 유지 확인)', () => {
    const assembler = read('sourceAssembler.ts');
    expect(assembler).toContain('options.allowGroundingFallback === true');
    const handlers = read('main/ipc/miscHandlers.ts');
    expect(handlers).toMatch(/factCheckEngine[\s\S]{0,80}=== 'gemini-grounding'/);
  });
});
