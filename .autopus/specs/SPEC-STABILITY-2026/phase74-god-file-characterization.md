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

## 7.4-b Completed

Added `src/automation/editorTitleHelpers.ts` and moved the live runtime path for
title-field discovery, title diagnostics, title text readback, and DOM input-event
fallback behind that helper module.

`NaverBlogAutomation.inputTitle()` now calls:

- `findEditorTitleInputElement()`
- `collectEditorTitleDiagnostics()`
- `readEditorTitleText()`
- `setTitleByDomEvent()`

The old private methods remain as a short-term legacy cleanup target, but the
active publishing path no longer depends on their internal implementation.

Additional characterization coverage now asserts that the helper owns the title
selectors, page fallback, diagnostics output, and DOM `InputEvent` fallback.

## 7.4-b Verification

- `npm test -- src/__tests__/phase74GodFileCharacterization.test.ts`
  - 7 tests passed.
- `npm test -- src/__tests__/phase71PipelineConfig.test.ts src/__tests__/phase72CorePurity.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 27 tests passed.
- `npm run build`
  - passed.

## 7.4-c Completed

Added `src/__tests__/editorTitleHelpers.test.ts` as a behavior-level guard for
the extracted title helper.

The test covers:

- Reading the current editor title through the Naver title selector list.
- DOM input-event fallback when keyboard typing does not stick.
- Diagnostic output that includes page URL, page title, frame URL, and selector counts.

This keeps the title-field failure class (`documentTitle` not found / blank title
after typing) protected without editing the large automation file again.

## 7.4-c Verification

- `npm test -- src/__tests__/editorTitleHelpers.test.ts`
  - 3 tests passed.

## Next

7.4-d should continue with the editor tail helper split. Suggested order:

1. `naverBlogAutomation.ts` editor/tail helpers, because this is where live selector
   and previous-post/hashtag failures are most expensive.
2. `main.ts` IPC registration clusters, because dead-router regressions already
   shipped more than once.
3. `contentGenerator.ts` pure prompt/title/rate-limit helpers.
4. `renderer/renderer.ts` only after event handler ownership is clear.
