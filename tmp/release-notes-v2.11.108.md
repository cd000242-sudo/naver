## v2.11.108

### Agent login reliability
- Fixed the packaged Windows Codex login flow so the official browser authorization page opens reliably and login status refreshes without reverting to a stale button state.
- Hardened CLI discovery, Windows command launching, timeouts, cancellation, process-tree cleanup, and concurrent status refresh handling.
- Clarified provider policy: Codex subscription login is supported, while Claude Code subscription login remains intentionally unavailable; Claude API mode is still supported.

### Content quality and publishing safeguards
- Added the guarded Content Quality V3 evaluation and shadow pipeline for the low-cost Gemini 3.1 Flash-Lite path, including strict output schemas, factual-safety checks, evidence contracts, and durable publish provenance.
- Kept Content Quality V3 production activation disabled until the recorded rollout evidence gates pass, preserving the verified legacy publishing path.
- Strengthened editor text semantics, final publish commit boundaries, FTC disclosure presets, and deterministic image publishing order.

### Release verification
- Expanded the release gate with dedicated agent and Content Quality V3 coverage thresholds, IPC contract checks, runtime self-test, and Electron UI end-to-end tests.
- Verified the full regression suite, TypeScript build, packaged runtime behavior, and release-critical UI flows before packaging.
- Made date and temporary-path regression tests deterministic across Windows, Linux, and macOS runners.
- Removed legacy hard-coded Google API keys from local helper scripts; those tools now require an environment-provided key and fail before any request when it is missing.
