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
  /**
   * [2026-08-23] 이미지가 걸려 있는 소제목 제목들. 이미지가 존재한다는 것은 그 소제목이 실재했다는
   * 증거다. 추출도 기존 소제목 슬라이스도 실패했을 때 마지막으로 이 제목들로 본문을 잘라 구조를
   * 되살린다 — 실패하면 이미지가 통째로 빠진 채 발행된다(실측 사고).
   */
  imageHeadingTitles?: readonly string[];
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

/**
 * [v2.11.205] 앞 줄이 문장을 닫았는지 — 소제목은 완결된 문장 뒤에만 온다.
 *
 * 모바일 줄바꿈 보정이 한 문장을 여러 줄로 끊어 저장한 글(v2.11.204 생성분)에서는
 * "그를 보유하고자 하며" 같은 문장 조각이 짧고 마침표가 없다는 이유로 소제목 후보가
 * 됐다(사용자 실측: 본문 일부에 인용구가 씌워짐). 앞 줄이 문장을 닫지 않았으면 그
 * 줄은 이어지는 조각이지 소제목이 아니다.
 *
 * 판정은 관대하게 — 애매하면 "닫았다"로 봐서 기존 동작을 유지한다.
 */
function endsSentence(line: string): boolean {
  const trimmed = String(line || '').trim().replace(/["'’”」』»)\]]+$/u, '');
  if (!trimmed) return true;
  if (/[.!?…。？！:：~〜]$/u.test(trimmed)) return true;
  return /(?:다|요|죠|까|네|군|함|음|임|오|셈|것|중)$/u.test(trimmed);
}

export function isSemiAutoHeadingCandidate(lines: readonly string[], index: number): boolean {
  const raw = String(lines[index] || '').trim();
  if (!raw) return false;
  // [v2.11.140] 마크다운 표 행/구분선(| a | b |, | --- | --- |)은 소제목이 아니다.
  //   빈 줄로 분리된 표 행이 짧다는 이유로 소제목 후보가 되어 표가 소제목으로 쪼개지던 버그
  //   차단(사용자 보고: "표로 바꿔줘야 하는데 소제목으로 인식"). 표는 본문/표 변환기가 처리한다.
  if (/^\|.*\|$/.test(raw)) return false;
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
  // [v2.11.205] 앞 줄이 문장 중간에서 끊겼으면 이 줄은 그 문장의 뒷조각이다.
  //   normalizeReadableBodyText가 모든 줄을 빈 줄로 갈라놓기 때문에 prevBlank는 항상
  //   true라 단독으로는 아무것도 걸러내지 못한다.
  const prevNonEmpty = lines.slice(0, index).reverse().find((line) => String(line || '').trim().length > 0)?.trim() || '';
  const continuesPrevSentence = prevNonEmpty.length > 0 && !endsSentence(prevNonEmpty);
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

  return prevBlank
    && !continuesPrevSentence
    && nextNonEmpty.length > 0
    && !sentenceLike
    && !startsLikeQuote
    && (title.length <= 34 || hasHeadingKeyword);
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

/**
 * Orderly position-slice of the body by known heading titles. Returns null when
 * any title is missing (or out of order), so callers can fall back safely.
 */
function sliceBodyByExistingHeadingTitles(
  body: string,
  titles: readonly string[],
): { introduction: string; sections: Array<{ title: string; content: string }> } | null {
  const positions: Array<{ title: string; at: number }> = [];
  let searchFrom = 0;
  for (const title of titles) {
    const at = body.indexOf(title, searchFrom);
    if (at < 0) return null;
    positions.push({ title, at });
    searchFrom = at + title.length;
  }
  const sections = positions.map((position, index) => {
    const contentStart = position.at + position.title.length;
    const contentEnd = index + 1 < positions.length ? positions[index + 1].at : body.length;
    return { title: position.title, content: body.slice(contentStart, contentEnd).trim() };
  });
  return { introduction: body.slice(0, positions[0].at).trim(), sections };
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

  // [v2.11.140] Sentence-style AI heading titles ("...보도됐습니다") fail the heading
  // candidate filter, so extraction returns 0 even though the titles are real section
  // markers sitting in the body. Wiping to plain-body then published the whole post as
  // one intro blob without subheadings or their images (live incident). When every
  // known title appears in the body in order, position-slice the CURRENT body instead:
  // structure survives and body edits stay authoritative.
  if (completeExistingHeadings.length > 0) {
    const sliced = sliceBodyByExistingHeadingTitles(
      normalizedBody,
      completeExistingHeadings.map((heading) => heading.title),
    );
    if (sliced && sliced.sections.every((section) => section.content.length > 0)) {
      return {
        introduction: sliced.introduction,
        headings: sliced.sections.map((section, index) => ({
          ...completeExistingHeadings[index],
          title: section.title,
          content: section.content,
        })),
        strategy: 'body-sections',
        orderLocked: true,
      };
    }
  }

  // [2026-08-23] 마지막 복구 시도: 이미지가 걸린 소제목 제목으로 본문을 자른다.
  // 사용자가 이미지를 만들어 붙였다는 건 그 소제목이 본문에 실재한다는 뜻이다. 여기서 포기하면
  // 본문이 통짜로 들어가고 이미지 삽입 지점이 0개가 된다(실측: 생성한 이미지 3장이 전부 유실).
  const imageTitles = (options.imageHeadingTitles || [])
    .map((title) => String(title || '').trim())
    .filter((title) => title.length > 0);
  if (imageTitles.length > 0) {
    const slicedByImages = sliceBodyByExistingHeadingTitles(normalizedBody, imageTitles);
    if (slicedByImages && slicedByImages.sections.every((section) => section.content.length > 0)) {
      return {
        introduction: slicedByImages.introduction,
        headings: slicedByImages.sections.map((section) => ({
          title: section.title,
          content: section.content,
          prompt: section.title,
          source: 'publish:image-heading',
        })),
        strategy: 'body-sections',
        orderLocked: true,
      };
    }
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
