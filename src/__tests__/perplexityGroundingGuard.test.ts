import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Perplexity hallucination guard (2026-06-13 live incident).
 * A published post contained invented stats traced to prompt-layer guidance.
 * These static locks keep unsafe expansion instructions from coming back.
 */
const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8');

describe('Perplexity hallucination grounding guard', () => {
  it('keeps fact-grounding rules in contentGenerator', () => {
    const src = read('src', 'contentGenerator.ts');
    expect(src).not.toContain('직접 경험·체크한 것처럼');
    expect(src).not.toContain('본인 경험·관찰처럼');
    expect(src).toContain('사실 그라운딩 (최우선)');
  });

  it('keeps fact-grounding rules in perplexity prompt', () => {
    const src = read('src', 'perplexity.ts');
    expect(src).not.toContain('본인 경험·관찰처럼');
    expect(src).toContain('사실 그라운딩 (최우선)');
  });
});

describe('Content length retry prompt grounding guard', () => {
  it('removes fabricated-stat expansion instructions and keeps source-bounded expansion rules', () => {
    const src = [
      read('src', 'contentGenerator.ts'),
      read('src', 'contentLengthRetryPolicy.ts'),
    ].join('\n');

    expect(src).not.toContain('전문가 인용이나 연구 결과를 포함하세요');
    expect(src).not.toContain('실제 경험담이나 시나리오를 추가하세요');
    expect(src).toContain('자료에 없는 통계·수치·연구 결과·전문가 인용·경험담을 만들어 추가하는 것은 절대 금지');
  });
});
