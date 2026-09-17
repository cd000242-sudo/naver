import { normalizeEditorSubtitleText } from './editorWriterTextSemantics.js';

/** Include the Markdown prefix when slicing at a known heading title. */
export function headingLineBoundary(content: string, titleIndex: number): number {
  const lineStart = content.lastIndexOf('\n', titleIndex - 1) + 1;
  const prefix = content.slice(lineStart, titleIndex);
  // [2026-09-17] 번호 접두("4. ", "4) ")도 소제목 마커다 - 빼면 "4." 이 앞 섹션 꼬리로 발행된다(라이브 실측).
  return /^[ \t]*(?:#{1,6}[ \t]+)?(?:\d{1,2}[ \t]*[).:：-][ \t]*)?(?:\*\*|__)?[ \t]*$/.test(prefix) ? lineStart : titleIndex;
}

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
