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

/**
 * [2026-08-30] 썸네일은 본문에 글자로 존재하지 않는 가짜 소제목이다.
 *
 * ImageManager 는 썸네일을 '🖼️ 썸네일' 키로 들고 있어서, 이미지 소제목 목록에 그대로
 * 섞여 들어온다. 아래 앵커 슬라이스는 "모든 제목이 본문에 순서대로 있어야 한다"를
 * 요구하므로, 본문에 있을 수 없는 이 한 줄이 복구를 통째로 무산시켰다(실측: URL 로
 * 이미지를 수집해 붙였는데 "넣을 자리를 찾지 못했습니다" 경고 반복).
 */
export function isNonBodyImageHeading(title: string): boolean {
  const normalized = String(title || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  return /썸네일/.test(normalized) || /^대표\s*이미지$/.test(normalized);
}

/**
 * 본문에 실제로 있는 제목만 순서대로 앵커로 쓴다.
 *
 * 전부 있어야만 자르는 규칙(sliceBodyByExistingHeadingTitles)은 순서 무결성을 지키려는
 * 것이지만, 사용자가 소제목 한 줄을 지웠거나 썸네일 같은 가짜 제목이 섞이면 남은 진짜
 * 앵커까지 버려 이미지 삽입 지점이 0개가 된다. 본문에서 확인된 제목은 추측이 아니라
 * 증거이므로, 확인된 것만으로 자른다.
 */
function sliceBodyByAvailableTitles(
  body: string,
  titles: readonly string[],
): { introduction: string; sections: Array<{ title: string; content: string }> } | null {
  const positions: Array<{ title: string; at: number }> = [];
  let searchFrom = 0;
  for (const title of titles) {
    const at = body.indexOf(title, searchFrom);
    if (at < 0) continue;
    positions.push({ title, at });
    searchFrom = at + title.length;
  }
  if (positions.length === 0) return null;

  const sections = positions.map((position, index) => {
    const contentStart = position.at + position.title.length;
    const contentEnd = index + 1 < positions.length ? positions[index + 1].at : body.length;
    return { title: position.title, content: body.slice(contentStart, contentEnd).trim() };
  });
  return { introduction: body.slice(0, positions[0].at).trim(), sections };
}

/**
 * [2026-08-25] 추출이 일부만 잡았을 때, 아는 제목으로 본문을 잘라 구조를 되살린다.
 *
 * 되살린 결과가 추출보다 많을 때만 채택한다 — 같거나 적으면 추측을 뒤집을 이유가 없다.
 * 제목이 본문에 순서대로 전부 있고 각 구간에 내용이 있을 때만 성립하므로, 근거 없이
 * 구조를 만들어내지 않는다.
 */
function recoverStructureFromKnownTitles(
  body: string,
  extractedCount: number,
  titleSets: ReadonlyArray<readonly string[]>,
  existingHeadings: readonly any[],
): SemiAutoPublishStructure | null {
  for (const titles of titleSets) {
    if (titles.length <= extractedCount) continue;

    const sliced = sliceBodyByExistingHeadingTitles(body, titles);
    if (!sliced) continue;
    if (!sliced.sections.every((section) => section.content.length > 0)) continue;

    return {
      introduction: sliced.introduction,
      headings: sliced.sections.map((section) => {
        const previous = existingHeadings.find(
          (heading) => String(heading?.title || '').trim() === section.title,
        );
        return {
          ...(previous || {}),
          title: section.title,
          content: section.content,
          prompt: String(previous?.prompt || section.title),
          source: String(previous?.source || 'publish:known-heading-recovery'),
        };
      }),
      strategy: 'body-sections',
      orderLocked: true,
    };
  }
  return null;
}

/**
 * [2026-09-03 사장님 라이브] "이미지 5개가 준비돼 있는데 본문에서 넣을 자리(소제목)를 찾지 못했습니다".
 * 표 적용(applyPendingArticleTables)·페러프레이징 경로는 _preferBodyPlain 을 세워 텍스트 상자를 bodyPlain 으로
 * 채우는데, 생성기의 bodyPlain 은 소제목 제목 줄이 없다(실측 0/5). 제목이 하나도 없는 본문은 편집본이 아니라
 * 제목 없이 조립된 본문이다 — 그때는 소제목 데이터가 증거다.
 */
export function bodyLacksAllHeadingTitles(body: unknown, headings: readonly any[]): boolean {
  const text = String(body || '');
  const titles = (headings || []).map((heading) => String(heading?.title || '').trim()).filter((title) => title.length >= 2);
  if (titles.length === 0) return false;
  return titles.every((title) => !text.includes(title));
}

/**
 * 본문이 "제목 줄만 빠진 소제목 재조립" 인가 — 제목은 전무하고 각 소제목의 content 가 본문에 순서대로 있다.
 * 사용자가 새로 쓴 본문(v2.11.140 계약: plain-body 유지)과 구분하는 기준이다. 내용까지 같으면 편집본이 아니다.
 */
export function bodyIsTitlelessReconstruction(body: unknown, headings: readonly any[]): boolean {
  if (!bodyLacksAllHeadingTitles(body, headings)) return false;
  const collapse = (value: unknown): string => String(value || '').replace(/\s+/g, ' ').trim();
  const text = collapse(body);
  let cursor = 0;
  for (const heading of headings || []) {
    const content = collapse(heading?.content || heading?.summary || '');
    if (!content) return false;
    const probe = content.length > 60 ? content.slice(0, 60) : content;
    const at = text.indexOf(probe, cursor);
    if (at < 0) return false;
    cursor = at + probe.length;
  }
  return true;
}

export function resolveSemiAutoPublishStructure(
  body: string,
  existingHeadings: readonly any[] = [],
  options: SemiAutoPublishStructureOptions = {},
): SemiAutoPublishStructure {
  const normalizedBody = String(body || '').replace(/\r\n/g, '\n').trim();
  const extracted = extractSemiAutoDocumentFromBody(normalizedBody);

  const knownExistingTitles = existingHeadings
    .map((heading) => String(heading?.title || '').trim())
    .filter((title) => title.length > 0);
  const knownImageTitles = (options.imageHeadingTitles || [])
    .map((title) => String(title || '').trim())
    .filter((title) => title.length > 0 && !isNonBodyImageHeading(title));

  if (extracted.headings.length > 0) {
    /*
     * [2026-08-25 사용자 실측] 소제목 여러 개짜리 글을 발행했더니 일부만 살아남고,
     * 사라진 소제목에 걸려 있던 이미지가 전부 글 끝으로 쏠린 채 삽입되지 않았다.
     *
     * 아래 복구 사다리(기존 소제목 슬라이스 / 이미지 소제목 슬라이스)는 추출이 0개일 때만
     * 돌았다. 추출 휴리스틱은 34자를 넘고 특정 어미로 끝나지 않는 제목을 조용히 버리므로
     * "일부만 잡히는" 경우가 오히려 흔하다. 하나라도 잡히면 그대로 확정해 버려서 나머지
     * 소제목과 그 이미지 슬롯이 통째로 사라졌다.
     *
     * 추출은 추측이고 기존/이미지 소제목은 증거다. 증거가 더 많고 본문에서 순서대로 전부
     * 확인되면 증거를 쓴다. 확인되지 않으면 추측을 그대로 둔다(기존 동작 유지).
     */
    const recovered = recoverStructureFromKnownTitles(
      normalizedBody,
      extracted.headings.length,
      [knownExistingTitles, knownImageTitles],
      existingHeadings,
    );
    if (recovered) return recovered;

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

  // [2026-09-03] 본문이 권위여도 제목 줄만 빠진 재조립(내용은 소제목과 동일)이면 편집본이 아니다 — 소제목 데이터를 쓴다. 새로 쓴 본문은 v2.11.140 대로 plain-body.
  if (options.bodyIsAuthoritative === true && canPreserveExisting && bodyIsTitlelessReconstruction(normalizedBody, completeExistingHeadings)) {
    return {
      introduction: String(options.existingIntroduction || '').trim(),
      headings: completeExistingHeadings,
      strategy: 'existing-sections',
      orderLocked: true,
    };
  }
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
    .filter((title) => title.length > 0 && !isNonBodyImageHeading(title));
  if (imageTitles.length > 0) {
    const slicedByImages = sliceBodyByAvailableTitles(normalizedBody, imageTitles);
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
