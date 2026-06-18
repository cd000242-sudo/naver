/**
 * prePublishAssertion.ts - last-gate inspection right before the publish click.
 *
 * R2 of SPEC-STABILITY-2026: OBSERVATION MODE — it logs what the editor
 * actually contains versus what the flow planned, and never blocks a publish.
 * R6 flips failing checks to a hard block once field false-positive data is in.
 */
import type { Frame } from 'puppeteer';

export interface PrePublishExpectations {
  minBodyChars: number;
  expectedImageMin: number;
  expectedLinkCardMin: number;
  expectedDividerMin: number;
  forbiddenMarkers?: string[];
  /** Hashtags the tail stage typed — each must appear in the editor body. */
  expectedHashtags?: string[];
}

export interface PrePublishStats {
  bodyChars: number;
  imageCount: number;
  linkCardCount: number;
  dividerCount: number;
  leakedMarkers: string[];
  /** Raw editor text — used for hashtag presence (optional for old callers). */
  bodyText?: string;
  /** Where the body text came from, for publish-gate diagnostics. */
  bodySource?: string;
  /** Candidate lengths used when choosing the most complete editor snapshot. */
  bodyCandidateChars?: {
    componentText: number;
    rootText: number;
    fallbackText: number;
  };
}

export interface PrePublishCheck {
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
}

export interface PrePublishReport {
  pass: boolean;
  checks: PrePublishCheck[];
}

export interface PrePublishBodyCandidates {
  componentText?: string;
  rootText?: string;
  fallbackText?: string;
}

export interface SelectedPrePublishBody {
  text: string;
  source: 'component-text' | 'root-text' | 'fallback-text' | 'empty';
}

export interface HashtagPresenceDiagnostic {
  tag: string;
  hashPresent: boolean;
  plainPresent: boolean;
}

export interface HashtagPresenceDiagnostics {
  expectedHashtags: string[];
  missingHashtags: string[];
  bodyHashtagStatus: HashtagPresenceDiagnostic[];
  plainOccurrences: string[];
  bodyChars: number;
  bodySource?: string;
  bodyTail: string;
  probableCause: string;
}

const IMAGE_SOURCE_FIELDS = [
  'filePath',
  'savedToLocal',
  'url',
  'thumbnailUrl',
  'previewDataUrl',
  'dataUrl',
  'path',
] as const;

const SMART_EDITOR_ROOT_SELECTORS = [
  'article.se-components-wrap',
  '.se-canvas > article.se-components-wrap',
  '.se-content article.se-components-wrap',
  '.se-components-wrap',
  '.se-main-container',
] as const;

// Do not include `.se-panel`: current SmartEditor can wrap the document
// canvas in it, and excluding it makes the publish gate read an empty body.
const SMART_EDITOR_PANEL_SELECTOR = '.se-popup, .se-layer, .se-modal, [role="dialog"], [aria-modal="true"]';

const EDITOR_CHROME_ONLY_TEXT_MARKERS = [
  '사진 편집',
  '문서 너비',
  'AI 사용 설정',
  '사진 설명을 입력하세요',
  '대표',
  '작게',
  '크게',
  '마이박스',
  '템플릿',
  '라이브러리',
] as const;

export const DEFAULT_FORBIDDEN_MARKERS = [
  '[원본 텍스트]',
  '[Article Content]',
  '[구분선]',
  '[제목]',
  '[본문]',
  '[해시태그]',
];

export function findLeakedMarkers(
  text: string,
  markers: string[] = DEFAULT_FORBIDDEN_MARKERS
): string[] {
  const leaked = markers.filter((marker) => text.includes(marker));
  if (/\[자료\s*\d+\]/.test(text)) leaked.push('[자료N]');
  return leaked;
}

export function countExpectedPublishImages(images: unknown): number {
  if (!Array.isArray(images)) return 0;

  return images.filter((image) => {
    if (typeof image === 'string') return image.trim().length > 0;
    if (!image || typeof image !== 'object') return false;

    const record = image as Record<string, unknown>;
    if (record.skip === true || record.failed === true) return false;

    return IMAGE_SOURCE_FIELDS.some((field) => {
      const value = record[field];
      return typeof value === 'string' && value.trim().length > 0;
    });
  }).length;
}

export function evaluatePrePublishReport(
  stats: PrePublishStats,
  expectations: PrePublishExpectations
): PrePublishReport {
  const checks: PrePublishCheck[] = [
    {
      name: 'body-min-chars',
      pass: stats.bodyChars >= expectations.minBodyChars,
      expected: `>= ${expectations.minBodyChars}`,
      actual: String(stats.bodyChars),
    },
    {
      name: 'image-count',
      pass: stats.imageCount >= expectations.expectedImageMin,
      expected: `>= ${expectations.expectedImageMin}`,
      actual: String(stats.imageCount),
    },
    {
      name: 'link-card-count',
      pass: stats.linkCardCount >= expectations.expectedLinkCardMin,
      expected: `>= ${expectations.expectedLinkCardMin}`,
      actual: String(stats.linkCardCount),
    },
    {
      name: 'divider-count',
      pass: stats.dividerCount >= expectations.expectedDividerMin,
      expected: `>= ${expectations.expectedDividerMin}`,
      actual: String(stats.dividerCount),
    },
    {
      name: 'marker-leak',
      pass: stats.leakedMarkers.length === 0,
      expected: 'none',
      actual: stats.leakedMarkers.join(', ') || 'none',
    },
  ];

  // 2026-06-11 live incident: hashtags were typed (log confirmed) but the
  // published post had none — the tail landed outside the component model.
  // Presence in the editor body is the closest pre-publish signal we have.
  const expectedHashtags = expectations.expectedHashtags || [];
  if (expectedHashtags.length > 0) {
    const missing = getMissingExpectedHashtags(stats, expectations);
    checks.push({
      name: 'hashtag-presence',
      pass: missing.length === 0,
      expected: `${expectedHashtags.length}개 본문 포함`,
      actual: missing.length === 0 ? 'all present' : `누락: ${missing.join(', ')}`,
    });
  }

  return { pass: checks.every((check) => check.pass), checks };
}

export function getMissingExpectedHashtags(
  stats: PrePublishStats,
  expectations: Pick<PrePublishExpectations, 'expectedHashtags'>
): string[] {
  const bodyText = stats.bodyText || '';
  return getExpectedHashtagNames(expectations)
    .filter((name) => name.length > 0 && !bodyText.includes(`#${name}`));
}

export function getExpectedHashtagNames(
  expectations: Pick<PrePublishExpectations, 'expectedHashtags'>
): string[] {
  const seen = new Set<string>();
  return (expectations.expectedHashtags || [])
    .map((tag) => String(tag).replace(/^#/, '').trim())
    .filter((name) => {
      if (name.length === 0) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getHashtagPresenceDiagnostics(
  stats: PrePublishStats,
  expectations: Pick<PrePublishExpectations, 'expectedHashtags'>
): HashtagPresenceDiagnostics {
  const bodyText = stats.bodyText || '';
  const expectedHashtags = getExpectedHashtagNames(expectations);
  const bodyHashtagStatus = expectedHashtags.map((tag) => ({
    tag,
    hashPresent: bodyText.includes(`#${tag}`),
    plainPresent: bodyText.includes(tag),
  }));
  const missingHashtags = bodyHashtagStatus
    .filter((status) => !status.hashPresent)
    .map((status) => status.tag);
  const plainOccurrences = bodyHashtagStatus
    .filter((status) => !status.hashPresent && status.plainPresent)
    .map((status) => status.tag);
  const bodyTail = bodyText.slice(-700);

  let probableCause = 'ok';
  if (expectedHashtags.length === 0) {
    probableCause = 'no-expected-hashtags';
  } else if (missingHashtags.length === 0) {
    probableCause = 'all-hashtags-present';
  } else if (isEditorChromeOnlyText(bodyText, stats.bodyChars)) {
    probableCause = 'editor-chrome-selected-instead-of-body';
  } else if (!bodyText.trim()) {
    probableCause = 'editor-body-not-readable';
  } else if (
    bodyTail.includes('추가할 컴포넌트를 선택하세요') ||
    bodyTail.includes('사진 라이브러리') ||
    bodyTail.includes('현재 문서구매 목록')
  ) {
    probableCause = 'editor-insert-panel-active';
  } else if (plainOccurrences.length > 0) {
    probableCause = 'hash-prefix-lost-or-plain-text-only';
  } else if (bodyTail.includes('http://') || bodyTail.includes('https://')) {
    probableCause = 'cursor-stayed-near-link-card-or-tail-not-after-card';
  } else {
    probableCause = 'hashtag-tail-not-inserted-or-focus-lost';
  }

  return {
    expectedHashtags,
    missingHashtags,
    bodyHashtagStatus,
    plainOccurrences,
    bodyChars: stats.bodyChars,
    bodySource: stats.bodySource,
    bodyTail,
    probableCause,
  };
}

export function formatHashtagPresenceDiagnostics(
  stats: PrePublishStats,
  expectations: Pick<PrePublishExpectations, 'expectedHashtags'>
): string {
  return `HASHTAG_DEBUG:${JSON.stringify(getHashtagPresenceDiagnostics(stats, expectations))}`;
}

export function isEditorBodyUnreadable(stats: PrePublishStats | null | undefined): boolean {
  if (!stats) return false;
  const text = (stats.bodyText || '').trim();
  return (
    stats.bodyChars === 0 &&
    !text &&
    stats.imageCount === 0 &&
    stats.linkCardCount === 0 &&
    stats.dividerCount === 0
  ) || isEditorChromeOnlyText(text, stats.bodyChars);
}

export function isEditorChromeOnlyText(text: string, bodyChars = text.replace(/\s+/g, ' ').trim().length): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  if (bodyChars > 450) return false;

  const markerHits = EDITOR_CHROME_ONLY_TEXT_MARKERS
    .filter((marker) => normalized.includes(marker))
    .length;

  return markerHits >= 2;
}

// [SPEC-STABILITY-2026 R6] 단계적 차단: 의미가 에디터 안에서 결정되는 검사만
// 차단 대상. 링크카드/구분선은 네이버 서버 변환에 의존해 오탐 여지가 있어
// 라이브 오탐 데이터가 쌓일 때까지 관찰 유지.
export function selectPrePublishBodyText(
  candidates: PrePublishBodyCandidates
): SelectedPrePublishBody {
  const ranked = [
    { source: 'component-text' as const, text: candidates.componentText || '' },
    { source: 'root-text' as const, text: candidates.rootText || '' },
    { source: 'fallback-text' as const, text: candidates.fallbackText || '' },
  ]
    .map((candidate) => ({
      ...candidate,
      normalizedLength: candidate.text.replace(/\s+/g, ' ').trim().length,
    }))
    .filter((candidate) => candidate.normalizedLength > 0)
    .sort((left, right) => right.normalizedLength - left.normalizedLength);

  const best = ranked[0];
  return best
    ? { text: best.text, source: best.source }
    : { text: '', source: 'empty' };
}

export const BLOCKING_CHECKS: ReadonlySet<string> = new Set([
  'body-min-chars',
  'image-count',
  'marker-leak',
]);

export function getBlockingFailures(report: PrePublishReport): PrePublishCheck[] {
  return report.checks.filter((check) => !check.pass && BLOCKING_CHECKS.has(check.name));
}

export function formatPrePublishReport(report: PrePublishReport): string {
  const passCount = report.checks.filter((check) => check.pass).length;
  const blocking = getBlockingFailures(report).length;
  const header =
    `[PrePublish] 발행 전 검사 ${passCount}/${report.checks.length} 통과` +
    (report.pass ? '' : blocking > 0 ? ' — 누락 감지! (차단 검사 실패)' : ' — 누락 의심! (관찰 항목: 발행은 진행)');
  const lines = report.checks.map(
    (check) => `${check.pass ? '✅' : '❌'} ${check.name}: 기대 ${check.expected} / 실제 ${check.actual}`
  );
  return [header, ...lines].join('\n   ');
}

export async function collectPrePublishStats(
  frame: Frame,
  markers: string[] = DEFAULT_FORBIDDEN_MARKERS
): Promise<PrePublishStats> {
  const raw = await frame.evaluate(({ rootSelectors, panelSelector, chromeMarkers }) => {
    function isVisibleElement(element: Element): boolean {
      if (!(element instanceof HTMLElement)) return false;
      if (element.closest(panelSelector)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    function normalizeText(value: string): string {
      return value.replace(/\s+/g, ' ').trim();
    }

    function looksLikeEditorChromeOnly(value: string): boolean {
      const normalized = normalizeText(value);
      if (!normalized || normalized.length > 450) return false;
      const markerHits = chromeMarkers.filter((marker: string) => normalized.includes(marker)).length;
      return markerHits >= 2;
    }

    function isDocumentTextElement(element: Element): boolean {
      if (!(element instanceof HTMLElement)) return false;
      if (!isVisibleElement(element)) return false;
      if (element.closest('.se-section-documentTitle, .se-documentTitle, [data-name="documentTitle"]')) return false;
      if (element.closest('.se-toolbar, .se-floating-toolbar, .se-property-panel, .se-image-setting, .se-image-toolbar')) return false;
      if (element.closest('button, [role="button"], [role="toolbar"], nav, header, footer')) return false;
      return true;
    }

    function collectDocumentComponentText(scope: ParentNode): string {
      const selectors = [
        '.se-component-text .se-text-paragraph',
        '.se-component-text .se-module-text',
        '.se-section-text .se-text-paragraph',
        '.se-section-text .se-module-text',
        '.se-component-text [contenteditable="true"]',
        '.se-module-text',
        '.se-text-paragraph',
      ].join(',');
      const seen = new Set<string>();
      return Array.from(scope.querySelectorAll(selectors))
        .filter(isDocumentTextElement)
        .map((el) => ((el as HTMLElement).innerText || el.textContent || '').trim())
        .filter(Boolean)
        .filter((text) => !looksLikeEditorChromeOnly(text))
        .filter((text) => {
          const key = normalizeText(text);
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .join('\n');
    }

    function getSmartEditorDocumentRoot(): HTMLElement | null {
      const candidates = Array.from(document.querySelectorAll(rootSelectors.join(','))) as HTMLElement[];
      let best: HTMLElement | null = null;
      let bestScore = -1;
      for (const candidate of candidates) {
        if (!isVisibleElement(candidate)) continue;
        const componentCount = candidate.querySelectorAll('.se-component').length;
        const paragraphCount = candidate.querySelectorAll('.se-text-paragraph, p').length;
        const textLength = (candidate.innerText || candidate.textContent || '').trim().length;
        const roleScore = candidate.matches('article.se-components-wrap')
          ? 1000000
          : candidate.matches('.se-components-wrap')
            ? 900000
            : candidate.matches('.se-main-container')
              ? 100000
              : 0;
        const score = roleScore + componentCount * 1000 + paragraphCount * 100 + Math.min(textLength, 2000);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      return best;
    }

    const root = getSmartEditorDocumentRoot();
    const rootText = root?.innerText || root?.textContent || '';
    const componentText = collectDocumentComponentText(root || document);
    const cleanRootText = looksLikeEditorChromeOnly(rootText) ? '' : rootText;
    const fallbackText = !componentText.trim() && !cleanRootText.trim()
      ? Array.from(document.querySelectorAll([
        '.se-section-text',
        '.se-module-text',
        '.se-text-paragraph',
        '.se-component-text',
        '[contenteditable="true"]',
      ].join(',')))
        .filter(isDocumentTextElement)
        .map((el) => ((el as HTMLElement).innerText || el.textContent || '').trim())
        .filter(Boolean)
        .filter((text) => !looksLikeEditorChromeOnly(text))
        .filter((text, index, all) => all.indexOf(text) === index)
        .join('\n')
      : '';
    const searchScope: ParentNode = root || document;

    const imageCount = Array.from(searchScope.querySelectorAll(
      'img.se-image-resource, .se-module-image img, .se-component-image img'
    )).filter((el) => isVisibleElement(el)).length;

    // Same selector pool as waitForLinkCard; dedup nested matches by their
    // component root so one card never counts twice.
    const linkSelectors = [
      '.se-oglink',
      '.se-module-oglink',
      '.se-oembed',
      '.se-module-oembed',
      '.se-link-preview',
      '[data-module="oglink"]',
      '.se-section-oglink',
    ];
    const cardRoots = new Set<Element>();
    for (const selector of linkSelectors) {
      searchScope.querySelectorAll(selector).forEach((el) => {
        if (!isVisibleElement(el)) return;
        cardRoots.add(el.closest('.se-component') || el);
      });
    }

    const dividerSourceText = [componentText, cleanRootText, fallbackText]
      .sort((left, right) => normalizeText(right).length - normalizeText(left).length)[0] || '';
    const dividerTextRuns = (dividerSourceText.match(/━{10,}/g) || []).length;
    const dividerComponents = Array.from(searchScope.querySelectorAll(
      '[class*="horizontalLine"], [class*="horizontal-line"], hr'
    )).filter((el) => isVisibleElement(el)).length;

    return {
      componentText,
      rootText: cleanRootText,
      fallbackText,
      imageCount,
      linkCardCount: cardRoots.size,
      dividerCount: dividerTextRuns + dividerComponents,
    };
  }, {
    rootSelectors: [...SMART_EDITOR_ROOT_SELECTORS],
    panelSelector: SMART_EDITOR_PANEL_SELECTOR,
    chromeMarkers: [...EDITOR_CHROME_ONLY_TEXT_MARKERS],
  });
  const selectedBody = selectPrePublishBodyText(raw);
  const normalizedLength = (text: string): number => text.replace(/\s+/g, ' ').trim().length;

  return {
    bodyChars: normalizedLength(selectedBody.text),
    imageCount: raw.imageCount,
    linkCardCount: raw.linkCardCount,
    dividerCount: raw.dividerCount,
    leakedMarkers: findLeakedMarkers(selectedBody.text, markers),
    bodyText: selectedBody.text,
    bodySource: selectedBody.source,
    bodyCandidateChars: {
      componentText: normalizedLength(raw.componentText),
      rootText: normalizedLength(raw.rootText),
      fallbackText: normalizedLength(raw.fallbackText),
    },
  };
}
