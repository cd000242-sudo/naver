import { describe, expect, it } from 'vitest';
import {
  applyArticleTablesToStructuredContent,
  articleTableToMarkdown,
  createEmptyArticleTable,
  insertArticleTableAtSelection,
  insertArticleTableByContext,
  type ArticleTable,
} from '../renderer/utils/articleTableUtils';

function sampleTable(overrides: Partial<ArticleTable> = {}): ArticleTable {
  return {
    id: 'table-benefit-check',
    title: 'Benefit comparison',
    cells: [
      ['Item', 'Details'],
      ['Income', 'Check household income'],
      ['Deadline', 'Confirm the application date'],
    ],
    createdAt: 1,
    ...overrides,
  };
}

describe('articleTableUtils', () => {
  it('creates a bounded rectangular editable grid', () => {
    const table = createEmptyArticleTable(3, 4);

    expect(table.cells).toHaveLength(3);
    expect(table.cells.every((row) => row.length === 4)).toBe(true);
    expect(table.id).toMatch(/^article-table-/);
  });

  it('serializes cell content to a valid markdown table without breaking pipes or newlines', () => {
    const markdown = articleTableToMarkdown(sampleTable({
      cells: [
        ['Item', 'Details'],
        ['Plan | A', 'First line\nSecond line'],
      ],
    }));

    expect(markdown).toContain('| Item | Details |');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('Plan \\| A');
    expect(markdown).toContain('First line Second line');
  });

  it('inserts at the exact textarea selection without rearranging surrounding content', () => {
    const body = 'Opening paragraph.\n\nClosing paragraph.';
    const selection = body.indexOf('Closing');
    const result = insertArticleTableAtSelection(body, sampleTable(), selection, selection);

    expect(result.text.indexOf('Opening paragraph.')).toBeLessThan(result.text.indexOf('| Item |'));
    expect(result.text.indexOf('| Deadline |')).toBeLessThan(result.text.indexOf('Closing paragraph.'));
    expect(result.selectionStart).toBe(result.selectionEnd);
  });

  it('places a table in the most relevant heading section before the next heading', () => {
    const body = [
      'Short introduction.',
      '',
      '## Required documents',
      'Prepare an ID card and application form.',
      '',
      '## Benefit and income conditions',
      'Household income changes the available benefit.',
      '',
      '## Application steps',
      'Submit the form online.',
    ].join('\n');

    const result = insertArticleTableByContext(body, sampleTable());
    const relevantHeading = result.text.indexOf('## Benefit and income conditions');
    const table = result.text.indexOf('| Item | Details |');
    const nextHeading = result.text.indexOf('## Application steps');

    expect(result.strategy).toBe('context');
    expect(table).toBeGreaterThan(relevantHeading);
    expect(table).toBeLessThan(nextHeading);
  });

  it('does not duplicate an identical table already present in the article', () => {
    const table = sampleTable();
    const body = `Intro.\n\n${articleTableToMarkdown(table)}\n\nOutro.`;
    const result = insertArticleTableByContext(body, table);

    expect(result.strategy).toBe('duplicate');
    expect(result.text.match(/\| Item \| Details \|/g)).toHaveLength(1);
  });

  it('updates bodyPlain, content, and the matched structured heading immutably', () => {
    const original = {
      selectedTitle: 'Support guide',
      bodyPlain: [
        'Introduction.',
        '',
        '## Benefit and income conditions',
        'Household income changes the available benefit.',
        '',
        '## Application steps',
        'Submit the form online.',
      ].join('\n'),
      content: 'legacy body',
      headings: [
        { title: 'Benefit and income conditions', content: 'Household income changes the available benefit.' },
        { title: 'Application steps', content: 'Submit the form online.' },
      ],
    };

    const result = applyArticleTablesToStructuredContent(original, [sampleTable()]);

    expect(result).not.toBe(original);
    expect(result.headings).not.toBe(original.headings);
    expect(result.bodyPlain).toContain('| Item | Details |');
    expect(result.content).toBe(result.bodyPlain);
    expect(result.headings[0].content).toContain('| Item | Details |');
    expect(result._preferBodyPlain).toBe(true);
    expect(original.bodyPlain).not.toContain('| Item | Details |');
  });

  it('keeps the table-bearing body authoritative when plain body and headings use different layouts', () => {
    const original = {
      bodyPlain: 'Introduction.\n\nFirst paragraph.\n\nSecond paragraph.\n\nConclusion.',
      content: 'legacy body',
      headings: [
        { title: 'First section', content: 'First paragraph.' },
        { title: 'Second section', content: 'Second paragraph.' },
      ],
    };

    const result = applyArticleTablesToStructuredContent(original, [sampleTable({
      title: 'Item details',
      cells: [['Item', 'Details'], ['A', 'B']],
    })]);

    expect(result._preferBodyPlain).toBe(true);
    expect(result.bodyPlain).toContain('| Item | Details |');
  });
});
