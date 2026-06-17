import { Page } from 'puppeteer';
import { PREV_POST_HOOKS } from './ctaHelpers.js';
import { recordSilentFailure } from './silentFailureCounter.js';
import { safeKeyboardType } from './typingUtils.js';
import { ensureTailTypingReady } from './richTextPaste.js';
import { getHashtagGapEnterCount, normalizeComparableUrl } from './editorTailPlan.js';

function emitTailDebug(stage: string, payload: Record<string, unknown>): void {
  try {
    console.warn(`[TailDebug] ${JSON.stringify({ stage, ...payload })}`);
  } catch (error) {
    console.warn('[TailDebug] emit failed', (error as Error).message);
  }
}

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
  emitTailDebug('previous-post-tail-start', {
    hasPreviousPostUrl: previousPostUrl.length > 0,
    context,
  });
  if (!previousPostUrl) {
    return { inserted: false, cardReady: false };
  }

  const prevUrlUsedAsCta =
    normalizeComparableUrl(resolved.affiliateLink) === normalizeComparableUrl(previousPostUrl);

  if (prevUrlUsedAsCta) {
    emitTailDebug('previous-post-tail-skip-duplicate-cta', {
      previousPostUrl,
    });
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
  emitTailDebug('previous-post-card-check', {
    cardReady,
    waitMs: 15000,
    previousPostTitle,
    previousPostUrl,
  });

  if (cardReady && typeof self.removeBareUrlTextAfterLinkCard === 'function') {
    await self.removeBareUrlTextAfterLinkCard();
  }

  if (cardReady) {
    try {
      const frame = typeof self.getAttachedFrame === 'function' ? await self.getAttachedFrame() : null;
      if (frame) {
        const ready = await ensureTailTypingReady(page, frame, (m: string) => self.log(m));
        if (!ready) recordSilentFailure('editor:previous-post-tail-refocus');
      }
    } catch (error) {
      recordSilentFailure('editor:previous-post-tail-refocus');
      emitTailDebug('previous-post-tail-refocus-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    emitTailDebug('previous-post-tail-refocus-skipped', {
      reason: 'card-timeout',
      previousPostUrl,
    });
    self.log('   ⚠️ 이전글 카드가 제한 시간 안에 확인되지 않아 추가 tail 포커스 검증 없이 해시태그 단계로 넘깁니다.');
  }
  await self.delay(200);
  self.log(`   ✅ 이전글 연결 완료 (후킹: ${randomPrevHook}, 카드: ${cardReady ? '감지' : '대기 초과'})`);

  emitTailDebug('previous-post-tail-complete', {
    inserted: true,
    cardReady,
  });
  return { inserted: true, cardReady };
}

export async function applyTailHashtagsAfterCards(input: {
  self: any;
  page: Page;
  previousPostTailInserted: boolean;
  previousPostCardReady: boolean;
  tailLinkCardInserted?: boolean;
  tailLinkCardReady?: boolean;
  hashtagsToApply: readonly string[];
}): Promise<void> {
  const {
    self,
    page,
    previousPostTailInserted,
    previousPostCardReady,
    tailLinkCardInserted = false,
    tailLinkCardReady = false,
    hashtagsToApply,
  } = input;

  const linkCardInsertedBeforeHashtags = previousPostTailInserted || tailLinkCardInserted;

  emitTailDebug('tail-hashtag-start', {
    previousPostTailInserted,
    previousPostCardReady,
    tailLinkCardInserted,
    tailLinkCardReady,
    hashtagsToApply,
  });

  const allInsertedTailCardsReady = (!previousPostTailInserted || previousPostCardReady) &&
    (!tailLinkCardInserted || tailLinkCardReady);
  const anyTailCardReady = previousPostCardReady || tailLinkCardReady;
  const confirmedTailLinkCardReady = allInsertedTailCardsReady;

  if (linkCardInsertedBeforeHashtags && !confirmedTailLinkCardReady) {
    emitTailDebug('tail-hashtag-card-timeout-continue', {
      previousPostTailInserted,
      previousPostCardReady,
      tailLinkCardInserted,
      tailLinkCardReady,
      confirmedTailLinkCardReady,
      anyTailCardReady,
      hashtagsToApply,
    });
    self.log('   ⚠️ 링크 카드 일부가 제한 시간 안에 확인되지 않았습니다. 추가 재대기 없이 5줄 공백을 확보하고 해시태그를 계속 입력합니다.');
  }

  if (hashtagsToApply.length === 0) {
    emitTailDebug('tail-hashtag-skipped-empty', {
      previousPostTailInserted,
      confirmedTailLinkCardReady,
    });
    return;
  }

  const shouldVerifyHashtagTail = !linkCardInsertedBeforeHashtags || confirmedTailLinkCardReady;
  self.log('   → 커서를 에디터 맨 끝으로 이동 (해시태그 영역 준비)');
  let tailCursorVerified = true;
  if (shouldVerifyHashtagTail) {
    try {
      const hashtagFrame = await self.getAttachedFrame();
      if (!hashtagFrame) {
        throw new Error('POST_TAIL_INCOMPLETE: 해시태그 입력 전 네이버 글쓰기 프레임을 찾지 못했습니다.');
      }
      if (hashtagFrame) {
        const ready = await ensureTailTypingReady(page, hashtagFrame, (m: string) => self.log(m), {
          allowEmptyParagraph: linkCardInsertedBeforeHashtags,
        });
        if (!ready) {
          emitTailDebug('tail-hashtag-ready-best-effort', {
            previousPostTailInserted,
            tailLinkCardInserted,
            confirmedTailLinkCardReady,
            reason: 'ensureTailTypingReady returned false',
          });
          tailCursorVerified = false;
          self.log('   ⚠️ tail 커서 검증이 불안정합니다. 해시태그 입력 단계에서 5줄 공백과 tail 포커스를 다시 확보합니다.');
        }
      }
    } catch (error) {
      if ((error as Error).message.includes('POST_TAIL_INCOMPLETE')) throw error;
      throw new Error(`POST_TAIL_INCOMPLETE: 해시태그 입력 전 본문 tail 준비에 실패했습니다. 원인: ${(error as Error).message}`);
    }
  } else {
    tailCursorVerified = false;
    emitTailDebug('tail-hashtag-preflight-skipped', {
      reason: 'card-timeout',
      previousPostTailInserted,
      previousPostCardReady,
      tailLinkCardInserted,
      tailLinkCardReady,
      confirmedTailLinkCardReady,
    });
    self.log('   ⚠️ 링크 카드 timeout 흐름 — 추가 프레임 검증 없이 5줄 공백 후 해시태그를 바로 입력합니다.');
  }

  const hashtagGapEnterCount = getHashtagGapEnterCount(linkCardInsertedBeforeHashtags);
  emitTailDebug('tail-hashtag-gap', {
    hashtagGapEnterCount,
    previousPostTailInserted,
    tailLinkCardInserted,
    confirmedTailLinkCardReady,
  });
  self.log(`   🔎 해시태그 공백 ${hashtagGapEnterCount}줄은 tail 검증 함수 안에서 처리합니다.`);
  // The hashtag gap is now owned by applyHashtagsInBody so every Enter can be
  // followed by SmartEditor panel dismissal and a fresh tail-cursor check.

  const cardStabilizeDelay = linkCardInsertedBeforeHashtags
    ? (confirmedTailLinkCardReady || anyTailCardReady ? 1000 : 3000)
    : 300;
  self.log(`   ⏳ 링크 카드 안정화 대기(${Math.round(cardStabilizeDelay / 1000)}초)...`);
  await self.delay(cardStabilizeDelay);
  self.log('   ✅ 링크 카드 안정화 완료');

  if (hashtagsToApply.length > 0) {
    self.log(`   → 해시태그 ${hashtagsToApply.length}개 입력 중...`);
    const strictHashtagTail = linkCardInsertedBeforeHashtags &&
      confirmedTailLinkCardReady &&
      tailCursorVerified;
    await self.applyHashtagsInBody([...hashtagsToApply], {
      ensureTailReady: shouldVerifyHashtagTail,
      leadingEnterCount: hashtagGapEnterCount,
      previousPostTailInserted: strictHashtagTail,
    });
    await self.delay(self.DELAYS.MEDIUM);
    emitTailDebug('tail-hashtag-typed', {
      hashtagsToApply,
      previousPostTailInserted,
      tailLinkCardInserted,
      confirmedTailLinkCardReady,
      tailCursorVerified,
    });
    self.log(`   ✅ 해시태그 입력 완료`);
  }
}

export async function insertTailLinkCardBlock(input: {
  self: any;
  page: Page;
  label: string;
  url: string;
}): Promise<{ cardReady: boolean }> {
  const { self, page, label, url } = input;

  await page.keyboard.press('Enter');
  await safeKeyboardType(page, PREVIOUS_POST_SEPARATOR, { delay: 5 });
  await page.keyboard.press('Enter');
  await safeKeyboardType(page, label, { delay: 10 });
  await page.keyboard.press('Enter');
  // Keep the URL bare. Naver SmartEditor reliably converts a plain URL into
  // a link card; prefixing it with emoji/text can leave it as raw text and
  // make following hashtags attach to the URL line.
  await safeKeyboardType(page, url, { delay: 10 });
  await self.delay?.(600);
  await page.keyboard.press('Enter');

  const cardReady = typeof self.waitForLinkCard === 'function'
    ? await self.waitForLinkCard(15000, 500)
    : false;

  if (cardReady && typeof self.removeBareUrlTextAfterLinkCard === 'function') {
    await self.removeBareUrlTextAfterLinkCard();
  }

  return { cardReady };
}
