import { describe, expect, it } from 'vitest';
import { parseNaverPubDate, resolveSourceDate } from '../content/sourceFreshness';

describe('parseNaverPubDate', () => {
  it('parses the news API RFC 822 shape', () => {
    expect(parseNaverPubDate('Mon, 23 Jun 2026 09:00:00 +0900')).toBe('2026-06-23');
  });

  it('returns empty for junk rather than inventing a date', () => {
    expect(parseNaverPubDate('')).toBe('');
    expect(parseNaverPubDate('어제')).toBe('');
    expect(parseNaverPubDate(null)).toBe('');
  });
});

describe('resolveSourceDate', () => {
  it('prefers the blog postdate when present', () => {
    expect(resolveSourceDate({ postdate: '20260623' })).toBe('2026-06-23');
  });

  it('falls back to the news pubDate', () => {
    expect(resolveSourceDate({ pubDate: 'Mon, 23 Jun 2026 09:00:00 +0900' })).toBe('2026-06-23');
  });

  it('returns empty when neither field is usable', () => {
    expect(resolveSourceDate({})).toBe('');
  });
});
