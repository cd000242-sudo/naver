import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { detectPromptLeakageInTitle } from '../contentTitleSafetyChecks.js';
import { evaluateTitleQuality } from '../contentTitleEvaluator.js';
import { pickClaudeAnswerText } from '../main/ipc/claudeAnswerText.js';

// Stage A of the homefeed audit (2026-11-27). Three defects found in the owner's own logs.

describe('title leak check is not case sensitive', () => {
  // Live run 2026-11-24: keyword "ev7 가격" (typed in lower case), chosen title "EV5 5,323만 원보다 높다는 EV7, EV9과는
  // 얼마나 다를까". "ev7" !== "EV7", so the number title was called a prompt leak and the post went out with the
  // earlier question title instead.
  it('accepts a title that holds the keyword in another letter case', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = detectPromptLeakageInTitle('EV5 5,323만 원보다 높다는 EV7, EV9과는 얼마나 다를까', 'ev7 가격');
    expect(result.isLeaked).toBe(false);
    expect(detectPromptLeakageInTitle('ev7 출시 일정 정리', 'EV7 가격').isLeaked).toBe(false);
    spy.mockRestore();
  });

  it('still flags a title that shares no word with the keyword, and a real prompt phrase', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(detectPromptLeakageInTitle('겨울 실내 습도 관리 요령', 'EV7 가격').isLeaked).toBe(true);
    expect(detectPromptLeakageInTitle('EV7 가격 키워드 밀도 맞추기', 'EV7 가격').isLeaked).toBe(true);
    spy.mockRestore();
  });

  it('the homefeed title validator compares the keyword the same way', () => {
    const source = readFileSync(join(process.cwd(), 'src/contentTitleValidators.ts'), 'utf8');
    expect(source).toMatch(/t\.toLowerCase\(\)\.indexOf\(firstKwWord\.toLowerCase\(\)\)/);
  });
});

describe('homefeed title scoring follows the owner analysis (96 posts: question titles 4% vs 14%, number titles 15% vs 8%)', () => {
  const quiet = <T>(run: () => T): T => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try { return run(); } finally { spy.mockRestore(); }
  };
  const score = (title: string, mode: 'homefeed' | 'seo') => quiet(() => evaluateTitleQuality(title, 'EV7 가격', mode).score);

  it('a question ending no longer earns points on the homefeed', () => {
    const plain = score('EV7 가격 공개 전, 기아가 먼저 꺼낸 배터리 조건', 'homefeed');
    const question = score('EV7 가격 공개 전, 기아가 먼저 꺼낸 조건은 뭘까', 'homefeed');
    expect(question).toBeLessThan(plain);
  });

  it('a number with its unit earns points on the homefeed', () => {
    // The score is capped at 100, so the bonus shows where another rule has taken points off (here the question ending).
    const without = score('EV7 가격 공개 전, 기아가 먼저 꺼낸 조건은 뭘까', 'homefeed');
    const withNumber = score('EV7 가격 공개 전, 5,323만 원 기준은 뭘까', 'homefeed');
    expect(withNumber).toBeGreaterThan(without);
  });

  it('search modes keep the question bonus', () => {
    const source = readFileSync(join(process.cwd(), 'src/contentTitleEvaluator.ts'), 'utf8');
    expect(source).toMatch(/mode !== 'homefeed' && \/\(\\\?\|일까\|할까\|인가요\)\/\.test\(t\)/);
  });
});

describe('Claude side call reads the text block wherever it is', () => {
  // Owner log 2026-11-26: "[Blueprint] ⚠️ 응답을 설계도로 읽을 수 없어 생략 (… 0자)" five times, every time on the
  // Claude API route. The helper returned content[0].text only.
  it('joins every text block and skips the others', () => {
    expect(pickClaudeAnswerText({ content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: '{"a":1}' }] })).toBe('{"a":1}');
    expect(pickClaudeAnswerText({ content: [{ type: 'text', text: '앞' }, { type: 'text', text: '뒤' }] })).toBe('앞뒤');
    expect(pickClaudeAnswerText({ content: [{ text: '형식 없는 옛 응답' }] })).toBe('형식 없는 옛 응답');
  });

  it('returns an empty string for an empty or malformed reply', () => {
    expect(pickClaudeAnswerText({ content: [] })).toBe('');
    expect(pickClaudeAnswerText({})).toBe('');
    expect(pickClaudeAnswerText(null)).toBe('');
    expect(pickClaudeAnswerText({ content: [{ type: 'thinking', thinking: '…' }] })).toBe('');
  });
});
