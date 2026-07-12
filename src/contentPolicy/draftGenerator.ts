import type {
  ArticleDraft,
  ArticleFaq,
  ContentPolicyConfig,
  ContentPolicyInput,
} from './types';
import type { ContentOutline } from './outlineGenerator';

export interface DraftGenerationOptions {
  input: ContentPolicyInput;
  outline: ContentOutline;
  config?: ContentPolicyConfig;
}

function answerForQuestion(input: ContentPolicyInput, index: number): string {
  const facts = input.business_facts.map((fact) => fact.trim()).filter(Boolean);
  return facts[index % Math.max(facts.length, 1)]
    ?? 'No verified answer is available from the supplied facts.';
}

function buildFaq(
  input: ContentPolicyInput,
  questions: string[],
  config?: ContentPolicyConfig,
): ArticleFaq[] {
  const max = config?.content.faq_max ?? questions.length;
  return questions.slice(0, max).map((question, index) => ({
    question,
    answer: answerForQuestion(input, index),
  }));
}

function resolveArguments(
  inputOrOptions: ContentPolicyInput | DraftGenerationOptions,
  outline?: ContentOutline,
  config?: ContentPolicyConfig,
): DraftGenerationOptions {
  if ('input' in inputOrOptions && 'outline' in inputOrOptions) {
    return {
      input: inputOrOptions.input,
      outline: inputOrOptions.outline,
      config: inputOrOptions.config,
    };
  }
  if (!outline) throw new Error('DRAFT_OUTLINE_REQUIRED');
  return { input: inputOrOptions, outline, config };
}

export function generateDraft(options: DraftGenerationOptions): ArticleDraft;
export function generateDraft(
  input: ContentPolicyInput,
  outline: ContentOutline,
  config?: ContentPolicyConfig,
): ArticleDraft;
export function generateDraft(
  inputOrOptions: ContentPolicyInput | DraftGenerationOptions,
  outline?: ContentOutline,
  config?: ContentPolicyConfig,
): ArticleDraft {
  const resolved = resolveArguments(inputOrOptions, outline, config);
  const maxHeadings = resolved.config?.content.headings_max ?? resolved.outline.headings.length;
  const headings = resolved.outline.headings.slice(0, maxHeadings).map((heading) => ({
    title: heading.title.trim(),
    content: heading.content.trim(),
  }));
  const bodyParts = [
    resolved.outline.introduction.trim(),
    ...headings.flatMap((heading) => [`## ${heading.title}`, heading.content]),
    ...resolved.outline.disclosures,
  ].filter(Boolean);

  return {
    title: resolved.outline.title.trim(),
    summary: resolved.outline.summary.trim(),
    introduction: resolved.outline.introduction.trim(),
    headings,
    body_markdown: bodyParts.join('\n\n'),
    faq: buildFaq(resolved.input, resolved.outline.faqQuestions, resolved.config),
    cta: resolved.outline.cta.trim(),
    source_ids: [...resolved.outline.sourceIds],
  };
}
