import { describe, expect, it } from 'vitest';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { validatePolicyInput } from '../contentPolicy/inputValidator';
import { analyzeSearchIntent } from '../contentPolicy/searchIntentAnalyzer';
import { analyzeSimilarity } from '../contentPolicy/similarityGuard';
import { runContentPolicyPipeline } from '../contentPolicy/orchestrator';
import { makeGoodDraft, makePolicyInput, makeRecentPost, makeRecentPosts } from './contentPolicyFixtures';

describe('content policy acceptance cases', () => {
  it('returns REWRITE or BLOCK when the opening pattern was already repeated', async () => {
    const opening = '이사 날짜는 다가오는데 막막하신가요?';
    const recent = makeRecentPosts().map((post, index) => index < 5
      ? { ...post, intro: `${opening} ${index}번째 안내입니다.`, body: `${opening}\n${post.body}` }
      : post);
    const draft = makeGoodDraft({
      introduction: `${opening} 먼저 준비할 내용을 확인합니다.`,
      body_markdown: `${opening} 먼저 준비할 내용을 확인합니다.\n\n${makeGoodDraft().body_markdown}`,
    });

    const report = await analyzeSimilarity(makePolicyInput({ recent_posts: recent }), draft, await loadContentPolicy());

    expect(['MEDIUM', 'HIGH']).toContain(report.risk);
    expect(report.matched_patterns).toContain('REPEATED_OPENING_PATTERN');
  });

  it('blocks a 부산 유품 정리 draft that is mostly about moving waste', () => {
    const body = '이사 폐기물은 트럭에 싣고 폐기장으로 옮깁니다. 이사 폐기물 배출량과 운반 차량을 계속 설명합니다.';
    const draft = makeGoodDraft({ title: '부산 유품 정리', introduction: body, body_markdown: body });
    const intent = analyzeSearchIntent(makePolicyInput(), draft);

    expect(intent.keyword_intent_mismatch).toBe(true);
    expect(intent.mismatch_reasons).toContain('KEYWORD_BODY_MISMATCH');
  });

  it('blocks a copied source that only changes a few words', async () => {
    const copiedBody = makeGoodDraft().body_markdown;
    const input = makePolicyInput({
      source_materials: [{
        type: 'reference',
        title: '네이버 블로그 원문',
        content: copiedBody.replace('핵심입니다', '중요합니다'),
        url: 'https://blog.naver.com/example/1',
      }],
    });

    const result = await runContentPolicyPipeline({ input, draft: makeGoodDraft(), config: await loadContentPolicy() });

    expect(result.decision).toBe('BLOCK');
    expect(result.similarity_report.risk).toBe('HIGH');
    expect(result.block_reasons).toContain('BLOCK_COPIED_SOURCE');
  });

  it('allows the same region and service when question, angle, and structure differ', async () => {
    const recent = Array.from({ length: 20 }, (_, index) => makeRecentPost(index, {
      title: `부산 유품 정리 기존 절차 ${index}`,
      topic_angle: 'process',
      structure_type: `legacy-${index % 5}`,
      body: `기존 절차 글 ${index}. 방문과 운반 단계에 대한 설명입니다.`,
    }));
    const input = makePolicyInput({ recent_posts: recent });

    const result = await runContentPolicyPipeline({ input, draft: makeGoodDraft(), config: await loadContentPolicy() });

    expect(result.decision).toBe('PASS');
    expect(result.quality_report.total_score).toBeGreaterThanOrEqual(85);
    expect(result.uniqueness_plan.topic_angle).not.toBe('process');
  });

  it('accepts a score-only miss after bounded repair attempts', async () => {
    const baseConfig = await loadContentPolicy();
    const config = {
      ...baseConfig,
      similarity: {
        ...baseConfig.similarity,
        rewrite_limit: 1,
      },
      quality_gate: {
        ...baseConfig.quality_gate,
        pass_score: 100,
      },
    };

    const result = await runContentPolicyPipeline({
      input: makePolicyInput(),
      draft: makeGoodDraft({
        summary: '',
        faq: [],
        cta: '',
      }),
      config,
    });

    expect(result.quality_report.total_score).toBeLessThan(config.quality_gate.pass_score);
    expect(result.quality_report.fatal_errors).toEqual([]);
    expect(result.rewrite_count).toBe(config.similarity.rewrite_limit);
    expect(result.decision).toBe('PASS');
    expect(result.block_reasons).not.toContain('BLOCK_QUALITY_SCORE');
    expect(result.stage_trace.find((stage) => stage.stage === 'QualityGate')).toEqual({
      stage: 'QualityGate',
      status: 'PASS',
      reasons: ['QUALITY_SCORE_BELOW_TARGET_ACCEPTED'],
    });
  });

  it('blocks missing facts before draft publication', async () => {
    const input = makePolicyInput({ business_facts: [] });
    const draft = makeGoodDraft({
      body_markdown: '지난달 현장에서 고객 30명 모두가 만족했고 비용은 정확히 45만원이었습니다.',
    });

    const validation = validatePolicyInput(input, draft);
    const result = await runContentPolicyPipeline({ input, draft, config: await loadContentPolicy() });

    expect(validation.blockReasons).toContain('BLOCK_MISSING_FACTS');
    expect(result.decision).toBe('BLOCK');
    expect(result.block_reasons).toContain('BLOCK_MISSING_FACTS');
  });
});
