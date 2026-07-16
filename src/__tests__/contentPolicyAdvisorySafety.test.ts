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
  it('keeps copied-source and unknown policy reasons blocked by default', () => {
    const result = acceptContentPolicyAdvisories(
      blockedResult(['BLOCK_COPIED_SOURCE', 'BLOCK_EXCESSIVE_SIMILARITY', 'BLOCK_FUTURE_SAFETY_RULE']),
      makePolicyInput(),
    );

    expect(result.policyResult.decision).toBe('BLOCK');
    expect(result.policyResult.block_reasons).toEqual([
      'BLOCK_COPIED_SOURCE',
      'BLOCK_FUTURE_SAFETY_RULE',
    ]);
    expect(result.advisoryReasons).toContain('BLOCK_EXCESSIVE_SIMILARITY');
  });

  it('keeps missing facts and fabricated firsthand experience blocked', () => {
    const result = acceptContentPolicyAdvisories(
      blockedResult(['BLOCK_MISSING_FACTS', 'BLOCK_FABRICATED_FIRSTHAND_EXPERIENCE']),
      makePolicyInput({ business_facts: [] }),
    );

    expect(result.policyResult.decision).toBe('BLOCK');
    expect(result.policyResult.block_reasons).toEqual([
      'BLOCK_MISSING_FACTS',
      'BLOCK_FABRICATED_FIRSTHAND_EXPERIENCE',
    ]);
    expect(result.advisoryReasons).toEqual([]);
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

  it('does not let the generated-content guard publish copied reference text', async () => {
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

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('BLOCK_COPIED_SOURCE');
  });

  it('does not let the generated-content guard publish business claims without facts', async () => {
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

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain('BLOCK_MISSING_FACTS');
  });
});
