/**
 * SPEC-CONVERSION-001 L2-1.5 — 팩트 게이트 단위 테스트.
 */

import { describe, it, expect } from 'vitest';
import {
  extractClaims,
  evaluateFactGate,
  buildFactGateRetryInstruction,
} from '../content/factGate';

describe('extractClaims — 주장 추출', () => {
  it('숫자+단위 추출', () => {
    const draft = '아이폰 가격은 150만원이고 배터리 효율 12.5% 향상';
    const claims = extractClaims(draft);
    expect(claims.some((c) => c.claim.includes('150만원'))).toBe(true);
    expect(claims.some((c) => c.claim.includes('12.5%'))).toBe(true);
  });

  it('기간 표현 추출', () => {
    const draft = '2주간 사용해봤어요. 한 달 동안 매일 사용했습니다.';
    const claims = extractClaims(draft);
    expect(claims.some((c) => c.claim.includes('2주간'))).toBe(true);
    expect(claims.some((c) => c.type === 'duration')).toBe(true);
  });

  it('경험 단언 추출 (REVIEW-001 P0 환각 패턴)', () => {
    const draft = '써보니 정말 좋았고 직접 테스트해보니 만족스러웠습니다.';
    const claims = extractClaims(draft);
    expect(claims.some((c) => c.type === 'experience')).toBe(true);
  });

  it('빈 본문은 빈 배열', () => {
    expect(extractClaims('')).toEqual([]);
  });

  it('max 제한 준수', () => {
    const draft = '1자 2자 3자 4자 5자 6자 7자 8자 9자'.repeat(10);
    const claims = extractClaims(draft, 5);
    expect(claims.length).toBeLessThanOrEqual(5);
  });
});

describe('evaluateFactGate — 검증', () => {
  it('500자 미만 초안은 검증 스킵', () => {
    const r = evaluateFactGate({ draft: '짧은 초안' });
    expect(r.passed).toBe(true);
    expect(r.reason).toContain('스킵');
  });

  it('주장 없는 일반 글은 통과', () => {
    const r = evaluateFactGate({ draft: '오늘은 날씨가 정말 좋네요. '.repeat(60) });
    expect(r.passed).toBe(true);
    expect(r.totalClaims).toBe(0);
  });

  it('sourceText에 모든 주장 보존되면 passed', () => {
    const draft = ('아이폰 15 Pro 가격은 150만원입니다. 12.5% 할인 적용됩니다. ' .repeat(20));
    const sourceText = ('아이폰 15 Pro 가격은 150만원이고, 12.5% 할인이 가능합니다. '.repeat(20));
    const r = evaluateFactGate({ draft, sourceText });
    expect(r.passed).toBe(true);
    expect(r.verificationRate).toBeGreaterThanOrEqual(0.8);
  });

  it('sourceText에 주장 없으면 unverified', () => {
    const draft = ('이 제품은 30만원이고 50% 효율 향상이 있습니다. '.repeat(20));
    const sourceText = ('전혀 무관한 내용입니다. '.repeat(50));
    const r = evaluateFactGate({ draft, sourceText });
    expect(r.passed).toBe(false);
    expect(r.unverifiedClaims.length).toBeGreaterThan(0);
  });

  it('sourceText 없으면 (키워드 모드) 숫자는 통과 허용, 경험은 unverified', () => {
    const draft = ('이 제품은 5만원이고 써보니 좋았습니다. 2주간 사용했어요. '.repeat(20));
    const r = evaluateFactGate({ draft });
    // 숫자(5만원)는 통과, 경험(써보니)·기간(2주간)은 unverified
    expect(r.unverifiedClaims.some((c) => c.type === 'experience' || c.type === 'duration')).toBe(true);
  });
});

describe('buildFactGateRetryInstruction', () => {
  it('passed면 빈 문자열', () => {
    const r = buildFactGateRetryInstruction({
      passed: true,
      totalClaims: 5,
      verifiedClaims: 5,
      unverifiedClaims: [],
      verificationRate: 1,
    });
    expect(r).toBe('');
  });

  it('unverified 있으면 명시', () => {
    const r = buildFactGateRetryInstruction({
      passed: false,
      totalClaims: 10,
      verifiedClaims: 5,
      unverifiedClaims: [
        { claim: '12.5%', type: 'number', span: [0, 5] },
        { claim: '2주간 사용', type: 'duration', span: [10, 16] },
      ],
      verificationRate: 0.5,
    });
    expect(r).toContain('12.5%');
    expect(r).toContain('2주간 사용');
    expect(r).toContain('50%');
  });
});

describe('SPEC 메모리 원칙', () => {
  it('silent 폴백 부재', () => {
    const r = evaluateFactGate({
      draft: '테스트 본문 '.repeat(60),
      sourceText: '소스',
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('imageSource');
    expect(blob).not.toContain('subWorkProvider');
  });
});
