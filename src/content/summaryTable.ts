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
 * [2026-09-15 사장님 화면] 발행글 첫 화면에 이런 표가 나갔다:
 *   | 검색 상태 | 검색 결과를 수집하지 못했습니다. |
 *   | 화면 표기 | Google News 주제 불일치 유사도 5% |
 *   | 연도 표기 | 2026년·2025년 귀속·2024년·2023년 |
 *
 * 크롤링이 전부 실패한 글이라 모델에게 줄 사실이 없었고, 모델은 **재료의 실패 메시지와
 * 프롬프트 규칙**을 표 칸에 옮겨 적었다. 재료 쪽은 sourceAssembler 에서 막았지만,
 * 여기서도 막는다 — 도구의 상태·표기 규칙은 독자가 읽을 사실이 아니다.
 *
 * 한 낱말 목록이 아니라 **모양**으로 거른다: 수집/검색 상태, 유사도 수치, 주제 불일치,
 * 그리고 "…표기" 처럼 글의 내용이 아니라 글의 표기를 가리키는 라벨.
 */
const PROCESS_VALUE = /검색\s?결과|수집(?:하지\s?못|되지\s?않|\s?실패|\s?불가)|유사도\s*\d+\s*%|주제\s?불일치|자료(?:\s?없음|\s?부족|가\s?없)|프롬프트/;
const PROCESS_LABEL = /^(?:검색|수집|크롤링)\s?(?:상태|결과)$|표기$|프롬프트|내부\s?상태/;

export function isProcessNoiseRow(label: string, value: string): boolean {
  return PROCESS_LABEL.test(label.trim()) || PROCESS_VALUE.test(value) || PROCESS_VALUE.test(label);
}

/**
 * 쓸 수 있는 행만 남긴다.
 *
 * 라벨이 전부 같으면(예: "핵심"×4) 정보가 0이므로 표 자체를 버린다 — 그런 표는
 * 첫 화면만 차지하고 독자에게 아무것도 주지 않는다.
 * 도구의 상태를 적은 행도 같은 이유로 버린다. 그렇게 해서 남는 행이 2개 미만이면 표가 통째로 사라진다 —
 * 사장님 말대로 "이렇게 나올 거면 안 나오는 게 낫다".
 */
export function normalizeSummaryRows(rows: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const out: Array<{ label: string; value: string }> = [];
  for (const row of rows) {
    const label = text((row as SummaryTableRow)?.label);
    const value = text((row as SummaryTableRow)?.value);
    if (!label || !value) continue;
    if (isProcessNoiseRow(label, value)) continue;

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
 * 도입부 **뒤에** 요약 표를 붙인다. (2026-09-16)
 *
 * 사장님이 원하는 순서:
 *   제목 → 썸네일 → 도입부 글 → 요약표 → 1번 소제목
 * 예전에는 도입부 앞에 붙여서 썸네일 바로 아래에 표가 왔다:
 *   제목 → 썸네일 → **표** → 도입부 글 → 1번 소제목
 *
 * 표는 도입부가 상황을 세운 **다음**에 와야 읽힌다 — 상황을 모르는 채로 표부터 보면 숫자의 뜻을 모른다.
 * 첫 화면에서 사실이 보인다는 목적은 도입부가 짧기 때문에 그대로 유지된다.
 * 이미 표가 있으면 건드리지 않는다.
 */
export function appendSummaryTable(introduction: unknown, rows: unknown): string {
  const intro = typeof introduction === 'string' ? introduction.trim() : '';
  const table = renderSummaryTable(rows);
  if (!table) return intro;
  if (alreadyHasTable(intro)) return intro;
  return intro ? `${intro}\n\n${table}` : table;
}
