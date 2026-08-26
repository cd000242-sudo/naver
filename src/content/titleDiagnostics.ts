/**
 * Title diagnostics — makes the material behind a title visible in the log.
 *
 * [2026-08-27 Phase 0] A homefeed title scored 100/100 and the owner said it would not
 * make him click. He is right and the scorer is wrong: 96% of that 100 is hygiene
 * (length ok, keyword present, no banned ending) and only 4 points come from any measure
 * of pull.
 *
 * Before building a better scorer we have to know which link fails, and right now nothing
 * in the log can tell us:
 *   - `preWritingAnalysis.clickReason` is generated and then dropped by the parser
 *   - the two rejected candidates and their `whyClick` are never printed
 *
 * So a weak title could mean weak material or good material poorly used, and we cannot
 * tell them apart. This prints both so a handful of real articles settles the question.
 *
 * Pure and total: builds lines, never logs, never throws.
 */

const MAX_LINE = 160;

const clip = (value: unknown, limit: number): string => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

const sameTitle = (a: string, b: string): boolean =>
  a.replace(/\s+/g, '') === b.replace(/\s+/g, '');

/**
 * One block of diagnostic lines, or an empty array when there is nothing to report.
 *
 * Order matters: the declared click reason comes first because every candidate is
 * supposed to descend from it — reading it first makes a drifting title obvious.
 */
export function buildTitleDiagnosticsLines(content: unknown): string[] {
  try {
    if (!content || typeof content !== 'object') return [];
    const record = content as Record<string, any>;

    const analysis = record.preWritingAnalysis;
    const reason = analysis && typeof analysis === 'object'
      ? clip(analysis.clickReason ?? analysis.stopReason, 110)
      : '';

    const rawCandidates = Array.isArray(record.titleCandidates) ? record.titleCandidates : [];
    const selected = clip(record.selectedTitle ?? record.title, 90);

    const lines: string[] = [];
    if (reason) lines.push(`[TitleDiag] 클릭 사유: ${reason}`);

    rawCandidates.slice(0, 5).forEach((candidate: any, index: number) => {
      const text = clip(candidate?.text, 60);
      if (!text) return;
      const why = clip(candidate?.whyClick, 50);
      const mark = selected && sameTitle(text, selected) ? ' ◀ 선택' : '';
      // 길이를 함께 적는다 — 계약(모드별 상한) 위반이 눈에 바로 보이게.
      lines.push(
        `[TitleDiag] 후보${index + 1} (${text.length}자)${mark}: ${text}`
        + (why ? ` — ${why}` : ''),
      );
    });

    // 후보에 없는 제목이 선택된 경우(패치·잠금 경로)도 보이게 한다.
    if (selected && !rawCandidates.some((c: any) => sameTitle(clip(c?.text, 60), selected))) {
      lines.push(`[TitleDiag] 최종 (${selected.length}자) ◀ 후보 밖: ${selected}`);
    }

    return lines.map((line) => (line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line));
  } catch {
    return []; // 진단 실패로 생성을 막지 않는다.
  }
}
