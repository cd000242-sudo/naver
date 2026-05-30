/**
 * Comparison-block scanner (advisory).
 *
 * SPEC-AEO-EXPOSURE-2026 R1.
 *
 * 비교표·체크리스트·번호목록은 "발췌 가능한 구조"라 AI 브리핑/스니펫 인용에
 * 유리하다. 이 스캐너는 그런 구조의 "존재와 개수"만 센다. 강제하지 않으며
 * 수정하지 않는다 — 형식을 강제하면 빈 표(cargo cult)를 양산하므로, 측정만 하고
 * 판단은 호출자에게 맡긴다 (soft-score). 발행 파이프라인 미연결.
 */

export interface ComparisonBlockResult {
  /** HTML <table> + markdown separator rows. */
  tableCount: number;
  /** HTML <ul>/<ol> + markdown list groups. */
  listCount: number;
  /** Checkbox/checkmark markers. */
  checklistCount: number;
  hasAny: boolean;
  warnings: string[];
}

const HTML_TABLE = /<table[\s>]/gi;
const HTML_LIST = /<[uo]l[\s>]/gi;
const MD_TABLE_SEPARATOR = /^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/;
const MD_LIST_ITEM = /^\s*(\d+\.|[-*+])\s+\S/;
const CHECKLIST_MARK = /[□☐✅✓✔]/g;
const CHECKBOX = /-\s*\[[ xX]\]/g;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function countMarkdownListGroups(lines: string[]): number {
  let groups = 0;
  let inList = false;
  for (const line of lines) {
    if (MD_LIST_ITEM.test(line)) {
      if (!inList) groups += 1;
      inList = true;
    } else {
      inList = false;
    }
  }
  return groups;
}

export function scanComparisonBlocks(bodyText: string): ComparisonBlockResult {
  const text = bodyText ?? '';
  const lines = text.split('\n');

  const tableCount =
    countMatches(text, HTML_TABLE) + lines.filter((l) => MD_TABLE_SEPARATOR.test(l)).length;
  const listCount = countMatches(text, HTML_LIST) + countMarkdownListGroups(lines);
  const checklistCount = countMatches(text, CHECKLIST_MARK) + countMatches(text, CHECKBOX);

  const hasAny = tableCount + listCount + checklistCount > 0;
  const warnings: string[] = [];
  if (!hasAny) {
    warnings.push('비교표/체크리스트/번호목록이 없습니다. 발췌 인용에 유리한 구조 1개 권장(선택)');
  }

  return { tableCount, listCount, checklistCount, hasAny, warnings };
}
