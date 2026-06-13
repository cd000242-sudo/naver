import { describe, expect, it, vi } from 'vitest';
import { removeDuplicatePhrases } from '../contentTitleDuplicateRemoval.js';

describe('content title duplicate removal', () => {
  it('keeps short titles as trimmed text', () => {
    expect(removeDuplicatePhrases('  짧은 제목  ')).toBe('짧은 제목');
  });

  it('removes repeated leading product text around a colon', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(removeDuplicatePhrases('캐치웰 CX PRO: 캐치웰 CX PRO 한 달 후기'))
      .toBe('캐치웰 CX PRO: 한 달 후기');

    logSpy.mockRestore();
  });

  it('removes direct repeated Korean title words', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(removeDuplicatePhrases('지원금 지원금 신청 방법 정리'))
      .toBe('지원금 신청 방법 정리');

    logSpy.mockRestore();
  });
});
