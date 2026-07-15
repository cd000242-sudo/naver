import { describe, expect, it } from 'vitest';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { runContentPolicyPipeline } from '../contentPolicy/orchestrator';
import { guardGeneratedContent } from '../contentPolicy/generatedContentGuard';
import { makeGoodDraft, makePolicyInput } from './contentPolicyFixtures';

describe('content policy fabricated-fact recovery', () => {
  it('does not classify an explicit no-guarantee disclaimer as a fabricated claim', async () => {
    const disclaimer = '다만 모든 차량에 100% 완벽하게 호환된다고 단정하기는 어렵습니다.';
    const draft = makeGoodDraft({
      body_markdown: `${makeGoodDraft().body_markdown}\n\n${disclaimer}`,
    });

    const result = await runContentPolicyPipeline({
      input: makePolicyInput(),
      draft,
      config: await loadContentPolicy(),
    });

    expect(result.decision).toBe('PASS');
    expect(result.rewrite_count).toBe(0);
    expect(result.quality_report.unsupported_claims).toEqual([]);
    expect(result.article.body_markdown).toContain(disclaimer);
  });

  it('removes unsupported price and performance sentences during the rewrite loop', async () => {
    const unsupported = '국내생산 윈드포스 기술을 적용한 이 시트커버는 45,800원에 판매되고 있습니다.';
    const base = makeGoodDraft();
    const draft = makeGoodDraft({
      headings: base.headings.map((heading, index) => index === 0
        ? { ...heading, content: `${heading.content} ${unsupported}` }
        : { ...heading }),
      body_markdown: `${base.body_markdown}\n\n${unsupported}`,
    });

    const result = await runContentPolicyPipeline({
      input: makePolicyInput(),
      draft,
      config: await loadContentPolicy(),
    });

    expect(result.decision).toBe('PASS');
    expect(result.rewrite_count).toBe(1);
    expect(result.quality_report.unsupported_claims).toEqual([]);
    expect(result.article.body_markdown).not.toContain('45,800원');
    expect(result.article.headings?.[0].content).not.toContain('45,800원');
  });

  it('repairs generated structured content before the image stage receives it', async () => {
    const unsupported = '국내생산 윈드포스 기술을 적용한 이 시트커버는 45,800원에 판매되고 있습니다.';
    const draft = makeGoodDraft();
    const input = makePolicyInput();
    const result = await guardGeneratedContent({
      structuredContent: {
        selectedTitle: draft.title,
        summary: draft.summary,
        introduction: draft.introduction,
        headings: draft.headings.map((heading, index) => index === 0
          ? { ...heading, content: `${heading.content} ${unsupported}` }
          : { ...heading }),
        bodyPlain: `${draft.body_markdown}\n\n${unsupported}`,
        content: `${draft.body_markdown}\n\n${unsupported}`,
        faq: draft.faq,
        cta: draft.cta,
      },
      input,
      config: await loadContentPolicy(),
      recentPostsResult: { ok: true, posts: input.recent_posts || [], source: 'test' },
    });

    expect(result.allowed).toBe(true);
    expect(result.policyResult.rewrite_count).toBe(1);
    expect(result.content.bodyPlain).not.toContain('45,800원');
    expect(result.content.headings[0].content).not.toContain('45,800원');
  });

  it('removes a declared forbidden sentence and continues to the image stage with an advisory', async () => {
    const unsupported = '이 서비스는 누구에게나 100% 해결을 보장합니다.';
    const draft = makeGoodDraft();
    const input = makePolicyInput({ forbidden_claims: [unsupported] });
    const result = await guardGeneratedContent({
      structuredContent: {
        selectedTitle: draft.title,
        summary: draft.summary,
        introduction: draft.introduction,
        headings: draft.headings,
        bodyPlain: `${draft.body_markdown}\n\n${unsupported}`,
        content: `${draft.body_markdown}\n\n${unsupported}`,
        faq: draft.faq,
        cta: draft.cta,
      },
      input,
      config: await loadContentPolicy(),
      recentPostsResult: { ok: true, posts: input.recent_posts || [], source: 'test' },
    });

    expect(result.allowed).toBe(true);
    expect(result.manualReviewRequired).toBe(false);
    expect(result.advisoryReasons).toContain('BLOCK_FORBIDDEN_CLAIM');
    expect(result.content.bodyPlain).not.toContain('100% 해결을 보장');
  });
});
