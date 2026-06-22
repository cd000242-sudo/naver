import { describe, expect, it } from 'vitest';
import { isPasteVisible } from '../automation/richTextPaste.js';

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
  const longPlain = 'ㄱ'.repeat(1528);

  function stats(chars: number, opts: { tables?: number; text?: string } = {}) {
    return { chars, tables: opts.tables ?? 0, text: opts.text ?? '' };
  }

  it('full paste of long content → visible', () => {
    const before = stats(0);
    const after = stats(1528, { text: longPlain });
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

  it('~70% coverage of long content → visible', () => {
    const before = stats(0);
    const after = stats(Math.floor(1528 * 0.7));
    expect(isPasteVisible(before, after, longPlain)).toBe(true);
  });

  it('table insertion with substantial coverage → visible', () => {
    const before = stats(0, { tables: 0 });
    const after = stats(Math.floor(1528 * 0.5), { tables: 1 });
    expect(isPasteVisible(before, after, longPlain)).toBe(true);
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
