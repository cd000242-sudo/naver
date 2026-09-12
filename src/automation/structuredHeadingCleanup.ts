import { normalizeEditorSubtitleText } from './editorWriterTextSemantics.js';

function headingKey(line: string): string {
  return normalizeEditorSubtitleText(line.trim().replace(/^>\s*/, '').replace(/\s+#+\s*$/, ''));
}

/** The native section writer owns the heading. Remove only an exact boundary echo. */
export function stripBoundaryHeading(content: string, title: string, edge: 'start' | 'end'): string {
  const key = headingKey(title);
  if (!content || !key) return content;
  const lines = content.split(/\r?\n/);
  let start = 0;
  let end = lines.length;
  let removed = false;
  while (start < end) {
    const index = edge === 'start' ? start : end - 1;
    const line = lines[index].trim();
    if (line && headingKey(line) !== key) break;
    if (line) removed = true;
    if (edge === 'start') start += 1;
    else end -= 1;
  }
  return removed ? lines.slice(start, end).join('\n').trim() : content;
}
