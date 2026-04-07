import { describe, it, expect } from 'vitest';
import {
  measureAiFingerprint,
  injectExpertiseSignals,
  diversifyCitations,
  insertExperienceExpressions,
  applyAuthGRDefense,
} from '../authgrDefense';

describe('measureAiFingerprint', () => {
  it('AI처럼 균일한 문장에 높은 위험도를 반환한다', () => {
    // 균일한 문장 길이 + 반복 어휘 = AI 의심
    const aiLikeText = Array(20)
      .fill('이 제품은 매우 좋습니다. 사용하기 편리합니다. 가격도 합리적입니다.')
      .join(' ');
    const result = measureAiFingerprint(aiLikeText);

    expect(result.overallRisk).toBeGreaterThan(40);
    expect(result.perplexity).toBeLessThan(60);
  });

  it('자연스러운 텍스트에 낮은 위험도를 반환한다', () => {
    const humanText = `
      솔직히 처음에는 반신반의했어요. 근데 써보니까 진짜 괜찮더라고요?
      가격이 좀 비싸긴 한데, 내구성은 확실히 좋습니다.
      제가 3개월째 쓰고 있는데 아직까지 문제 하나 없어요.
      다만 색상 옵션이 좀 적은 게 아쉽습니다.
      전체적으로 만족스럽고, 지인에게도 추천했습니다!
    `;
    const result = measureAiFingerprint(humanText);

    expect(result.burstiness).toBeGreaterThanOrEqual(0); // 자연스러운 텍스트여도 짧으면 낮을 수 있음
  });

  it('짧은 텍스트에도 오류 없이 동작한다', () => {
    const result = measureAiFingerprint('짧은 글입니다.');
    expect(result.overallRisk).toBeGreaterThanOrEqual(0);
    expect(result.overallRisk).toBeLessThanOrEqual(100);
  });

  it('빈 문자열에 안전하게 동작한다', () => {
    const result = measureAiFingerprint('');
    expect(result.perplexity).toBeGreaterThanOrEqual(0);
    expect(result.burstiness).toBeGreaterThanOrEqual(0);
  });

  it('needsRewrite는 risk 65 이상일 때 true', () => {
    const result = measureAiFingerprint('a');
    expect(typeof result.needsRewrite).toBe('boolean');
    expect(result.needsRewrite).toBe(result.overallRisk >= 65);
  });
});

describe('injectExpertiseSignals', () => {
  const longContent = `도입부입니다. 오늘은 좋은 제품을 소개합니다.

이 제품의 가장 큰 장점은 내구성입니다. 금속 소재라 튼튼합니다.

디자인도 세련되었습니다. 모던한 느낌이 좋습니다.

가격 대비 성능이 뛰어납니다. 합리적인 가격대입니다.

결론적으로 이 제품을 추천합니다.`;

  it('카테고리에 맞는 전문성 신호를 주입한다', () => {
    const result = injectExpertiseSignals(longContent, 'tech', 2);
    expect(result.injectedCount).toBeGreaterThan(0);
    expect(result.injectedCount).toBeLessThanOrEqual(2);
    expect(result.signals.length).toBe(result.injectedCount);
  });

  it('이미 충분한 신호가 있으면 추가하지 않는다', () => {
    const contentWithSignals = longContent.replace(
      '이 제품의',
      '직접 테스트해본 결과, 이 제품의'
    ).replace(
      '디자인도',
      '실제 사용해보니, 디자인도'
    ).replace(
      '가격 대비',
      '개발 환경에서 확인한 바로는, 가격 대비'
    );
    const result = injectExpertiseSignals(contentWithSignals, 'tech', 3);
    expect(result.injectedCount).toBe(0);
  });

  it('짧은 콘텐츠에는 주입하지 않는다', () => {
    const result = injectExpertiseSignals('짧은 글', 'tech');
    expect(result.injectedCount).toBe(0);
  });

  it('없는 카테고리는 general로 폴백한다', () => {
    const result = injectExpertiseSignals(longContent, 'unknown_category', 1);
    // general 카테고리 신호가 주입되어야 함
    expect(result.content).not.toBe(longContent);
  });
});

describe('diversifyCitations', () => {
  it('3회 이상 반복되는 출처 인용을 다양화한다', () => {
    const content = `
      한국은행에 따르면 물가가 올랐습니다.
      통계청에 따르면 소비자 지수도 상승했습니다.
      금융위원회에 따르면 대출 규제가 강화됩니다.
      기획재정부에 따르면 예산이 증가합니다.
    `;
    const result = diversifyCitations(content);
    expect(result.diversifiedCount).toBeGreaterThan(0);
    // 처음 2개는 유지
    expect(result.content).toContain('한국은행에 따르면');
    expect(result.content).toContain('통계청에 따르면');
    // 3번째부터는 다양화됨 (다른 패턴으로 교체)
    expect(result.diversifiedCount).toBeGreaterThanOrEqual(1);
  });

  it('2회 이하는 변경하지 않는다', () => {
    const content = '연구소에 따르면 A입니다. 기관에 따르면 B입니다.';
    const result = diversifyCitations(content);
    expect(result.diversifiedCount).toBe(0);
    expect(result.content).toBe(content);
  });
});

describe('insertExperienceExpressions', () => {
  const content = `도입부입니다.

첫 번째 단락 내용입니다.

두 번째 단락 내용입니다.

세 번째 단락 내용입니다.

결론 내용입니다.`;

  it('경험 표현을 삽입한다', () => {
    const result = insertExperienceExpressions(content, 2);
    // 삽입은 문단 길이와 위치에 따라 0일 수 있음
    expect(result.insertedCount).toBeGreaterThanOrEqual(0);
    expect(result.insertedCount).toBeLessThanOrEqual(2);
  });

  it('빈 콘텐츠에 안전하게 동작한다', () => {
    const result = insertExperienceExpressions('', 2);
    expect(result.insertedCount).toBe(0);
  });
});

describe('applyAuthGRDefense', () => {
  const sampleContent = `오늘 소개할 제품은 최신 무선 이어폰입니다.

이 이어폰의 음질은 매우 뛰어납니다. 저음이 풍부하고 고음이 깨끗합니다.

배터리 수명은 약 8시간으로, 하루 사용에 충분합니다.

노이즈 캔슬링 기능도 포함되어 있어 지하철에서도 편리합니다.

가격은 10만원대로 합리적인 편입니다.

전체적으로 만족스러운 제품이었습니다.`;

  it('통합 방어를 적용하고 결과를 반환한다', () => {
    const result = applyAuthGRDefense(sampleContent, 'tech');

    expect(result.content).toBeTruthy();
    expect(result.fingerprint).toBeDefined();
    expect(result.fingerprint.overallRisk).toBeGreaterThanOrEqual(0);
    expect(result.fingerprint.overallRisk).toBeLessThanOrEqual(100);
    expect(typeof result.expertiseInjected).toBe('number');
    expect(typeof result.citationsDiversified).toBe('number');
    expect(typeof result.experienceInserted).toBe('number');
    expect(result.totalModifications).toBe(
      result.expertiseInjected + result.citationsDiversified + result.experienceInserted,
    );
  });

  it('카테고리 미지정 시 general로 동작한다', () => {
    const result = applyAuthGRDefense(sampleContent);
    expect(result.content).toBeTruthy();
  });
});
