# SPEC-DROPSHOT-2026: Dropshot 나노바나나 Pro 이미지 엔진 통합

**Status**: draft
**Created**: 2026-05-30
**Domain**: IMAGE
**Target Module**: better-life-naver (root, cross-module)
**Version Context**: v2.11.6
**입력**: DROPSHOT_PORTING_KIT.md (blogger-gpt-cli v3.6.0 추출, generic 템플릿)
**관련**: SPEC-IMAGE-RECOVERY-001, SPEC-FLOW-001, SPEC-IMAGE-MODEL-001

## 0. 핵심 결론 (왜 키트를 그대로 쓰지 않는가)

입력 키트는 "임의의 Node/Electron 앱"용 generic 템플릿이라 **standalone 브라우저 런처**(os.homedir 프로필, 자체 launchBrowser/ensurePage)를 들고 온다. 그러나 **이 앱은 이미 Flow/ImageFX 두 개의 UI-자동화 이미지 엔진을 운영**하며, 키트보다 성숙한 공통 인프라를 갖췄다. 키트를 통째로 복붙하면 기존 인프라와 중복·충돌하고, 키트가 무시한 패키징 문제를 재발시킨다.

**따라서 본 SPEC은 `flowGenerator.ts`를 템플릿으로 클론하고, 키트에서는 Dropshot 고유의 UI 지식(URL·셀렉터·이미지 감지·i2i 업로드)만 이식한다.**

| 키트 가정 | 이 앱의 실제 | 재사용 가능? |
|---|---|---|
| `os.homedir()/.your-app/dropshot-profile` | `app.getPath('userData')/dropshot-chromium-profile` (flowGenerator.ts:198 패턴) | 패턴 모방 |
| 자체 `launchBrowser()` | `launchWithStealthFallback`+`ensurePlaywrightBrowserInstalled` (flow/imageFx 내부) | ⚠️ **private — import 불가** (아래 §1a) |
| `makeDropshotImage→{ok,dataUrl}` 단건 | `generateWithDropshot(items[])→GeneratedImage[]` 배치 | 시그니처 모방 |
| 자체 base64 scrape | `writeImageFile()`(imageUtils.ts:54, **export ✓**) | ✅ 직접 import |
| (중복차단 없음) | `probeDuplicate`(imageHashUtils.ts:85)·`applyDiversityHint`(:121)·`computeAHash64`(:46) **export ✓** | ✅ 직접 import |
| `console.log` onLog | `sendImageLog()`(flowGenerator.ts:141, **private**) | ⚠️ IPC `image-generation:log` 직접 send로 동등 구현 |
| ~~recovery coordinator~~ | (검증 실패 — gemini 503 전용 추정) | ❌ 적용 안 함 |

**검증 결과(자가비평 1R):** 브라우저 런처 3종(`launchWithStealthFallback`/`ensurePlaywrightBrowserInstalled`/`sendImageLog`)은 flow/imageFx에서 **export되지 않아 직접 import 불가**. → §1a 처리. `writeImageFile`/`probeDuplicate`/`applyDiversityHint`/`computeAHash64`는 export되어 직접 재사용.

**키트에서 이식할 고유 자산 4개:** ①BOARD_URL ②PROMPT_SELECTOR(`textarea[placeholder="어떤 장면을..."]`) + 생성버튼(parent `button.absolute`) ③결과 감지(snapshot diff: 신규 `data:image/`/`cdn.aistudio.dropshot.io` img) ④i2i(`setInputFiles`).

## 1a. 브라우저 런처 공유 문제 (자가비평 핵심 결정)

`launchWithStealthFallback`+`ensurePlaywrightBrowserInstalled`(패키징 Chromium 자동설치 포함)는 Flow/ImageFX 내부 private. Dropshot이 쓰려면 두 길:

- **(A) 통제된 중복** — 런처 로직(~150줄)을 dropshotGenerator에 복제. 기존 Flow/ImageFX **무손상(위험 0)**, 단 런처 3중복(기술부채).
- **(B) 공유 추출** — `src/image/uiAutomation/browserLauncher.ts`로 추출 후 Flow/ImageFX 재배선. DRY ✓, 단 **검증된 god-area 엔진 2개를 건드림 + 이 둘은 단위테스트 빈약(UI 자동화)** → cascade 위험.

**결정: (A) 중복으로 첫 배포 → Dropshot 안정화 후 (B) 추출+dedup을 별도 증분.** 근거(confidence high): Flow/ImageFX는 회귀 그물이 얇아, 신규 기능 DRY를 위해 working 엔진을 리팩토링하는 건 cascade 원칙 위반. 부채는 명시 기록 후 추후 상환.

## 1. 요구사항 (EARS)

- **R1**: 새 엔진은 `src/image/dropshotGenerator.ts` 단일 파일로 구현하되 **flowGenerator의 공통 유틸을 재사용**한다(자체 브라우저 런처/프로필/파일저장/중복차단 재발명 금지).
- **R2**: 엔진 등록은 기존 SSOT 5곳만 수정한다: `image/types.ts`(ImageProvider+ALLOWED_PROVIDER), `runtime/imageEngineCatalog.ts`(DROPSHOT 스펙+카탈로그), `imageGenerator.ts`(import+분기), `renderer/components/HeadingImageSettings.ts`(타입+SOURCE_NAMES), `__tests__/imageEngineRouting.test.ts`(엔진 목록).
- **R3**: 반환은 반드시 `GeneratedImage[]`(filePath/previewDataUrl/provider/blobId 등). 키트의 `{ok,dataUrl}`는 내부 per-item 헬퍼로만 사용.
- **R4**: 한글 텍스트 네이티브(Dropshot=nano-banana-pro 계열) → `koreanText:true`, 영어 변환·후처리 오버레이 스킵(`isKoreanTextSupportedEngine` at imageGenerator.ts:61에 'dropshot' 추가).
- **R5**: i2i — `item.referenceImageUrl`/`referenceImagePath` → 다운로드 → `setInputFiles`(최대 4장). 단 **쇼핑커넥트 `SC_IMG2IMG_ENGINES` 자동 추가 금지** — dropshot i2i는 스타일 변형이라 제품 정확 재현이 보장 안 됨. P3에서 충실도 수동 검증 후에만 화이트리스트 편입 결정.
- **R6**: **auto 모드 및 자동 폴백 체인에서 제외**(UI 자동화라 느리고 fragile — 사용자 명시 선택 시에만).
- **R7**: 한계비용 0원이나 **"무료" 표기 금지**. UI/freeTierNote에 "Pro 구독료별(월 7.4~9.9만원)·구독자 무제한" 명시. `consumeImageApi(0)`로 호출 수만 추적.
- **R8**: 중복 차단은 키트 snapshot-diff(호출 내) + 앱 `probeDuplicate`+aHash(이미지 간) **둘 다**.
- **R9**: 로그인 Flow 패턴(headless 우선→미로그인 visible+폴링). `/api/auth/session` 없으므로 body-text `isLoggedIn`. 로그인 창이 **Electron과 별개 Chromium 창**임을 로그 안내.
- **R10**: 매 릴리즈 1~3 fix + git diff 독립검증 + vitest 전량 + lint + tsc. 라이브 UI는 CI 불가 → **자동화 범위는 라우팅 테스트 + 순수 헬퍼(셀렉터 파싱/중복차단) 단위테스트로 한정**, 실제 생성은 수동 smoke(Flow/ImageFX도 동일).
- **R11**: 무료 티어 quota 소진 시(dropshot UI가 "플랜 업그레이드" 표시) silent 실패 금지 — 명확한 사용자 메시지로 보고(feedback_no_fallback).
- **R12**: 대량(연속발행) 취소 대응 — Flow처럼 `stopCheck`/abort 신호를 시그니처에 포함, 장시간 UI 폴링 중 취소 가능.
- **R13**: Dropshot UI 변경으로 90초 타임아웃 시, 셀렉터 갱신 안내 메시지(키트 §7) 출력 — silent 실패 금지.

## 2. 비용 / 정직한 한계

- 한계비용 0원(Pro 무제한, isUnlimited)이나 월 구독료 7.4~9.9만원은 사용자가 별도 결제. UI에 "구독료별" 명시.
- Dropshot UI 리뉴얼 시 셀렉터 깨짐 — Naver `remoteUpdate` 레지스트리는 **다른 도메인이라 미적용**. 셀렉터는 dropshotGenerator 내 상수 + 수동 갱신.
- 라이브 생성 13~38초/장 — 대량 발행 시 시간 증가. auto 제외(R6)로 의도치 않은 사용 방지.

## 3. 리스크 / ToS (objective-reasoning 정직 고지)

- **ToS 리스크**: dropshot.io를 UI 자동화로 사용하는 것은 서비스 ToS 위반 소지가 있다. 사용자 본인 단일 계정 + 정상 구독 + rate limit 준수 전제. ToS 변경 시 기능이 위반이 될 수 있음 — 사용 시점 ToS 확인 필요. (키트 §9)
- **셀렉터 staleness**: 키트 셀렉터는 2026-05-30 시점. 구현 전 P0에서 DevTools로 현행 확인 필수.
- **자원 경합**: Dropshot Chromium이 Naver Puppeteer 발행과 동시 구동 시 메모리/CPU 경합 가능. 단일 발행 흐름에서는 순차라 영향 적음.

## 4. 비목표

- Dropshot API 직접 호출(키트 §0: 11회 시도 모두 401, 비현실적 → UI 자동화만).
- 다중 Dropshot 계정/세션 풀.
- Naver 셀렉터 레지스트리에 Dropshot 셀렉터 편입(도메인 다름).
