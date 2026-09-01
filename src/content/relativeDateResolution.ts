/**
 * Resolves publish-date-relative expressions in source material.
 *
 * Korean news writes dates against its own publish date — "오는 17일",
 * "지난 5일", "다음 달 9일". The reader of that article knew when it was
 * written; the model reading it a year later does not, and copies the phrase
 * verbatim. Two live posts shipped that way:
 *
 *   침구  자료 "2025 구스&울 페어 … 오는 17일부터"
 *         본문 "오는 17일부터 … 열리는 행사로 안내됐습니다"  ← 1년 전에 끝난 행사
 *   베란다 자료 "지난 5일 오후 3시를 기점으로 화재 위험경보 상향"
 *         본문 그대로 옮김                                   ← 어느 달의 5일인지 없음
 *
 * The publish date was already attached to every block
 * (sourceFreshness.withFreshnessLabel, "[2026-03-06 작성 · N개월 전]") and the
 * body prompt already tells the model not to copy relative expressions
 * (contentJsonPromptFormat dateBasis). Neither worked: the model has the two
 * numbers but does not do the arithmetic. Models are unreliable at date math —
 * so we do it and write the answer next to the phrase.
 *
 * The original wording is kept and the absolute date is appended in
 * parentheses. Replacing outright would destroy the sentence when our reading
 * is wrong; annotating leaves the model both readings and costs one clause.
 */

/** ISO date (YYYY-MM-DD) → UTC-noon Date, or null when unparseable. */
function parseIso(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/u.exec(String(isoDate || '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isNaN(d.getTime()) ? null : d;
}

function format(d: Date): string {
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** Days in the month that `year`/`monthIndex` names. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
}

/**
 * The most recent day-`day` on or before `from`.
 * "지난 5일" in an article published on the 6th means yesterday, not last month.
 */
function mostRecentDay(from: Date, day: number): Date | null {
  /*
   * 두 달까지 되짚는다. 한 달이면 31일을 놓친다 —
   * 3월 1일 자료의 "지난 31일" 은 2월에 31일이 없으므로 1월 31일이다.
   * 31·30일이 없는 달은 연속으로 오지 않으므로 두 번이면 반드시 찾는다.
   */
  for (let back = 0; back <= 2; back++) {
    const year = from.getUTCFullYear();
    const monthIndex = from.getUTCMonth() - back;
    const probe = new Date(Date.UTC(year, monthIndex, 1, 12));
    if (day > daysInMonth(probe.getUTCFullYear(), probe.getUTCMonth())) continue;
    const candidate = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), day, 12));
    if (candidate.getTime() <= from.getTime()) return candidate;
  }
  return null;
}

/** The next day-`day` strictly after `from`. */
function nextDay(from: Date, day: number): Date | null {
  for (let ahead = 0; ahead <= 2; ahead++) {
    const probe = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + ahead, 1, 12));
    if (day > daysInMonth(probe.getUTCFullYear(), probe.getUTCMonth())) continue;
    const candidate = new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), day, 12));
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  return null;
}

/** Month-level shift, rendered as "YYYY년 M월". */
function shiftMonth(from: Date, delta: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + delta, 1, 12));
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
}

/** Already annotated, or the phrase already carries a year — leave it alone. */
function isAlreadyResolved(text: string, index: number, matchLength: number): boolean {
  return /^\s*\(/u.test(text.slice(index + matchLength, index + matchLength + 3));
}

/**
 * Annotates publish-date-relative expressions with their absolute dates.
 * Returns the text unchanged when the date is missing or unparseable —
 * a wrong annotation is worse than none.
 */
export function annotateRelativeDates(content: string, isoDate: string): string {
  const text = String(content ?? '');
  const base = parseIso(isoDate);
  if (!text || !base) return text;

  let out = text.replace(/(지난|오는)\s*(\d{1,2})일/gu, (match, kind: string, dayStr: string, index: number) => {
    if (isAlreadyResolved(text, index, match.length)) return match;
    const day = Number(dayStr);
    if (!Number.isInteger(day) || day < 1 || day > 31) return match;
    const resolved = kind === '지난' ? mostRecentDay(base, day) : nextDay(base, day);
    return resolved ? `${match}(${format(resolved)})` : match;
  });

  out = out.replace(/(지난달|다음\s*달)/gu, (match, _kind: string, index: number) => {
    if (isAlreadyResolved(out, index, match.length)) return match;
    const delta = match.startsWith('지난') ? -1 : 1;
    return `${match}(${shiftMonth(base, delta)})`;
  });

  return out;
}
