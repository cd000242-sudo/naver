import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * [2026-11-03 app run] The daily panel hides rows with the `hidden` property, but its stylesheet gives every
 * label `display:flex`, which overrides the UA `[hidden]` rule. Seen in the real window: with LEWORD chosen the
 * manual "주제·키워드 또는 소재 URL" box stayed visible, and the collect-consent row showed in AI-only mode.
 */
const css = readFileSync(join(resolve(__dirname, '..', '..'), 'public', 'daily-publishing.css'), 'utf8');
const panel = readFileSync(join(resolve(__dirname, '..'), 'renderer', 'modules', 'dailyPublishingPanel.ts'), 'utf8');

describe('daily publishing panel — hidden rows really disappear', () => {
  it('the dialog stylesheet makes [hidden] win over its display rules', () => {
    expect(css).toMatch(/\.daily-publishing-dialog \[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });

  it('the rows the panel hides are labels styled with display:flex (the reason the rule is needed)', () => {
    expect(css).toMatch(/\.daily-publishing-dialog label\s*\{[^}]*display:\s*flex/);
    expect(panel).toMatch(/el\('topic-row'\)\.hidden = usesLeword\(\)/);
    expect(panel).toMatch(/<label[^>]*data-daily="topic-row"/);
    expect(panel).toMatch(/<label[^>]*data-daily="collect-consent-row"/);
  });
});
