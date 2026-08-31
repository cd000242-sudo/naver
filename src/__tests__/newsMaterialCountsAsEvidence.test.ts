import { describe, expect, it } from 'vitest';

import { evaluateQuality } from '../contentPolicy/qualityGate';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { makeGoodDraft, makePolicyInput } from './contentPolicyFixtures';
import type { IntentAnalysis, SimilarityReport } from '../contentPolicy/types';

/**
 * [2026-08-31] 뉴스 자료가 근거로 인정되지 않아, 자료에 있는 수치가 통째로 지워지고 있었다.
 *
 * evidenceTexts() 는 first_party 와 official 만 근거로 셌다. 그런데
 * resolvePolicySourceMaterialType() 은 뉴스 URL 을 전부 'reference' 로,
 * URL 이 없는 붙여넣기 자료를 'user_provided' 로 배정한다 — 둘 다 근거에서 빠진다.
 *
 * 그 결과 이슈·키워드 모드에서는 근거가 사실상 0개가 되고,
 * 숫자가 든 문장이 전부 unsupported 로 몰려 removeUnsupportedClaimSentences 가
 * 문장째로 삭제한다. 기사에 그대로 적혀 있는 수치인데도 그렇다.
 *
 * 사장님 지적이 정확히 이 증상이다.
 *   "팩트체크까지 완료했다면 자료가 알차고 사람들이 원하는 정보를 줘야 되는데 많이 약한 것 같거든."
 *
 * 근거의 등급(first_party 가 뉴스보다 신뢰도 높다)은 점수 계산에서 다루면 된다.
 * "이 숫자가 어디서 왔는가" 를 묻는 자리에서는, 모델에게 실제로 건넨 자료 전부가 출처다.
 */
const intent: IntentAnalysis = {
  type: ['정보형'],
  primary_question: '영화 누룩 성적은 어떤가요?',
  supporting_questions: ['관객 수는?', '상영관은?'],
  keyword_intent_mismatch: false,
  mismatch_reasons: [],
} as unknown as IntentAnalysis;

const similarity: SimilarityReport = {
  risk: 'LOW',
  most_similar_article_id: null,
  title_jaccard: 0.1,
  intro_ngram_cosine: 0.1,
  body_embedding_cosine: 0.1,
  heading_overlap: 0.1,
  exact_sentence_reuse_ratio: 0,
  matched_patterns: [],
  embedding_model: 'test',
  compared_post_count: 0,
} as unknown as SimilarityReport;

/*
 * RISKY_CLAIM 이 실제로 잡는 형태(숫자+원/%/명/건/회)로 자료를 구성한다.
 * "12만 명" 처럼 단위 앞에 조사가 끼면 정규식이 놓치므로 테스트가 헛돈다.
 */
const NEWS_BODY = [
  '영화 누룩의 일반 관람료는 14000원으로 책정됐다.',
  '제작비 100% 를 감독이 사비로 충당했다고 밝혔다.',
  '개봉 3주 차 누적 관객은 120000명을 기록했다.',
].join(' ');

const CONFIG = await loadContentPolicy();

function evaluateWith(materialType: 'reference' | 'user_provided' | 'first_party') {
  const input = makePolicyInput({
    business_facts: [],
    source_materials: [{
      type: materialType,
      title: '영화 누룩 개봉 3주 차 성적',
      content: NEWS_BODY,
      source_id: 'news-1',
    }],
  });
  const draft = makeGoodDraft({
    introduction: '영화 누룩의 일반 관람료는 14000원으로 책정됐습니다.',
    headings: [
      { title: '관람료 기준', content: '영화 누룩의 일반 관람료는 14000원으로 책정됐습니다.' },
      { title: '누적 관객 성적', content: '개봉 3주 차 누적 관객은 120000명을 기록했습니다.' },
      { title: '제작 방식', content: '제작비 100% 를 감독이 사비로 충당했다고 밝혔습니다.' },
      { title: '앞으로의 일정', content: '배급사는 추가 상영 일정을 조율하고 있다고 설명했습니다.' },
    ],
    source_ids: ['news-1'],
  });
  return evaluateQuality(input, draft, intent, similarity, CONFIG);
}

describe('자료에 적힌 수치를 근거 없는 주장으로 몰지 않는다', () => {
  it('뉴스 자료(reference)에 있는 수치는 unsupported 가 아니다', () => {
    const report = evaluateWith('reference');
    expect(report.unsupported_claims.join(' ')).not.toContain('14000원');
    expect(report.unsupported_claims.join(' ')).not.toContain('120000명');
  });

  it('붙여넣기 자료(user_provided)도 마찬가지다 — 사용자가 직접 건넨 자료다', () => {
    const report = evaluateWith('user_provided');
    expect(report.unsupported_claims.join(' ')).not.toContain('14000원');
  });

  it('first_party 는 원래대로 근거로 인정된다 — 회귀 방지', () => {
    expect(evaluateWith('first_party').unsupported_claims.join(' ')).not.toContain('14000원');
  });
});

describe('자료에 없는 수치는 여전히 잡아낸다 — 완화가 아니라 정정이다', () => {
  it('자료 어디에도 없는 숫자를 지어내면 unsupported 로 남는다', () => {
    const input = makePolicyInput({
      business_facts: [],
      source_materials: [{
        type: 'reference',
        title: '영화 누룩 개봉 3주 차 성적',
        content: NEWS_BODY,
        source_id: 'news-1',
      }],
    });
    const draft = makeGoodDraft({
      introduction: '영화 누룩의 심야 관람료는 25000원까지 오른다고 합니다.',
      headings: [
        { title: '심야 요금', content: '영화 누룩의 심야 관람료는 25000원까지 오른다고 합니다.' },
        { title: '관람료 기준', content: '영화 누룩의 일반 관람료는 14000원으로 책정됐습니다.' },
        { title: '제작 방식', content: '제작비 100% 를 감독이 사비로 충당했다고 밝혔습니다.' },
        { title: '앞으로의 일정', content: '배급사는 추가 상영 일정을 조율하고 있다고 설명했습니다.' },
      ],
      source_ids: ['news-1'],
    });
    const report = evaluateQuality(input, draft, intent, similarity, CONFIG);
    expect(report.unsupported_claims.join(' ')).toContain('25000원');
  });

  it('forbidden_claims 는 자료와 무관하게 계속 걸린다', () => {
    const input = makePolicyInput({
      business_facts: [],
      forbidden_claims: ['상위 노출 보장'],
      source_materials: [{
        type: 'reference', title: '자료', content: NEWS_BODY, source_id: 'news-1',
      }],
    });
    const draft = makeGoodDraft({ introduction: '이 방법이면 상위 노출 보장 됩니다.' });
    const report = evaluateQuality(input, draft, intent, similarity, CONFIG);
    expect(report.unsupported_claims).toContain('상위 노출 보장');
  });
});
