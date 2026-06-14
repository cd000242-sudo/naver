import { describe, expect, it } from 'vitest';

import {
  applyFactCheckHardConstraint,
  buildFactCheckHardConstraintBlock,
} from '../contentFactCheckConstraint';

describe('contentFactCheckConstraint', () => {
  it('builds the hard constraint block that prevents unsupported facts', () => {
    const block = buildFactCheckHardConstraintBlock();

    expect(block).toContain('HARD CONSTRAINT');
    expect(block).toContain('자료에 없는 숫자/날짜/금액/통계/퍼센트 0건 강제');
    expect(block).toContain('일반화 도피 표현');
    expect(block).toContain('자료가 너무 부족해 1500자 못 채우면');
  });

  it('prepends the constraint only when fact-check source exists', () => {
    const basePrompt = 'BASE PROMPT';

    expect(applyFactCheckHardConstraint(basePrompt, true)).toMatch(/^(\s|\S)*HARD CONSTRAINT/);
    expect(applyFactCheckHardConstraint(basePrompt, true)).toContain(basePrompt);
    expect(applyFactCheckHardConstraint(basePrompt, false)).toBe(basePrompt);
  });
});
