# FFmpeg Distribution Checklist

Better Life Naver currently obtains its FFmpeg executable through `ffmpeg-static@5.3.0`. This document records the verified Windows binary identity and the work required whenever an application binary is distributed.

## Verified bundled binary

The installed Windows x64 executable reports:

```text
ffmpeg version 6.1.1-essentials_build-www.gyan.dev
built with gcc 12.2.0 (Rev10, Built by MSYS2 project)
configuration: --enable-gpl --enable-version3 --enable-static ... --enable-libx264 --enable-libx265 ...
```

The complete configuration can be reproduced locally with:

```powershell
node_modules\ffmpeg-static\ffmpeg.exe -version
```

The presence of `--enable-gpl`, `--enable-version3`, and GPL libraries means this executable is distributed under GPLv3-or-later terms. The binary is associated with the [`ffmpeg-static` b6.1.1 release](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1); the Windows x64 provider identified by that package is [gyan.dev](https://www.gyan.dev/ffmpeg/builds/).

## Release requirements

Before publishing any installer, portable archive, or other application binary that contains FFmpeg:

1. Run the packaged FFmpeg executable with `-version` and record the exact version and complete configuration.
2. Obtain the corresponding source for that exact build, including FFmpeg, statically linked GPL components, applied patches, and the scripts or instructions needed to rebuild it.
3. Publish that source from the same release or download location, at no additional charge, and keep a durable source link next to the binary download.
4. Include the GPL text and the applicable copyright and attribution notices in the distribution and its About/legal view.
5. Verify that the release's `THIRD_PARTY_NOTICES.md` names the actual bundled version rather than a version expected from dependency metadata.
6. Keep open-source components outside any EULA restrictions that would limit rights granted by their licenses.

FFmpeg 6.1.1 corresponds to upstream source revision [`e38092ef93`](https://github.com/FFmpeg/FFmpeg/tree/e38092ef93). That upstream revision or archive alone may not be the complete corresponding source for a third-party static build because the executable incorporates additional statically linked libraries. Follow [FFmpeg's official legal and compliance guidance](https://ffmpeg.org/legal.html) and have the release package reviewed if the exact source/build materials cannot be verified.

This checklist is project documentation, not legal advice.
