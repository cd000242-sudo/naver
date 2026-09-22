import { describe, expect, it } from 'vitest';
import { optimizeContentForNaver } from '../contentOptimizer.js';

/**
 * [2026-09-22 attribution/후처리 원칙] LOW_QUALITY_2025 는 한때 /[A-Z]{5,}/, /\d+%\s*할인/,
 * /무료\s*배송/, /최저가\s*보장/ 를 스팸으로 간주해 지웠다 — 이는 실제 모델명(NVIDIA, GEFORCE)과
 * 진짜 할인율/배송 정보를 파괴했다. 이 패턴들을 제거했으므로 아래 텍스트는 그대로 살아남아야 한다.
 */
describe('optimizeContentForNaver — low-quality pattern narrowing', () => {
  it('preserves real model names and discount/shipping facts', () => {
    const body = 'NVIDIA GEFORCE RTX 4070을 30% 할인된 가격에 구매했습니다. 무료 배송도 함께 왔고 최저가 보장 조건까지 확인했습니다.';
    const out = String(optimizeContentForNaver(body, 'professional', true, { skipDictInjection: true }));

    expect(out).toContain('NVIDIA');
    expect(out).toContain('GEFORCE');
    expect(out).toContain('30% 할인');
    expect(out).toContain('무료 배송');
    expect(out).toContain('최저가 보장');
  });

  it('still removes spam repetition and decorative clutter', () => {
    const body = '정말정말정말정말 좋아요..... ★★★★★ 완전 최고입니다.';
    const out = String(optimizeContentForNaver(body, 'professional', true, { skipDictInjection: true }));

    expect(out).not.toMatch(/★{3,}/);
  });
});
