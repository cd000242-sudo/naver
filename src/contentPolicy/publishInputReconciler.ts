import type { ArticleDraft, ContentPolicyInput } from './types.js';

const GENERIC_TITLE_TOKENS = new Set([
  '가이드',
  '꿀팁',
  '방법',
  '알아보기',
  '정보',
  '추천',
  '총정리',
  '핵심',
  '후기',
]);

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(/\s+/).filter((token) => token.length >= 2))];
}

function articleBody(draft: ArticleDraft): string {
  return [
    draft.introduction,
    draft.body_markdown,
    ...draft.headings.flatMap((heading) => [heading.title, heading.content]),
    ...draft.faq.flatMap((entry) => [entry.question, entry.answer]),
  ].filter(Boolean).join(' ');
}

function tokenCoverage(value: string, body: string): number {
  const normalizedValue = normalize(value);
  const normalizedBody = normalize(body);
  if (!normalizedValue || !normalizedBody) return 0;
  if (normalizedBody.includes(normalizedValue)) return 1;
  const valueTokens = tokens(value);
  if (valueTokens.length === 0) return 0;
  return valueTokens.filter((token) => normalizedBody.includes(token)).length / valueTokens.length;
}

function koreanStem(token: string): string {
  const stem = token.replace(/(?:에서|으로|에게|까지|부터|처럼|보다|하고|이며|와|과|은|는|이|가|을|를|의|에|로|도|만)$/u, '');
  return stem.length >= 2 ? stem : token;
}

function deriveFinalTitleKeyword(draft: ArticleDraft): string | null {
  const title = draft.title.trim();
  const body = articleBody(draft);
  if (!title || !normalize(body)) return null;
  if (tokenCoverage(title, body) >= 0.5) return title;

  const titleTokens = tokens(title).filter((token) => (
    !/^\d{1,4}$/u.test(token) && !GENERIC_TITLE_TOKENS.has(token)
  ));
  if (titleTokens.length === 0) return null;
  const normalizedBody = normalize(body);
  const matchedTokens = titleTokens.map((token) => {
    if (normalizedBody.includes(token)) return token;
    const stem = koreanStem(token);
    return normalizedBody.includes(stem) ? stem : '';
  }).filter(Boolean);
  const aligned = matchedTokens.length > 0 && matchedTokens.length / titleTokens.length >= 0.4;
  return aligned ? [...new Set(matchedTokens)].join(' ') : null;
}

export function reconcilePublishPolicyInput(
  input: ContentPolicyInput,
  draft: ArticleDraft,
  options: { semiAutoMode: boolean; contextMissing: boolean },
): ContentPolicyInput {
  const body = articleBody(draft);
  const finalKeyword = deriveFinalTitleKeyword(draft);
  const contextDrifted = tokenCoverage(input.primary_keyword, body) < 0.5;
  const titleContextDrifted = tokenCoverage(input.primary_keyword, draft.title) < 0.5;
  const mustUseFinalDraft = options.semiAutoMode
    || options.contextMissing
    || contextDrifted
    || !finalKeyword;
  if (!mustUseFinalDraft) {
    return {
      ...input,
      business_facts: [...input.business_facts],
      secondary_keywords: input.secondary_keywords ? [...input.secondary_keywords] : undefined,
      source_materials: input.source_materials?.map((source) => ({ ...source })),
      related_questions: input.related_questions ? [...input.related_questions] : undefined,
    };
  }

  const resetStaleContext = options.semiAutoMode
    || options.contextMissing
    || (contextDrifted && titleContextDrifted);
  if (!resetStaleContext) {
    return {
      ...input,
      primary_keyword: finalKeyword || draft.title.trim(),
      business_facts: [...input.business_facts],
      secondary_keywords: input.secondary_keywords ? [...input.secondary_keywords] : undefined,
      source_materials: input.source_materials?.map((source) => ({ ...source })),
      related_questions: input.related_questions ? [...input.related_questions] : undefined,
    };
  }

  const faqQuestions = draft.faq.map((item) => item.question.trim()).filter(Boolean);
  const relevantBusinessFacts = input.business_facts.filter((fact) => tokenCoverage(fact, body) >= 0.35);
  const relevantSourceMaterials = (input.source_materials || []).filter((source) => (
    tokenCoverage(source.content || source.title, body) >= 0.2
  ));
  const inputOrigin = options.semiAutoMode ? 'semi_auto_manual' : 'final_draft_payload';
  const provenanceFact = options.semiAutoMode
    ? '사용자가 반자동 편집 화면에서 최종 원고를 직접 확인했다.'
    : '발행 경계에서 최종 제목과 본문을 기준으로 원고를 다시 확인했다.';
  return {
    ...input,
    input_origin: inputOrigin,
    primary_keyword: finalKeyword || draft.title.trim(),
    secondary_keywords: [],
    region: undefined,
    service: undefined,
    target_reader: '최종 편집 원고의 주제를 확인하는 독자',
    search_intent_hint: finalKeyword ? `${draft.title.trim()}에 필요한 내용을 알고 싶음` : undefined,
    content_goal: '최종 편집 원고의 질문에 정확히 답변',
    business_facts: relevantBusinessFacts.length > 0 ? relevantBusinessFacts : [provenanceFact],
    source_materials: relevantSourceMaterials.map((source) => ({ ...source })),
    related_questions: faqQuestions,
    cta: draft.cta.trim() || undefined,
  };
}
