// [2026-09-17] 이슈 끝판왕 이미지 검사 — OpenAI 요청 본문 계약.
// 라이브 사고: gpt-5.6-terra 에 max_tokens 를 보내 400 → fail-closed → 116장 중 0장 통과.
import { describe, expect, it } from 'vitest';
import { buildOpenAiVisionBody } from '../crawler/issueHarness/visionJudges';

const content = [{ type: 'text', text: 'judge' }];

describe('buildOpenAiVisionBody', () => {
  it('never sends max_tokens — new models reject it with 400', () => {
    for (const model of ['gpt-5.6-terra', 'gpt-6-astra', 'gpt-4o', 'gpt-4.1-mini']) {
      const body = buildOpenAiVisionBody(model, content);
      expect(body).not.toHaveProperty('max_tokens');
      expect(body.max_completion_tokens).toBe(4096);
      expect(body.model).toBe(model);
      expect(body.messages).toEqual([{ role: 'user', content }]);
    }
  });

  it('reasoning family: no temperature, effort low so the budget goes to the verdict', () => {
    const body = buildOpenAiVisionBody('gpt-5.6-terra', content);
    expect(body).not.toHaveProperty('temperature');
    expect(body.reasoning_effort).toBe('low');
  });

  it('legacy family keeps the deterministic temperature and no effort field', () => {
    const body = buildOpenAiVisionBody('gpt-4o', content);
    expect(body.temperature).toBe(0.1);
    expect(body).not.toHaveProperty('reasoning_effort');
  });
});

// 같은 뿌리의 두 번째 사이트 — 관련성 검사기의 OpenAI 전략. 함수가 클로저라 소스로 잠근다.
import { readFileSync } from 'fs';
import { join } from 'path';

describe('imageRelevanceScorer openaiStrategy never sends max_tokens', () => {
  it('uses max_completion_tokens in the openai body', () => {
    const src = readFileSync(join(__dirname, '../crawler/imageRelevanceScorer.ts'), 'utf-8');
    const start = src.indexOf('function openaiStrategy(');
    const end = src.indexOf('// ─── 핵심 dispatcher', start);
    // 주석은 뺀다 — 주석에는 옛 이름이 교훈으로 남는다.
    const openaiPart = src.slice(start, end).replace(/^\s*\/\/.*$/gm, '');
    expect(openaiPart).not.toMatch(/\bmax_tokens\b/);
    expect(openaiPart).toMatch(/max_completion_tokens/);
    expect(openaiPart).toMatch(/isOpenAiReasoningModel\(model\)/);
  });
});
