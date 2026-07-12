import { articleTableToMarkdown, type ArticleTable } from './articleTableUtils.js';

export interface ArticleClipboardConversion {
  readonly text: string;
  readonly tableCount: number;
}

function normalizeClipboardText(value: string): string {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function clipboardTableToGrid(table: HTMLTableElement): string[][] {
  const grid: string[][] = [];
  const rows = Array.from(table.querySelectorAll('tr'))
    .filter((row) => row.closest('table') === table);
  let headerRowCount = 0;
  for (const row of rows) {
    const hasHeaderCell = Array.from(row.children).some((child) => child.tagName.toLocaleLowerCase() === 'th');
    if (!hasHeaderCell) break;
    headerRowCount += 1;
  }
  if (headerRowCount === 0 && rows.length > 0) headerRowCount = 1;

  rows.forEach((row, rowIndex) => {
    grid[rowIndex] ||= [];
    let columnIndex = 0;
    const cells = Array.from(row.children).filter((child): child is HTMLTableCellElement =>
      child instanceof HTMLTableCellElement,
    );
    cells.forEach((cell) => {
      while (grid[rowIndex][columnIndex] !== undefined) columnIndex += 1;
      const rowSpan = Math.max(1, Math.min(20, Number(cell.rowSpan) || 1));
      const columnSpan = Math.max(1, Math.min(8, Number(cell.colSpan) || 1));
      const value = normalizeClipboardText(cell.textContent || '');
      for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
        grid[rowIndex + rowOffset] ||= [];
        for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
          grid[rowIndex + rowOffset][columnIndex + columnOffset] = value;
        }
      }
      columnIndex += columnSpan;
    });
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  const normalizedRows = grid
    .filter((row) => row.some((cell) => String(cell || '').trim().length > 0))
    .map((row) => Array.from({ length: width }, (_, index) => String(row[index] || '')));
  if (normalizedRows.length === 0 || headerRowCount <= 1) return normalizedRows;

  const safeHeaderRowCount = Math.min(headerRowCount, normalizedRows.length);
  const compositeHeader = Array.from({ length: width }, (_, columnIndex) => {
    const labels = normalizedRows
      .slice(0, safeHeaderRowCount)
      .map((row) => normalizeClipboardText(row[columnIndex] || ''))
      .filter(Boolean);
    return labels.filter((label, index) => labels.indexOf(label) === index).join(' / ');
  });
  return [compositeHeader, ...normalizedRows.slice(safeHeaderRowCount)];
}

function clipboardTableToMarkdown(table: HTMLTableElement, index: number): string {
  const cells = clipboardTableToGrid(table);
  if (cells.length === 0) return '';
  if (cells.length === 1) cells.push(Array.from({ length: cells[0].length }, () => ''));
  const model: ArticleTable = {
    id: `clipboard-table-${index}`,
    title: normalizeClipboardText(table.querySelector('caption')?.textContent || ''),
    cells,
    createdAt: Date.now(),
  };
  return articleTableToMarkdown(model);
}

function clipboardElementBlocks(element: Element, tables: { count: number }): string[] {
  const tag = element.tagName.toLocaleLowerCase();
  if (['script', 'style', 'noscript', 'template'].includes(tag)) return [];
  if (tag === 'table') {
    tables.count += 1;
    const caption = normalizeClipboardText(element.querySelector('caption')?.textContent || '');
    const markdown = clipboardTableToMarkdown(element as HTMLTableElement, tables.count);
    return [caption, markdown].filter(Boolean);
  }
  if (/^h[1-6]$/.test(tag)) {
    const level = Math.min(4, Math.max(2, Number(tag.slice(1)) || 2));
    const text = normalizeClipboardText(element.textContent || '');
    return text ? [`${'#'.repeat(level)} ${text}`] : [];
  }
  if (tag === 'ul' || tag === 'ol') {
    return Array.from(element.children)
      .filter((child) => child.tagName.toLocaleLowerCase() === 'li')
      .map((child, index) => {
        const text = normalizeClipboardText(child.textContent || '');
        return text ? `${tag === 'ol' ? `${index + 1}.` : '-'} ${text}` : '';
      })
      .filter(Boolean);
  }
  if (tag === 'br') return [''];

  const blockChildren = Array.from(element.children).filter((child) => {
    const childTag = child.tagName.toLocaleLowerCase();
    return /^(address|article|aside|blockquote|div|dl|fieldset|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|ul)$/.test(childTag);
  });
  if (blockChildren.length > 0) {
    return blockChildren.flatMap((child) => clipboardElementBlocks(child, tables));
  }
  const text = normalizeClipboardText(element.textContent || '');
  return text ? [text] : [];
}

export function extractArticleTextFromClipboardHtml(
  html: string,
  _fallbackPlainText = '',
): ArticleClipboardConversion | null {
  if (!String(html || '').trim() || typeof DOMParser === 'undefined') return null;
  const documentNode = new DOMParser().parseFromString(html, 'text/html');
  if (!documentNode.querySelector('table')) return null;
  const tables = { count: 0 };
  const blocks = Array.from(documentNode.body.children).flatMap((element) => clipboardElementBlocks(element, tables));
  const text = blocks
    .map(normalizeClipboardText)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text && tables.count > 0 ? { text, tableCount: tables.count } : null;
}
