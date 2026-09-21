import { describe, expect, it } from 'vitest';

import { removeUnsupportedClaimSentences } from '../contentPolicy/claimRepair';

/**
 * [2026-09-21 사장님 라이브] "12.3 이면 12.에서 줄바꿈되고 뒤에 3은 누락된다."
 *
 * 문장 조각 정규식이 마침표를 무조건 문장 끝으로 봤다. "프레스티지에 12.3인치 …" 는
 * "프레스티지에 12." 와 "3인치 … 됩니다." 로 갈라지고, 뒤 조각만 근거 없는 주장으로
 * 지워져 "12." 가 매달린 채 남았다. 숫자 사이의 점은 문장 끝이 아니다.
 */
describe('removeUnsupportedClaimSentences keeps decimals in one sentence', () => {
  const sentence = '트렌디에서 프레스티지로 올라가고, 프레스티지에 12.3인치 클러스터와 드라이브 와이즈를 넣으면 차량 가격은 3,414만원이 됩니다.';
  const next = '그런데 시그니처 기본가격은 3,520만원이에요.';

  it('removes the whole unsupported sentence instead of leaving a dangling "12."', () => {
    const result = removeUnsupportedClaimSentences(`${sentence} ${next}`, [sentence]);
    expect(result).toBe(next);
    expect(result).not.toContain('12.');
  });

  it('keeps a supported decimal sentence intact', () => {
    const result = removeUnsupportedClaimSentences(`${sentence} ${next}`, [next]);
    expect(result).toBe(sentence);
    expect(result).toContain('12.3인치 클러스터와');
  });
});
