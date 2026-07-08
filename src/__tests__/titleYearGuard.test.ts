import { describe, expect, it } from 'vitest';
import { applyKeywordPrefixToTitle as applyContentKeywordPrefix } from '../contentKeywordPrefix';
import { applyKeywordPrefixToTitle as applyRendererKeywordPrefix } from '../renderer/utils/titleUtils';

describe('duplicate leading year title guard', () => {
  it('protects content keyword-prefix titles when the keyword tokens are already present', () => {
    expect(
      applyContentKeywordPrefix('2026년 2026 꼼수장학금 신청 방법', '2026 꼼수장학금 신청 방법')
    ).toBe('2026년 꼼수장학금 신청 방법');
  });

  it('protects renderer keyword-prefix titles used by automation flows', () => {
    expect(
      applyRendererKeywordPrefix('2026년 2026 꼼수장학금 신청 방법', '2026 꼼수장학금 신청 방법')
    ).toBe('2026년 꼼수장학금 신청 방법');
  });
});
