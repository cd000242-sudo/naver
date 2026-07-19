/**
 * Collects review text candidates from generic commerce DOMs (Cafe24 and
 * modern card-based stores). Keep this function self-contained because
 * Puppeteer serializes it into the page context.
 */
export function collectGenericReviewTextCandidates(): string[] {
  const selectors = [
    '[data-review-content]',
    '[data-testid*="review-content" i]',
    '[data-testid*="review-body" i]',
    '[data-review-id] p',
    '[data-review-no] p',
    '[class*="ReviewContent"]',
    '[class*="reviewContent"]',
    '.review-content',
    '.review-text',
    '.review-body',
    '.user-review',
    '.photo-review-text',
    '.review-description',
    '.rv__subject',
    '.rv__summary',
    '[class*="ReviewPageContent"] p[class*="_content_"]',
    '[class*="review-wrapper"] p[class*="_content_"]',
    '.xans-product-review a[href*="/article/"]',
    'a[href*="/article/"][href*="/4/"]',
    'a[href*="board_no=4"]',
    '[class*="review" i] a[href*="/article/"]',
  ];
  const seen = new Set<string>();
  const candidates: string[] = [];
  const elements = Array.from(document.querySelectorAll(selectors.join(',')));

  const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
  const identity = (value: string): string => value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');

  // Prefer leaves so a review-card parent and its text child do not duplicate.
  const ordered = elements.sort((left, right) => {
    const leftChildren = left.querySelectorAll(selectors.join(',')).length;
    const rightChildren = right.querySelectorAll(selectors.join(',')).length;
    return leftChildren - rightChildren;
  });

  for (const element of ordered) {
    const text = normalize(element.textContent || '');
    if (text.length < 12 || text.length > 600) continue;
    if (!/[a-z가-힣]/i.test(text)) continue;
    if (/^(?:상품)?리뷰\s*\d*|^(?:상품)?후기\s*\d*|^전체\s*보기/i.test(text)) continue;
    if (/글읽기\s*권한|미성년자|성인인증|신고\s*차단/i.test(text)) continue;
    const key = identity(text);
    if (!key || seen.has(key)) continue;
    if (candidates.some(existing => identity(existing).includes(key) || key.includes(identity(existing)))) continue;
    seen.add(key);
    candidates.push(text);
    if (candidates.length >= 40) break;
  }

  return candidates;
}

/**
 * Builds a bounded set of Cafe24 review-page samples. Recent, middle and
 * oldest pages expose different usage stages without crawling every review.
 */
export function buildReviewSamplingPageUrls(
  currentUrl: string,
  lastPage: number,
  maxAdditionalPages = 3,
): string[] {
  let parsed: URL;
  try {
    parsed = new URL(currentUrl);
  } catch {
    return [];
  }
  const boundedLastPage = Math.max(1, Math.min(500, Math.floor(lastPage) || 1));
  if (boundedLastPage <= 1) return [];
  const currentPage = Math.max(1, Number(parsed.searchParams.get('page_4')) || 1);
  const candidates = [
    Math.min(2, boundedLastPage),
    Math.max(2, Math.ceil(boundedLastPage / 2)),
    boundedLastPage,
  ];
  const pageNumbers = [...new Set(candidates)]
    .filter(page => page !== currentPage)
    .slice(0, Math.max(0, Math.min(3, Math.floor(maxAdditionalPages) || 0)));

  return pageNumbers.map(pageNumber => {
    const sampleUrl = new URL(parsed.toString());
    sampleUrl.searchParams.set('page_4', String(pageNumber));
    sampleUrl.hash = 'use_review';
    return sampleUrl.toString();
  });
}
