import type {
  ArticleHeading,
  ContentPolicyConfig,
  ContentPolicyInput,
  IntentAnalysis,
  UniquenessPlan,
} from './types';

export interface ContentOutline {
  title: string;
  summary: string;
  introduction: string;
  headings: ArticleHeading[];
  faqQuestions: string[];
  cta: string;
  sourceIds: string[];
  disclosures: string[];
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueText(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.normalize('NFKC').toLocaleLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildHeadingTitles(
  input: ContentPolicyInput,
  intent: IntentAnalysis | undefined,
  plan: UniquenessPlan,
  count: number,
): string[] {
  const candidates = uniqueText([
    intent?.primary_question ?? '',
    ...(input.related_questions ?? []),
    `${humanize(plan.topic_angle)} overview`,
    'Verified facts and constraints',
    'Preparation and decision checklist',
    'Common risks to avoid',
    'Next steps',
  ].filter(hasText));

  while (candidates.length < count) {
    candidates.push(`${humanize(plan.topic_angle)} section ${candidates.length + 1}`);
  }
  return candidates.slice(0, count);
}

function buildFaqQuestions(input: ContentPolicyInput, min: number, max: number): string[] {
  const questions = uniqueText([...(input.related_questions ?? [])]);
  const fallbackLabels = ['preparation', 'cost factors', 'timing', 'risks', 'next steps'];
  for (const label of fallbackLabels) {
    if (questions.length >= min) break;
    questions.push(`${input.primary_keyword}: what should readers know about ${label}?`);
  }
  return questions.slice(0, max);
}

export function generateOutline(
  input: ContentPolicyInput,
  plan: UniquenessPlan,
  config: ContentPolicyConfig,
): ContentOutline;
export function generateOutline(
  input: ContentPolicyInput,
  intent: IntentAnalysis,
  plan: UniquenessPlan,
  config: ContentPolicyConfig,
): ContentOutline;
export function generateOutline(
  input: ContentPolicyInput,
  intentOrPlan: IntentAnalysis | UniquenessPlan,
  planOrConfig: UniquenessPlan | ContentPolicyConfig,
  maybeConfig?: ContentPolicyConfig,
): ContentOutline {
  const intent = maybeConfig ? intentOrPlan as IntentAnalysis : undefined;
  const plan = (maybeConfig ? planOrConfig : intentOrPlan) as UniquenessPlan;
  const config = (maybeConfig ?? planOrConfig) as ContentPolicyConfig;
  const facts = input.business_facts.map((fact) => fact.trim()).filter(Boolean);
  const headingCount = Math.min(
    config.content.headings_max,
    Math.max(config.content.headings_min, facts.length, 1),
  );
  const headingTitles = buildHeadingTitles(input, intent, plan, headingCount);
  const headings = headingTitles.map((title, index) => ({
    title,
    content: facts[index % Math.max(facts.length, 1)]
      ?? 'Source-backed details must be supplied before drafting.',
  }));
  const introduction = uniqueText([
    input.search_intent_hint ?? '',
    facts[0] ?? '',
  ].filter(hasText)).join(' ');
  const summary = input.content_goal?.trim()
    || intent?.primary_question
    || `A source-backed guide for ${input.target_reader.trim()}.`;

  return {
    title: `${input.primary_keyword.trim()} | ${humanize(plan.topic_angle)}`,
    summary,
    introduction: introduction || summary,
    headings,
    faqQuestions: buildFaqQuestions(input, config.content.faq_min, config.content.faq_max),
    cta: input.cta?.trim() ?? '',
    sourceIds: (input.source_materials ?? [])
      .map((source) => source.source_id?.trim())
      .filter(hasText),
    disclosures: (input.fixed_disclosures ?? []).map((value) => value.trim()).filter(Boolean),
  };
}
