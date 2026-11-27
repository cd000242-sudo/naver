// src/automation/barePipeTable.ts
// A table written without outer pipes and without a |---| row:
//   구분 | iX4 50 xDrive | iX3 50 xDrive
//   (blank line)
//   차체 | 쿠페형 | SUV
// Posts written in ChatGPT / Claude and pasted into the app arrive like this. The paste builder only knew markdown
// tables, so every row was published as an "a · b · c" sentence (owner, live run 2026-11-26: "표가 벗겨져서 발행").
// This rewrites such a run of rows into a real markdown table; the existing table code does the rest.
// Pure text in, text out. Anything that is not clearly a table is returned untouched.

const MAX_ROW_CHARS = 240;
const CELL_SPLIT = /\s+\|\s+/;
const BARE_DIVIDER = /^\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*$/;

/** Cells of a bare row, or null when the line is not one (a markdown row, a heading, prose with one stray pipe …). */
function bareRowCells(line: string): string[] | null {
  const text = line.trim();
  if (!text || text.length > MAX_ROW_CHARS) return null;
  if (text.startsWith('|') || text.endsWith('|') || text.startsWith('#')) return null;
  if (!CELL_SPLIT.test(text)) return null;
  const cells = text.split(CELL_SPLIT).map((cell) => cell.trim());
  return cells.length >= 2 && cells.every((cell) => cell.length > 0) ? cells : null;
}

/** Two columns need three rows (a lone "A | B" pair is usually prose); three or more columns need two. */
function isTable(rows: readonly string[][]): boolean {
  if (rows.length === 0) return false;
  return rows[0].length >= 3 ? rows.length >= 2 : rows.length >= 3;
}

function toMarkdown(rows: readonly string[][]): string[] {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [line(rows[0]), line(rows[0].map(() => '---')), ...rows.slice(1).map(line)];
}

export function normalizeBarePipeTables(text: string): string {
  const source = String(text || '');
  if (!source.includes('|')) return source;
  const lines = source.split('\n');
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const first = bareRowCells(lines[index]);
    if (!first) {
      out.push(lines[index]);
      index += 1;
      continue;
    }
    // Collect the run: rows with the same cell count, with blank lines or a bare divider allowed in between.
    const rows: string[][] = [first];
    let end = index + 1; // one past the last line that belongs to the run
    let cursor = index + 1;
    while (cursor < lines.length) {
      if (lines[cursor].trim() === '' || BARE_DIVIDER.test(lines[cursor])) {
        cursor += 1;
        continue;
      }
      const cells = bareRowCells(lines[cursor]);
      if (!cells || cells.length !== first.length) break;
      rows.push(cells);
      cursor += 1;
      end = cursor;
    }
    if (!isTable(rows)) {
      out.push(lines[index]);
      index += 1;
      continue;
    }
    if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
    out.push(...toMarkdown(rows));
    if (end < lines.length && lines[end].trim() !== '') out.push('');
    index = end;
  }
  return out.join('\n');
}
