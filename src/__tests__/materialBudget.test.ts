/**
 * [2026-09-11 사장님] "글 퀄리티가 2차로 손 안 봐도 되게끔 올리고 싶다. 이탈률이 생기고
 * 팩트도 70~80%에 방향성 문제가 재기된다. 크롤링할 때 재료가 부족해서인가?"
 *
 * 측정했다. 재료를 못 모으는 게 아니라 **우리가 두 번 자르고 있었다.**
 *
 *   수집(sourceAssembler)  FULLTEXT_TOTAL_BUDGET_CHARS = 8,000 에서 멈춤
 *   렌더러(contentGeneration) crawledText.substring(0, 10000) 로 또 자름
 *   설계도(buildBlueprintPrompt) DEFAULT_MATERIAL_MAX_CHARS = 30,000 을 받을 수 있음
 *
 * 로그 실측:
 *   "네이버 API 성공: 1,781자 (블로그 10개, 웹문서 10개)"  ← 문서당 90자, 스니펫이다
 *   "상위글 본문 4건 수집 성공 (2,032ms)"                  ← 본문은 4건뿐
 *   "Blueprint ✅ 인용 0·사실 6"                            ← 인용문이 0개
 *
 * 인용이 0인 이유: 설계도는 인용을 **자료에 글자 그대로 있을 때만** 싣는다(환각 차단).
 * 스니펫에는 당사자 발언이 거의 없다. 본문을 더 받아야 인용이 생긴다.
 *
 * 비용을 안 늘리는 길: **설계도에만 긴 재료를 주고 본문 프롬프트는 그대로 둔다.**
 * 설계도가 재료를 사실·인용으로 압축하므로, 원재료를 늘려도 본문 호출은 커지지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveBlueprintMaterial, MATERIAL_BUDGET } from '../content/materialBudget';

describe('resolveBlueprintMaterial — 설계도에는 긴 재료를, 본문에는 짧은 재료를', () => {
  const long = 'ㄱ'.repeat(25_000);

  it('긴 재료가 따로 있으면 그것을 쓴다', () => {
    expect(resolveBlueprintMaterial({ rawText: 'short', blueprintMaterial: long }).length).toBe(long.length);
  });

  it('없으면 본문 재료로 되돌아간다 — 구버전 payload 도 그대로 산다', () => {
    expect(resolveBlueprintMaterial({ rawText: 'short' })).toBe('short');
  });

  it('설계도 상한을 넘지 않는다', () => {
    const huge = 'ㄴ'.repeat(60_000);
    expect(resolveBlueprintMaterial({ blueprintMaterial: huge }).length).toBe(MATERIAL_BUDGET.blueprintMaxChars);
  });

  it('둘 다 비면 빈 문자열 — 호출자가 설계도를 생략한다', () => {
    expect(resolveBlueprintMaterial({})).toBe('');
    expect(resolveBlueprintMaterial(null)).toBe('');
  });

  it('본문 상한이 설계도 상한보다 작다 — 본문 호출을 키우지 않는 것이 이 설계의 전부다', () => {
    expect(MATERIAL_BUDGET.bodyMaxChars).toBeLessThan(MATERIAL_BUDGET.blueprintMaxChars);
  });
});

describe('수집 예산 — 설계도가 받을 수 있는 만큼 모은다', () => {
  const assembler = readFileSync(new URL('../sourceAssembler.ts', import.meta.url), 'utf8');
  const value = (name: string): number => {
    const at = assembler.indexOf(name + ' = ');
    if (at < 0) return 0;
    const digits = assembler.slice(at, at + name.length + 20).match(/[0-9]+/g);
    return digits ? Number(digits[0]) : 0;
  };

  it('본문 수집 예산이 8,000자보다 크다 — 그 값이 인용 0의 뿌리였다', () => {
    expect(value('FULLTEXT_TOTAL_BUDGET_CHARS')).toBeGreaterThan(8_000);
  });

  it('본문 건수도 함께 늘린다 — 예산만 늘리면 건수 상한에 걸린다', () => {
    expect(value('FULLTEXT_MAX_SUCCESS')).toBeGreaterThan(5);
  });

  it('수집 예산이 설계도 상한을 넘지 않는다 — 모아도 못 쓰면 시간만 버린다', () => {
    expect(value('FULLTEXT_TOTAL_BUDGET_CHARS')).toBeLessThanOrEqual(MATERIAL_BUDGET.blueprintMaxChars);
  });
});

describe('배선 핀 — 설계도만 긴 재료를 받는다', () => {
  const live = (path: string, needle: string): number => readFileSync(new URL(path, import.meta.url), 'utf8')
    .split(String.fromCharCode(10))
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .filter((l) => l.includes(needle))
    .length;

  it('설계도 호출이 resolveBlueprintMaterial 을 쓴다', () => {
    expect(live('../contentGenerator.ts', 'resolveBlueprintMaterial(')).toBeGreaterThan(0);
  });

  it('수집이 자르기 전 원본을 실어 보낸다', () => {
    expect(live('../sourceAssembler.ts', 'blueprintMaterial:')).toBeGreaterThan(0);
  });

  it('본문 프롬프트의 원문 상한은 그대로 10,000자 — 본문 호출을 키우지 않는 것이 핵심이다', () => {
    expect(live('../renderer/modules/contentGeneration.ts', 'crawledText.substring(0, 10000)')).toBeGreaterThan(0);
  });
});
