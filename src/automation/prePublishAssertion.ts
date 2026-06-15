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

const IMAGE_SOURCE_FIELDS = [
  'filePath',
  'savedToLocal',
  'url',
  'thumbnailUrl',
  'previewDataUrl',
  'dataUrl',
  'path',
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
    const bodyText = stats.bodyText || '';
    const missing = expectedHashtags.filter((tag) => {
      const name = String(tag).replace(/^#/, '').trim();
      return name.length > 0 && !bodyText.includes(`#${name}`);
    });
    checks.push({
      name: 'hashtag-presence',
      pass: missing.length === 0,
      expected: `${expectedHashtags.length}개 본문 포함`,
      actual: missing.length === 0 ? 'all present' : `누락: ${missing.join(', ')}`,
    });
  }

  return { pass: checks.every((check) => check.pass), checks };
}

// [SPEC-STABILITY-2026 R6] 단계적 차단: 의미가 에디터 안에서 결정되는 검사만
// 차단 대상. 링크카드/구분선은 네이버 서버 변환에 의존해 오탐 여지가 있어
// 라이브 오탐 데이터가 쌓일 때까지 관찰 유지.
export const BLOCKING_CHECKS: ReadonlySet<string> = new Set([
  'body-min-chars',
  'image-count',
  'marker-leak',
  'hashtag-presence',
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
  const raw = await frame.evaluate(() => {
    const root =
      (document.querySelector('.se-main-container') as HTMLElement | null) || document.body;
    const text = root?.innerText || root?.textContent || '';

    const imageCount = document.querySelectorAll(
      'img.se-image-resource, .se-module-image img, .se-component-image img'
    ).length;

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
      document.querySelectorAll(selector).forEach((el) => {
        cardRoots.add(el.closest('.se-component') || el);
      });
    }

    const dividerTextRuns = (text.match(/━{10,}/g) || []).length;
    const dividerComponents = document.querySelectorAll(
      '[class*="horizontalLine"], [class*="horizontal-line"], hr'
    ).length;

    return {
      text,
      imageCount,
      linkCardCount: cardRoots.size,
      dividerCount: dividerTextRuns + dividerComponents,
    };
  });

  return {
    bodyChars: raw.text.replace(/\s+/g, ' ').trim().length,
    imageCount: raw.imageCount,
    linkCardCount: raw.linkCardCount,
    dividerCount: raw.dividerCount,
    leakedMarkers: findLeakedMarkers(raw.text, markers),
    bodyText: raw.text,
  };
}
