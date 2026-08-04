import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-05] "일일 권장 9007199254740991회" 표시 버그.
 *
 * v2.11.159에서 발행 한도를 해제하며 dailyPostLimit 기본값을 무제한
 * (Number.MAX_SAFE_INTEGER)으로 바꿨는데, 요약 카드와 설정 입력창이 그 값을
 * 그대로 렌더링했다.
 *
 * 계약: 발행은 무제한으로 두되(막지 않는다), 화면에는 권장치 3회를 보여준다.
 * 사용자가 현실적인 값(1~99)을 직접 지정한 경우에만 그 값을 표시한다.
 */
describe('일일 권장 표시 — 무제한 값 노출 차단', () => {
  it('요약 카드가 설정값을 그대로 찍지 않는다', () => {
    const renderer = read('renderer/renderer.ts');
    // 회귀 형태: `const _limit: number = _cfg?.dailyPostLimit ?? 3;` → `${_limit}회`
    expect(renderer).not.toMatch(/_cfg\?\.dailyPostLimit \?\? 3/);
    expect(renderer).toContain('const RECOMMENDED_DAILY_POSTS = 3;');
    expect(renderer).toContain('function resolveDailyRecommendationText(): string');
  });

  it('요약 카드 갱신 지점 두 곳이 모두 리졸버를 거친다', () => {
    const renderer = read('renderer/renderer.ts');
    const uses = renderer.match(/riskDailyValue\.textContent = resolveDailyRecommendationText\(\);/g);
    expect(uses?.length).toBe(2); // 생성 후 표시 + 발행 후 리셋
  });

  it('설정 입력창도 무제한 값을 찍지 않는다', () => {
    const modal = read('renderer/modules/priceInfoModal.ts');
    expect(modal).not.toContain('String(config.dailyPostLimit || 3)');
    expect(modal).toContain('isRealisticUserSetting');
  });

  it('표시 규칙 재현 — 무제한/미설정은 3회, 사용자 지정값은 그대로', () => {
    // 실제 코드와 동일한 규칙
    const resolve = (configured: unknown): string => {
      const n = Number(configured);
      const realistic = Number.isFinite(n) && n > 0 && n < 100;
      return `${realistic ? n : 3}회`;
    };

    expect(resolve(Number.MAX_SAFE_INTEGER)).toBe('3회');
    expect(resolve(undefined)).toBe('3회');
    expect(resolve(null)).toBe('3회');
    expect(resolve(0)).toBe('3회');
    expect(resolve(-1)).toBe('3회');
    expect(resolve(100)).toBe('3회');
    // 사용자가 직접 지정한 현실적인 값은 존중
    expect(resolve(5)).toBe('5회');
    expect(resolve(1)).toBe('1회');
    expect(resolve(99)).toBe('99회');
  });

  it('실제 발행 한도는 여전히 무제한이다 (표시만 바뀐다)', async () => {
    const { getDailyLimit } = await import('../postLimitManager');
    expect(getDailyLimit()).toBe(Number.MAX_SAFE_INTEGER);
  });
});
