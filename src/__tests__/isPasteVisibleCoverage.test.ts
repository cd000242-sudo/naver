import { describe, expect, it } from 'vitest';
import { isPasteVisible, resolvePasteRollbackPolicy } from '../automation/richTextPaste.js';

/**
 * Regression guards for isPasteVisible (2026-06-22 refund-crisis fix).
 *
 * Symptom: on slower client machines a long article pasted only its first
 * paragraph before the snapshot was read. The old check declared the paste
 * "visible" whenever the first 12 chars appeared (or any 21+ chars landed), so a
 * 171/1528-char partial paste passed as success. The publish then proceeded with
 * a truncated body and was blocked downstream by the pre-publish guard, surfacing
 * to users as a mysterious "발행 실패" loop ("소제목만 작성되고 본문이 안 들어감").
 *
 * The fix requires substantial content to actually land most of itself (coverage),
 * not just a leading fragment.
 */
describe('isPasteVisible coverage guard', () => {
  it('rejects a flattened table when a real table component was expected', () => {
    const before = { chars: 20, tables: 0, text: 'Existing paragraph.' };
    const after = {
      chars: 90,
      tables: 0,
      text: 'Existing paragraph. Item Details Income Household Deadline Tomorrow',
    };
    const plain = 'Item Details Income Household Deadline Tomorrow';

    expect(isPasteVisible(before, after, plain, 1)).toBe(false);
    expect(isPasteVisible(before, { ...after, tables: 1 }, plain, 1)).toBe(true);
  });

  const longPlain = [
    '첫 문단은 여름철 보양식의 기본 원칙을 설명합니다.',
    '중간 문단은 단백질과 칼슘 등 영양소를 차례대로 정리합니다.',
    '마지막 문단은 각자 몸 상태에 맞는 음식을 고르라고 안내합니다.',
  ].map((line) => line.repeat(12)).join('\n\n');

  function stats(chars: number, opts: { tables?: number; text?: string } = {}) {
    return { chars, tables: opts.tables ?? 0, text: opts.text ?? '' };
  }

  it('full paste of long content → visible', () => {
    const beforeText = '6. 전복죽';
    const before = stats(beforeText.length, { text: beforeText });
    const after = stats(beforeText.length + longPlain.length, { text: `${beforeText}\n${longPlain}` });
    expect(isPasteVisible(before, after, longPlain)).toBe(true);
  });

  it('partial paste (171 of 1528) → NOT visible (the bug)', () => {
    const before = stats(0);
    // first paragraph only: leading fragment present, but coverage ~11%
    const after = stats(171, { text: longPlain.slice(0, 171) });
    expect(isPasteVisible(before, after, longPlain)).toBe(false);
  });

  it('leading-fragment-only does not count as success for long content', () => {
    const before = stats(50); // editor already holds a subheading
    const after = stats(50 + 171, { text: 'soup' + longPlain.slice(0, 171) });
    expect(isPasteVisible(before, after, longPlain)).toBe(false);
  });

  it('~70% coverage of long content → NOT visible because the tail is missing', () => {
    const before = stats(0);
    const partial = longPlain.slice(0, Math.floor(longPlain.length * 0.7));
    const after = stats(partial.length, { text: partial });
    expect(isPasteVisible(before, after, longPlain)).toBe(false);
  });

  it('table insertion still requires the ordered tail anchors', () => {
    const beforeText = '표 앞 문장';
    const before = stats(beforeText.length, { tables: 0, text: beforeText });
    const after = stats(beforeText.length + longPlain.length, { tables: 1, text: `${beforeText}\n${longPlain}` });
    expect(isPasteVisible(before, after, longPlain)).toBe(true);
  });

  it('rejects a complete paste that landed in the middle of the document', () => {
    const beforeText = '앞 섹션 본문\n뒤에 반드시 남아야 하는 기존 꼬리 문장';
    const before = stats(beforeText.length, { text: beforeText });
    const afterText = `앞 섹션 본문\n${longPlain}\n뒤에 반드시 남아야 하는 기존 꼬리 문장`;
    const after = stats(afterText.length, { text: afterText });

    expect(isPasteVisible(before, after, longPlain)).toBe(false);
  });

  it('rejects content whose beginning, middle and end anchors were reordered', () => {
    const parts = longPlain.split(/\n{2,}/);
    const reordered = [parts[2], parts[0], parts[1]].join('\n\n');
    const before = stats(0, { text: '' });
    const after = stats(reordered.length, { text: reordered });

    expect(isPasteVisible(before, after, longPlain)).toBe(false);
  });

  it('short content keeps the lenient presence heuristic', () => {
    const shortPlain = '오늘 날씨 좋네요';
    const before = stats(0);
    const after = stats(shortPlain.length, { text: shortPlain });
    expect(isPasteVisible(before, after, shortPlain)).toBe(true);
  });

  it('short content with nothing pasted → NOT visible', () => {
    const shortPlain = '오늘 날씨 좋네요';
    const before = stats(0);
    const after = stats(0, { text: '' });
    expect(isPasteVisible(before, after, shortPlain)).toBe(false);
  });
});

describe('paste rollback safety policy', () => {
  it('allows a safe keyboard fallback when undo restored content but the tail probe was transiently false', () => {
    expect(resolvePasteRollbackPolicy({ restored: true, tailReady: false })).toEqual({
      safeToFallback: true,
      canContinuePasteFallback: false,
    });
  });

  it('blocks every fallback when the pre-paste snapshot was not restored', () => {
    expect(resolvePasteRollbackPolicy({ restored: false, tailReady: true })).toEqual({
      safeToFallback: false,
      canContinuePasteFallback: false,
    });
  });
});
