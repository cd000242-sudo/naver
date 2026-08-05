import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';
import { buildSituationTitleContract } from '../content/situationTitleContract';

/**
 * [2026-08-05] SEO title query-tail digestion contract.
 *
 * Live finding: the SEO title copied the raw search query verbatim —
 * "이런 엿같은 사랑 하영 누구, ..." — because the title guide example
 * ("여권 재발급, 주말에 급하게 해야 할 때 순서") teaches a
 * "[keyword-as-typed, situation]" frame. Search queries carry clipped
 * interrogative tails (누구/방법/후기/뜻) that read as bot output when
 * pasted into a title. The contract: keep the core nouns visible for
 * search matching, but digest the query tail into a natural sentence.
 */
describe('seoTitleQueryTailDigestion', () => {
  const buildSeoPrompt = () =>
    buildContentJsonOutputFormat({
      contentMode: 'seo',
      mode: 'seo',
      source: {
        rawText: '원본 본문입니다.',
        title: '제목 참고',
        metadata: { keywords: ['메인키워드'] },
      } as any,
      title: '제목 참고',
      rawText: 'SEO 테스트 원문',
      primaryKeyword: '메인키워드',
      subKeywords: '',
      minChars: 2000,
    });

  it('SEO 제목 가이드에 검색어투 원문 복사 금지 규칙이 있다', () => {
    const prompt = buildSeoPrompt();
    expect(prompt).toMatch(/검색어[\s\S]{0,80}(원문 그대로|그대로 복사)[\s\S]{0,40}(붙여 넣지|복사하지|옮기지)/);
    // 소화 대상 어휘가 명시돼 있어야 한다 (누구/방법/후기류 꼬리)
    expect(prompt).toMatch(/누구[·,/]?\s*(방법|후기|뜻)/);
  });

  it('검색어 원문 복사를 유발하던 [키워드, 상황] 단일 예시가 제거됐다', () => {
    const prompt = buildSeoPrompt();
    // 예시 자체는 남을 수 있으나, 검색어투를 소화한 대비쌍 없이 단독으로 남으면 안 된다
    if (prompt.includes('여권 재발급, 주말에 급하게')) {
      expect(prompt).toMatch(/검색어[\s\S]{0,200}여권 재발급/);
    }
  });

  it('situationTitleContract SEO 절에도 같은 소화 규칙이 있다', () => {
    const contract = buildSituationTitleContract('seo');
    expect(contract).toMatch(/검색어[\s\S]{0,80}(원문 그대로|그대로 복사)[\s\S]{0,40}(붙여 넣지|복사하지|옮기지)/);
  });

  // [2026-08-06 사용자 피드백] "이런 엿같은 사랑"이 실제 드라마 제목인데 일반 수식어로
  // 취급됐다 + "누구" 검색어는 물음표 질문형 제목을 기대한다.
  it('전 모드 공통 스키마에 고유명사 판별(entityCheck) 축이 있다', () => {
    const prompt = buildSeoPrompt();
    expect(prompt).toContain('"entityCheck"');
    expect(prompt).toMatch(/작품명[·,]?\s*인물명/);
    expect(prompt).toMatch(/수식어처럼 보이는 구절이 실제 (드라마|작품)/);
  });

  it('정체·이유형 검색어는 물음표 질문형 제목으로 소화할 수 있다', () => {
    const prompt = buildSeoPrompt();
    expect(prompt).toMatch(/물음표 질문형/);
    expect(prompt).toMatch(/누구\?/);
    const contract = buildSituationTitleContract('seo');
    expect(contract).toMatch(/물음표 질문형/);
  });

  it('키워드 가시성 계약(검색 매칭)은 유지된다', () => {
    const prompt = buildSeoPrompt();
    expect(prompt).toContain('메인 키워드가 제목에 분명히 보이게');
    const contract = buildSituationTitleContract('seo');
    expect(contract).toContain('메인 키워드가 제목에 분명히 보여야 한다');
  });
});
