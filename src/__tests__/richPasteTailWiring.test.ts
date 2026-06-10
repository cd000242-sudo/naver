import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Regression guards for the rich-paste tail block (v2.11.33).
 *
 * Symptom: after switching body input to clipboard rich-paste, published posts
 * intermittently lost the divider line, previous-post link block, and CTA.
 * These guards lock the wiring that restores them.
 */
describe('rich paste tail wiring', () => {
  it('uses the thick divider for the previous-post separator (matches every other tail divider)', () => {
    const code = read('automation/editorHelpers.ts');
    expect(code).toContain(
      "const PREVIOUS_POST_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'"
    );
  });

  it('routes body CTA-artifact cleanup through stripCtaArtifactsFromBody on both auto and semi-auto paths', () => {
    const code = read('automation/editorHelpers.ts');
    const calls = code.match(/stripCtaArtifactsFromBody\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // The old blanket regex deleted legitimate standalone section dividers.
    expect(code).not.toContain("replace(/━━━━━━━━━━━━━━━━━━━━━━[^\\n]*\\n?/g, '')");
  });

  it('re-anchors editor focus by real mouse click before typing the previous-post tail block', () => {
    const code = read('automation/editorHelpers.ts');
    const tailHelper = code.slice(
      code.indexOf('async function insertPreviousPostTailBlock'),
      code.indexOf('// ── Local utility')
    );
    expect(tailHelper).toMatch(/clickLastEditableLine\(/);
  });

  it('releases stuck modifiers and click-focuses before the CTA/hashtag tail phase', () => {
    const code = read('automation/editorHelpers.ts');
    const tailPhase = code.slice(
      code.indexOf("self.log('📝 [마지막 단계] CTA 및 해시태그 영역 준비 중...')"),
      code.indexOf('let effectiveCtas = resolved.ctas')
    );
    expect(tailPhase).toMatch(/clickLastEditableLine\(/);
    expect(tailPhase).toMatch(/\['Control', 'Shift', 'Alt'\]/);
    expect(tailPhase).toMatch(/keyboard\.up\(modifier\)/);
  });

  it('click-focuses again right before the hashtag tail', () => {
    const code = read('automation/editorHelpers.ts');
    const beforeHashtags = code.slice(
      code.indexOf('이전글 카드 뒤에는 반드시 Enter'),
      code.indexOf('const hashtagGapEnterCount')
    );
    expect(beforeHashtags).toMatch(/clickLastEditableLine\(/);
  });

  it('exports click-based and programmatic focus helpers from richTextPaste', () => {
    const code = read('automation/richTextPaste.ts');
    expect(code).toMatch(/export async function focusLastEditableLine\(/);
    expect(code).toMatch(/export async function clickLastEditableLine\(/);
  });

  it('verifies the server session before reusing an open browser in runPostOnly', () => {
    const code = read('naverBlogAutomation.ts');
    const start = code.indexOf('async runPostOnly(');
    expect(start).toBeGreaterThan(-1);
    const runPostOnly = code.slice(start, start + 4500);
    expect(runPostOnly).toMatch(/ensureServerSession\(this\.options\.naverId\)/);
    expect(runPostOnly).toMatch(/loginToNaver\(\)/);
  });
});
