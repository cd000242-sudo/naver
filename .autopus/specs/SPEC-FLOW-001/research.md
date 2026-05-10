# SPEC-FLOW-001 리서치

## 기존 코드 분석

### 핵심 파일

| 경로 | 역할 | 주요 위치 |
|------|------|-----------|
| `src/image/flowGenerator.ts` | 전체 시스템 (830줄) | — |
| `src/image/types.ts` | `ImageRequestItem`, `GeneratedImage` 타입 | L18 import |
| `src/image/imageUtils.ts` | `writeImageFile` | L19 import |
| `src/image/promptBuilder.ts` | `PromptBuilder.build` | L20 import |
| `src/apiUsageTracker.ts` | `trackApiUsage` | L21 import |

### 상태 변수 생명주기 (L106–110)

```
cachedBrowser    — 선언만 됨, 미사용 (dead code)
cachedContext    — launchWithStealthFallback() 반환값 저장 → resetFlowState()로 close/null
cachedPage       — ctx.pages()[0] 또는 newPage() → 3중 유효성 체크 (L189–203)
cachedProjectUrl — ensureFlowProject() 성공 시 저장 → resetFlowState()로 null
_enabled         — setFlowEnabled()/isFlowEnabled() 공개 플래그
```

### 에러 코드 체계

모든 에러는 `FLOW_{CODE}:설명` 형식 문자열로 throw. `generateWithFlow`(L779)에서
`msg.startsWith('FLOW_')` 체크로 critical 분류.

| 코드 | 위치 | 설명 |
|------|------|------|
| `FLOW_BROWSER_LAUNCH_FAILED` | L181 | Chrome/Edge/Playwright 모두 실패 |
| `FLOW_LOGIN_TIMEOUT` | L263 | 5분 로그인 대기 초과 |
| `FLOW_SESSION_LOST` | L282 | off-screen 전환 후 세션 유실 |
| `FLOW_NEW_PROJECT_BUTTON_NOT_FOUND` | L417 | "새 프로젝트" 버튼 30초 탐색 실패 |
| `FLOW_PROJECT_REDIRECT_TIMEOUT` | L428 | 프로젝트 URL 리다이렉트 30초 초과 |
| `FLOW_PROMPT_INPUT_NOT_FOUND` | L461 | contenteditable 15초 탐색 실패 |
| `FLOW_PROMPT_NOT_ENTERED` | L502 | 입력값 검증 실패 (textContent < 5자) |
| `FLOW_SUBMIT_BUTTON_NOT_FOUND` | L513 | arrow_forward 버튼 10초 탐색 실패 |
| `FLOW_PROMPT_INPUT_ALL_FAILED` | L493 | 3가지 입력 방식 모두 실패 |
| `FLOW_IMAGE_TIMEOUT` | L599 | 이미지 감지 타임아웃 (기본 120s) |
| `FLOW_IMAGE_DOWNLOAD_TINY` | L628 | 다운로드 buffer < 1024 bytes |
| `FLOW_IMAGE_DOWNLOAD_FAILED` | L641 | 다운로드 3회 모두 실패 |
| `FLOW_ALL_FAILED` | L788 | 배치 전체 실패 |

### 외부 의존성

| 의존성 | 버전/채널 | 용도 |
|--------|-----------|------|
| `playwright` | import 동적 (L145) | 브라우저 자동화 |
| Chromium 채널 | `chrome` → `msedge` → 번들 (L155–158) | 봇 감지 우회 |
| `labs.google/fx/tools/flow` | — | 이미지 생성 UI |
| `/fx/api/auth/session` | — | 세션 검증 API (L330) |
| `electron` | app, BrowserWindow | userData 경로, IPC |

### 로깅 채널 (3중)

- `sendImageLog` (L75): 콘솔 + IPC `image-generation:log` + 파일
- `flowLog/Warn/Error` (L86–99): 콘솔 + 파일만 (IPC 제외)
- `saveDebugScreenshot` (L344): PNG → `FLOW_LOG_DIR`

---

## 설계 결정

### 왜 UI 자동화인가

`recaptchaContext.token`이 Flow 페이지 JS 런타임에서만 생성되며 외부 복제 불가
(L10–12). 실제 엔드포인트는 `POST /v1/projects/{id}/flowMedia:batchGenerateImages`
(L11)이지만 reCAPTCHA 토큰 없이는 호출 불가.

### 왜 headless: false인가

v1.5.0에서 Playwright MCP 실측 비교 결과, headless 모드에서 Google Labs가 이미지
렌더를 차단함 (L142–144). off-screen `--window-position=-10000,-10000`으로
화면에 안 보이면서도 visible 상태 유지.

### 왜 off-screen → on-screen → off-screen 3단 전환인가

`--window-position=-10000,-10000`으로 시작된 창은 `moveTo()`로 복구 불가 (L230–231).
따라서 로그인 필요 시 context 완전 종료 후 on-screen 재시작, 완료 후 다시 off-screen
전환. 전환 사이 1.5s 대기는 `SingletonLock` 파일 해제 타이밍 확보 (L235).

### 왜 ctx.request.get()인가

v1.4.96에서 `page.evaluate(fetch)` 방식을 교체. off-screen 컨텍스트에서 CORS 정책과
페이지 생명주기 의존성으로 "Failed to fetch" 발생 (L609–611). Playwright 네이티브
HTTP 클라이언트는 쿠키 자동 포함, CORS 없음.

### fill() 우선 입력 전략

v1.5.5에서 `pressSequentially`(10ms/char × 391자 ≈ 19s 실측) 대신 `fill()` 1순위로
변경 (L468–469). 실패 시 `pressSequentially(3ms)` → `keyboard.type(3ms)` 폴백.

---

## 알려진 기술 부채

1. `flowGenerator.ts` 830줄 — 파일 크기 제한(300줄) 위반 (plan.md T1)
2. `FLOW_LOG_DIR` = `'C:\Users\박성현\Desktop\새 폴더'` 하드코딩 (L31, plan.md T2)
3. `cachedBrowser` 선언만 되고 미사용 (L107, plan.md T5)
4. `countExistingImages` 언어 고정 셀렉터 (L604, plan.md T3)
