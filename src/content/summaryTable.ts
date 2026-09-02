// src/content/summaryTable.ts
// 글 맨 앞 사실 요약 표 — 모델이 채운 스키마 필드를 마크다운 표로 렌더한다.
//
// [2026-08-26 실측] 프롬프트로 "표를 써라"고 지시했지만 모델이 계속 흘렸다.
// 진단: 조립된 시스템 프롬프트가 40,377자였고, 표 지시는 83% 지점(뒤쪽=강한 위치)에
// 있었는데도 안 나왔다. 같은 프롬프트에서 해시태그는 나왔는데, 그건 JSON 스키마의
// 필드라 구조적으로 강제되기 때문이다.
//
// 그래서 표도 스키마 필드(summaryTable)로 옮긴다. 모델은 문장 지시는 흘려도
// 채워야 할 필드는 흘리지 않는다. 마크다운 조립은 코드가 한다 — 형식이 어긋날 여지가 없다.

export interface SummaryTableRow {
  readonly label?: unknown;
  readonly value?: unknown;
}

/** 2행 미만은 표로 만들 가치가 없고, 6행을 넘으면 첫 화면을 잡아먹는다. */
export const SUMMARY_TABLE_MIN_ROWS = 2;
export const SUMMARY_TABLE_MAX_ROWS = 6;

/**
 * [2026-09-02 사장님 화면] 모델이 규격 값을 "1. 5kg" 로 적었다 — 소수점 뒤 공백. 표 안에서는 문장 경계가 아니라
 * 숫자다. 숫자.공백.숫자 는 소수점으로 붙인다. 문장("…합니다. 5개")은 셀 값에 오지 않는다 — 표는 문장을 담지 않는다.
 */
function collapseDecimalGap(value: string): string {
  return value.replace(/(\d)\.\s+(?=\d)/g, '$1.');
}
function text(value: unknown): string {
  return typeof value === 'string' ? collapseDecimalGap(value.replace(/\s+/g, ' ').trim()) : '';
}

/** 표 안에서 파이프는 열 구분자라 그대로 두면 표가 깨진다. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '/');
}

/**
 * 쓸 수 있는 행만 남긴다.
 *
 * 라벨이 전부 같으면(예: "핵심"×4) 정보가 0이므로 표 자체를 버린다 — 그런 표는
 * 첫 화면만 차지하고 독자에게 아무것도 주지 않는다.
 */
export function normalizeSummaryRows(rows: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const out: Array<{ label: string; value: string }> = [];
  for (const row of rows) {
    const label = text((row as SummaryTableRow)?.label);
    const value = text((row as SummaryTableRow)?.value);
    if (!label || !value) continue;

    const key = label.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ label: escapeCell(label), value: escapeCell(value) });
    if (out.length >= SUMMARY_TABLE_MAX_ROWS) break;
  }

  if (out.length < SUMMARY_TABLE_MIN_ROWS) return [];
  return out;
}

/** 마크다운 2열 표. 쓸 행이 없으면 빈 문자열. */
export function renderSummaryTable(rows: unknown): string {
  const normalized = normalizeSummaryRows(rows);
  if (normalized.length === 0) return '';

  return [
    '| 구분 | 내용 |',
    '| --- | --- |',
    ...normalized.map((r) => `| ${r.label} | ${r.value} |`),
  ].join('\n');
}

/** 도입부에 이미 마크다운 표가 있는가 — 중복으로 얹지 않기 위해. */
function alreadyHasTable(introduction: string): boolean {
  return /^\s*\|.*\|\s*$/m.test(String(introduction || ''));
}

/**
 * 도입부 맨 앞에 요약 표를 붙인다.
 *
 * 표는 본문 전에 와야 첫 화면에서 사실이 먼저 보인다. 이미 표가 있으면 건드리지 않는다.
 */
export function prependSummaryTable(introduction: unknown, rows: unknown): string {
  const intro = typeof introduction === 'string' ? introduction.trim() : '';
  const table = renderSummaryTable(rows);
  if (!table) return intro;
  if (alreadyHasTable(intro)) return intro;
  return intro ? `${table}\n\n${intro}` : table;
}
