# Better Life Naver macOS Build

macOS installers must be packaged on macOS. Windows can validate the TypeScript/Electron build and prepare the macOS build scripts, but it cannot produce the final `.dmg`.

## Universal MacBook test build

```bash
cd ~/better-life-naver
npm ci
npm run dist:mac:unsigned
```

Outputs are created in `release_final/`.

- `Better-Life-Naver-<version>-universal.dmg`
- `Better-Life-Naver-<version>-universal.zip`

The universal build supports both Apple Silicon MacBook and Intel MacBook. Unsigned builds show a Gatekeeper warning on customer Macs. For testing, open with right click -> Open.

## Signed customer build

Run this on a Mac with an Apple Developer ID certificate installed:

```bash
cd ~/better-life-naver
npm ci
npm run dist:mac
```

To publish the macOS release assets to the configured GitHub Release for auto-update:

```bash
npm run release:mac
```

This uploads the `.dmg`, `.zip`, and `latest-mac.yml` through electron-builder when `GH_TOKEN` is available.

For architecture-specific builds:

```bash
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:mac:universal
```

## Notes

- The mac icon is generated from the existing `.ico` when `build/icon.icns` is missing.
- Use the universal `.dmg` when one file must support both Apple Silicon and Intel MacBook.
- macOS auto-update requires the `.zip` and `latest-mac.yml` assets on the GitHub Release.
- Signed and notarized releases require a paid Apple Developer Program account. Unsigned test builds can be created, but customer auto-update may not work reliably on macOS.
- GitHub Actions workflow: `.github/workflows/mac-release.yml`.
- Recommended Mac RAM: 16GB or more.
