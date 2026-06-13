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

## 7.4-k Completed

Extracted title duplicate removal from `src/contentGenerator.ts` into
`src/contentTitleDuplicateRemoval.ts`.

This keeps the shopping-connect and URL-generation title cleanup behavior while
shrinking `contentGenerator.ts` before deeper prompt/rate-limit work:

- Reused the existing duplicate-removal behavior through a focused pure helper.
- Rewired all title cleanup call sites to the helper import.
- Added focused regression coverage for short-title trimming, colon-side product
  duplication, and repeated Korean title words.

## 7.4-k Verification

- `npm test -- src/__tests__/contentTitleDuplicateRemoval.test.ts`
  - 3 tests passed.
- `npm test -- src/__tests__/contentTitleDuplicateRemoval.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 10 tests passed.
- `npm test`
  - 265 files / 3,111 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors / 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-l Completed

Extracted Gemini billing-block classification from `src/contentGenerator.ts`
into `src/geminiBillingBlock.ts`.

This reduces the risk that Gemini prepaid/postpaid billing failures are
mistaken for transient RPM/TPM waits:

- Kept `contentGenerator.ts` public exports compatible through re-exports.
- Moved prepaid credit depletion, postpaid spend-cap, and billing-required
  classification into a focused helper.
- Added message-level tests so user-facing guidance remains explicit about
  whether waiting will help.
- Updated Phase 7.4 characterization to allow re-exported public API ownership.

## 7.4-l Verification

- `npm test -- src/__tests__/geminiBillingBlock.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/geminiBillingBlock.test.ts src/__tests__/geminiRateLimitPolicy.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 18 tests passed.
- `npm test`
  - 266 files / 3,115 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors / 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-m Completed

Extracted same-engine content failure policy from `src/contentGenerator.ts` into
`src/contentGenerationFailurePolicy.ts`.

This protects the selected-engine contract used after a recoverable content
generation failure:

- Terminal errors remain terminal: user cancel, missing input/source, invalid
  key/auth, model access, billing/credit, hard quota, and safety policy blocks.
- Transient pressure remains recoverable: RPM/TPM/resource-exhausted, timeout,
  and connection errors do not trigger cross-engine fallback.
- The same-engine recovery prompt is compacted before being appended to the
  next selected-engine attempt.
- Existing source-level guards now verify helper ownership plus
  `contentGenerator.ts` call-site wiring.

## 7.4-m Verification

- `npm test -- src/__tests__/contentGenerationFailurePolicy.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentGenerationFailurePolicy.test.ts src/__tests__/contentGenerationTimeoutPolicy.test.ts src/__tests__/costInvariants.test.ts`
  - 50 tests passed.
- `npm test`
  - 267 test files passed, 3,118 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors, 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-n Completed

Extracted custom prompt adherence scoring from `src/contentGenerator.ts` into
`src/contentPromptAdherence.ts`.

This keeps the user-prompt repair contract intact while removing another pure
policy block from the generation god file:

- Empty custom prompts skip scoring and never force a repair retry.
- Required terms, forbidden terms, and requested structures such as FAQ/table
  are scored in one focused helper.
- Failed prompt adherence still injects `[PROMPT_ADHERENCE_REPAIR]` before the
  next selected-engine generation attempt.
- Existing source-level guards now verify helper ownership plus
  `contentGenerator.ts` call-site wiring.

## 7.4-n Verification

- `npm test -- src/__tests__/contentPromptAdherence.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentPromptAdherence.test.ts src/__tests__/contentGenerationTimeoutPolicy.test.ts src/__tests__/costInvariants.test.ts`
  - 50 tests passed.
- `npm test`
  - 268 test files passed, 3,121 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors, 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-o Completed

Extracted content-generation error diagnostics from `src/contentGenerator.ts`
into `src/contentErrorDiagnostics.ts`.

This protects the high-complaint timeout/quota guidance path while reducing the
generation god file again:

- OpenAI diagnostic classification now has direct tests for auth, rate limit,
  billing, DNS, and connection cases.
- Provider wait messages keep the "1분 미만" floor so RPM/TPM guidance never
  appears as a zero-minute wait.
- Header extraction for request IDs remains compatible with fetch Headers-like
  objects and plain objects.
- Existing timeout/cost invariants now verify helper ownership plus
  `contentGenerator.ts` call-site wiring.

## 7.4-o Verification

- `npm test -- src/__tests__/contentErrorDiagnostics.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentErrorDiagnostics.test.ts src/__tests__/contentGenerationTimeoutPolicy.test.ts src/__tests__/costInvariants.test.ts`
  - 51 tests passed.
- `npm test`
  - 269 test files passed, 3,125 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - 0 errors, 1,023 baseline warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-p Completed

Extracted automatic tone/category mapping from `src/contentGenerator.ts` into
`src/contentTonePolicy.ts`.

This keeps the mode-specific tone contract isolated for future writing-quality
work:

- Missing categories keep safe mode defaults: SEO/Mate calm_info, homefeed
  friendly, business professional.
- Homefeed remains conversational/community-oriented.
- SEO/Mate remains information-oriented.
- Shopping affiliate and business modes stay distinct.

## 7.4-p Verification

- `npm test -- src/__tests__/contentTonePolicy.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentTonePolicy.test.ts src/__tests__/contentGenerationTimeoutPolicy.test.ts`
  - 23 tests passed.
- `npm test`
  - 270 test files passed, 3,129 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - passed with baseline warnings: 0 errors, 1,023 warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-q Completed

Extracted body marker cleanup helpers from `src/contentGenerator.ts` into
`src/contentTextHelpers.ts`:

- `stripInternalMarkers`
- `removeOrdinalHeadingLabelsFromBody`
- `removeInternalStructureMarkersFromText`

`contentGenerator.ts` keeps named re-exports for existing callers, while new
tests import the helpers directly from `contentTextHelpers.ts`.
`contentBodyTransforms.ts` now reuses the shared internal-structure marker
cleanup helper instead of owning a duplicate definition.

## 7.4-q Verification

- `npm test -- src/__tests__/contentTextHelpersMarkers.test.ts`
  - expected red first: helper exports were not available from
    `contentTextHelpers.ts`.
- `npm test -- src/__tests__/phase74GodFileCharacterization.test.ts src/__tests__/contentTextHelpersMarkers.test.ts src/__tests__/contentGenerator.test.ts src/__tests__/stripInternalMarkers.test.ts`
  - 40 tests passed.
- `npm test`
  - 271 test files passed, 3,131 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - passed with baseline warnings: 0 errors, 1,023 warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-r Completed

Extracted unverified official/latest guide claim cleanup from
`src/contentGenerator.ts` into `src/contentClaimSanitizer.ts`.

This directly locks the user-reported quality regression where generated posts
could contain unsupported phrases like "2026년 공식 가이드에서는" or
"최신 가이드 기준으로는". The helper now owns:

- plain text claim phrase cleanup.
- structured content field cleanup for body/introduction/conclusion.
- heading content/body/summary cleanup with immutable heading replacement.

## 7.4-r Verification

- `npm test -- src/__tests__/contentClaimSanitizer.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentClaimSanitizer.test.ts src/__tests__/contentGenerationTimeoutPolicy.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 28 tests passed.
- `npm test`
  - 272 test files passed, 3,133 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - passed with baseline warnings: 0 errors, 1,023 warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-s Completed

Extracted duplicate/similarity generation heuristics from
`src/contentGenerator.ts` into `src/contentDuplicateHeuristics.ts`.

The helper now owns:

- weighted text similarity scoring used by paragraph/sentence cleanup and full
  article repeat cleanup.
- permissive heading-order validation.
- generated body length gating used by retry decisions.
- duplicate heading detection.
- repeated full article heading-sequence cleanup.

This reduces the content generation god file while keeping the same stable
retry thresholds for full-auto, semi-auto, continuous publishing, and URL-based
generation paths.

## 7.4-s Verification

- `npm test -- src/__tests__/contentDuplicateHeuristics.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentDuplicateHeuristics.test.ts src/__tests__/contentGenerator.test.ts src/__tests__/contentGenerationTimeoutPolicy.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 55 tests passed.
- `npm test`
  - 273 test files passed, 3,138 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - passed with baseline warnings: 0 errors, 1,019 warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-t Completed

Extracted the URL-source prompt prefix from `src/contentGenerator.ts` into
`src/contentUrlModeDirective.ts`.

The helper now owns:

- URL/news source detection for the "original source preservation" prompt.
- the 200-character minimum raw-text gate.
- the full URL mode directive text used before the mode-based system prompt.

This keeps URL-based generation behavior stable while making the retry loop in
`generateStructuredContent()` smaller and easier to audit.

## 7.4-t Verification

- `npm test -- src/__tests__/contentUrlModeDirective.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentUrlModeDirective.test.ts src/__tests__/contentGenerator.test.ts src/__tests__/phase74GodFileCharacterization.test.ts`
  - 33 tests passed.
- `npm test`
  - 274 test files passed, 3,140 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - passed with baseline warnings: 0 errors, 1,019 warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## 7.4-u Completed

Extracted the recent-winners prompt block from `src/contentGenerator.ts` into
`src/contentRecentWinnersBlock.ts`.

The helper now owns:

- `feedback_loop` feature flag gating for the recent winners few-shot block.
- previous-title map resolution for winner post IDs.
- non-throwing fallback to an empty prompt block when metrics or text resolver
  data are insufficient.

This keeps `buildFullPrompt(..., buildRecentWinnersBlock(source))` wiring in
place while moving the extraction/formatting ownership out of the generation
god file.

## 7.4-u Verification

- `npm test -- src/__tests__/contentRecentWinnersBlock.test.ts`
  - expected red first: module missing before helper extraction.
- `npm test -- src/__tests__/contentRecentWinnersBlock.test.ts src/__tests__/phase74GodFileCharacterization.test.ts src/__tests__/smoke/integration-hooks.test.ts`
  - 21 tests passed.
- `npm run build`
  - first run exposed `TS2559` weak-type incompatibility; fixed by accepting
    `unknown` and narrowing internally.
- `npm test`
  - 275 test files passed, 3,147 tests passed.
- `npm run build`
  - passed.
- `npm run lint`
  - passed with baseline warnings: 0 errors, 1,019 warnings.
- `npm run lint:ipc`
  - passed; 264 preload channels, 289 main registrations, 321 preload API
    methods, 6 critical API methods.

## Next

7.4-v should continue the stability split. Suggested order:

1. `contentGenerator.ts` pure prompt helpers.
2. `renderer/renderer.ts` only after event handler ownership is clear.
