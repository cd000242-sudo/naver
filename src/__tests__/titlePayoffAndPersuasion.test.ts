import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { buildEvidenceAndIntentFinalContract } from '../content/evidenceIntegrity';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-07-29] 라이브 실측 2건에 대한 프롬프트 계약 잠금.
 *
 * (1) 홈판 rimi_77- 글 2건: 제목("…환수됩니다", "…1분 확인하는 방법")이 던진 질문에
 *     본문이 답하지 않고 "현재 자료에는 ~가 제시되지 않았으므로 안내할 수 없어요" 같은
 *     근거 메타 서술로 채워짐 → 독자 즉시 이탈.
 * (2) 쇼핑커넥트 글: "이런 후기는 내구성까지 나온 후기가 아니고…"처럼 후기의 품질을
 *     평가하는 메타 글이 됨 → 구매 설득 실패.
 */
describe('homefeed title payoff + evidence-meta seal', () => {
  it('FINAL CONTRACT(런타임): 근거 메타 서술 금지가 grounded/ungrounded 모두에 들어간다', () => {
    const ungrounded = buildEvidenceAndIntentFinalContract({ rawText: '' } as any, 'homefeed');
    const grounded = buildEvidenceAndIntentFinalContract(
      { rawText: '충분히 긴 근거 텍스트입니다. '.repeat(10) } as any,
      'homefeed',
    );
    for (const contract of [ungrounded, grounded]) {
      expect(contract).toContain('자료의 존재·부족·범위를 독자에게 말하지 않는다');
      expect(contract).toContain('제공된 문구');
      expect(contract).toContain('제목이 던진 질문·숫자·정체·방법은 도입부 첫 3~5문장 안에서 직접 답한다');
    }
    // 근거 부족 시: 답 못 줄 약속형 제목 자체를 금지
    expect(ungrounded).toContain('근거 없이 답할 수 없는 약속');
  });

  it('홈판 base.prompt에 TITLE PAYOFF 규칙이 존재한다', () => {
    const base = read('prompts/homefeed/base.prompt');
    expect(base).toContain('[TITLE PAYOFF — 필수]');
    expect(base).toContain('도입부 첫 3~5문장 안에서 직접 답한다');
    expect(base).toContain('근거로 답할 수 있는 제목으로 바꾼다');
  });

  it('NEO-HOOK 자가검토에 훅 이행(payoff) 항목이 있다', () => {
    const neo = read('content/neoHookTitles.ts');
    expect(neo).toContain('약속한 정보(질문·숫자·정체·방법)를 근거 자료로 도입부에서 직접 답할 수 있는가');
  });
});

describe('affiliate persuasion rewrite (후기 평가체 제거)', () => {
  it('REVIEW SEARCH INTENT: 후기 평가 금지 + 장르 재정의 + 허위 체험 금지 유지', () => {
    const auth = read('content/affiliateAuthenticity.ts');
    expect(auth).toContain('[후기 평가 금지 — 가장 중요]');
    expect(auth).toContain('언급 자체를 하지 않고 조용히 생략한다');
    expect(auth).toContain('내부 판단 기준일 뿐, 독자용 문장이 아니다');
    expect(auth).toContain('독자 상황 시뮬레이션');
    expect(auth).not.toContain('후기 분석처럼 연결한다');
    // 표본 크기 노출을 유발하던 문구 제거
    expect(auth).not.toContain('"한 구매자 후기에서는"처럼 범위를 정확히 한정한다');
    // 기만 방지선은 불변
    expect(auth).toContain('허위 체험을 만들지 않는다');
  });

  it('REVIEW DECISION BLUEPRINT: 구매 결정 구조로 리프레임 + 표본 메타 봉인', () => {
    const bp = read('content/reviewDecisionBlueprint.ts');
    expect(bp).toContain('구매 결정을 만드는 글의 우선 구조');
    expect(bp).not.toContain('후기형 글의 최우선 구조');
    expect(bp).toContain('본문에 후기 개수나 표본 이야기를 쓰지 않는다');
    expect(bp).toContain('후기의 범위·개수·부족을 서술하는 문장은 어디에도 쓰지 않는다');
  });

  it('affiliate base.prompt: 자료 부족 메타 노출 금지 조항(F4 등가)이 존재한다', () => {
    const base = read('prompts/affiliate/base.prompt');
    expect(base).toContain('[자료 부족·후기 범위 메타 노출 금지]');
    expect(base).toContain('구체적으로 설명되지 않았다');
  });

  it('전문가 분석형: 후기 구조 계약 미부착 + 구매 결정 목표 문장', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(/isExpertAnalysis \? '' : buildAffiliateReviewIntentContract\(source\)/);
    const expert = read('prompts/affiliate/shopping_expert_review.prompt');
    expect(expert).toContain('구매를 결정할 이유');
    expect(expert).not.toContain('"좋은 제품"이라고 설득하는 글이 아니라');
  });
});
