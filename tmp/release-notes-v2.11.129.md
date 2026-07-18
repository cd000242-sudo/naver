## v2.11.129

- Fixed `OPENAI_TEXT_MODELS is not defined` during heading image prompt generation by inlining the renderer text-model constants and failing the build if they are missing.
- Fixed full-auto Shopping Connect image routing so the currently selected image engine wins over stale `scAIImageEngine` values.
- The shipped `#image-source-select` is now read directly before persisted legacy settings, preventing GPT Image 2/OpenAI selections from being replaced by Nano Banana Pro.
- Removed hidden hardcoded Nano Banana defaults from continuous and multi-account Shopping Connect controls so saved or newly selected engines are restored correctly.
- Preserved the engine-only policy: an unavailable selected engine reports its own failure and is not silently replaced with another paid provider.
- Added regression coverage for renderer bundling, full-auto/continuous/multi-account engine precedence, and cross-engine fallback prevention.
