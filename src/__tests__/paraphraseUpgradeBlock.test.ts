import { describe, expect, it } from 'vitest';
import {
  appendParaphraseUpgradeBlock,
  buildParaphraseUpgradeBlock,
  hasParaphraseUpgradeBrief,
} from '../content/paraphraseUpgradeBlock';
import { shouldAnalyzeUrlSource } from '../main/paraphraseUpgradeForUrl';

const brief = '[노출 근거] 2026년 최신 기준과 개정 지침을 정리해 연도별 변동을 혼동하던 독자의 궁금증을 해소했다.\n'
  + '[메인키워드] 청년일자리도약장려금\n'
  + '[상위호환 지점] 구체적인 지급 금액 / 신청 후 심사 기간 / 비수도권 우대 적용 기준 상세';

describe('paraphraseUpgradeBlock', () => {
  it('ignores a brief too short to be material', () => {
    expect(hasParaphraseUpgradeBrief('')).toBe(false);
    expect(hasParaphraseUpgradeBrief('짧다')).toBe(false);
    expect(hasParaphraseUpgradeBrief(brief)).toBe(true);
  });

  it('adds to the mode prompt instead of replacing it', () => {
    const base = 'SEO 모드 계약 본문';
    const applied = appendParaphraseUpgradeBlock(base, brief);
    expect(applied.startsWith(base)).toBe(true);
    expect(applied).toContain('상위호환');
    expect(applied).toContain('모드(검색/홈판 등) 계약을 대체하지 않는다');
  });

  it('forbids rewriting the original and inventing facts', () => {
    const block = buildParaphraseUpgradeBlock(brief);
    expect(block).toContain('유사문서로 걸려');
    expect(block).toContain('없는 사실을 지어내는 것이 아니라');
  });

  it('is a no-op without a brief', () => {
    expect(appendParaphraseUpgradeBlock('BASE', '')).toBe('BASE');
    expect(appendParaphraseUpgradeBlock('BASE', undefined)).toBe('BASE');
  });
});

describe('shouldAnalyzeUrlSource', () => {
  it('runs only for a URL source with enough body to read', () => {
    expect(shouldAnalyzeUrlSource({ url: 'https://blog.naver.com/x/1', rawText: '가'.repeat(1200) })).toBe(true);
    expect(shouldAnalyzeUrlSource({ url: 'https://blog.naver.com/x/1', rawText: '짧은 원문' })).toBe(false);
    expect(shouldAnalyzeUrlSource({ rawText: '가'.repeat(1200) })).toBe(false);
    expect(shouldAnalyzeUrlSource({})).toBe(false);
  });
});
