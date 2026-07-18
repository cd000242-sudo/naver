## Fixes

- Fixed a packaged-renderer hotfix regression where image generation could stop immediately with `compactImageContextText is not defined`.
- Inlined `image/contextualImagePrompt.js` into the packaged browser renderer before image-generation modules consume it.
- Added a build-time renderer runtime guard so missing contextual image helpers now fail the build instead of shipping a runtime ReferenceError.
- Added a regression test covering contextual image prompt runtime inlining.
