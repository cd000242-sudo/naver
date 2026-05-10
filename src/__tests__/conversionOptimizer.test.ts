/**
 * SPEC-CONVERSION-001 L2-1.6 — 전환 최적화 퇴고 단위 테스트.
 */

import { describe, it, expect, vi } from 'vitest';
import { optimizeForConversion, buildOptimizerPrompt } from '../content/conversionOptimizer';
import { buildPersona } from '../content/personaBuilder';
import type { LLMProvider } from '../content/draftWriter';

const fakeProvider = (response: string): LLMProvider => ({
  complete: vi.fn(async () => response),
});

const failingProvider = (error: string): LLMProvider => ({
  complete: vi.fn(async () => { throw new Error(error); }),
});

const sampleDraft = '안녕하세요. 오늘은 이 제품에 대해 이야기할게요. '.repeat(40);
const samplePersona = buildPersona({ category: 'beauty' });

describe('buildOptimizerPrompt — 5가지 퇴고 영역', () => {
  it('5가지 영역 모두 프롬프트에 명시', () => {
    const p = buildOptimizerPrompt({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '쿠션 발색 비교',
    });
    expect(p).toContain('도입부 후크');
    expect(p).toContain('사회적 증거');
    expect(p).toContain('결정 마찰');
    expect(p).toContain('CTA');
    expect(p).toContain('페르소나 톤');
  });

  it('socialProof 없으면 환각 차단 명시', () => {
    const p = buildOptimizerPrompt({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
    });
    expect(p).toContain('데이터 없음');
    expect(p).toContain('환각 차단');
  });

  it('socialProof 있으면 데이터 블록 포함', () => {
    const p = buildOptimizerPrompt({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      socialProof: {
        reviewCount: 1234,
        avgRating: 4.7,
        trustQuotes: ['진짜 발색 좋아요', '인생 립스틱'],
      },
    });
    expect(p).toContain('1,234건');
    expect(p).toContain('4.7점');
    expect(p).toContain('진짜 발색 좋아요');
  });

  it('금칙어 명시', () => {
    const p = buildOptimizerPrompt({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
    });
    // beauty persona 금칙어
    expect(p).toContain('피부가 완전 변신');
  });
});

describe('optimizeForConversion — 정상 동작', () => {
  it('정상 LLM 응답으로 OptimizedResult 반환', async () => {
    const optimizedText = '맛있는 강남 김치찌개 후기. 첫 입에 멈췄어요. '.repeat(40);
    const r = await optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider(optimizedText),
    });
    expect(r.optimized.length).toBeGreaterThan(800);
    expect(r.charCount).toBe(r.optimized.length);
    expect(r.hookFirst100.length).toBeGreaterThan(0);
    expect(r.ctaLine.length).toBeGreaterThan(0);
    expect(r.appliedFixes).toContain('hook-rewrite');
  });

  it('결정 마찰 제거 패턴 감지', async () => {
    const optimizedText = '고민됐는데 결국 샀어요. 솔직히 처음엔 의심했지만 써보니 좋았어요. '.repeat(50);
    const r = await optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider(optimizedText),
    });
    expect(r.appliedFixes).toContain('decision-friction-removed');
  });

  it('강압 CTA 감지 (경고 플래그)', async () => {
    const aggressive = '무조건 사세요. 지금 당장 결제 하세요. '.repeat(40);
    const r = await optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider(aggressive),
    });
    expect(r.appliedFixes).toContain('cta-warning-aggressive');
  });

  it('금칙어 잔존 감지', async () => {
    const banned = '이 제품 쓰면 피부가 완전 변신 합니다. '.repeat(40);
    const r = await optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider(banned),
    });
    expect(r.appliedFixes.some((f) => f.includes('forbidden-phrase-remained'))).toBe(true);
  });
});

describe('optimizeForConversion — 명시 오류', () => {
  it('초안 800자 미만 throw', async () => {
    await expect(optimizeForConversion({
      draft: '짧은 초안',
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider('x'.repeat(2000)),
    })).rejects.toThrow(/OPT_DRAFT_TOO_SHORT/);
  });

  it('초안 8000자 초과 throw', async () => {
    await expect(optimizeForConversion({
      draft: 'x'.repeat(9000),
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider('x'.repeat(2000)),
    })).rejects.toThrow(/OPT_DRAFT_TOO_LONG/);
  });

  it('LLM provider 미주입 throw', async () => {
    await expect(optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: null as any,
    })).rejects.toThrow(/OPT_LLM_PROVIDER_INVALID/);
  });

  it('LLM 호출 실패 OPT_LLM_FAILED', async () => {
    await expect(optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: failingProvider('Claude API 오류'),
    })).rejects.toThrow(/OPT_LLM_FAILED.*Claude API/);
  });

  it('LLM 응답 800자 미만 OPT_RESULT_TOO_SHORT', async () => {
    await expect(optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider('짧은 응답'),
    })).rejects.toThrow(/OPT_RESULT_TOO_SHORT/);
  });
});

describe('SPEC 메모리 원칙', () => {
  it('silent 폴백 부재 — 결과에 imageSource·subWorkProvider 없음', async () => {
    const r = await optimizeForConversion({
      draft: sampleDraft,
      persona: samplePersona,
      topic: '주제',
      llmProvider: fakeProvider('정상 응답 ' + 'x'.repeat(2000)),
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('imageSource');
    expect(blob).not.toContain('subWorkProvider');
  });
});
