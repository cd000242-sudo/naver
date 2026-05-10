/**
 * Phase 7 — Source Fidelity Engine 단위 테스트.
 * 사용자 진단: URL 입력 시 LLM이 원본을 압축·중요 정보 누락.
 */

import { describe, it, expect } from 'vitest';
import {
  checkSourceFidelity,
  extractCoreFacts,
  extractResultBody,
  buildFidelityRetryInstruction,
} from '../content/sourceFidelityCheck';

describe('extractCoreFacts — 핵심 fact 추출', () => {
  it('숫자 + 단위 추출', () => {
    const text = '300자 글이 12.5% 더 효과적이며 1만원 가치가 있다.';
    const facts = extractCoreFacts(text);
    expect(facts).toContain('300자');
    expect(facts).toContain('12.5%');
    expect(facts).toContain('1만원');
  });

  it('영문 고유명사 추출', () => {
    const text = 'Naver와 Google이 2024년 발표한 ChatGPT 비교 결과';
    const facts = extractCoreFacts(text);
    expect(facts.some((f) => f.includes('Naver'))).toBe(true);
    expect(facts.some((f) => f.includes('Google'))).toBe(true);
  });

  it('빈 문자열은 빈 배열', () => {
    expect(extractCoreFacts('')).toEqual([]);
  });

  it('max 파라미터 준수', () => {
    const text = '1자 2자 3자 4자 5자 6자 7자 8자 9자 10자 11자 12자';
    const facts = extractCoreFacts(text, 5);
    expect(facts.length).toBeLessThanOrEqual(5);
  });
});

describe('checkSourceFidelity — 압축률·보존율 검증', () => {
  it('rawText 500자 미만은 검증 스킵 (키워드 모드)', () => {
    const r = checkSourceFidelity({
      rawText: '짧은 키워드 입력',
      resultBody: '아주 긴 결과물 본문...'.repeat(100),
    });
    expect(r.passed).toBe(true);
    expect(r.reason).toContain('스킵');
  });

  it('압축률 50% 미만이면 fail', () => {
    const longSource = '원본 글 내용입니다. '.repeat(60); // ~1200자
    const compressedResult = '결과 짧음.'.repeat(20); // ~140자
    const r = checkSourceFidelity({
      rawText: longSource,
      resultBody: compressedResult,
    });
    expect(r.passed).toBe(false);
    expect(r.compressionRatio).toBeLessThan(0.5);
    expect(r.reason).toContain('압축률');
  });

  it('압축률 OK + fact 보존율 OK면 pass', () => {
    const source = '2024년 출시된 Naver Cloud 제품의 가격은 30만원이며 12.5% 할인 혜택이 있다. '.repeat(20);
    const result = '2024년 Naver Cloud 제품 가격은 30만원이고 12.5% 할인 가능합니다. '.repeat(20);
    const r = checkSourceFidelity({ rawText: source, resultBody: result });
    expect(r.passed).toBe(true);
    expect(r.compressionRatio).toBeGreaterThanOrEqual(0.5);
  });

  it('핵심 fact 누락 시 missingFacts 채워짐', () => {
    const source = ('아이폰 15 Pro의 가격은 150만원이며 A17 칩셋을 탑재. '.repeat(30));
    const result = ('스마트폰의 성능이 좋습니다. '.repeat(30));
    const r = checkSourceFidelity({
      rawText: source,
      resultBody: result,
      minCompressionRatio: 0.3,
    });
    expect(r.passed).toBe(false);
    expect(r.missingFacts.length).toBeGreaterThan(0);
    expect(r.missingFacts.some((f) => f.includes('150만원') || f.includes('A17'))).toBe(true);
  });
});

describe('buildFidelityRetryInstruction — 재시도 프롬프트', () => {
  it('passed면 빈 문자열', () => {
    const r = buildFidelityRetryInstruction({
      passed: true,
      compressionRatio: 0.8,
      retentionScore: 0.9,
      missingFacts: [],
      totalFacts: 5,
      retainedFacts: 5,
    });
    expect(r).toBe('');
  });

  it('압축률 미달 시 명시', () => {
    const r = buildFidelityRetryInstruction({
      passed: false,
      compressionRatio: 0.3,
      retentionScore: 0.9,
      missingFacts: [],
      totalFacts: 5,
      retainedFacts: 5,
    });
    expect(r).toContain('30%');
    expect(r).toContain('압축');
  });

  it('누락 fact 명시', () => {
    const r = buildFidelityRetryInstruction({
      passed: false,
      compressionRatio: 0.7,
      retentionScore: 0.4,
      missingFacts: ['150만원', 'A17 칩셋'],
      totalFacts: 5,
      retainedFacts: 2,
    });
    expect(r).toContain('150만원');
    expect(r).toContain('A17 칩셋');
  });
});

describe('extractResultBody — StructuredContent → 텍스트', () => {
  it('introduction + headings + conclusion 합침', () => {
    const body = extractResultBody({
      introduction: '도입부',
      headings: [{ content: '본문1' }, { content: '본문2' }],
      conclusion: '결론',
    });
    expect(body).toContain('도입부');
    expect(body).toContain('본문1');
    expect(body).toContain('본문2');
    expect(body).toContain('결론');
  });

  it('빈 객체는 빈 문자열', () => {
    expect(extractResultBody({})).toBe('');
  });
});

describe('Phase 7 silent 폴백 부재 (메모리 원칙)', () => {
  it('결과에 imageSource나 subWorkProvider 단어 없음', () => {
    const r = checkSourceFidelity({
      rawText: '원본 글 매우 길어 검증되어야 함. '.repeat(50),
      resultBody: '짧은 결과.'.repeat(5),
    });
    const blob = JSON.stringify(r);
    expect(blob).not.toContain('imageSource');
    expect(blob).not.toContain('subWorkProvider');
  });
});
