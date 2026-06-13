import { describe, expect, it } from 'vitest';
import {
  buildUrlModeDirective,
  shouldApplyUrlModeDirective,
} from '../contentUrlModeDirective';

describe('contentUrlModeDirective', () => {
  it('applies only to URL/news sources with enough crawled text', () => {
    expect(shouldApplyUrlModeDirective({ url: 'https://example.com', rawText: 'x'.repeat(200) })).toBe(true);
    expect(shouldApplyUrlModeDirective({ sourceType: 'naver_news', rawText: 'x'.repeat(200) })).toBe(true);
    expect(shouldApplyUrlModeDirective({ sourceType: 'custom_text', rawText: 'x'.repeat(200) })).toBe(false);
    expect(shouldApplyUrlModeDirective({ url: 'https://example.com', rawText: 'x'.repeat(199) })).toBe(false);
  });

  it('builds a stable directive prefix for URL-based generation', () => {
    const directive = buildUrlModeDirective({ url: 'https://example.com', rawText: 'x'.repeat(200) });

    expect(directive.startsWith('[URL')).toBe(true);
    expect(directive).toContain('85%');
    expect(directive).toContain('AI');
    expect(buildUrlModeDirective({ sourceType: 'custom_text', rawText: 'x'.repeat(200) })).toBe('');
  });
});
