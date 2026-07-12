// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extractArticleTextFromClipboardHtml } from '../renderer/utils/articleTableClipboard';

describe('article table clipboard conversion', () => {
  it('preserves paragraph and table order when a complete article is pasted', () => {
    const html = [
      '<h2>Eligibility</h2>',
      '<p>Check the requirements first.</p>',
      '<table>',
      '<thead><tr><th>Item</th><th>Rule</th></tr></thead>',
      '<tbody><tr><td>Income</td><td>Household basis</td></tr></tbody>',
      '</table>',
      '<p>Confirm details on the official website.</p>',
    ].join('');

    const result = extractArticleTextFromClipboardHtml(html, 'Eligibility\nCheck the requirements first.');

    expect(result).not.toBeNull();
    expect(result?.tableCount).toBe(1);
    expect(result?.text).toContain('## Eligibility');
    expect(result?.text).toContain('| Item | Rule |');
    expect(result?.text.indexOf('Check the requirements first.')).toBeLessThan(result!.text.indexOf('| Item | Rule |'));
    expect(result?.text.indexOf('| Income | Household basis |')).toBeLessThan(result!.text.indexOf('Confirm details'));
  });

  it('recognizes spreadsheet-style tables that use td cells only', () => {
    const html = [
      '<table>',
      '<tr><td>Month</td><td>Cost</td><td>Status</td></tr>',
      '<tr><td>January</td><td>100</td><td>Paid</td></tr>',
      '<tr><td>February</td><td>120</td><td>Pending</td></tr>',
      '</table>',
    ].join('');

    const result = extractArticleTextFromClipboardHtml(html, 'Month Cost Status');

    expect(result?.tableCount).toBe(1);
    expect(result?.text).toContain('| Month | Cost | Status |');
    expect(result?.text).toContain('| --- | --- | --- |');
    expect(result?.text).toContain('| February | 120 | Pending |');
  });

  it('expands colspan and rowspan into a stable rectangular table', () => {
    const html = [
      '<table>',
      '<tr><th rowspan="2">Item</th><th colspan="2">Period</th></tr>',
      '<tr><th>Start</th><th>End</th></tr>',
      '<tr><td>Apply</td><td>March</td><td>April</td></tr>',
      '</table>',
    ].join('');

    const result = extractArticleTextFromClipboardHtml(html, 'Item Period Start End');
    const rows = result?.text.split('\n').filter((line) => line.startsWith('|')) || [];

    expect(result?.tableCount).toBe(1);
    expect(rows.every((row) => row.split('|').length === 5)).toBe(true);
    expect(result?.text).toContain('| Item | Period / Start | Period / End |');
    expect(result?.text).not.toContain('열 3');
    expect(result?.text).toContain('| Apply | March | April |');
  });

  it('does not intercept ordinary rich text with no table', () => {
    expect(extractArticleTextFromClipboardHtml('<p>Plain paragraph</p>', 'Plain paragraph')).toBeNull();
  });
});
