# EVAL DEFINITION: Content Quality V3

Status: `IMPLEMENTED_BUT_NOT_PROMOTED`

## Baseline

- Legacy manifest: `docs/content-quality-v3/legacy-baseline.json`
- Repository checkpoint: `015f68f72257a7eb380f0e0a0e60dbe7f91aadf5`
- Locale: `ko-KR`
- Default production route: `legacy`
- Candidate provider/model: Gemini `gemini-3.1-flash-lite`
- Candidate grounding: intentionally disabled; the schema-constrained draft uses only fixed
  upstream evidence for deterministic, lower-cost, reproducible evaluation
- Evaluated modes: `seo`, `homefeed`, `affiliate`, `business`, `mate`

## Capability evals

1. Compact trust contract
   - One cache-stable system contract per evaluated mode.
   - Exactly one `[원본 텍스트]` boundary.
   - Source data remains untrusted data; user/runtime instructions cannot create facts.
2. Evidence fidelity
   - No fabricated first-person experience, family story, authority, review attribution, price, phone number, current statistic, or official superlative.
   - Conflicting evidence is disclosed rather than silently resolved.
3. Structured output
   - Native JSON Schema is mandatory.
   - The provider response is revalidated locally against the same strict schema; extra keys,
     missing fields, invalid ranges, and array bound violations fail closed.
   - Gemini-supported schema keywords only.
   - Flash-Lite supports structured output and Search grounding. This evaluation intentionally
     leaves grounding off so every run uses the same fixed upstream evidence.
   - Final output passes V3 recovery and `validatePublishableContent` without legacy semantic mutation.
4. Cheap-model quality
   - The candidate uses exactly `gemini-3.1-flash-lite` without model/provider fallback.
   - Exactly one provider call is allowed; config/env retries, key rotation, caches, prompt
     augmentation, and network/server retries are disabled for V3.
   - Quality is assessed from recorded outputs, never inferred from the prompt or proxy metrics.
5. Mode fitness
   - Five evaluated modes each complete 24 balanced Korean cases.
   - `custom`, `image-narrative`, `traffic-hunter`, and unknown modes remain legacy.
6. Safe failure
   - Invalid flags, modes, providers, schema results, corpus inputs, assessor inputs, or metrics fail closed with stable codes and no raw prompt/output leakage.

## Regression evals

1. Missing, malformed, or untrusted pipeline flags execute the exact legacy driver once.
2. The default V3 content-mode allowlist remains empty.
3. Renderer payloads cannot promote V3.
4. `custom`, `image-narrative`, `traffic-hunter`, and unknown modes remain legacy.
5. Production shadow performs no second generation.
6. Legacy prompt/evaluator hashes remain unchanged unless the baseline is deliberately reviewed and replaced.
7. Legacy result identity, error identity, AbortSignal behavior, post-draft call order, login flows, IPC validation, lint, build, and the full test suite remain unchanged.
8. Exact V3 skips all legacy LLM repairs and deterministic semantic injectors while preserving safe sanitization and fail-fast validation.
9. The same source-bound factual guard runs before provenance registration, during evaluation,
   and again after any publication-time mutation; fake experience, unsupported important
   numbers, prompt leakage, and high-risk guarantees cannot bypass the release corpus gate.

## Evaluation sets

- PR smoke: 24 immutable Korean cases, one per risk scenario.
- Release corpus: 120 immutable Korean cases, 24 per evaluated mode.
- Release outcomes must match the source-controlled immutable case-ID manifest exactly; missing, extra, unknown, or wrong-mode IDs are invalid corpus input.
- Diversity: at least six unique domain/topic seeds per mode and 30 distinct signatures overall.
- Machine expectations: required identifiers/literals, forbidden claims, prompt leakage, fake first person, unsupported important unit-bearing numbers, and high-risk guarantees.
- Human pairwise: at least 200 randomized, blinded `ko-KR` judgments.
- Reliability: the 24-case smoke corpus passes three consecutive times on the exact prompt/model/schema tuple.

## Non-negotiable machine gates

- Schema pass rate: 100%.
- Publishable result rate: 100%.
- Critical hallucinations: 0.
- Fake first-person claims: 0.
- Unsupported current numbers: 0.
- Product failures: 0.
- Infrastructure failures and `NOT_RUN` never count as success.
- Completed release cases: 120 total and exactly 24 per evaluated mode.
- Promotion always uses the fixed published thresholds; callers cannot replace or weaken the rollout policy.
- Korean blinded judgments: at least 200.
- Candidate mean quality delta: `>= 0` versus legacy.
- Candidate win-or-tie rate and 95% Wilson lower bound: `>= 0.5`.
- Median cost ratio: `< 1.0` versus legacy.
- P95 latency ratio: `<= 1.0` versus legacy.
- Promotion evidence requires strict attestation schema version `2`, provider/model
  `gemini` / `gemini-3.1-flash-lite`, locale `ko-KR`, one matching `runId`, and
  lowercase SHA-256 pins for the prompt bundle, output schema, release corpus,
  legacy baseline, and the complete candidate runtime.
- The five pins are not trusted caller declarations. The gate derives one cached,
  immutable current-artifact tuple from the exact 120 prompt outputs and options,
  current output schema, full release corpus plus manifest, and raw legacy baseline,
  plus the source-controlled candidate runtime fingerprint, then requires exact equality.
  A missing baseline or stale pin is invalid and blocking.
- The exact baseline JSON is included in packaged app files at the same `docs/` path,
  and a path-specific `.gitattributes` rule preserves LF raw bytes across checkouts.
- Every provider case carries strict lowercase `candidateOutputSha256`,
  `legacyOutputSha256`, `requestSha256`, and `providerResponseSha256` values. Every
  blinded judgment carries `orderedPairSha256`; the gate recomputes it from those
  four case hashes, the case ID, and the recorded candidate A/B position before
  accepting the judgment.
- Raw evidence package schema version `2` contains ordered candidate/legacy call ledgers,
  raw request/response/final-output bytes, token counts, latency, and backoff. Candidate
  evidence permits exactly one initial successful provider call. The gate derives cost and
  latency ratios from these ledgers instead of trusting caller-supplied ratios.
- For every release case, the gate byte-compares the candidate request against the current
  canonical request, reparses the raw provider response through strict schema/finalization/
  factual guards, regenerates the canonical final output and machine assessment, and requires
  exact equality with the recorded case.
- `artifactSha256` is computed from canonical sanitized cases, judgments, and
  attestation metadata. Metric, verdict, run, or metadata drift is blocking.
- Raw evidence package schema version `2` records both candidate and legacy as
  ordered call ledgers. Each call binds attempt/reason/outcome, canonical request
  bytes, raw provider-response bytes, token counts, call latency, and preceding
  backoff. Candidate evidence permits exactly one successful initial call with no
  retry or backoff; legacy evidence preserves every attempted call in order.
- Cost is never accepted as a caller-provided total. The package recomputes both
  runs from token counts and the source-controlled Gemini Flash-Lite price snapshot,
  then derives the candidate/legacy ratio. Elapsed time is likewise recomputed from
  every call latency plus recorded backoff before deriving the latency ratio.
- For every release case, the gate rebuilds the exact canonical candidate request
  from the source-controlled case, prompt options, prompt builder, model policy,
  native schema, safety settings, and single-call envelope. Recorded request bytes
  must match exactly.
- The recorded raw provider response is strict-UTF-8 JSON, must satisfy the native
  output schema with no extra fields, and is passed through the same finalizer,
  title contract, affiliate/business/factual guards, and publication boundary as
  production. The resulting canonical candidate bytes and machine assessment are
  recomputed and must exactly match the recorded final output and declared `PASS`
  fields. Independently valid but unrelated requests, responses, outputs, metrics,
  or internally re-hashed packages are blocking.
- The source-controlled approved artifact SHA-256 allowlist is immutable and
  intentionally empty. Environment variables, configuration, renderer data,
  caller arguments, and self-attestation cannot approve an artifact.

## Deterministic assessor contract

- Runs the strict V3 schema validator, publication finalizer, and shared source-bound factual
  guard, then maps violations to immutable codes/counts.
- Checks missing expected identifiers/literals, prompt leakage, fake first-person claims, unsupported important numbers, and high-risk guarantees.
- Does not manufacture a subjective quality score.
- Emits `machineAssessmentCases`, not rollout-ready evidence. A rollout case must
  be constructed with `buildContentQualityV3RecordedRolloutCase`, which requires
  matching case/stratum identity, all four externally recorded hashes, and—only
  for `PASS`—independently measured quality, cost, and latency. The builder never
  invents a score or digest, and a machine `PRODUCT_FAIL` cannot be upgraded.
- Malformed input, thrown validators, missing evidence, and proxy-only outcomes fail closed.
- `source.contentPolicyPrompt` remains a limited user-brief instruction and is never promoted into trusted runtime constraints.
- Gate dispositions are `PASS`, `PRODUCT_FAIL`, `INFRA_EXTERNAL`, or `NOT_RUN`.

## Current evidence

- Project-wide tests: 575 files and 5438/5438 tests passing.
- Agent regression coverage: 20 files and 201/201 tests passing; statements 90.16%,
  branches 80.42%, functions 92.48%, and lines 92.62%.
- V3 regression coverage: 47 files and 743/743 tests passing; statements 89.26%,
  branches 84.56%, functions 98.40%, and lines 93.94%.
- TypeScript/renderer build, IPC contract, built self-test, and Electron E2E 15/15 pass.
- Production route: legacy with empty V3 allowlist.
- Production shadow: dormant.
- Real provider corpus runs: `NOT_RUN`.
- Human pairwise judgments: `NOT_RUN`.
- Approved evidence artifact SHA-256 values: none (empty source-controlled allowlist).
- Candidate runtime identity: source-controlled SHA-256 over the reviewed runtime
  source manifest; any source drift blocks previously recorded evidence.
- Actual OAuth browser flow: `NOT_RUN`.

## Promotion rule

`legacy -> shadow -> v3` is permitted only after real recorded outcomes have a
strict, digest-matching attestation and a human-reviewed source change adds that
exact canonical artifact SHA-256 to the approval allowlist. With the allowlist
empty, `evaluateContentQualityV3Rollout` cannot return `PROMOTE` from caller-supplied
metrics, judgments, metadata, environment, or configuration. Missing or
self-consistent-but-unapproved evidence is `INCOMPLETE`; invalid or digest-mismatched
evidence is `BLOCK`. Product and input failures remain `BLOCK`. Until then:

- production remains legacy;
- renderer payloads cannot enable V3;
- no production second generation occurs;
- `custom` and forced-legacy modes cannot enter V3;
- no quality-superiority claim is considered proven.

## Human review

Risk is high. Review all 200 blinded Korean pairs, factual-source matches, medical/legal/financial cases, provider billing and latency evidence, and at least one real Flash-Lite schema-only smoke. Packaged Claude subscription login requires separate Anthropic authorization; the supported packaged route is a Claude API key.

The artifact hash provides deterministic integrity and a source-control approval
boundary. It is not a signature, identity proof, or cryptographic proof that a
person performed the judgments. Human review of the recorded evidence remains
mandatory before any digest is added to the allowlist.

Provider-reported token counts/timing and rater identity are external observations. Their raw
records are hash-bound and recomputed where possible, but local code cannot independently prove
those real-world measurements; approval therefore remains an explicit human trust boundary.

## Candidate runtime fingerprint contract

`CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SOURCE_PATHS` is the reviewed closure for
generation, publication, evaluation policy, attestation, provider/cache/parser/retry
helpers, and `package-lock.json`. Paths are validated as relative POSIX paths,
deduplicated, and sorted. Every parent component is checked with `lstat`; symlinks,
escapes, missing files, and non-files fail closed. Real paths must remain under the
workspace root.

The final reviewed manifest contains 636 files, including the renderer save/restore,
semi-auto/full-auto relay, main-process handoff, browser execution, and Worker entry
paths. Its reviewed SHA-256 is
`d03175e8e3c804608614ac595ba0b7e0fc6306cf4ded7d9a517170a35889b306`.

Each file must be strict UTF-8 without BOM. CRLF is the only canonicalization and
becomes LF; a lone CR or invalid UTF-8 is rejected. SHA-256 input uses a domain
separator plus unsigned 64-bit big-endian length prefixes for the path count, each
UTF-8 path, and each canonical file body. The reviewed lowercase fingerprint is a
source constant: environment, renderer, configuration, and caller-provided expected
hashes cannot replace it. Release tests recompute the value from actual workspace
bytes.

`approvedEvidenceArtifacts.ts`, `candidateRuntimeFingerprintPin.ts`, and
`releaseActivationManifest.ts` are deliberately outside this hash closure because
hashing an approval value or the fingerprint pin into the value it approves would
create a digest self-reference. All three remain source-reviewed and fail closed;
exclusion is not approval. A TypeScript-AST architecture test walks every
fingerprinted V3 module's runtime imports and fails whenever a relative runtime
dependency is outside the closure, except for those three explicit self-reference
edges.

## Durable publication handoff contract

- Main issues a one-shot opaque descriptor only after the initial V3 publication
  boundary succeeds and binds it to a main-derived renderer owner identity.
- Before browser execution, duplicate renderer title/body fields are reconciled and
  checked. The descriptor is consumed only at the final editor boundary after the
  writer ledger, canonical `bodyPlain`, and isolated-realm DOM snapshot agree.
- Strict V3 publication is text-only: opaque visuals, embeds, external anchors/cards,
  dynamic CTA tails, and user supplements are rejected. Only the exact deterministic
  default FTC disclosure is permitted at the top.
- Canonical prose is materialized through the same rich-text writer semantics before
  equality comparison. Numbered/STEP/Markdown heading decoration is normalized while
  sentence loss, replacement, and duplication remain blocking.
- A second isolated-realm snapshot detects DOM changes during durable consume. The
  remaining gap between that snapshot and Puppeteer's trusted click is not atomic and
  remains an activation blocker.
- Saved drafts persist only the required marker and the bounded three-string
  descriptor. Raw evidence, provider output, and publication tickets are not stored.
- A process restart deliberately invalidates the in-memory ticket. A restored V3 draft
  with an unknown descriptor fails as `untrusted_handoff`; a marker without a descriptor
  fails as `missing_handoff`. Neither case may fall through as legacy, so regeneration is
  required before publication.
- Semi-auto, full-auto, multi-account, and schedule relay tests preserve the marker and
  descriptor. V3 app-schedule remains explicitly unsupported and fail-closed.
- Legacy saved-post serialization and exact-reference publication behavior remain
  unchanged.

## Remaining activation blockers

- Real 120-case paid Flash-Lite evidence and 200 blinded `ko-KR` human judgments are
  `NOT_RUN`.
- Final DOM verification and the trusted confirmation click must be made atomic; the
  current two-snapshot check is fail-closed but cannot eliminate the last task gap.
- A renderer reload followed by removal of every V3 marker and a changed body can still
  be indistinguishable from a legacy payload without a stable trusted publish intent.
- Visual publication remains disabled until source digest, OCR, and producer attestation
  are bound to the publication candidate.

The release activation manifest remains `null / null / []`, the approved evidence
allowlist remains empty, and production therefore remains `legacy`.
