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

## 7.4-d Completed

Added `src/automation/editorTailPlan.ts` and `src/__tests__/editorTailPlan.test.ts`.

The helper now owns the high-risk tail planning rules before the remaining
runtime typing code is split further:

- Previous-post URLs are normalized before duplicate CTA filtering.
- CTA placement set to `heading-N` is kept out of the bottom tail CTA area.
- Previous-post cards keep the larger hashtag gap (`Enter` 5) while ordinary
  tail hashtags keep the smaller gap (`Enter` 3).
- Tail hashtags are trimmed and capped to five before body typing.
- Pre-publish link-card expectations count the previous-post card plus the
  remaining non-duplicate CTA URLs.

`src/automation/editorHelpers.ts` now calls this helper for the live tail path,
while the older rich-paste tail wiring guards were updated to assert the new
helper-backed contract.

## 7.4-d Verification

- `npm test -- src/__tests__/editorTailPlan.test.ts`
  - 5 tests passed.
- `npm test -- src/__tests__/editorTailPlan.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 35 tests passed.

## 7.4-e Completed

Added `src/automation/editorTailActions.ts` and
`src/__tests__/editorTailActions.test.ts`.

The previous-post tail runtime action is now outside `editorHelpers.ts`:

- It types the separator, hook, and previous-post URL in the confirmed order.
- It waits for the Naver link card and removes leftover bare URL text when the
  card appears.
- It keeps the duplicate affiliate/previous-post URL skip logic using normalized
  URL comparison.
- It preserves the tail typing readiness probe before the block is typed.

Existing rich-paste tail wiring guards now read the moved action module while
`editorHelpers.ts` keeps only the orchestration calls.

## 7.4-e Verification

- `npm test -- src/__tests__/editorTailActions.test.ts`
  - 2 tests passed.
- `npm test -- src/__tests__/editorTailActions.test.ts src/__tests__/editorTailPlan.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 37 tests passed.

## 7.4-f Completed

Extended `src/automation/editorTailActions.ts` with
`applyTailHashtagsAfterCards()`.

The helper now owns the hashtag tail runtime sequence:

- Move to the editor end after previous-post/CTA insertion.
- Re-run the tail typing readiness probe.
- Insert `Enter` 5 when a previous-post card was inserted, otherwise `Enter` 3.
- Wait shorter when the previous-post card was already detected and longer when
  the card state is uncertain.
- Type hashtags through the existing body hashtag path after the gap is in place.

This keeps the previous-post/CTA/hashtag ordering protected while shrinking
`editorHelpers.ts` further.

## 7.4-f Verification

- `npm test -- src/__tests__/editorTailActions.test.ts`
  - 4 tests passed.
- `npm test -- src/__tests__/editorTailActions.test.ts src/__tests__/editorTailPlan.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 39 tests passed.

## 7.4-g Completed

Extended `src/automation/editorTailActions.ts` with
`insertTailLinkCardBlock()`.

The helper now owns the repeated CTA/official-site link-card sequence:

- Insert the shared tail separator.
- Type the CTA or official-site hook label.
- Type the URL line with the same arrow prefix used in production.
- Wait for Naver's link-card conversion.

`src/automation/editorHelpers.ts` now calls this helper from four runtime paths:

- Shopping-connect additional CTA links.
- General/manual CTA links.
- Official-site link insertion after a CTA.
- Official-site link insertion when no CTA exists.

## 7.4-g Verification

- `npm test -- src/__tests__/editorTailActions.test.ts`
  - 5 tests passed.
- `npm test -- src/__tests__/editorTailActions.test.ts src/__tests__/editorTailPlan.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 40 tests passed.

## 7.4-h Completed

Added `src/automation/editorOfficialSiteTail.ts` and
`src/__tests__/editorOfficialSiteTail.test.ts`.

The helper now owns the official-site tail policy that had been duplicated in
the CTA and no-CTA runtime branches:

- Action-category keyword matching across title and hashtags.
- Official-site hook label selection.
- Injectable random source for deterministic tests.

`src/automation/editorHelpers.ts` now calls this shared policy from both
official-site insertion branches, so CTA tail behavior and no-CTA tail behavior
cannot drift independently.

## 7.4-h Verification

- `npm test -- src/__tests__/editorOfficialSiteTail.test.ts`
  - 3 tests passed.
- `npm test -- src/__tests__/editorOfficialSiteTail.test.ts src/__tests__/editorTailActions.test.ts src/__tests__/editorTailPlan.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 43 tests passed.
- `npm test -- src/__tests__/editorOfficialSiteTail.test.ts src/__tests__/editorTailActions.test.ts src/__tests__/editorTailPlan.test.ts src/__tests__/editorTitleHelpers.test.ts src/__tests__/phase71PipelineConfig.test.ts src/__tests__/phase72CorePurity.test.ts src/__tests__/phase74GodFileCharacterization.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts`
  - 66 tests passed.
- `npm test`
  - 264 files / 3,103 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors / 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed.

## 7.4-i Completed

Extended `src/automation/editorOfficialSiteTail.ts` with
`insertOfficialSiteTailBlock()`.

The helper now owns the official-site runtime orchestration:

- Skip search when title/hashtags are not action-category topics.
- Search official sites with the existing `findRelevantOfficialSite()` contract.
- Pass the same 500-character body context used by the prior inline runtime.
- Insert the official-site link card through `insertTailLinkCardBlock()`.
- Keep the previous production behavior of swallowing official-site lookup
  failures after logging them.

`src/automation/editorHelpers.ts` now calls this helper from both CTA and no-CTA
branches, shrinking the live editor tail runtime while keeping the previous
failure-tolerant behavior.

## 7.4-i Verification

- `npm test -- src/__tests__/editorOfficialSiteTail.test.ts`
  - 6 tests passed.
- `npm test -- src/__tests__/editorOfficialSiteTail.test.ts src/__tests__/editorTailActions.test.ts src/__tests__/editorTailPlan.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 46 tests passed.
- `npm test -- src/__tests__/editorOfficialSiteTail.test.ts src/__tests__/editorTailActions.test.ts src/__tests__/editorTailPlan.test.ts src/__tests__/editorTitleHelpers.test.ts src/__tests__/phase71PipelineConfig.test.ts src/__tests__/phase72CorePurity.test.ts src/__tests__/phase74GodFileCharacterization.test.ts src/__tests__/richPasteTailWiring.test.ts src/__tests__/publishMetadataPropagation.test.ts`
  - 69 tests passed.
- `npm test`
  - 264 files / 3,106 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors / 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed.

## 7.4-j Completed

Extended `scripts/lint-ipc.mjs` with critical preload API surface validation.

This targets the `window.api.matchImages is not a function` class directly:

- The existing IPC channel lint still verifies preload channels are registered
  in main.
- The new critical API method lint verifies the preload bridge still exposes
  renderer-facing method names that must not disappear during bundling or
  refactoring.
- The first protected set includes `matchImages`, `matchImagesToHeadings`,
  `generateStructuredContent`, shopping image collection, multi-account publish,
  and multi-image download.

## 7.4-j Verification

- `npm test -- src/__tests__/ipcContractLint.test.ts`
  - 7 tests passed.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.
- `npm test -- src/__tests__/ipcContractLint.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 14 tests passed.
- `npm test`
  - 264 files / 3,108 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors / 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed.

## Next

7.4-k should continue the stability split. Suggested order:

1. `contentGenerator.ts` pure prompt/title/rate-limit helpers.
2. `renderer/renderer.ts` only after event handler ownership is clear.
