import { describe, expect, it } from 'vitest';
import { acceptContentPolicyAdvisories } from '../contentPolicy/claimRepair';
import { guardGeneratedContent } from '../contentPolicy/generatedContentGuard';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import type { ArticleDraft, ContentPolicyResult } from '../contentPolicy/types';
import { makeGoodDraft, makePassPolicyResult, makePolicyInput } from './contentPolicyFixtures';

function blockedResult(reasons: string[]): ContentPolicyResult {
  const base = makePassPolicyResult();
  return {
    ...base,
    decision: 'BLOCK',
    block_reasons: [...reasons],
    publication: {
      ...base.publication,
      allowed: false,
      manual_review_required: true,
    },
  };
}

function structuredFromDraft(draft: ArticleDraft): Record<string, any> {
  return {
    selectedTitle: draft.title,
    summary: draft.summary,
    introduction: draft.introduction,
    headings: draft.headings.map((heading) => ({ ...heading })),
    bodyPlain: draft.body_markdown,
    content: draft.body_markdown,
    faq: draft.faq.map((item) => ({ ...item })),
    cta: draft.cta,
  };
}

describe('content policy advisory safety boundary', () => {
  it('keeps unknown editorial diagnostics as advisories so future quality rules cannot stop publishing again', () => {
    const result = acceptContentPolicyAdvisories(
      blockedResult(['BLOCK_COPIED_SOURCE', 'BLOCK_EXCESSIVE_SIMILARITY', 'BLOCK_FUTURE_SAFETY_RULE']),
      makePolicyInput(),
    );

    expect(result.policyResult.decision).toBe('PASS');
    expect(result.policyResult.block_reasons).toEqual([]);
    expect(result.advisoryReasons).toContain('BLOCK_COPIED_SOURCE');
    expect(result.advisoryReasons).toContain('BLOCK_EXCESSIVE_SIMILARITY');
    expect(result.advisoryReasons).toContain('BLOCK_FUTURE_SAFETY_RULE');
  });

  it('keeps an empty or unusable draft as the only content-policy hard stop', () => {
    const result = acceptContentPolicyAdvisories(
      blockedResult(['BLOCK_EMPTY_DRAFT', 'BLOCK_FUTURE_QUALITY_RULE']),
      makePolicyInput(),
    );

    expect(result.policyResult.decision).toBe('BLOCK');
    expect(result.policyResult.block_reasons).toEqual(['BLOCK_EMPTY_DRAFT']);
    expect(result.advisoryReasons).toContain('BLOCK_FUTURE_QUALITY_RULE');
  });

  it('continues with warnings for known editorial safety diagnostics after local repair', () => {
    const result = acceptContentPolicyAdvisories(
      blockedResult([
        'BLOCK_MISSING_FACTS',
        'BLOCK_FABRICATED_FIRSTHAND_EXPERIENCE',
        'BLOCK_FABRICATED_FACT',
        'BLOCK_COPIED_OR_LIGHTLY_PARAPHRASED_SOURCE',
        'BLOCK_MISSING_REQUIRED_INPUT',
        'BLOCK_FORBIDDEN_CLAIM',
        'BLOCK_UNSUPPORTED_CLAIM',
      ]),
      makePolicyInput({ business_facts: [] }),
    );

    expect(result.policyResult.decision).toBe('PASS');
    expect(result.policyResult.block_reasons).toEqual([]);
    expect(result.advisoryReasons).toEqual([
      'BLOCK_MISSING_FACTS',
      'BLOCK_FABRICATED_FIRSTHAND_EXPERIENCE',
      'BLOCK_FABRICATED_FACT',
      'BLOCK_COPIED_OR_LIGHTLY_PARAPHRASED_SOURCE',
      'BLOCK_MISSING_REQUIRED_INPUT',
      'BLOCK_FORBIDDEN_CLAIM',
      'BLOCK_UNSUPPORTED_CLAIM',
    ]);
  });

  it('continues for explicit quality and recent-post diagnostics', () => {
    const result = acceptContentPolicyAdvisories(
      blockedResult([
        'BLOCK_KEYWORD_BODY_MISMATCH',
        'BLOCK_EXCESSIVE_SIMILARITY',
        'BLOCK_RECENT_POSTS_UNAVAILABLE',
      ]),
      makePolicyInput(),
    );

    expect(result.policyResult.decision).toBe('PASS');
    expect(result.policyResult.block_reasons).toEqual([]);
    expect(result.advisoryReasons).toEqual([
      'BLOCK_KEYWORD_BODY_MISMATCH',
      'BLOCK_EXCESSIVE_SIMILARITY',
      'BLOCK_RECENT_POSTS_UNAVAILABLE',
    ]);
  });

  it('keeps copied-source findings as advisories so generation can continue', async () => {
    const draft = makeGoodDraft();
    const input = makePolicyInput({
      source_materials: [{
        type: 'reference',
        title: 'reference article',
        content: draft.body_markdown.replace('핵심입니다', '중요합니다'),
        url: 'https://blog.naver.com/example/1',
      }],
    });
    const result = await guardGeneratedContent({
      structuredContent: structuredFromDraft(draft),
      input,
      config: await loadContentPolicy(),
      recentPostsResult: { ok: true, posts: input.recent_posts || [], source: 'test' },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.advisoryReasons).toContain('BLOCK_COPIED_SOURCE');
    expect(result.content.quality.warnings).toContain('[콘텐츠 정책 경고] BLOCK_COPIED_SOURCE');
  });

  it('keeps missing-fact findings as advisories so generation can continue', async () => {
    const draft = makeGoodDraft({
      body_markdown: '지난달 현장에서 고객 30명 모두가 만족했고 비용은 정확히 45만원이었습니다.',
    });
    const input = makePolicyInput({
      business_facts: [],
      source_materials: [],
      business_facts_applicable: true,
    });
    const result = await guardGeneratedContent({
      structuredContent: structuredFromDraft(draft),
      input,
      config: await loadContentPolicy(),
      recentPostsResult: { ok: true, posts: input.recent_posts || [], source: 'test' },
    });

    expect(result.allowed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.advisoryReasons).toContain('BLOCK_MISSING_FACTS');
  });

  it('still stops before image generation when the generated draft is structurally empty', async () => {
    const input = makePolicyInput();
    const result = await guardGeneratedContent({
      structuredContent: {
        selectedTitle: '',
        summary: '',
        introduction: '',
        headings: [],
        bodyPlain: '',
        content: '',
        faq: [],
        cta: '',
      },
      input,
      config: await loadContentPolicy(),
      recentPostsResult: { ok: true, posts: input.recent_posts || [], source: 'test' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual(['BLOCK_EMPTY_DRAFT']);
  });
});
