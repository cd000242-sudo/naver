// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildRendererContentPolicyContext } from '../renderer/utils/contentPolicyContext';
import { GENERATED_POSTS_KEY } from '../renderer/utils/postStorageUtils';

function generatedPost(index: number) {
  return {
    id: `post-${index}`,
    title: `부산 생활 정보 ${index}`,
    content: `도입 문장 ${index}.\n\n준비 내용 ${index}.\n\n절차 내용 ${index}.`,
    headings: [
      { title: `준비 ${index}`, content: `준비 내용 ${index}` },
      { title: `절차 ${index}`, content: `절차 내용 ${index}` },
    ],
    structuredContent: {
      introduction: `도입 문장 ${index}.`,
      topicAngle: `angle-${index}`,
      structureType: `structure-${index}`,
      relatedQuestions: [`질문 ${index}`],
    },
    createdAt: new Date(2026, 0, index + 1).toISOString(),
    publishedAt: new Date(2026, 0, index + 1).toISOString(),
    publishedUrl: `https://blog.naver.com/example/${index}`,
  };
}

describe('renderer content policy context', () => {
  beforeEach(() => localStorage.clear());

  it('injects up to 50 complete recent posts from the existing generated-post store', () => {
    localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(Array.from({ length: 25 }, (_, index) => generatedPost(index))));
    const context = buildRendererContentPolicyContext({
      title: '부산 유품 정리 준비 순서',
      content: '현재 글 본문',
      keywords: ['부산 유품 정리'],
      structuredContent: {
        selectedTitle: '부산 유품 정리 준비 순서',
        targetReader: '처음 준비하는 유족',
        businessFacts: ['귀중품은 가족이 먼저 확인한다.'],
        headings: [{ title: '준비 순서', content: '귀중품 확인' }],
      },
      businessInfo: { process: '귀중품은 가족이 먼저 확인한다.' },
      contentMode: 'business',
    });

    expect(context.recentPostsResult.ok).toBe(true);
    expect(context.recentPostsSnapshot).toHaveLength(25);
    expect(context.recentPostsSnapshot[0]).toMatchObject({
      article_id: expect.any(String),
      title: expect.any(String),
      intro: expect.any(String),
      headings: expect.any(Array),
      body: expect.any(String),
      topic_angle: expect.any(String),
      structure_type: expect.any(String),
      published_at: expect.any(String),
      exposure_status: expect.any(String),
    });
    expect(context.input.business_facts).toContain('귀중품은 가족이 먼저 확인한다.');
  });

  it('reports corrupt storage instead of silently passing an empty recent-post list', () => {
    localStorage.setItem(GENERATED_POSTS_KEY, '{broken');
    const context = buildRendererContentPolicyContext({
      title: '제목',
      content: '본문',
      keywords: ['키워드'],
      structuredContent: {},
    });

    expect(context.recentPostsResult.ok).toBe(false);
    if (!context.recentPostsResult.ok) {
      expect(context.recentPostsResult.code).toBe('RECENT_POSTS_CORRUPT');
    }
    expect(context.input.recent_posts).toBeUndefined();
  });

  it('preserves compact generation facts when rebuilding the publish context', () => {
    localStorage.setItem(GENERATED_POSTS_KEY, JSON.stringify(Array.from({ length: 20 }, (_, index) => generatedPost(index))));
    const context = buildRendererContentPolicyContext({
      title: 'Generated title',
      content: 'Generated body',
      keywords: [],
      structuredContent: {
        contentPolicyContext: {
          input: {
            primary_keyword: 'source keyword',
            target_reader: 'source reader',
            business_facts: ['verified source fact'],
            related_questions: ['source question'],
          },
        },
      },
    });

    expect(context.input.primary_keyword).toBe('source keyword');
    expect(context.input.target_reader).toBe('source reader');
    expect(context.input.business_facts).toContain('verified source fact');
    expect(context.input.related_questions).toContain('source question');
  });

  it('wires the recent-post snapshot into shared and multi-account publish payloads', () => {
    const fullAuto = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/modules/fullAutoFlow.ts'), 'utf8');
    const multiAccount = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/modules/multiAccountManager.ts'), 'utf8');
    const copyStatic = fs.readFileSync(path.resolve(process.cwd(), 'scripts/copy-static.mjs'), 'utf8');

    expect(fullAuto).toContain('contentPolicyContext = buildRendererContentPolicyContext');
    expect(fullAuto).toContain('contentPolicyContext,');
    expect(multiAccount).toContain('contentPolicyContext: buildRendererContentPolicyContext');
    expect(copyStatic).toContain("'contentPolicyContext.js'");
  });

  it('keeps the embedded policy context on the alternate renderer multi-account route', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/renderer/modules/publishingHandlers.ts'),
      'utf8',
    );
    expect(source).toContain('contentPolicyContext: (window as any).currentStructuredContent?.contentPolicyContext');
  });
});
