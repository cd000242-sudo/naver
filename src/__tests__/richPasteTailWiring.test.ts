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
    const code = read('automation/editorTailActions.ts');
    expect(code).toContain(
      "const PREVIOUS_POST_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'"
    );
  });

  it('routes body CTA-artifact cleanup through stripCtaArtifactsFromBody on both auto and semi-auto paths', () => {
    const code = read('automation/editorHelpers.ts');
    const calls = code.match(/stripCtaArtifactsFromBody\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(code).toMatch(/stripBodyHashtagsFromStructuredContent\(/);
    expect(code).toMatch(/stripBodyHashtagBlocks\(/);
    // The old blanket regex deleted legitimate standalone section dividers.
    expect(code).not.toContain("replace(/━━━━━━━━━━━━━━━━━━━━━━[^\\n]*\\n?/g, '')");
  });

  it('verifies keyboard input registers before typing the previous-post tail block', () => {
    const code = read('automation/editorTailActions.ts');
    const tailHelper = code.slice(
      code.indexOf('async function insertPreviousPostTailBlock'),
      code.indexOf('// ── Local utility')
    );
    expect(tailHelper).toMatch(/ensureTailTypingReady\(/);
    // User-confirmed tail format (2026-06-10): hook line → URL line, no
    // separate title line.
    expect(tailHelper).not.toMatch(/safeKeyboardType\(page,\s*previousPostTitle,/);
  });

  it('releases stuck modifiers without creating blind tail blanks before planning', () => {
    const code = read('automation/editorHelpers.ts');
    const tailPhase = code.slice(
      code.indexOf("self.log('📝 [마지막 단계] CTA 및 해시태그 영역 준비 중...')"),
      code.indexOf('let effectiveCtas = resolved.ctas')
    );
    expect(tailPhase).toMatch(/\['Control', 'Shift', 'Alt'\]/);
    expect(tailPhase).toMatch(/keyboard\.up\(modifier\)/);
    expect(tailPhase).not.toMatch(/ensureTailTypingReady\(/);
    expect(tailPhase).not.toMatch(/keyboard\.press\('Enter'\)/);
  });

  it('re-verifies keyboard input right before the hashtag tail', () => {
    const code = read('automation/editorTailActions.ts');
    const beforeHashtags = code.slice(
      code.indexOf('export async function applyTailHashtagsAfterCards'),
      code.indexOf('const hashtagGapEnterCount')
    );
    expect(beforeHashtags).toMatch(/ensureTailTypingReady\(/);
  });

  it('verifies keyboard input before heading-position CTA typing', () => {
    const code = read('automation/editorHelpers.ts');
    const headingCta = code.slice(
      code.indexOf('d) CTA 특정 소제목 아래 삽입'),
      code.indexOf('insertCtaLink')
    );
    expect(headingCta).toMatch(/ensureTailTypingReady\(/);
  });

  it('exports the keyboard recovery ladder from richTextPaste', () => {
    const code = read('automation/richTextPaste.ts');
    expect(code).toMatch(/export async function focusLastEditableLine\(/);
    expect(code).toMatch(/export async function ensureTailTypingReady\(/);
    expect(code).not.toMatch(/clickLastEditableLine/);
  });

  it('uses a structure-agnostic sentinel probe that requires true document end', () => {
    const code = read('automation/richTextPaste.ts');
    // 2026-06-11 structure dump: the redesigned editor's document tree has NO
    // contenteditable — the model caret only moves on REAL paragraph clicks,
    // so the click strategy must run FIRST; Selection anchors are last resorts.
    expect(code.indexOf("name: 'paragraph-end-click'")).toBeGreaterThan(-1);
    // The literal-last-paragraph click (empty ones included — the only caret
    // position BELOW a freshly converted link card) must outrank the
    // text-bearing-only click, which must outrank coordinate/Selection paths.
    expect(code.indexOf("name: 'paragraph-end-click'")).toBeLessThan(code.indexOf("name: 'text-paragraph-end-click'"));
    expect(code.indexOf("name: 'text-paragraph-end-click'")).toBeLessThan(code.indexOf("name: 'caret-end-click'"));
    expect(code.indexOf("name: 'caret-end-click'")).toBeLessThan(code.indexOf("name: 'root-end'"));
    expect(code).toMatch(/clickParagraphEnd\(false\)/);
    // Sentinel-char probe: confirms input registered AND ended at doc end,
    // independent of editor DOM classes (paragraph counting broke on redesign).
    expect(code).toMatch(/const SENTINEL =/);
    expect(code).toMatch(/endsWith\(SENTINEL\)/);
    expect(code).toMatch(/Backspace/);
  });

  it('anchors the root-end caret INSIDE the last text block (publish-serialization safety)', () => {
    const code = read('automation/richTextPaste.ts');
    // 2026-06-11 live incident: collapsing the caret at the editable ROOT
    // level (after the last component) types text that renders in the editor
    // but lives outside the SmartEditor component model — the publish
    // serializer dropped the entire tail (divider/CTA/hashtags).
    const fn = code.slice(code.indexOf('const focusRootEnd'), code.indexOf("name: 'root-end'"));
    expect(fn).toMatch(/previousElementSibling/); // walks to last text-bearing block
    expect(fn).toMatch(/while \(leaf\.lastChild\)/); // descends inside the block
  });

  it('rejects sentinel probes that landed outside the component model', () => {
    const code = read('automation/richTextPaste.ts');
    expect(code).toMatch(/closest\('\.se-component'\)/);
    expect(code).toMatch(/registered && atEnd && inModel/);
  });

  it('calibrates the in-model depth against real body text (no fixed depth threshold)', () => {
    // 2026-06-11 round 2: a fixed depth>=3 rule false-negatived the redesigned
    // editor — every strategy failed, typing fell to an orphan caret, and the
    // tail dropped while the probe's own sentinels survived publish.
    const code = read('automation/richTextPaste.ts');
    expect(code).toMatch(/bodyDepthMax/);
    expect(code).toMatch(/sentinelDepth >= Math\.max\(1, bodyDepthMax - 1\)/);
  });

  it('anchors tail probes only inside the SmartEditor document root, never global body or tool panels', () => {
    const code = read('automation/richTextPaste.ts');
    expect(code).toMatch(/function getSmartEditorDocumentRoot/);
    expect(code).toMatch(/article\.se-components-wrap/);
    expect(code.indexOf("'article.se-components-wrap'")).toBeLessThan(code.indexOf("'.se-main-container'"));
    expect(code).not.toMatch(/candidate\.matches\('\.se-main-container'\)\s*\?\s*1000000/);

    const editableRoot = code.slice(
      code.indexOf('function editableRootText'),
      code.indexOf('/**\n * Post-paste keyboard recovery ladder')
    );
    expect(editableRoot).not.toMatch(/\|\|\s*document\.body/);

    const tailReady = code.slice(
      code.indexOf('export async function ensureTailTypingReady'),
      code.indexOf('// Ladder exhausted')
    );
    expect(tailReady).toMatch(/getSmartEditorDocumentRoot/);
    expect(tailReady).not.toMatch(/document\.querySelectorAll\('\[contenteditable="true"\]'\)/);
    expect(tailReady).toMatch(/se-popup|se-layer|se-modal/);
    expect(tailReady).not.toMatch(/SMART_EDITOR_PANEL_SELECTOR[^;\n]*se-panel/);
  });

  it('uses the same real-document root priority for pre-publish assertions', () => {
    const code = read('automation/prePublishAssertion.ts');
    expect(code.indexOf("'article.se-components-wrap'")).toBeLessThan(code.indexOf("'.se-main-container'"));
    expect(code).not.toMatch(/candidate\.matches\('\.se-main-container'\)\s*\?\s*1000000/);
  });

  it('does not fall straight back to typing when rich clipboard paste needs recovery', () => {
    const code = read('automation/richTextPaste.ts');
    const pasteFn = code.slice(
      code.indexOf('export async function pasteRichHtmlAtCursor'),
      code.length
    );
    expect(code).toMatch(/async function dispatchRichPasteEventAtCursor/);
    expect(code).toMatch(/async function pastePlainTextAtCursor/);
    expect(pasteFn).toMatch(/method:\s*'paste-event-html'/);
    expect(pasteFn).toMatch(/method:\s*'clipboard-plain'/);
    expect(pasteFn).toMatch(/buildPasteFailureReason/);
  });

  it('verifies the SmartEditor model caret before native clipboard paste', () => {
    const code = read('automation/richTextPaste.ts');
    const pasteFn = code.slice(
      code.indexOf('export async function pasteRichHtmlAtCursor'),
      code.length
    );
    const caretReady = pasteFn.indexOf('const pasteCaretReady = await ensureTailTypingReady');
    const clipboardWrite = pasteFn.indexOf('const writeInPage = await page.evaluate');
    const secondCaretReady = pasteFn.indexOf('const postClipboardCaretReady = await ensureTailTypingReady');
    const ctrlV = pasteFn.indexOf("await page.keyboard.press('V')");
    expect(caretReady).toBeGreaterThan(-1);
    expect(clipboardWrite).toBeGreaterThan(caretReady);
    expect(secondCaretReady).toBeGreaterThan(clipboardWrite);
    expect(ctrlV).toBeGreaterThan(secondCaretReady);
  });

  it('re-anchors to the best caret when the ladder is exhausted', () => {
    const code = read('automation/richTextPaste.ts');
    const tail = code.slice(code.indexOf('// Ladder exhausted'));
    expect(tail).toMatch(/if \(allowEmptyParagraph\)[\s\S]{0,120}await clickLastParagraphEnd\(\)/);
    expect(tail).toMatch(/else[\s\S]{0,120}await clickLastTextParagraphEnd\(\)/);
    expect(tail).toMatch(/return false;/);
  });

  it('verifies sentinel cleanup and force-deletes residue (published ￬￬ incident)', () => {
    const code = read('automation/richTextPaste.ts');
    expect(code).toMatch(/cleanupTry/);
    expect(code).toMatch(/lastIndexOf\(sentinel\)/);
  });

  it('skips general CTAs that duplicate the previous-post URL (S16 — link inserted twice)', () => {
    const code = read('automation/editorHelpers.ts');
    // 2026-06-11 live (224312838588): the continuous flow ships the same URL
    // as a CTA AND previousPostUrl — with typing fixed, both landed and the
    // post showed the link twice. The dedup must keep the previous-post block.
    expect(code).toMatch(/이전글과 동일 URL CTA/);
    expect(code).toMatch(/planEditorTail\(\{/);
    expect(code).toMatch(/previousPostUrl:\s*resolved\.previousPostUrl/);
  });

  it('counts general CTAs in the pre-publish link-card expectation', () => {
    const code = read('automation/editorHelpers.ts');
    const stash = code.slice(
      code.indexOf('__prePublishExpectations = {'),
      code.indexOf('// 7. CTA 버튼 최종 확인')
    );
    // 2026-06-11 live: CTA 1개 inserted but expectation stayed 0 because only
    // previousPostTailInserted was counted — the lost link card passed 5/5.
    // effectiveCtas = post-S16-dedup list, so a skipped duplicate CTA is not
    // re-counted into the expectation.
    expect(stash).toMatch(/expectedLinkCardMin:\s*getExpectedLinkCardMin\(previousPostTailInserted,\s*effectiveCtas\)/);
    expect(stash).toMatch(/expectedHashtags/);
  });

  it('asserts expected hashtags are present in the editor body before publish', () => {
    const code = read('automation/prePublishAssertion.ts');
    expect(code).toMatch(/hashtag/i);
  });

  it('separates main body applied from final tail-complete applied state', () => {
    const code = read('automation/editorHelpers.ts');
    const mainBodyMarker = code.indexOf('__editorMainBodyApplied = true');
    const tailPhase = code.indexOf('[TailOptions]');
    const hashtagTail = code.indexOf('await applyTailHashtagsAfterCards');
    const finalAppliedMarker = code.indexOf('__editorContentApplied = true');

    expect(mainBodyMarker).toBeGreaterThan(-1);
    expect(tailPhase).toBeGreaterThan(mainBodyMarker);
    expect(hashtagTail).toBeGreaterThan(tailPhase);
    expect(finalAppliedMarker).toBeGreaterThan(hashtagTail);
  });

  it('does not retry the whole structured content writer after the main body is already applied', () => {
    const code = read('naverBlogAutomation.ts');
    const retryStart = code.indexOf('private async retry<T>');
    expect(retryStart).toBeGreaterThan(-1);
    const retryBlock = code.slice(retryStart, retryStart + 5200);

    expect(retryBlock).toContain('__editorMainBodyApplied === true');
    expect(retryBlock).toContain('__editorContentApplied !== true');
    expect(retryBlock).toContain('본문 전체 재실행 없이');
  });

  it('verifies the server session before reusing an open browser in runPostOnly', () => {
    const code = read('naverBlogAutomation.ts');
    const start = code.indexOf('async runPostOnly(');
    expect(start).toBeGreaterThan(-1);
    const runPostOnly = code.slice(start, start + 4500);
    expect(runPostOnly).toMatch(/ensureServerSession\(this\.options\.naverId\)/);
    expect(runPostOnly).toMatch(/loginToNaver\(\)/);
  });

  it('skips link-card waiting and proceeds to hashtags when there is no previous post', () => {
    const code = read('automation/editorTailActions.ts');
    const hashtagTail = code.slice(
      code.indexOf('export async function applyTailHashtagsAfterCards'),
      code.indexOf('export async function insertTailLinkCardBlock')
    );
    expect(hashtagTail).toMatch(/if \([\s\S]{0,180}previousPostTailInserted[\s\S]{0,80}!confirmedPreviousPostCardReady/);
    expect(hashtagTail).toMatch(/const cardStabilizeDelay = previousPostTailInserted\s*\?\s*\(confirmedPreviousPostCardReady \? 1000 : 3000\)\s*:\s*300/);
    expect(hashtagTail).toMatch(/applyHashtagsInBody\(\[\.{3}hashtagsToApply\]/);
  });
});
