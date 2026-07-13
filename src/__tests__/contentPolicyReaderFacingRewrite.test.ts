import { describe, expect, it } from 'vitest';
import { loadContentPolicy } from '../contentPolicy/policyLoader';
import { runContentPolicyPipeline } from '../contentPolicy/orchestrator';
import { repairUnsupportedClaims } from '../contentPolicy/claimRepair';
import { makeGoodDraft, makePolicyInput, makeRecentPosts } from './contentPolicyFixtures';

describe('content policy reader-facing rewrite safety', () => {
  it('does not leak crawler metadata into a rewritten introduction', async () => {
    const introduction = '차량용 통풍시트 추천 정보를 찾는다면 바람 세기뿐 아니라 차량 호환성과 소음도 함께 확인해야 합니다.';
    const base = makeGoodDraft();
    const draft = makeGoodDraft({
      title: '차량용 통풍시트 추천과 구매 전 확인할 점',
      summary: '여름철 운전 환경에 맞는 통풍시트 선택 기준을 정리합니다.',
      introduction,
      body_markdown: [
        introduction,
        '12V 전원 연결 방식과 시트 고정 방법을 확인합니다.',
        ...base.headings.flatMap((heading) => [`## ${heading.title}`, heading.content]),
      ].join('\n\n'),
    });
    const recentPosts = makeRecentPosts().map((post, index) => index < 5
      ? { ...post, intro: introduction, body: `${introduction}\n\n${post.body}` }
      : post);
    const input = makePolicyInput({
      primary_keyword: '차량용 통풍시트 추천',
      target_reader: '여름철 차량용 통풍시트를 찾는 운전자',
      business_facts: [
        '12V 전원 연결 방식을 사용합니다.',
        '수집 시점 표시 가격: 47,158원',
      ],
      source_materials: [{
        type: 'official',
        title: '판매 페이지',
        content: '12V 전원 연결 방식. 가격 47,158원.',
        source_id: 'shopping-page',
      }],
      recent_posts: recentPosts,
    });

    const result = await runContentPolicyPipeline({ input, draft, config: await loadContentPolicy() });

    expect(result.rewrite_count).toBeGreaterThan(0);
    expect(result.article.introduction).not.toContain('수집 시점 표시 가격:');
    expect(result.article.introduction).not.toContain('먼저 확인할 핵심은');
    expect(result.article.introduction.length).toBeGreaterThan(20);
  });

  it('keeps heading content in its original order when heading similarity triggers a rewrite', async () => {
    const draft = makeGoodDraft();
    const recentPosts = makeRecentPosts().map((post) => ({
      ...post,
      headings: draft.headings.map((heading) => heading.title),
    }));

    const result = await runContentPolicyPipeline({
      input: makePolicyInput({ recent_posts: recentPosts }),
      draft,
      config: await loadContentPolicy(),
    });

    expect(result.rewrite_count).toBeGreaterThan(0);
    expect(result.article.headings?.map((heading) => heading.content))
      .toEqual(draft.headings.map((heading) => heading.content));
  });

  it('uses a concise neutral heading when an unsupported heading must be removed', () => {
    const keyword = '차량용 통풍시트 추천｜여름 운전할 때 등 땀 줄이는 지엠지모터스 쿨썸 시트커버 후기';
    const unsupported = '누구에게나 100% 시원함을 보장합니다.';
    const draft = makeGoodDraft({
      headings: [
        { title: unsupported, content: '차량과 사용 환경에 따라 체감은 달라질 수 있습니다.' },
        ...makeGoodDraft().headings.slice(1),
      ],
    });

    const repaired = repairUnsupportedClaims(
      draft,
      makePolicyInput({ primary_keyword: keyword }),
      [unsupported],
    );

    expect(repaired.headings[0].title).not.toContain(keyword);
    expect(repaired.headings[0].title).not.toMatch(/확인 사항\s*1/);
    expect(repaired.headings[0].title.length).toBeGreaterThan(2);
  });
});
