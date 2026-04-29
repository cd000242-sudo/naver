# Phase 1 미점검 보안 영역 보강 감사 — Summary (SEC-004)

날짜: 2026-04-29  
대상: Better Life Naver v2.7.40  
선행: SEC-001~003 패치 완료(.env 인스톨러 제거), 본 감사는 IPC/preload/BrowserWindow/로그/원격 셀렉터 영역.

## 위험도 요약

| 등급 | 발견 수 | 즉시 조치 |
|------|--------|----------|
| Critical | 2 | 24h 내 |
| High | 5 | 1주 내 |
| Medium | 4 | 다음 스프린트 |
| Low | 2 | 백로그 |

## CRITICAL — 즉시 패치 권고

### SEC-V2-C1. `file:deleteFolder` Command Injection (`src/main.ts:2382-2384`)
폴백 분기에서 사용자 제공 `folderPath`를 `execSync(\`rmdir /s /q "${folderPath}"\`)`에 직접 보간. 경로에 `" && <명령>` 삽입 시 임의 명령 실행. preload에서 `deleteFolder(folderPath)` 무검증 노출. 패치: `child_process.spawn('cmd', ['/c','rmdir','/s','/q', folderPath])` + 화이트리스트 디렉토리 검증.

### SEC-V2-C2. `api.on(channel, callback)` 임의 채널 청취 (`src/preload.ts:250-256`)
모든 IPC 채널을 렌더러가 자유 구독. 라이선스/세션/API 키 같은 메인→렌더러 이벤트가 의도치 않게 노출. 화이트리스트 enum으로 채널 제한 필요.

## HIGH — 1주 내 패치

- **SEC-V2-H1**: BrowserWindow 4곳 `sandbox: false` (main.ts 1490 외 명시 누락 3곳). 렌더러 컴프로마이즈 시 Node.js 컨텍스트 폭발.
- **SEC-V2-H2**: `shell:openPath` (systemHandlers.ts:216) 사용자 경로로 폴더 자동 생성 + 임의 위치 열기. Path traversal 무검증.
- **SEC-V2-H3**: `openExternalUrl` (main.ts:5021, systemHandlers.ts:281) 임의 URL → `shell.openExternal()`. `file://`/`javascript:` 차단 없음.
- **SEC-V2-H4**: `remoteUpdate.ts` HTTPS 강제 없음, 코드 서명/HMAC 검증 0%. 호출처가 없어 활성화 시 MITM으로 셀렉터 주입 가능.
- **SEC-V2-H5**: 105+161=266개 IPC 핸들러 입력 검증(zod) 0건. `as any`/`as string` 단순 타입 캐스트만.

## MEDIUM

- **SEC-V2-M1**: `webSecurity` 명시값 없는 BrowserWindow 3곳(main.ts 1579, 8443, WindowManager.ts 32, updater.ts 74) — 기본값 의존.
- **SEC-V2-M2**: CSP `script-src 'unsafe-inline' 'unsafe-eval'`, `connect-src https: http: ws: wss:` 전체 허용(main.ts 1509-1527).
- **SEC-V2-M3**: 동일 IPC 채널(file:deleteFolder, file:readDir 등)이 main.ts와 systemHandlers.ts에 중복 등록 시도(registerOnce.ts로 가드되나 일관성 부재).
- **SEC-V2-M4**: `devTools` mainWindow에서 패키지 모드에도 활성(loginWindow만 `!app.isPackaged` 조건).

## LOW

- **SEC-V2-L1**: `bln-startup-debug.log` `process.type`/`isPackaged`만 기록, 자격증명 누출 없음. 다만 TEMP 권한이 사용자 단위라 대상 시스템에서는 무관.
- **SEC-V2-L2**: `preload.ts` 1051줄, 271 노출 표면. 도메인별 분할로 공격 표면 축소 권고.

## 결론

배포 차단 권고 — CRITICAL 2건(SEC-V2-C1 command injection, SEC-V2-C2 임의 채널)은 신뢰 경계 위반으로 즉시 패치 후 재배포. 이후 HIGH 5건 1주 스프린트 편성.
