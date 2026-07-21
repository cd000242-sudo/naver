/**
 * [v2.11.136] 최근글 컨텍스트 프롬프트 비용 폭증 회귀 잠금.
 *
 * 라이브 실측: 최근 글 42개의 body 전문을 프롬프트에 통째로 주입 → 입력
 * 105k 토큰(편당 입력 비용의 81%). 이 systemPrompt는 전 엔진(openai/gemini/
 * claude/perplexity/agent)에 동일 전달되므로 엔진 무관 공통 비용이었다.
 * 본문을 발췌(200자)로 축소해 토큰을 대폭 줄인다. 중복 회피 신호(제목·서론·
 * 소제목·주제각도·구조)는 유지, 문장 단위 유사도는 사후 저장소가 담당.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildRecentPostsGenerationPrompt } from '../contentPolicy/generationContext';

const ROOT = path.resolve(__dirname, '..');

function makeInput(postCount: number, bodyChars: number) {
  const bigBody = '가'.repeat(bodyChars);
  return {
    primary_keyword: '키워드',
    target_reader: '일반',
    business_facts: [],
    related_questions: [],
    recent_posts: Array.from({ length: postCount }, (_, i) => ({
      article_id: `a${i}`,
      title: `제목 ${i}`,
      intro: `서론 ${i}`,
      headings: [`소제목 ${i}-1`, `소제목 ${i}-2`],
      body: bigBody,
      topic_angle: `각도 ${i}`,
      structure_type: 'listicle',
      business_facts: [],
      related_questions: [],
      published_at: null,
      exposure_status: null,
      template_id: null,
      url: null,
    })),
  } as unknown as Parameters<typeof buildRecentPostsGenerationPrompt>[0];
}

describe('최근글 프롬프트 비용 방어', () => {
  it('본문 전문 대신 발췌만 주입한다 (전 엔진 공통 입력 토큰 절감)', () => {
    const prompt = buildRecentPostsGenerationPrompt(makeInput(42, 3000));
    // 42개 × 3000자 본문 전문이면 126,000자+ 였다. 발췌(200자)면 크게 줄어든다.
    expect(prompt).toContain('body_excerpt');
    expect(prompt).not.toMatch(/"body":/);
    // 발췌 후 전체 길이는 옛 전문 주입(126k+)의 몇 분의 일이어야 한다.
    expect(prompt.length).toBeLessThan(60000);
  });

  it('본문 발췌는 200자로 제한된다', () => {
    const prompt = buildRecentPostsGenerationPrompt(makeInput(1, 5000));
    const parsed = JSON.parse(prompt.split('\n').find((l) => l.trim().startsWith('[{'))!);
    expect(parsed[0].body_excerpt.length).toBe(200);
  });

  it('중복 회피 신호(제목·서론·소제목·주제각도·구조)는 유지된다', () => {
    const prompt = buildRecentPostsGenerationPrompt(makeInput(1, 100));
    expect(prompt).toContain('title');
    expect(prompt).toContain('introduction');
    expect(prompt).toContain('headings');
    expect(prompt).toContain('topic_angle');
    expect(prompt).toContain('structure_type');
  });

  it('빈 최근글이면 빈 문자열 (기존 계약 유지)', () => {
    expect(buildRecentPostsGenerationPrompt(makeInput(0, 0))).toBe('');
  });

  it('systemPrompt 주입이 전 provider 공통 경로임을 잠근다', () => {
    const gen = fs.readFileSync(path.join(ROOT, 'contentGenerator.ts'), 'utf-8');
    // contentPolicyPrompt가 systemPrompt에 prepend되고, 그 systemPrompt가
    // openai/claude/perplexity/gemini에 동일 전달된다.
    expect(gen).toMatch(/systemPrompt = `\$\{source\.contentPolicyPrompt\}\\n\\n\$\{systemPrompt\}`/);
    expect(gen).toMatch(/callOpenAI\(systemPrompt,/);
    expect(gen).toMatch(/callGemini\(systemPrompt,/);
    expect(gen).toMatch(/callClaude\(systemPrompt,/);
    expect(gen).toMatch(/callPerplexity\(systemPrompt,/);
  });
});
