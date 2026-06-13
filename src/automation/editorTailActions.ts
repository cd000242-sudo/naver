import { Page } from 'puppeteer';
import { PREV_POST_HOOKS } from './ctaHelpers.js';
import { recordSilentFailure } from './silentFailureCounter.js';
import { safeKeyboardType } from './typingUtils.js';
import { ensureTailTypingReady } from './richTextPaste.js';
import { normalizeComparableUrl } from './editorTailPlan.js';

type ResolvedRunOptions = any;
type TailCtaLike = { link?: string; text?: string };

export const PREVIOUS_POST_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

export async function insertPreviousPostTailBlock(
  self: any,
  page: Page,
  resolved: ResolvedRunOptions,
  _effectiveCtas: TailCtaLike[] = [],
  context = 'tail'
): Promise<{ inserted: boolean; cardReady: boolean }> {
  const previousPostUrl = String(resolved.previousPostUrl || '').trim();
  if (!previousPostUrl) {
    return { inserted: false, cardReady: false };
  }

  const prevUrlUsedAsCta =
    normalizeComparableUrl(resolved.affiliateLink) === normalizeComparableUrl(previousPostUrl);

  if (prevUrlUsedAsCta) {
    self.log(`   ⚠️ [이전글] CTA 링크와 동일 URL → 중복 삽입 건너뜀`);
    return { inserted: false, cardReady: false };
  }

  const randomPrevHook = PREV_POST_HOOKS[Math.floor(Math.random() * PREV_POST_HOOKS.length)];
  const previousPostTitle = String(resolved.previousPostTitle || '이전 글 보기').trim();

  self.log(`   📖 [이전글] 리치 본문 뒤 이전글 연결 (${context})`);
  try {
    const frame = typeof self.getAttachedFrame === 'function' ? await self.getAttachedFrame() : null;
    if (frame) await ensureTailTypingReady(page, frame, (m: string) => self.log(m));
  } catch {
    // best-effort: Enter below still lands at the last known cursor.
  }
  await page.keyboard.press('Enter');
  await safeKeyboardType(page, PREVIOUS_POST_SEPARATOR, { delay: 5 });
  await page.keyboard.press('Enter');
  await safeKeyboardType(page, randomPrevHook || previousPostTitle, { delay: 10 });
  await page.keyboard.press('Enter');
  await safeKeyboardType(page, previousPostUrl, { delay: 10 });
  await self.delay(600);
  await page.keyboard.press('Enter');

  const cardReady = typeof self.waitForLinkCard === 'function'
    ? await self.waitForLinkCard(15000, 500)
    : false;

  if (cardReady && typeof self.removeBareUrlTextAfterLinkCard === 'function') {
    await self.removeBareUrlTextAfterLinkCard();
  }

  await page.keyboard.press('End').catch(() => undefined);
  try {
    await page.keyboard.down('Control');
    await page.keyboard.press('End');
  } catch {
    recordSilentFailure('editor:cursor-move');
  } finally {
    await page.keyboard.up('Control').catch(() => undefined);
  }
  await self.delay(200);
  self.log(`   ✅ 이전글 연결 완료 (후킹: ${randomPrevHook}, 카드: ${cardReady ? '감지' : '대기 초과'})`);

  return { inserted: true, cardReady };
}
