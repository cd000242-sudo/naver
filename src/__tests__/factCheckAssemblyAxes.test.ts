import { describe, expect, it } from 'vitest';
import { buildAssemblyErrorAxes } from '../factCheckRouter';

describe('buildAssemblyErrorAxes', () => {
  it('covers all five assembly-error axes the external critique surfaced', () => {
    const axes = buildAssemblyErrorAxes();
    expect(axes).toContain('수량 한정어 승격');
    expect(axes).toContain('주체 혼합');
    expect(axes).toContain('용어 치환');
    expect(axes).toContain('상대 날짜');
    expect(axes).toContain('근거 없는 이유·전망');
  });

  it('demands minimal edits so applyCorrections cannot rewrite good sentences', () => {
    const axes = buildAssemblyErrorAxes();
    expect(axes).toContain('최소 편집');
    expect(axes).toContain('문장을 새로 쓰지 말고');
    expect(axes).toContain('해당하지 않으면 건드리지 마세요');
  });

  it("keeps the '출생연도 vs 생년월일' distinction that the rules called out", () => {
    expect(buildAssemblyErrorAxes()).toContain("'출생연도 끝자리'와 '생년월일 끝자리'는 다른 제도입니다");
  });
});
