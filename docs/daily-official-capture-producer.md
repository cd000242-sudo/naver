# Reviewed Daily Official Captures

`ensureDailyOfficialCaptureBatch(input, { signal })` reuses a completed, valid batch or produces page screenshots from an explicitly reviewed plan. It does not discover or approve sources, infer usage rights, generate images, connect to a user's browser session, or publish posts.

## Current Readiness

Normal one-click discovery is **not ready**. The operator must supply both source approval evidence and a plan matching the final generated job binding. In particular, the plan's `jobId`, account, blog, category, title, and complete heading list must match that specific job. A reusable website-level approval alone is insufficient. The UI must hold jobs without these inputs; it must not set official capture readiness merely because the producer function exists.

`DAILY_CAPTURE_PLAN_REQUIRED` means the job plan is absent. `DAILY_CAPTURE_REVIEW_REQUIRED` means binding, source evidence, rights, regions, or actual output failed validation. `DAILY_CAPTURE_VIDEO_UNSUPPORTED` means a video/channel source requires a separately prepared and verified video-frame batch. Cancellation returns `DAILY_CANCELLED`.

## Source Registry

Location: `<userDataDir>/daily-official-sources.json`. The existing consumer verifies this file. Every verification evidence file must exist inside `userDataDir`, without symlinks/junctions. These placeholders are **not approvals** and must not be installed as live configuration.

```json
{
  "schema": 1,
  "sources": [{
    "id": "REVIEWED_SOURCE_ID",
    "verified": true,
    "publisher": "OPERATOR_VERIFIED_PUBLISHER",
    "captureCategory": "issue",
    "host": "REPLACE_WITH_VERIFIED_PUBLIC_HOST",
    "reviewedBy": "ACTUAL_OPERATOR",
    "reviewedAt": "ACTUAL_ISO_TIMESTAMP_WITH_TIMEZONE",
    "verificationUrl": "https://REPLACE_WITH_VERIFIED_PUBLIC_HOST/ownership-evidence",
    "verificationEvidence": "ABSOLUTE_PATH_INSIDE_USER_DATA_TO_ACTUAL_EVIDENCE",
    "approvedPageUrls": ["https://REPLACE_WITH_VERIFIED_PUBLIC_HOST/EXACT_APPROVED_PAGE"]
  }]
}
```

The verified field must represent a real operator review. Approval covers exact normalized page URLs, not an entire site. Categories are `issue`, `sports`, or `auto`. Rights review is separate from publisher verification.

## Job Capture Plan

Use `getDailyOfficialCaptureBatchDirectory(userDataDir, jobId)` to locate the job directory. Write `capture-plan.json` there. There must be 5–31 captures, one thumbnail at slot 0, and at least one capture for each heading slot. All scenes and resulting file hashes must be distinct. The following shows one capture entry only; add the remaining reviewed scenes before execution.

```json
{
  "schema": 1,
  "jobId": "EXACT_JOB_ID",
  "accountId": "EXACT_ACCOUNT_ID",
  "blogId": "EXACT_BLOG_ID",
  "categoryId": "1",
  "captureCategory": "issue",
  "sourceUrl": "https://REPLACE_WITH_ORIGINAL_ARTICLE_HOST/EXACT_ORIGINAL_ARTICLE",
  "title": "EXACT_FINAL_TITLE",
  "headings": ["EXACT_HEADING_1", "EXACT_HEADING_2", "EXACT_HEADING_3", "EXACT_HEADING_4"],
  "review": {
    "decision": "approved",
    "reviewedBy": "ACTUAL_OPERATOR",
    "reviewedAt": "ACTUAL_ISO_TIMESTAMP_WITH_TIMEZONE"
  },
  "captures": [{
    "slotIndex": 0,
    "heading": "EXACT_FINAL_TITLE",
    "sourceApprovalId": "REVIEWED_SOURCE_ID",
    "pageUrl": "https://REPLACE_WITH_VERIFIED_PUBLIC_HOST/EXACT_APPROVED_PAGE",
    "scene": "OPERATOR_REVIEWED_DISTINCT_SCENE_DESCRIPTION",
    "clip": { "x": 0, "y": 0, "width": 1280, "height": 800 },
    "rightsReview": {
      "decision": "approved",
      "basis": "permission",
      "reviewedBy": "ACTUAL_OPERATOR",
      "reviewedAt": "ACTUAL_ISO_TIMESTAMP_WITH_TIMEZONE",
      "note": "ACTUAL_REVIEW_OF_USAGE_SCOPE_AND_CONTEXT",
      "evidenceUrl": "https://REPLACE_WITH_VERIFIED_PUBLIC_HOST/ACTUAL_RIGHTS_EVIDENCE"
    }
  }]
}
```

Use exactly one of `clip` or `selector` per scene. A selector entry uses `"selector": "#operator-reviewed-region"` instead of `clip`. Regions must have a minimum side of 300 pixels, a maximum side of at least 600 pixels, and no more than 32 million decoded pixels. The viewport is 1280×1000. Rights basis accepts `quotation`, `permission`, `licensed`, or `owned`; selecting a basis is not a substitute for checking permission and context.

## Runtime and Verification

- Uses `launchAdaptedBrowser({ headless: true })` and a new isolated context with service workers and downloads disabled.
- Each main navigation must match its approved page. Only HTTPS GET/HEAD traffic is permitted. WebSockets, redirects, private/reserved DNS destinations, credentials in URLs, and literal IP URLs are blocked.
- Browser requests are fulfilled through DNS-pinned HTTPS requests. No user cookies, authorization headers, or browser session are reused. External assets also undergo the public-address checks.
- Maximum response/image size: 20 MB. Per-page aggregate: 60 MB / 200 requests. The shared byte budget is charged on each incoming chunk, before storage; exceeding it aborts all concurrent page requests. Navigation: 30 seconds. Network idle timeout: 15 seconds. Full batch: 180 seconds. Some sites will require a different reviewed capture plan because their redirects, login, compression-only responses, or dynamic traffic are rejected.
- Records actual screenshot SHA-256, pixel dimensions, timestamp, page, scene, and job evidence. Duplicate images are rejected.
- Runs the existing `loadDailyOfficialCaptureBatch` validator against a staging batch before exposing the final manifest. The final manifest is atomically linked without overwriting any existing batch, then validated again using the original registry.
- An invalid existing manifest is never silently replaced. Inspect the evidence and correct the job explicitly.

Tests use owned in-memory fixtures and mock private browser/network adapters. No real third-party site or live publishing account was exercised during implementation. Live acceptance still requires operator-approved pages and rights evidence.
