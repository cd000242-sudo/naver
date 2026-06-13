import { describe, expect, it } from 'vitest';
import { cleanEscapeSequences } from '../contentEscapeCleanup.js';

describe('contentEscapeCleanup', () => {
  it('preserves literal newline escape as an actual paragraph line break', () => {
    expect(cleanEscapeSequences('첫 줄\\n둘째 줄')).toBe('첫 줄\n둘째 줄');
  });

  it('normalizes tab and carriage escape sequences for rich paste text', () => {
    expect(cleanEscapeSequences('문장\\t다음\\r문장')).toBe('문장 다음문장');
  });

  it('removes unicode escape leftovers and decodes common html entities', () => {
    expect(cleanEscapeSequences('A\\u003cB&nbsp;&amp;&lt;')).toBe('AB &<');
  });

  it('collapses excessive line breaks while preserving a blank paragraph gap', () => {
    expect(cleanEscapeSequences('a\\n\\n\\n\\nb')).toBe('a\n\nb');
  });
});
