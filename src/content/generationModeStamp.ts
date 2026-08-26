/**
 * Records which content mode produced an article, and reports a publish-time mismatch.
 *
 * [2026-08-26] Content had no memory of its own mode. Every publish-time contract —
 * hashtag ceilings, title rules — reads `runOptions.contentMode`, which is whatever the
 * UI selector happens to show *now*, not what generated the article. A homefeed piece
 * (3~7 tags) reloaded while the selector sits on SEO (10~15) is clamped by the wrong
 * ceiling, silently. The ceilings only became mode-aware this release, so this gap is new.
 *
 * The stamp reports; it never decides. Switching modes deliberately before publishing is
 * a legitimate thing to do, so this must not block or rewrite anything.
 */

/** Field name kept `__`-prefixed so it travels with the object but is never rendered. */
const STAMP_FIELD = '__generatedMode';

const MODE_LABELS: Record<string, string> = {
  seo: 'SEO',
  homefeed: '홈판',
  affiliate: '쇼핑커넥트',
  business: '업체홍보',
  mate: '메이트',
  custom: '직접입력',
};

const labelOf = (mode: string): string => MODE_LABELS[mode] || mode;

/**
 * Writes the generating mode onto the content, once.
 *
 * Never overwrites: the first stamp is the one made at generation, and any later
 * caller is downstream of a mode the article was not written for.
 */
export function stampGenerationMode(content: unknown, mode: string | undefined): void {
  try {
    if (!content || typeof content !== 'object') return;
    const normalized = String(mode || '').trim();
    if (!normalized) return; // 모르는 값을 각인하면 없는 사실이 생긴다.
    const target = content as Record<string, unknown>;
    if (target[STAMP_FIELD]) return;
    target[STAMP_FIELD] = normalized;
  } catch {
    /* 각인 실패로 생성을 막지 않는다 */
  }
}

/** The mode the article was generated with, or undefined when it predates the stamp. */
export function readGenerationMode(content: unknown): string | undefined {
  try {
    if (!content || typeof content !== 'object') return undefined;
    const value = (content as Record<string, unknown>)[STAMP_FIELD];
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One warning line when the publishing mode differs from the generating mode,
 * or empty when they agree or either side is unknown.
 */
export function describeGenerationModeMismatch(
  generatedMode: string | undefined,
  publishMode: string | undefined,
): string {
  const from = String(generatedMode || '').trim();
  const to = String(publishMode || '').trim();
  if (!from || !to || from === to) return '';
  return (
    `⚠️ 이 글은 ${labelOf(from)} 모드로 만들어졌는데 지금은 ${labelOf(to)} 모드로 발행합니다. ` +
    '해시태그 개수·제목 규칙이 발행 모드 기준으로 적용됩니다.'
  );
}
