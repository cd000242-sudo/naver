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
      affiliateEvidenceMode: 'first_party',
    };
    const result = evaluate(input);
    expect(result.modeScore.details.priceSpec).toBeGreaterThan(0);
    expect(result.modeScore.details.usageExperience).toBeGreaterThan(0);
  });

  it('affiliate 리뷰 종합형은 가짜 체험담을 보상하지 않고 안전성 실패로 돌린다', () => {
    const result = evaluate({
      body: '제가 직접 한 달 써보니 가족도 좋아하더라고요. 지금 안 사면 손해예요.',
      title: '한 달 써본 모노팬 솔직 후기',
      rawText: '상품명 모노팬. 구매자 후기에는 저속 소음이 작다는 의견과 최고 풍량 소리가 크다는 의견이 있다.',
      mode: 'affiliate',
      contentMode: 'affiliate',
      affiliateEvidenceMode: 'review_synthesis',
    });

    expect(result.modeScore.details.evidenceIntegrity).toBeLessThan(10);
    expect(result.safetyScore.score).toBeLessThan(50);
    expect(result.decision).toBe('regenerate');
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

  it('Phase 2.5.1 — 구체 수치(단위 포함)는 일반 숫자보다 높은 SEO 점수', () => {
    const baseInput = {
      title: '무선 충전기 비교',
      headings: [{ title: 'A', content: '' }, { title: 'B', content: '' }],
      primaryKeyword: '무선 충전기',
      mode: 'seo' as const,
    };
    const withConcrete = evaluate({
      ...baseInput,
      body: '무선 충전기를 30분 충전했더니 5000mAh 배터리가 80% 찼어요. 가격은 3만원대이고 무게 200g 정도입니다. 한 달 써본 결과 만족도 95%입니다.',
    });
    const withRawNumbers = evaluate({
      ...baseInput,
      body: '무선 충전기를 충전했더니 30 5000 80 3 200 1 95 같은 숫자가 많이 나옵니다. 어느 정도 충전이 되었습니다.',
    });
    // 구체 수치가 일반 숫자보다 높은 점수 (또는 동등)
    expect(withConcrete.modeScore.details.concreteNumberCount).toBeGreaterThan(0);
    expect(withConcrete.modeScore.details.numbersLists).toBeGreaterThanOrEqual(withRawNumbers.modeScore.details.numbersLists);
  });

  it('Phase 2.5.2 — AI 도입부 클리셰는 humanlike 점수 차감', () => {
    const cleanInput: EvaluationInput = {
      body: '솔직히 처음엔 의심했어요. 한 달 써보니 진짜 좋더라고요. 막상 받아보니 디자인도 깔끔하고 가벼웠어요. 1500g 정도라 들고다니기 편해요. 의외로 배터리도 오래가서 만족스러워요. 사실은 가격이 좀 부담이었는데 막상 써보니 가성비 좋네요.',
      title: '한 달 후기',
      mode: 'homefeed' as const,
    };
    const cliche: EvaluationInput = {
      body: '안녕하세요. 오늘은 무선 충전기에 대해 소개해드리겠습니다. 이번 포스팅에서는 사용 방법을 안내해드리겠습니다. 많은 분들이 궁금해하시는 부분을 살펴보겠습니다. 결론적으로 말하자면 매우 좋은 제품입니다. 도움이 되셨길 바랍니다.',
      title: '무선 충전기 소개',
      mode: 'homefeed' as const,
    };
    const c1 = evaluate(cleanInput);
    const c2 = evaluate(cliche);
    expect(c2.humanlikeScore.score).toBeLessThan(c1.humanlikeScore.score);
    expect(c2.humanlikeScore.issues.some(i => i.includes('AI 클리셰'))).toBe(true);
  });

  it('Phase 2.5.3 — 직접 경험 표현은 humanlike 가산점', () => {
    const baseInput = {
      title: '제품 후기',
      mode: 'homefeed' as const,
    };
    const noExp = evaluate({
      ...baseInput,
      body: '이 제품은 가격이 적당하고 디자인이 좋습니다. 성능도 좋고 사용감이 부드럽습니다. 무게는 적당하고 휴대성도 괜찮습니다.',
    });
    const withExp = evaluate({
      ...baseInput,
      body: '제가 직접 한 달 써봤는데 실제로 만족스러웠어요. 제가 찍은 사진 보면 디자인이 깔끔하더라고요. 실사용 한 결과 가성비 진짜 좋아요. 직접 가봤더니 매장 직원도 친절했어요.',
    });
    expect(withExp.humanlikeScore.details.directExperience).toBeGreaterThan(noExp.humanlikeScore.details.directExperience);
  });

  it('Phase 2.1 — safety < 50 시 decision regenerate', () => {
    // 환각 의심 시나리오: 원본은 긍정(기부/선행) → 결과는 부정(폭로/논란/위선)
    const rawText = `정준하는 매달 1000만원씩 봉사단체에 기부하고 있다. 진심으로 선한 영향력을 행사하는 그의 모습이 감동적이다. 헌신적인 봉사로 많은 이들에게 희망을 주고 있으며, 그 의미는 매우 깊다. 평소 그의 진정성은 잘 알려져 있고, 친구들도 그가 정말 따뜻한 사람이라고 입을 모은다.`.repeat(3);
    const resultBody = `정준하의 충격적인 폭로가 이어지고 있다. 그의 위선과 거짓이 드러나면서 논란이 커지고 있다. 의혹이 제기되며 비판이 쏟아지고 있다. 이중성과 민낯이 공개되면서 결별을 선언한 사람도 많아 분노하고 있다. 진실은 충격이었다.`.repeat(3);
    const input: EvaluationInput = {
      body: resultBody,
      title: '정준하 충격 폭로',
      rawText,
      mode: 'seo',
      contentMode: 'seo',
      categoryHint: 'celebrity', // 연예인 카테고리 — 환각 차단 사전 적용
    };
    const result = evaluate(input);
    expect(result.safetyScore.score).toBeLessThan(50);
    expect(result.decision).toBe('regenerate');
    expect(result.retryDirective).toBeTruthy();
  });

  it('finalScore는 0~100 범위', () => {
    const modes: Array<EvaluationInput['mode']> = ['seo', 'homefeed', 'affiliate', 'business', 'custom', 'mate'];
    for (const mode of modes) {
      const result = evaluate({ body: sampleBodyGood, title: '테스트', mode });
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
    }
  });
});
