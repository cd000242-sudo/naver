/**
 * Title formula selector — source-grounding gate for issue-pick formulas.
 *
 * 홈판 이슈픽 공식(익명공개/인용파편)은 실존 인물 사실을 다루므로, 근거 자료가 없으면
 * (키워드만 생성) 선택에서 제외돼야 한다 — 사실 날조/명예훼손 차단. SPEC-REVIEW-001 확장.
 */

import { describe, it, expect } from 'vitest';
import { selectTitleFormula } from '../contentTitleSelector';
import { SOURCE_REQUIRED_FORMULA_IDS } from '../contentTitleFormulas';

describe('selectTitleFormula — source gate', () => {
  it('never picks an issue-pick formula for 연예 when there is no source', () => {
    const used: string[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const f = selectTitleFormula('homefeed', attempt, used, '연예', undefined, false);
      expect(SOURCE_REQUIRED_FORMULA_IDS).not.toContain(f.id);
      used.push(f.id);
    }
  });

  it('never picks an issue-pick formula for 스포츠 when there is no source', () => {
    const used: string[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const f = selectTitleFormula('homefeed', attempt, used, '스포츠', undefined, false);
      expect(SOURCE_REQUIRED_FORMULA_IDS).not.toContain(f.id);
      used.push(f.id);
    }
  });

  it('prioritizes the hidden-identity formula for 연예 when a source IS present', () => {
    const f = selectTitleFormula('homefeed', 0, [], '연예', undefined, true);
    expect(f.id).toBe('hf_hidden_identity');
  });

  it('defaults to source-present behavior when hasSource is omitted (back-compat)', () => {
    const f = selectTitleFormula('homefeed', 0, [], '연예');
    expect(f.id).toBe('hf_hidden_identity');
  });
});
