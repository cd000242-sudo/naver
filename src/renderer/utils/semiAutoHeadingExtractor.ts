export interface SemiAutoExtractedHeading {
  title: string;
  content: string;
  prompt: string;
  source: string;
}

export interface SemiAutoExtractedDocument {
  introduction: string;
  headings: SemiAutoExtractedHeading[];
}

export type SemiAutoPublishStructureStrategy = 'body-sections' | 'existing-sections' | 'plain-body';

export interface SemiAutoPublishStructureOptions {
  bodyIsAuthoritative?: boolean;
  existingIntroduction?: string;
}

export interface SemiAutoPublishStructure extends SemiAutoExtractedDocument {
  strategy: SemiAutoPublishStructureStrategy;
  orderLocked: boolean;
}

interface SemiAutoHeadingMatch {
  lineIndex: number;
  title: string;
}

export function isCurrentSemiAutoPasteRevision(
  currentRevision: number,
  expectedRevision: number,
  currentBody: string,
  pastedSnapshot: string,
): boolean {
  return Number(currentRevision) === Number(expectedRevision)
    && String(currentBody) === String(pastedSnapshot);
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

export function isSemiAutoHeadingCandidate(lines: readonly string[], index: number): boolean {
  const raw = String(lines[index] || '').trim();
  if (!raw) return false;
  if (/^(?:#\S+\s*){2,}$/u.test(raw)) return false;
  if (/^(?:A|Q)\d?\s*[:：]/i.test(raw)) return false;
  if (/^[-*•]\s+/.test(raw)) return false;

  const title = normalizeSemiAutoHeadingTitle(raw);
  const hasExplicitHeadingMarker = /^\s{0,3}#{1,4}\s+/.test(raw)
    || /^\s*(?:소제목|제목|heading|section)\s*\d*\s*[:：.\-]/i.test(raw)
    || /^\s*[\[(【]\s*(?:소제목|제목|heading|section)/i.test(raw)
    || /^\s*\d{1,2}\s*[\).:：-]\s+\S/.test(raw);
  if (title.length < (hasExplicitHeadingMarker ? 2 : 3) || title.length > 80) return false;
  if (/^(?:본문|해시태그|태그|요약|마무리)$/u.test(title)) return false;

  if (hasExplicitHeadingMarker && !/[.!?。？！]\s*$/.test(title)) return true;

  const prevBlank = index === 0 || String(lines[index - 1] || '').trim().length === 0;
  const nextNonEmpty = lines.slice(index + 1).find((line) => String(line || '').trim().length > 0)?.trim() || '';
  // 문장/소제목 구분. 정중형 어미(습니다 등)와 마침표 종결은 길이 무관 문장으로 배제한다.
  // 단 평서형 '~다' 종결은 짧은 헤드라인일 수 있어("결국 남는 건 연락 여부다"), 길거나(>22자)
  // 마침표가 있을 때만 문장으로 본다 — 짧고 마침표 없는 '다' 종결은 소제목으로 허용.
  const endsWithPunctuation = /[.!?。？！]\s*$/u.test(title);
  const clearSentenceEnding =
    /(?:습니다|합니다|했어요|해요|하죠|돼요|됩니다|입니다|이에요|예요|이었어요|드립니다)\.?$/u.test(title);
  const strippedForLen = title.replace(/[.!?。？！]\s*$/u, '');
  const longPlainDeclarative =
    /(?:했다|였다|이었다|된다|한다|이다|없다|있다|았다|겠다|린다|간다|온다|난다|[가-힣]다)\.?$/u.test(title)
    && strippedForLen.length > 22;
  const sentenceLike = endsWithPunctuation || clearSentenceEnding || longPlainDeclarative;
  const startsLikeQuote = /^[“"'‘’]/u.test(title);
  const hasHeadingKeyword =
    /(?:이유|지점|부분|질문|핵심|무엇인가|방법|정리|비교|분석|후기|반응|오해|결론|포인트|순서|기준|원인|진짜|체크리스트|루틴)$/u.test(title);

  return prevBlank && nextNonEmpty.length > 0 && !sentenceLike && !startsLikeQuote && (title.length <= 34 || hasHeadingKeyword);
}

function findSemiAutoHeadingMatches(lines: readonly string[]): SemiAutoHeadingMatch[] {
  const matches: SemiAutoHeadingMatch[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    if (!isSemiAutoHeadingCandidate(lines, index)) return;
    const title = normalizeSemiAutoHeadingTitle(line);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) return;
    seen.add(key);
    matches.push({ lineIndex: index, title });
  });

  return matches;
}

export function extractSemiAutoDocumentFromBody(body: string): SemiAutoExtractedDocument {
  const lines = String(body || '').split(/\r?\n/);
  const matches = findSemiAutoHeadingMatches(lines);

  if (matches.length === 0) {
    return { introduction: '', headings: [] };
  }

  const headings = matches.map((match, index) => {
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

  return {
    introduction: lines.slice(0, matches[0].lineIndex).join('\n').trim(),
    headings,
  };
}

export function extractSemiAutoHeadingsFromBody(body: string): SemiAutoExtractedHeading[] {
  return extractSemiAutoDocumentFromBody(body).headings;
}

export function resolveSemiAutoPublishStructure(
  body: string,
  existingHeadings: readonly any[] = [],
  options: SemiAutoPublishStructureOptions = {},
): SemiAutoPublishStructure {
  const normalizedBody = String(body || '').replace(/\r\n/g, '\n').trim();
  const extracted = extractSemiAutoDocumentFromBody(normalizedBody);

  if (extracted.headings.length > 0) {
    return {
      introduction: extracted.introduction,
      headings: extracted.headings.map((heading) => ({ ...heading })),
      strategy: 'body-sections',
      orderLocked: true,
    };
  }

  const completeExistingHeadings = existingHeadings
    .filter((heading) => String(heading?.title || '').trim().length > 0)
    .map((heading) => ({
      ...heading,
      title: String(heading.title || '').trim(),
      content: String(heading.content || heading.summary || '').trim(),
    }));
  const canPreserveExisting = completeExistingHeadings.length > 0
    && completeExistingHeadings.every((heading) => heading.content.length > 0);

  if (options.bodyIsAuthoritative !== true && canPreserveExisting) {
    return {
      introduction: String(options.existingIntroduction || '').trim(),
      headings: completeExistingHeadings,
      strategy: 'existing-sections',
      orderLocked: true,
    };
  }

  // A pasted body with no reliable section markers is safer as one immutable
  // body than as guessed equal chunks. This guarantees that paragraph order is
  // preserved even when stale headings exist from a previously loaded article.
  return {
    introduction: normalizedBody,
    headings: [],
    strategy: 'plain-body',
    orderLocked: true,
  };
}
