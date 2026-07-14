import { describe, expect, it } from 'vitest';
import { redactKnownAccountId, scrubText } from '../debug/privacyScrubber.js';

describe('privacyScrubber runtime log policy', () => {
  it('removes every case-insensitive occurrence of a known Naver account id', () => {
    const result = redactKnownAccountId(
      'login MyBlogUser ok; session=mybloguser; other text remains',
      'MyBlogUser',
    );

    expect(result).toBe('login [NAVER_ACCOUNT] ok; session=[NAVER_ACCOUNT]; other text remains');
    expect(result).not.toMatch(/mybloguser/i);
  });

  it('keeps API secrets out of file and renderer-bound console text', () => {
    const secret = `AIza${'A'.repeat(35)}`;
    const result = scrubText(`Gemini API key: ${secret}`);

    expect(result.text).not.toContain(secret);
    expect(result.text).toContain('***GEMINI_KEY_REDACTED***');
  });
});
