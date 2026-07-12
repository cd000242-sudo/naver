export const ARTICLE_TABLE_MIN_ROWS = 2;
export const ARTICLE_TABLE_MAX_ROWS = 20;
export const ARTICLE_TABLE_MIN_COLUMNS = 2;
export const ARTICLE_TABLE_MAX_COLUMNS = 8;

export interface ArticleTable {
  readonly id: string;
  readonly title: string;
  readonly cells: readonly (readonly string[])[];
  readonly createdAt: number;
}

export interface ArticleTableInsertResult {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly strategy: 'selection' | 'context' | 'fallback' | 'duplicate';
}

function clampArticleTableSize(value: number, min: number, max: number): number {
  const parsed = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.min(max, Math.max(min, parsed));
}

function createArticleTableId(): string {
  const random = Math.random().toString(36).slice(2, 9);
  return `article-table-${Date.now().toString(36)}-${random}`;
}

export function createEmptyArticleTable(rowCount: number, columnCount: number): ArticleTable {
  const rows = clampArticleTableSize(rowCount, ARTICLE_TABLE_MIN_ROWS, ARTICLE_TABLE_MAX_ROWS);
  const columns = clampArticleTableSize(columnCount, ARTICLE_TABLE_MIN_COLUMNS, ARTICLE_TABLE_MAX_COLUMNS);
  return {
    id: createArticleTableId(),
    title: '',
    cells: Array.from({ length: rows }, () => Array.from({ length: columns }, () => '')),
    createdAt: Date.now(),
  };
}

function normalizeArticleTable(table: ArticleTable): ArticleTable {
  const sourceRows = Array.isArray(table?.cells) ? table.cells : [];
  const rowCount = clampArticleTableSize(sourceRows.length, ARTICLE_TABLE_MIN_ROWS, ARTICLE_TABLE_MAX_ROWS);
  const widest = sourceRows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const columnCount = clampArticleTableSize(widest, ARTICLE_TABLE_MIN_COLUMNS, ARTICLE_TABLE_MAX_COLUMNS);
  const cells = Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) =>
      String(sourceRows[rowIndex]?.[columnIndex] ?? '').replace(/\r\n?/g, '\n').trim(),
    ),
  );
  return {
    id: String(table?.id || createArticleTableId()),
    title: String(table?.title || '').trim(),
    cells,
    createdAt: Number.isFinite(table?.createdAt) ? table.createdAt : Date.now(),
  };
}

function escapeArticleTableCell(value: string): string {
  return String(value || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

export function articleTableToMarkdown(table: ArticleTable): string {
  const normalized = normalizeArticleTable(table);
  const [rawHeader, ...rawBody] = normalized.cells;
  const header = rawHeader.map((cell, index) => escapeArticleTableCell(cell) || `열 ${index + 1}`);
  const body = rawBody.map((row) => row.map(escapeArticleTableCell));
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function normalizeArticleTableFingerprint(value: string): string {
  return String(value || '')
    .replace(/\\\|/g, '|')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function articleAlreadyContainsTable(body: string, markdown: string): boolean {
  return normalizeArticleTableFingerprint(body).includes(normalizeArticleTableFingerprint(markdown));
}

function insertArticleTableMarkdown(body: string, markdown: string, offset: number): ArticleTableInsertResult {
  const safeBody = String(body || '');
  const safeOffset = Math.min(safeBody.length, Math.max(0, Math.floor(offset)));
  const before = safeBody.slice(0, safeOffset);
  const after = safeBody.slice(safeOffset);
  const prefix = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = after.length === 0 || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const text = `${before}${prefix}${markdown}${suffix}${after}`;
  const caret = before.length + prefix.length + markdown.length;
  return { text, selectionStart: caret, selectionEnd: caret, strategy: 'selection' };
}

export function insertArticleTableAtSelection(
  body: string,
  table: ArticleTable,
  selectionStart: number,
  selectionEnd: number,
): ArticleTableInsertResult {
  const safeBody = String(body || '');
  const start = Math.min(safeBody.length, Math.max(0, Math.floor(selectionStart)));
  const end = Math.min(safeBody.length, Math.max(start, Math.floor(selectionEnd)));
  const markdown = articleTableToMarkdown(table);
  if (articleAlreadyContainsTable(safeBody, markdown)) {
    return { text: safeBody, selectionStart: start, selectionEnd: start, strategy: 'duplicate' };
  }
  return insertArticleTableMarkdown(`${safeBody.slice(0, start)}${safeBody.slice(end)}`, markdown, start);
}

const ARTICLE_TABLE_STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'this', 'that', 'item', 'details',
  '내용', '항목', '정리', '관련', '대한', '위한', '확인', '정보',
]);

function articleTableTerms(value: string): Set<string> {
  const matches = String(value || '').toLocaleLowerCase().match(/[a-z0-9가-힣]{2,}/g) || [];
  return new Set(matches.filter((term) => !ARTICLE_TABLE_STOP_WORDS.has(term)));
}

function scoreArticleTableContext(value: string, terms: ReadonlySet<string>): number {
  const normalized = String(value || '').toLocaleLowerCase();
  let score = 0;
  terms.forEach((term) => {
    if (normalized.includes(term)) score += term.length >= 4 ? 4 : 2;
  });
  if (/비교|기준|조건|금액|비용|혜택|서류|절차|일정|기간|comparison|cost|benefit|income|deadline/i.test(normalized)) {
    score += 2;
  }
  return score;
}

function collectArticleTableTerms(table: ArticleTable): Set<string> {
  const normalized = normalizeArticleTable(table);
  return articleTableTerms([normalized.title, ...normalized.cells.flat()].join(' '));
}

function findContextualArticleTableOffset(body: string, table: ArticleTable): { offset: number; matched: boolean } {
  const terms = collectArticleTableTerms(table);
  const headingPattern = /^#{1,4}\s+(.+)$/gm;
  const headings = Array.from(body.matchAll(headingPattern)).map((match) => ({
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    title: match[1],
  }));

  if (headings.length > 0) {
    const sections = headings.map((heading, index) => {
      const end = headings[index + 1]?.index ?? body.length;
      const sectionText = body.slice(heading.end, end);
      return {
        end,
        score: scoreArticleTableContext(heading.title, terms) * 3 + scoreArticleTableContext(sectionText, terms),
      };
    });
    const best = sections.reduce((winner, candidate) => candidate.score > winner.score ? candidate : winner, sections[0]);
    return { offset: best.end, matched: best.score > 0 };
  }

  const paragraphPattern = /\S(?:[\s\S]*?\S)?(?=\n{2,}|$)/g;
  const paragraphs = Array.from(body.matchAll(paragraphPattern)).map((match) => ({
    end: (match.index ?? 0) + match[0].length,
    score: scoreArticleTableContext(match[0], terms),
  }));
  if (paragraphs.length === 0) return { offset: body.length, matched: false };
  const best = paragraphs.reduce((winner, candidate) => candidate.score > winner.score ? candidate : winner, paragraphs[0]);
  return {
    offset: best.score > 0 ? best.end : paragraphs[Math.min(1, paragraphs.length - 1)].end,
    matched: best.score > 0,
  };
}

export function insertArticleTableByContext(body: string, table: ArticleTable): ArticleTableInsertResult {
  const safeBody = String(body || '');
  const markdown = articleTableToMarkdown(table);
  if (articleAlreadyContainsTable(safeBody, markdown)) {
    return { text: safeBody, selectionStart: safeBody.length, selectionEnd: safeBody.length, strategy: 'duplicate' };
  }
  const placement = findContextualArticleTableOffset(safeBody, table);
  const inserted = insertArticleTableMarkdown(safeBody, markdown, placement.offset);
  return { ...inserted, strategy: placement.matched ? 'context' : 'fallback' };
}

function appendArticleTableToHeading(content: string, table: ArticleTable): string {
  const markdown = articleTableToMarkdown(table);
  if (articleAlreadyContainsTable(content, markdown)) return content;
  return insertArticleTableMarkdown(content, markdown, content.length).text;
}

export function applyArticleTablesToStructuredContent<T extends Record<string, any>>(
  structuredContent: T,
  tables: readonly ArticleTable[],
): T {
  if (!structuredContent || tables.length === 0) return structuredContent;
  const clonedHeadings = Array.isArray(structuredContent.headings)
    ? structuredContent.headings.map((heading: any) => ({ ...heading }))
    : [];
  const sourceBody = String(
    structuredContent.bodyPlain
      || structuredContent.content
      || structuredContent.body
      || [
        structuredContent.introduction,
        ...clonedHeadings.map((heading: any) => `## ${String(heading.title || '').trim()}\n${String(heading.content || '').trim()}`),
      ].filter(Boolean).join('\n\n'),
  );

  let body = sourceBody;
  for (const table of tables.map(normalizeArticleTable)) {
    const insertion = insertArticleTableByContext(body, table);
    if (insertion.strategy === 'duplicate') continue;
    body = insertion.text;

    if (clonedHeadings.length > 0) {
      const terms = collectArticleTableTerms(table);
      const ranked = clonedHeadings.map((heading: any, index: number) => ({
        index,
        score: scoreArticleTableContext(`${heading.title || ''} ${heading.content || ''}`, terms),
      }));
      const best = ranked.reduce((winner, candidate) => candidate.score > winner.score ? candidate : winner, ranked[0]);
      const targetIndex = best.score > 0 ? best.index : 0;
      const target = clonedHeadings[targetIndex];
      clonedHeadings[targetIndex] = {
        ...target,
        content: appendArticleTableToHeading(String(target.content || ''), table),
      };
    }
  }

  return {
    ...structuredContent,
    bodyPlain: body,
    content: body,
    _preferBodyPlain: true,
    ...(Object.prototype.hasOwnProperty.call(structuredContent, 'body') ? { body } : {}),
    headings: clonedHeadings,
    articleTables: tables.map(normalizeArticleTable),
  };
}
