export interface SemiAutoExtractedHeading {
  title: string;
  content: string;
  prompt: string;
  source: string;
}

export function normalizeSemiAutoHeadingTitle(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^\s{0,3}#{1,4}\s+/, '')
    .replace(/^\s*(?:소제목|제목|heading|section)\s*\d*\s*[:：.\-]\s*/i, '')
    .replace(/^\s*[\[(【]\s*(?:소제목|제목|heading|section)\s*\d*\s*[\])】]\s*/i, '')
    .replace(/^\s*\d{1,2}\s*[\).:：-]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSemiAutoHeadingCandidate(lines: string[], index: number): boolean {
  const raw = String(lines[index] || '').trim();
  if (!raw) return false;
  if (/^(?:#\S+\s*){2,}$/u.test(raw)) return false;
  if (/^(?:A|Q)\d?\s*[:：]/i.test(raw)) return false;
  if (/^[-*•]\s+/.test(raw)) return false;

  const title = normalizeSemiAutoHeadingTitle(raw);
  if (title.length < 3 || title.length > 80) return false;
  if (/^(?:본문|해시태그|태그|요약|마무리)$/u.test(title)) return false;

  if (/^\s{0,3}#{1,4}\s+/.test(raw)) return true;
  if (/^\s*(?:소제목|제목|heading|section)\s*\d*\s*[:：.\-]/i.test(raw)) return true;
  if (/^\s*[\[(【]\s*(?:소제목|제목|heading|section)/i.test(raw)) return true;
  if (/^\s*\d{1,2}\s*[\).:：-]\s+\S/.test(raw) && !/[.!?。？！]\s*$/.test(title)) return true;

  const prevBlank = index === 0 || String(lines[index - 1] || '').trim().length === 0;
  const nextNonEmpty = lines.slice(index + 1).find((line) => String(line || '').trim().length > 0)?.trim() || '';
  const sentenceLike =
    /(?:습니다|합니다|했어요|돼요|입니다|이에요|예요|했다|였다|된다|이다|다)\.?$/u.test(title) ||
    /[.!?。？！]\s*$/u.test(title);
  const startsLikeQuote = /^[“"'‘’]/u.test(title);
  const hasHeadingKeyword =
    /(?:이유|지점|부분|질문|핵심|무엇인가|방법|정리|비교|분석|후기|반응|오해|결론|포인트|순서|기준|원인|진짜|체크리스트|루틴)$/u.test(title);

  return prevBlank && nextNonEmpty.length > 0 && !sentenceLike && !startsLikeQuote && (title.length <= 34 || hasHeadingKeyword);
}

export function extractSemiAutoHeadingsFromBody(body: string): SemiAutoExtractedHeading[] {
  const lines = String(body || '').split(/\r?\n/);
  const matches: Array<{ lineIndex: number; title: string }> = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    if (!isSemiAutoHeadingCandidate(lines, index)) return;
    const title = normalizeSemiAutoHeadingTitle(line);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) return;
    seen.add(key);
    matches.push({ lineIndex: index, title });
  });

  return matches.map((match, index) => {
    const next = matches[index + 1]?.lineIndex ?? lines.length;
    const content = lines
      .slice(match.lineIndex + 1, next)
      .join('\n')
      .trim();
    return {
      title: match.title,
      content,
      prompt: match.title,
      source: 'semi-auto:manual-body-heading',
    };
  });
}
