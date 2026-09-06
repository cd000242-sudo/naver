import { describe, expect, it } from 'vitest';

import { readerOrderTextForEvaluation } from '../contentBodyTransforms';

/**
 * [2026-09-06 R0] 품질 게이트는 독자가 보는 순서(도입부 → 본문 → 결론) 전체를 평가한다.
 * 이전에는 결론(conclusion)이 평가 입력에 없어서 게이트가 결론을 한 번도 읽지 않았고,
 * 어떤 지시도 결론에 닿을 수 없었다.
 */
describe('readerOrderTextForEvaluation', () => {
  it('도입부 → 본문 → 결론 순서로 빈 줄 하나씩 두고 잇는다', () => {
    const out = readerOrderTextForEvaluation({
      introduction: '도입 문장입니다.',
      bodyPlain: '본문 문장입니다.',
      conclusion: '결론 문장입니다.',
    });
    expect(out.indexOf('도입 문장')).toBeLessThan(out.indexOf('본문 문장'));
    expect(out.indexOf('본문 문장')).toBeLessThan(out.indexOf('결론 문장'));
    expect(out).toContain('결론 문장입니다.');
  });

  it('비어 있는 조각은 건너뛰고 앞뒤 공백을 정리한다', () => {
    const out = readerOrderTextForEvaluation({ introduction: '  ', bodyPlain: '본문만 있습니다.', conclusion: undefined });
    expect(out).toBe('본문만 있습니다.');
  });

  it('발행 모양(문단 묶음)으로 만든다 — 긴 문단은 maxSentences 로 나뉜다', () => {
    const long = '하나입니다. 둘입니다. 셋입니다. 넷입니다. 다섯입니다. 여섯입니다.';
    const out = readerOrderTextForEvaluation({ bodyPlain: long }, 2);
    expect(out.split('\n\n').length).toBeGreaterThan(1);
  });
});
