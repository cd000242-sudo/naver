import type {
  ArticleDraft,
  ContentPolicyInput,
  ContentPolicyResult,
  RecentPostRecord,
} from '../contentPolicy/types';

export function makeRecentPost(index: number, overrides: Partial<RecentPostRecord> = {}): RecentPostRecord {
  return {
    article_id: `recent-${index}`,
    title: `서로 다른 생활 정보 ${index}`,
    intro: `이 글은 ${index}번째 주제를 설명하는 고유한 도입입니다.`,
    headings: [`준비 ${index}`, `절차 ${index}`, `확인 ${index}`, `마무리 ${index}`],
    body: `고유한 본문 ${index}. 준비와 절차, 확인 사항을 서로 다른 순서로 설명합니다.`,
    topic_angle: `angle-${index}`,
    structure_type: `structure-${index}`,
    business_facts: [`사실 ${index}`],
    related_questions: [`질문 ${index}`],
    published_at: new Date(2026, 0, index + 1).toISOString(),
    exposure_status: 'INDEXED',
    template_id: `template-${index}`,
    ...overrides,
  };
}

export function makeRecentPosts(count = 20): RecentPostRecord[] {
  return Array.from({ length: count }, (_, index) => makeRecentPost(index));
}

export function makePolicyInput(overrides: Partial<ContentPolicyInput> = {}): ContentPolicyInput {
  return {
    primary_keyword: '부산 유품 정리',
    secondary_keywords: ['유품 보관', '유품 기부', '정리 절차'],
    region: '부산',
    service: '유품 정리',
    target_reader: '처음 유품 정리를 준비하는 유족',
    search_intent_hint: '준비 절차와 귀중품 보관 방법을 알고 싶음',
    content_goal: '실행 가능한 정보 제공',
    business_facts: [
      '작업 전 가족이 귀중품을 먼저 확인한다.',
      '기부 물품과 폐기 물품을 분리한다.',
      '희망 일정은 상담 단계에서 확인한다.',
    ],
    source_materials: [{
      type: 'first_party',
      title: '업체 내부 절차',
      content: '귀중품 확인 후 기부 물품과 폐기 물품을 분리한다.',
      source_id: 'first-party-1',
    }],
    related_questions: [
      '귀중품은 어떻게 따로 보관하나요?',
      '기부할 물건은 어떻게 분류하나요?',
      '작업 전에 가족이 확인할 것은 무엇인가요?',
      '일정은 언제 정하면 되나요?',
    ],
    recent_posts: makeRecentPosts(),
    forbidden_claims: ['상위 노출 보장', '100% 해결'],
    cta: '현재 보관 중인 물품과 희망 일정을 먼저 정리해 보세요.',
    template_id: 'reader-guide-v1',
    account_id: 'account-a',
    blog_id: 'blog-a',
    ...overrides,
  };
}

export function makeGoodDraft(overrides: Partial<ArticleDraft> = {}): ArticleDraft {
  const headings = [
    { title: '귀중품을 먼저 확인하는 순서', content: '작업 전 가족이 귀중품을 먼저 확인하고 별도 상자에 보관합니다.' },
    { title: '기부 물품과 폐기 물품 구분', content: '기부 가능한 물품과 폐기 물품을 나눠 표시하면 혼선을 줄일 수 있습니다.' },
    { title: '작업 전에 준비할 체크리스트', content: '사진, 문서, 열쇠처럼 다시 확인할 물건을 목록으로 남깁니다.' },
    { title: '희망 일정과 진행 절차 확인', content: '희망 일정은 상담 단계에서 확인하고 가족의 최종 확인 시간을 확보합니다.' },
  ];
  const introduction = '부산 유품 정리를 준비할 때는 귀중품 확인과 물품 분류를 먼저 끝내는 것이 핵심입니다.';
  const body = [
    introduction,
    ...headings.flatMap((heading) => [`## ${heading.title}`, heading.content]),
  ].join('\n\n');
  return {
    title: '부산 유품 정리 준비 순서와 귀중품 보관 기준',
    summary: '가족이 먼저 확인할 물건과 분류 순서를 정리합니다.',
    introduction,
    headings,
    body_markdown: body,
    faq: [
      { question: '귀중품은 언제 확인하나요?', answer: '작업 전에 가족이 먼저 확인합니다.' },
      { question: '기부 물품은 어떻게 나누나요?', answer: '상태와 기부처 기준을 확인해 별도로 표시합니다.' },
      { question: '일정은 언제 정하나요?', answer: '희망 일정은 상담 단계에서 확인합니다.' },
    ],
    cta: '현재 보관 중인 물품과 희망 일정을 먼저 정리해 보세요.',
    source_ids: ['first-party-1'],
    ...overrides,
  };
}

export function makePassPolicyResult(overrides: Partial<ContentPolicyResult> = {}): ContentPolicyResult {
  return {
    decision: 'PASS',
    block_reasons: [],
    intent: {
      type: ['informational', 'local'],
      primary_question: '무엇을 먼저 준비해야 하나요?',
      supporting_questions: ['귀중품은 어떻게 보관하나요?'],
      keyword_intent_mismatch: false,
      mismatch_reasons: [],
    },
    uniqueness_plan: {
      topic_angle: 'storage_and_sorting',
      structure_type: 'decision_checklist',
      difference_from_recent_posts: ['최근 글과 다른 질문을 사용'],
    },
    article: {
      title: '부산 유품 정리 준비 순서',
      summary: '요약',
      body_markdown: '본문',
      faq: [],
      cta: '',
    },
    quality_report: {
      total_score: 95,
      intent_score: 30,
      reader_value_score: 20,
      originality_score: 20,
      first_party_score: 15,
      readability_score: 5,
      spam_safety_score: 5,
      unsupported_claims: [],
      keyword_intent_mismatch: false,
      fatal_errors: [],
    },
    similarity_report: {
      risk: 'LOW',
      most_similar_article_id: null,
      title_jaccard: 0,
      intro_ngram_cosine: 0,
      body_embedding_cosine: 0,
      heading_overlap: 0,
      exact_sentence_reuse_ratio: 0,
      matched_patterns: [],
      embedding_model: 'hash-deterministic-v1',
      compared_post_count: 20,
    },
    publication: {
      allowed: true,
      template_id: 'reader-guide-v1',
      monitor_required: true,
      manual_review_required: false,
    },
    rewrite_count: 0,
    policy_version: '1',
    prompt_version: 'content-policy-v1',
    model_version: 'test-model',
    input_hash: 'hash',
    stage_trace: [],
    ...overrides,
  };
}
