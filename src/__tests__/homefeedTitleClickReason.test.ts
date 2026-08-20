import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';
import { evaluateTitleQuality } from '../contentTitleEvaluator';
import { HOMEFEED_TITLE_FORMULAS } from '../contentTitleFormulas';

/**
 * [2026-08-20] 홈판 제목이 "~정리/~가이드/~현황" 보도자료 문형으로 발행되던 문제.
 *
 * 사용자 관찰: "클릭하고 싶지도 않고 네이버 봇 관점에서도 가치를 못 느끼겠다."
 * 실측(published-posts.json): "택배사별 재개일 정리", "재고 현황", "관전 포인트",
 * "항목과 대응", "조건 확인 가이드" — 전부 요약 명사 종결, 클릭 사유 0.
 *
 * 3중 원인:
 *   1. 공식 풀 ⑨간단정리형 예시("~정리했어요")가 프롬프트 맨 뒤(최고 순응 위치)에 주입
 *   2. 기존 -35(템플릿 종결어)는 서브키워드 +10·길이 +5 가점에 상쇄돼 75점 게이트 통과
 *   3. 제목 생성 전에 크롤링 원문으로 "클릭 사유"를 추론하는 단계 부재
 *
 * 수정: 홈판 한정 요약 명사 종결 -50(상쇄 불가) + 공식 풀 요약형 제거
 *   + 홈판 스키마에 clickAnalysis(클릭 사유 추론) 선행 강제.
 */

const KEYWORD = '택배없는날';

function homefeedScore(title: string): number {
  return evaluateTitleQuality(title, KEYWORD, 'homefeed' as never, '사회').score;
}

describe('homefeed summary-noun ending penalty', () => {
  // 실제 발행됐던 요약형 제목들 — 반드시 75점 게이트에서 떨어져야 한다.
  it.each([
    '2026년 택배없는날 8월 14일 멈추는 배송 택배사별 재개일 정리',
    '홈플러스 재개장 67개 매장 확인과 반값 할인 재고 현황',
    '예비역 소환한 신병4 24일 첫방 관전 포인트',
    '앱 회원이라면 먼저 볼 것, 삼프로TV 개인정보 유출 항목과 대응',
  ])('fails the 75-point gate: %s', (title) => {
    expect(homefeedScore(title)).toBeLessThan(75);
  });

  it('reports the penalty reason so retry feedback names the problem', () => {
    const { issues } = evaluateTitleQuality(
      '택배없는날 배송 중단 택배사별 재개일 정리',
      KEYWORD,
      'homefeed' as never,
      '사회',
    );
    expect(issues.join(' ')).toContain('요약 명사 종결');
  });

  it('keeps curiosity-driven titles above the gate', () => {
    expect(homefeedScore('택배없는날인데 우리 집 택배만 오는 이유가 있었다'))
      .toBeGreaterThanOrEqual(75);
  });

  it('does not punish seo mode for the same endings beyond the legacy rule', () => {
    const seo = evaluateTitleQuality('택배없는날 택배사별 재개일 총정리', KEYWORD, 'seo' as never);
    const homefeed = evaluateTitleQuality('택배없는날 택배사별 재개일 총정리', KEYWORD, 'homefeed' as never);
    expect(homefeed.score).toBeLessThan(seo.score);
  });
});

describe('homefeed formula pool has no summary-noun endings', () => {
  it.each(HOMEFEED_TITLE_FORMULAS.map(f => [f.name, f.example] as const))(
    'formula %s example carries a click reason, not a summary ending',
    (_name, example) => {
      expect(example).not.toMatch(/(?:정리|현황|포인트|모음|리스트|대응|의미|근황|요약)(?:했어요|해봤어요)?\s*$/);
    },
  );
});

describe('main-path homefeed prompt wires click-reason inference', () => {
  // 본선 = 본문 생성 1회 호출(buildContentJsonOutputFormat)이 제목까지 만든다.
  // generateTitleOnlyPatch 는 프로덕션에서 꺼진 수리 경로다 — 본선에 반드시 배선돼야 한다.
  function mainPrompt(mode: 'homefeed' | 'seo' | 'affiliate' | 'business' | 'mate', categoryHint?: string): string {
    return buildContentJsonOutputFormat({
      contentMode: mode,
      mode,
      source: {
        rawText: '원본 본문입니다.',
        title: '제목 참고',
        metadata: { keywords: [KEYWORD, '서브키워드'] },
        categoryHint,
      } as never,
      title: '제목 참고',
      rawText: '테스트 원문',
      primaryKeyword: KEYWORD,
      subKeywords: '서브키워드',
      minChars: 2000,
    });
  }

  it('homefeed schema carries clickReason axis and per-candidate whyClick', () => {
    const prompt = mainPrompt('homefeed');
    expect(prompt).toContain('"clickReason"');
    expect(prompt).toContain('"whyClick"');
  });

  it('homefeed issue-pick variant also carries clickReason', () => {
    const prompt = mainPrompt('homefeed', '연예');
    expect(prompt).toContain('"clickReason"');
    expect(prompt).toContain('"curiosityGaps"');
  });

  it('homefeed directive enforces coherent hooks and bans summary endings', () => {
    const prompt = mainPrompt('homefeed');
    expect(prompt).toContain('[whyClick 자가검증]');
    expect(prompt).toContain('[훅은 말이 되어야 한다]');
    expect(prompt).toContain('[요약 명사 종결 금지]');
  });

  // [2026-08-20 2차] SEO·쇼핑도 클릭 사유 계약을 갖는다 — 단, 방향이 다르다:
  //   SEO = 답 은닉이 아니라 "가장 직접적인 답" 약속으로 경쟁 글을 이긴다.
  //   쇼핑 = 제품명+상황+후킹 ("제품명이 포함된 홈판").
  it('seo carries a search-intent click contract, not the homefeed gap contract', () => {
    const prompt = mainPrompt('seo');
    expect(prompt).toContain('"clickReason"');
    expect(prompt).toContain('"whyClick"');
    expect(prompt).toContain('[검색 클릭 계약]');
    expect(prompt).toContain('[약속-상환]');
    expect(prompt).not.toContain('[요약 명사 종결 금지]');
  });

  it('affiliate carries the product+situation+hook contract', () => {
    const prompt = mainPrompt('affiliate');
    expect(prompt).toContain('"clickReason"');
    expect(prompt).toContain('"whyClick"');
    expect(prompt).toContain('[쇼핑 클릭 계약 — 제품명+상황+후킹]');
    expect(prompt).not.toContain('[검색 클릭 계약]');
  });

  // [2026-08-20 3차] 사장님 지시 "업체홍보모드도 각 모드에 맞게 추론해야 돼" — 이전의
  // business 미누출 잠금을 뒤집는다. 단, 복붙 금지 원칙은 유지: business 계약은 홈판 갭
  // 은닉이 아니라 문의 전환 심리(inquiryTrigger·장벽 해소 약속)에서 도출돼야 한다.
  it('business carries an inquiry-driven click contract, not the homefeed gap contract', () => {
    const prompt = mainPrompt('business');
    expect(prompt).toContain('"clickReason"');
    expect(prompt).toContain('"whyClick"');
    expect(prompt).toContain('[업체홍보 클릭 계약]');
    expect(prompt).toContain('[광고법·신뢰 우선]');
    expect(prompt).not.toContain('[요약 명사 종결 금지]');
    expect(prompt).not.toContain('[쇼핑 클릭 계약');
  });

  it('mate carries the answer+citation click contract', () => {
    const prompt = mainPrompt('mate');
    expect(prompt).toContain('"clickReason"');
    expect(prompt).toContain('"whyClick"');
    expect(prompt).toContain('[메이트 클릭 계약]');
    expect(prompt).toContain('citationAtoms');
    expect(prompt).not.toContain('[요약 명사 종결 금지]');
  });
});

describe('homefeed title generation wires click-reason inference', () => {
  const source = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8');

  // [2026-08-20 3차] 패치 스키마가 홈판 전용 삼항이었다 — seo·affiliate 패치가 추론 없는
  // 옛 스키마로 본선 계약 제목을 덮어쓰는 구멍(사장님: "발행해보니 예전 그대로 절대 안 돼").
  // 이제 전 패치 모드가 clickAnalysis 선행 스키마 하나를 쓴다.
  it('forces clickAnalysis before titles in every title-patch schema', () => {
    expect(source).toMatch(/const schema = `Output ONLY valid JSON[^`]*clickAnalysis/);
    expect(source).toContain('"mostSurprisingFact"');
    expect(source).toContain('"readerQuestion"');
    expect(source).toContain('"clickReason"');
  });

  it('gives the affiliate title patch a purchase-axis inference step', () => {
    expect(source).toContain('[0단계 — 구매 판단 축 추론');
    expect(source).toContain('당연한 기능 결과');
  });

  it('gives the seo/mate title patch a search-click inference step', () => {
    expect(source).toContain('[0단계 — 검색 클릭 사유 추론');
  });

  it('gives homefeed a larger article snippet for the inference step', () => {
    expect(source).toMatch(/substring\(0,\s*mode === 'homefeed'\s*\?\s*2500\s*:\s*1000\)/);
  });

  it('bans summary-noun endings in the homefeed task rules', () => {
    expect(source).toContain('요약 명사 종결 금지');
  });
});
