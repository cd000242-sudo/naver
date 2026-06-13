# Phase 7.4 - God File Characterization

> Goal: before splitting `contentGenerator.ts`, `main.ts`, `naverBlogAutomation.ts`,
> and `renderer/renderer.ts`, lock the live-critical contracts that users keep
> hitting in production.

## 7.4-a Completed

Added `src/__tests__/phase74GodFileCharacterization.test.ts`.

The guard covers:

- `contentGenerator.ts` public exports used by older callers and renderer/main code.
- Post-generation validation and recent-winner prompt wiring.
- `preload.ts` API names paired with main-process channels.
- Extracted IPC modules for image matching, shopping image collection, and image download.
- Naver login-to-write-editor recovery paths.
- Editor title selector diagnostics and DOM-event fallback.
- Full-auto/semi-auto payload fields for CTA placement, previous-post links, hashtags, and thumbnail text.
- Rich-paste tail recovery after body paste: previous-post card, Enter gap, hashtags, and pre-publish expectations.

## Verification

- `npm test -- src/__tests__/phase74GodFileCharacterization.test.ts`
  - 7 tests passed.

## Next

7.4-b should add one more layer of static guards for the exact first split target
before moving code. Suggested order:

1. `naverBlogAutomation.ts` editor/tail helpers, because this is where live selector
   and previous-post/hashtag failures are most expensive.
2. `main.ts` IPC registration clusters, because dead-router regressions already
   shipped more than once.
3. `contentGenerator.ts` pure prompt/title/rate-limit helpers.
4. `renderer/renderer.ts` only after event handler ownership is clear.
