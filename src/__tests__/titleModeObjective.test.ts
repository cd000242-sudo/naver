import { describe, it, expect } from 'vitest';
import { scoreSearchMatch, isSearchDrivenTitleMode } from '../content/titleModeObjective';
import { evaluateTitleQuality } from '../contentTitleEvaluator';
import { buildSituationTitleContract } from '../content/situationTitleContract';

/**
 * [2026-08-26 사장님 지시] 제목은 모드가 이겨야 하는 판에 맞춰 나와야 한다.
 * SEO·메이트·쇼핑·업체는 검색으로 먹고사니 제목에 검색어가 물려 있어야 하고,
 * 홈판은 피드에서 싸우니 검색어를 억지로 끌어오면 안 된다.
 */
describe('검색 모드 제목은 검색어와 물려야 한다', () => {
  const kw = '청약통장 해지 방법';

  it('검색어를 버린 제목이 물린 제목과 동점이 되지 않는다', () => {
    // 수정 전에는 셋 다 100점이었다 — 검색으로 먹고사는 글이 검색어 없는 제목을
    // 달고 나갈 수 있었다는 뜻이다.
    const matched = evaluateTitleQuality('청약통장 해지, 2년 안 채웠을 때 갈리는 지점', kw, 'seo' as any).score;
    const dropped = evaluateTitleQuality('2년 안 채우고 나오면 갈리는 지점', kw, 'seo' as any).score;
    expect(matched).toBeGreaterThan(dropped);
  });

  it('검색어 이탈은 사유로 남는다', () => {
    const r = evaluateTitleQuality('2년 안 채우고 나오면 갈리는 지점', kw, 'seo' as any);
    expect(r.issues.join(' ')).toMatch(/검색어 이탈/);
  });

  it('홈판은 검색어 맞물림을 채점하지 않는다 (피드는 검색이 아니다)', () => {
    expect(isSearchDrivenTitleMode('homefeed')).toBe(false);
    expect(scoreSearchMatch('2년 안 채우고 나오면 갈리는 지점', kw, 'homefeed').points).toBe(0);
  });

  it('검색으로 먹고사는 네 모드에 모두 적용된다', () => {
    for (const mode of ['seo', 'mate', 'affiliate', 'business']) {
      expect(isSearchDrivenTitleMode(mode)).toBe(true);
      expect(scoreSearchMatch('청약통장 해지 방법이 갈리는 조건', kw, mode).points).toBeGreaterThan(0);
    }
  });

  it('부분 맞물림은 가산도 감점도 크게 하지 않는다', () => {
    const partial = scoreSearchMatch('청약통장 들고 있는데 지금 어떻게 하나', kw, 'seo');
    expect(partial.points).toBe(5);
    expect(partial.covered).toBe(1);
  });
});

describe('모드마다 제목 계약이 자기 판에 맞게 갈린다', () => {
  const build = (m: any) =>
    buildSituationTitleContract(m, { rawText: 'x'.repeat(300) } as any);

  it('쇼핑은 구매 축, 업체는 지역+업종이 필수축이다', () => {
    expect(build('affiliate')).toMatch(/\[구매 축 — 필수\]/);
    expect(build('business')).toMatch(/\[지역·업종 축 — 필수\]/);
  });

  it('업체 홍보는 검색용임을 명시하고 순위·추천 단정을 막는다', () => {
    const c = build('business');
    expect(c).toMatch(/\[업체 홍보 모드/);
    expect(c).toMatch(/피드용이 아니라 검색용/);
    expect(c).toMatch(/잘하는 곳/); // 금지 예시로 등장
    expect(c).toMatch(/지역·업종이 없는 제목은 쓰지 않는다/);
  });

  it('홈판은 검색어를 억지로 끌어오지 말라고 한다', () => {
    expect(build('homefeed')).toMatch(/검색어를 맞출 필요가 없다/);
  });

  it('모드마다 다른 계약이 나온다 — 일반 문구로 뭉개지지 않는다', () => {
    const seen = new Set(
      (['seo', 'homefeed', 'affiliate', 'business'] as const).map((m) => build(m)),
    );
    expect(seen.size).toBe(4);
  });
});
