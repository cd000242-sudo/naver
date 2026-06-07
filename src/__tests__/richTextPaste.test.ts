import { describe, expect, it } from 'vitest';
import {
  buildMobileRichHtml,
  pickRichArticleThemes,
  pickSoftHeadingTheme,
  pickSoftHighlightTheme,
  pickSoftTableTheme,
  SOFT_HEADING_THEMES,
  SOFT_HIGHLIGHT_THEMES,
  SOFT_TABLE_THEMES,
} from '../automation/richTextPaste';

describe('buildMobileRichHtml', () => {
  it('splits long prose into mobile-friendly centered paragraphs', () => {
    const result = buildMobileRichHtml(
      'Naver Mate selection becomes easier when the first paragraph shows the topic and conclusion clearly. The next paragraph should keep each sentence short enough for mobile readers, because long blocks are hard to scan on a phone.',
      { maxChunkChars: 54, highlight: false }
    );

    expect(result.paragraphCount).toBeGreaterThan(1);
    expect(result.html.match(/<p /g)?.length).toBe(result.paragraphCount);
    expect(result.html).toContain('text-align:center');
    expect(result.html).toContain('max-width:520px');
  });

  it('uses one soft highlight color theme only for important section sentences', () => {
    const theme = SOFT_HIGHLIGHT_THEMES[2];
    const result = buildMobileRichHtml(
      [
        '## Reader Trust',
        'This opener is useful but not the main point.',
        'The core result is that proof, comparison, and experience make the post easier to trust.',
        '',
        '## Selection Strategy',
        'A weak paragraph only repeats the topic.',
        'The most important action is to add a clear conclusion, review details, and a simple checklist.',
      ].join('\n'),
      { maxChunkChars: 120, highlight: true, maxHighlights: 6, highlightTheme: theme }
    );

    expect(result.highlightCount).toBe(2);
    expect(result.html.match(new RegExp(`background-color:${theme.background}`, 'g'))).toHaveLength(2);
    const openerIndex = result.html.indexOf('This opener is useful but not the main point.');
    const weakIndex = result.html.indexOf('A weak paragraph only repeats the topic.');
    expect(result.html.slice(Math.max(0, openerIndex - 120), openerIndex + 120)).not.toContain(`background-color:${theme.background}`);
    expect(result.html.slice(Math.max(0, weakIndex - 120), weakIndex + 120)).not.toContain(`background-color:${theme.background}`);
    expect(result.html).not.toContain('background-color:#fff3bf');
    expect(result.html).not.toContain('background-color:#fff7d6');
  });

  it('does not add a table of contents by default and keeps centered heading markers', () => {
    const result = buildMobileRichHtml(
      [
        '## First Section',
        'The core result belongs here.',
        '',
        '## Second Section',
        'The conclusion belongs here.',
      ].join('\n'),
      { maxChunkChars: 120, highlight: false, headingTheme: SOFT_HEADING_THEMES[0] }
    );

    expect(result.html).not.toContain('data-rich-toc="true"');
    expect(result.html).not.toContain('\uBAA9\uCC28');
    expect(result.html).toContain('id="naver-mate-section-1"');
    expect(result.html).toContain('data-rich-heading="true"');
    expect(result.html).toContain('text-align:center');
    expect(result.html).toContain('>01</span>');
    expect(result.html).toContain('border-bottom:2px solid');
  });

  it('can add a centered table of contents only when explicitly requested', () => {
    const result = buildMobileRichHtml(
      [
        '## First Section',
        'The core result belongs here.',
        '',
        '## Second Section',
        'The conclusion belongs here.',
      ].join('\n'),
      { toc: true, maxChunkChars: 120, highlight: false, headingTheme: SOFT_HEADING_THEMES[0] }
    );

    expect(result.html).toContain('data-rich-toc="true"');
    expect(result.html).toContain('href="#naver-mate-section-1"');
    expect(result.html).toContain('>01</span>');
  });

  it('keeps a long important sentence highlighted as one readable unit', () => {
    const theme = SOFT_HIGHLIGHT_THEMES[0];
    const importantSentence = 'The most important action is to highlight only one core sentence under each subheading so the reader can understand the point quickly.';
    const result = buildMobileRichHtml(
      [
        '## Highlight Scope',
        'This is plain supporting context.',
        importantSentence,
      ].join('\n'),
      { maxChunkChars: 42, highlight: true, maxHighlights: 3, highlightTheme: theme }
    );

    const highlighted = `<span style="background-color:${theme.background}`;
    expect(result.highlightCount).toBe(1);
    expect(result.html).toContain(`${highlighted}`);
    expect(result.html).toContain('The most important action is to highlight<br>');
    expect(result.html).toContain('the point quickly.</span>');
    expect(result.html).not.toContain('point quickly.</p>');
  });

  it('converts markdown tables into HTML tables for Naver rich paste', () => {
    const result = buildMobileRichHtml(
      [
        '| Item | Result |',
        '| --- | --- |',
        '| Price | OK |',
        '| Structure | Stable |',
      ].join('\n')
    );

    expect(result.tableCount).toBe(1);
    expect(result.html).toContain('<table ');
    expect(result.html).toContain('>Item</th>');
    expect(result.html).toContain('>OK</td>');
  });

  it('formats Q&A without standalone A labels and renders questions at 24px', () => {
    const result = buildMobileRichHtml(
      [
        'Q1. 제습기와 서큘레이터를 꼭 같이 써야 하나?',
        'A.',
        '꼭 필수는 아니지만, 함께 쓰면 건조 시간과 냄새 예방 효과가 확실히 높아진다.',
      ].join('\n'),
      { maxChunkChars: 38, highlight: false }
    );

    expect(result.html).toContain('font-size:24px');
    expect(result.html).toContain('제습기와 서큘레이터를 꼭 같이 써야 하나?');
    expect(result.html).not.toContain('>A.<');
    expect(result.plainText).not.toContain('\n\nA.');
  });

  it('removes inline A prefixes from Q&A answers', () => {
    const result = buildMobileRichHtml(
      [
        'Q1. 제습기와 서큘레이터를 꼭 같이 써야 하나?',
        'A. 꼭 필수는 아니지만, 함께 쓰면 건조 시간과 냄새 예방 효과가 확실히 높아진다.',
      ].join('\n'),
      { maxChunkChars: 38, highlight: false }
    );

    expect(result.html).toContain('font-size:24px');
    expect(result.html).toContain('제습기와 서큘레이터를 꼭 같이 써야 하나?');
    expect(result.html).not.toContain('>A.');
    expect(result.plainText).not.toContain('A. 꼭');
  });

  it('keeps Q numbers and converts answers to A-number colon labels', () => {
    const result = buildMobileRichHtml(
      [
        'Q1. Why does the smell remain?',
        'A.',
        'Moisture can stay inside the device after drying.',
        'Q2. Is fan-only drying enough? A2. It helps, but cleaning is still needed.',
      ].join('\n'),
      { maxChunkChars: 80, highlight: false }
    );

    expect(result.plainText).toContain('Q1. Why does the smell remain?');
    expect(result.plainText).toContain('A1: Moisture can stay inside the device after drying.');
    expect(result.plainText).toContain('Q2. Is fan-only drying enough?');
    expect(result.plainText).toContain('A2: It helps, but cleaning is still needed.');
    expect(result.plainText).not.toContain('\n\nA.\n\n');
  });

  it('normalizes inline numbered checklists into vertical mobile lines', () => {
    const result = buildMobileRichHtml(
      'Cleaning checklist includes 1) filter washing, 2) fan dust removal, 3) enough drying time.',
      { maxChunkChars: 120, highlight: false }
    );

    expect(result.plainText).toContain('Cleaning checklist includes');
    expect(result.plainText).toContain('\n\n1) filter washing,');
    expect(result.plainText).toContain('\n\n2) fan dust removal,');
    expect(result.plainText).toContain('\n\n3) enough drying time.');
  });

  it('normalizes inline dash lists so every dash starts on a new line', () => {
    const result = buildMobileRichHtml(
      'Use this order - run auto dry after cooling - clean the filter monthly - ventilate after cleaning.',
      { maxChunkChars: 120, highlight: false }
    );

    expect(result.plainText).toContain('\n\n- run auto dry after cooling');
    expect(result.plainText).toContain('\n\n- clean the filter monthly');
    expect(result.plainText).toContain('\n\n- ventilate after cleaning.');
  });

  it('collapses a dangling closing bracket into the verdict line', () => {
    const result = buildMobileRichHtml('[ One line verdict: automatic drying still needs cleaning.\n]');

    expect(result.plainText).toContain('[ One line verdict: automatic drying still needs cleaning. ]');
    expect(result.plainText).not.toMatch(/\n\]\s*$/);
  });

  it('uses wider paragraph spacing for two-enter mobile readability', () => {
    const result = buildMobileRichHtml('First sentence.\n\nSecond sentence.', { highlight: false });

    expect(result.html).toContain('margin:0 auto 30px');
    expect(result.plainText).toContain('First sentence.\n\nSecond sentence.');
  });

  it('splits long Korean sentences near a semantic midpoint for mobile reading', () => {
    const result = buildMobileRichHtml(
      '제습기와 서큘레이터를 같이 쓰면 2026년 장마철 기준으로 빨래 건조 시간이 확실히 단축되고, 냄새 예방 효과도 높아진다.',
      { maxChunkChars: 38, highlight: false }
    );

    expect(result.paragraphCount).toBe(1);
    expect(result.html).toContain('<br>');
    expect(result.plainText).toContain('제습기와 서큘레이터를 같이 쓰면 2026년 장마철 기준으로');
    expect(result.plainText).toContain('빨래 건조 시간이 확실히 단축되고');
  });

  it('applies one soft table color theme to table headers and cells', () => {
    const theme = SOFT_TABLE_THEMES[1];
    const result = buildMobileRichHtml(
      [
        '| Item | Result |',
        '| --- | --- |',
        '| Encoding | OK |',
        '| Table | Preserved |',
      ].join('\n'),
      { tableTheme: theme }
    );

    expect(result.html).toContain(`data-rich-table-theme="${theme.name}"`);
    expect(result.html).toContain(`border-top:3px solid ${theme.accent}`);
    expect(result.html).toContain(`background-color:${theme.headerBg}`);
    expect(result.html).toContain(`background-color:${theme.rowBg}`);
    expect(result.html).toContain(`background-color:${theme.altRowBg}`);
  });

  it('keeps the same table color theme across multiple tables in one article', () => {
    const theme = SOFT_TABLE_THEMES[2];
    const result = buildMobileRichHtml(
      [
        '| Item | Result |',
        '| --- | --- |',
        '| A | Good |',
        '',
        '| Check | Value |',
        '| --- | --- |',
        '| B | Stable |',
      ].join('\n'),
      { tableTheme: theme }
    );

    expect(result.tableCount).toBe(2);
    expect(result.html.match(new RegExp(`data-rich-table-theme="${theme.name}"`, 'g'))).toHaveLength(2);
    expect(result.html).not.toContain(`data-rich-table-theme="${SOFT_TABLE_THEMES[0].name}"`);
  });

  it('can pick deterministic random soft themes for each article', () => {
    expect(pickSoftTableTheme(() => 0)).toBe(SOFT_TABLE_THEMES[0]);
    expect(pickSoftTableTheme(() => 0.9999)).toBe(SOFT_TABLE_THEMES[SOFT_TABLE_THEMES.length - 1]);
    expect(pickSoftHighlightTheme(() => 0)).toBe(SOFT_HIGHLIGHT_THEMES[0]);
    expect(pickSoftHighlightTheme(() => 0.9999)).toBe(SOFT_HIGHLIGHT_THEMES[SOFT_HIGHLIGHT_THEMES.length - 1]);
    expect(pickSoftHeadingTheme(() => 0)).toBe(SOFT_HEADING_THEMES[0]);
    expect(pickSoftHeadingTheme(() => 0.9999)).toBe(SOFT_HEADING_THEMES[SOFT_HEADING_THEMES.length - 1]);
  });

  it('picks separate table, highlight, and heading theme roles for one article', () => {
    const themes = pickRichArticleThemes(() => 0.4);

    expect(themes.tableTheme).toBeTruthy();
    expect(themes.highlightTheme).toBeTruthy();
    expect(themes.headingTheme).toBeTruthy();
    expect(themes.tableTheme.headerBg).not.toBe(themes.highlightTheme.background);
    expect(themes.headingTheme.markerBg).not.toBe(themes.highlightTheme.background);
    expect(themes.headingTheme.markerBg).not.toBe(themes.tableTheme.headerBg);
  });

  it('escapes raw HTML before building the clipboard fragment', () => {
    const result = buildMobileRichHtml('<script>alert(1)</script> core test content.');

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;');
    expect(result.html).toContain('&gt;');
  });
});
