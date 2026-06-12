import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Perplexity hallucination guard (2026-06-13 live incident).
 * A published post contained invented stats ("89% 성공률 보장", "평균 4.2일")
 * traced to two prompt-layer instructions:
 *  1. tone guide telling the model to write search facts "as if personally
 *     experienced" (removed — replaced with a fact-grounding rule)
 *  2. length-retry expansion telling the model to ADD statistics / expert
 *     quotes / anecdotes (replaced with grounded-expansion-only rules)
 * These static locks keep both instructions from coming back.
 */
const read = (...seg: string[]): string => fs.readFileSync(path.join(process.cwd(), ...seg), 'utf-8');

describe('Perplexity 톤 가이드 — 사실 그라운딩 잠금', () => {
  it('경험 위장 지시가 제거되고 그라운딩 규칙이 존재한다 (contentGenerator)', () => {
    const src = read('src', 'contentGenerator.ts');
    expect(src).not.toContain('직접 경험·체크한 것처럼');
    expect(src).not.toContain('본인 경험·관찰처럼');
    expect(src).toContain('사실 그라운딩 (최우선)');
  });

  it('경험 위장 지시가 제거되고 그라운딩 규칙이 존재한다 (perplexity.ts 사본)', () => {
    const src = read('src', 'perplexity.ts');
    expect(src).not.toContain('본인 경험·관찰처럼');
    expect(src).toContain('사실 그라운딩 (최우선)');
  });
});

describe('글자수 미달 재시도 프롬프트 — 발명 확장 지시 금지', () => {
  it('통계/전문가 인용/경험담 추가 지시가 제거되고 발명 금지 지시가 존재한다', () => {
    const src = read('src', 'contentGenerator.ts');
    expect(src).not.toContain('전문가 인용이나 연구 결과를 포함하세요');
    expect(src).not.toContain('실제 경험담이나 시나리오를 추가하세요');
    expect(src).toContain('자료에 없는 통계·수치·연구 결과·전문가 인용·경험담을 만들어 추가하는 것은 절대 금지');
  });
});
