/**
 * qualityEvaluator (Phase 1) 통합 테스트
 *
 * 목적: 모드별 evaluator + safety + humanlike 통합 평가가 정상 동작하는지 보장.
 *   shadow mode 출력이 안정적인지 확인.
 */

import { describe, it, expect } from 'vitest';
import { evaluate, type EvaluationInput } from '../content/qualityEvaluator';

const sampleBodyGood = `
안녕하세요 솔직히 처음엔 이 제품 살까 말까 진짜 고민했어요. 그런데 막상 써보니 의외로 괜찮더라고요.

저는 한 달째 매일 쓰고 있는데, 1500g 정도라 휴대도 편하고 가격도 3만원대라 부담 없어요. 사실은 비슷한 가격대 다른 브랜드(LG, 삼성) 모델이랑 비교해봤는데, 무게 차이가 꽤 크더라고요. 가벼운 게 진짜 큰 장점이에요.

처음엔 디자인이 좀 별로라고 생각했어요. 근데 다시 보니 단순한 게 오히려 어디든 잘 어울리더라고요. 30대 워킹맘이나 출퇴근 자주 하는 분께 추천드려요.

단점도 솔직히 있어요. 배터리 용량이 5000mAh라 하루 종일 쓰면 좀 부족할 수 있어요. 그래도 가격 대비 성능은 만족스러워요.

확인해보시면 후회 안 하실 거예요. 저처럼 가성비 중시하는 분께 진심으로 권합니다.
`.trim();

const sampleBodyBad = `
이 제품에 대해 알아보겠습니다. 많은 분들이 궁금해하시는 부분을 살펴보겠습니다.
이 제품은 가성비가 좋고 디자인이 우수하며 성능이 뛰어납니다.
충격적인 사실은 이 제품이 매우 저렴하다는 점입니다.
결론적으로 말하자면 이 제품은 추천할 만한 제품입니다.
도움이 되셨으면 좋겠습니다.
`.trim();

describe('qualityEvaluator — Phase 1 통합 평가', () => {
  it('SEO 모드 평가가 정상 점수 반환', () => {
    const input: EvaluationInput = {
      body: sampleBodyGood + '\n\n' + sampleBodyGood, // 2배로 길이 확보
      title: '한 달 써본 솔직 후기 - 가성비 무선 충전기 비교 3가지',
      headings: [
        { title: '솔직한 첫인상', content: '' },
        { title: '한 달 사용 경험', content: '' },
        { title: '비슷한 제품과 비교', content: '' },
      ],
      primaryKeyword: '무선 충전기',
      mode: 'seo',
      contentMode: 'seo',
    };
    const result = evaluate(input);
    expect(result.mode).toBe('seo');
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
    expect(['pass', 'patch', 'regenerate']).toContain(result.decision);
    expect(result.weights.mode).toBe(0.60);
  });

  it('homefeed 모드는 humanlike 가중치 높음', () => {
    const input: EvaluationInput = {
      body: sampleBodyGood,
      title: '솔직히 진짜 놀랐어요! 한 달 써본 후기 3가지',
      headings: [{ title: '첫 만남', content: '' }, { title: '한 달 후', content: '' }],
      mode: 'homefeed',
      contentMode: 'homefeed',
    };
    const result = evaluate(input);
    expect(result.weights.humanlike).toBe(0.40);
    expect(result.weights.mode).toBe(0.40);
  });

  it('affiliate 모드 평가가 가격/스펙 신호 감지', () => {
    const input: EvaluationInput = {
      body: sampleBodyGood,
      title: '직접 써본 가성비 무선 충전기 추천',
      headings: [{ title: '사용 후기', content: '' }],
      mode: 'affiliate',
      contentMode: 'affiliate',
    };
    const result = evaluate(input);
    expect(result.modeScore.details.priceSpec).toBeGreaterThan(0);
    expect(result.modeScore.details.usageExperience).toBeGreaterThan(0);
  });

  it('AI 보고체 다수 글은 humanlike 낮음', () => {
    const input: EvaluationInput = {
      body: sampleBodyBad,
      title: '제품 후기',
      mode: 'homefeed',
      contentMode: 'homefeed',
    };
    const result = evaluate(input);
    expect(result.humanlikeScore.score).toBeLessThan(60);
    expect(result.humanlikeScore.issues.some(i => i.includes('AI 보고체'))).toBe(true);
  });

  it('Decision은 finalScore 기반 정확히 분기', () => {
    const goodInput: EvaluationInput = {
      body: sampleBodyGood + '\n\n' + sampleBodyGood,
      title: '솔직 후기 3가지 - 무선 충전기 비교',
      headings: [{ title: 'A', content: '' }, { title: 'B', content: '' }],
      primaryKeyword: '무선 충전기',
      mode: 'seo',
    };
    const goodResult = evaluate(goodInput);
    if (goodResult.finalScore >= 80) expect(goodResult.decision).toBe('pass');
    else if (goodResult.finalScore >= 60) expect(goodResult.decision).toBe('patch');
    else expect(goodResult.decision).toBe('regenerate');
  });

  it('retryDirective는 pass면 null, 아니면 문자열', () => {
    const input: EvaluationInput = {
      body: sampleBodyBad,
      title: '제품',
      mode: 'seo',
    };
    const result = evaluate(input);
    if (result.decision === 'pass') {
      expect(result.retryDirective).toBeNull();
    } else {
      expect(result.retryDirective).toBeTruthy();
      expect(typeof result.retryDirective).toBe('string');
    }
  });

  it('rawText 있을 때 fidelity 점수 포함', () => {
    const rawText = 'A'.repeat(1500); // 충분히 긴 원본
    const input: EvaluationInput = {
      body: 'A'.repeat(1400) + ' 추가 내용',
      title: '테스트',
      rawText,
      mode: 'seo',
    };
    const result = evaluate(input);
    expect(result.safetyScore.details.fidelity).toBeDefined();
  });

  it('rawText 짧으면 fidelity 제외 (hallucination + forbidden 50/50)', () => {
    const input: EvaluationInput = {
      body: sampleBodyGood,
      title: '테스트',
      rawText: '짧은 원본', // 500자 미만
      mode: 'seo',
    };
    const result = evaluate(input);
    expect(result.safetyScore.details.fidelity).toBeUndefined();
  });

  it('finalScore는 0~100 범위', () => {
    const modes: Array<EvaluationInput['mode']> = ['seo', 'homefeed', 'affiliate', 'business', 'custom'];
    for (const mode of modes) {
      const result = evaluate({ body: sampleBodyGood, title: '테스트', mode });
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
    }
  });
});
