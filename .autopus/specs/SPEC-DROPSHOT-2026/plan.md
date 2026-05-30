# SPEC-DROPSHOT-2026 — 실행 계획 (flowGenerator 클론 기반)

> 원칙: 기존 UI-자동화 엔진(Flow) 패턴 재사용 · 1릴리즈 1~3 fix · 매 단계 회귀검증 · auto 제외.

## Phase 0 — 셀렉터/세션 현행 확인 (수동, 코딩 전)
- aistudio.dropshot.io 로그인 후 DevTools로 키트 §3 셀렉터 4종 현행 검증:
  - 프롬프트 `textarea[placeholder="어떤 장면을 만들고 싶나요?"]`
  - 생성 버튼(프롬프트 textarea의 상위 5단계 내 `button.absolute`)
  - 결과 img(`data:image/` 신규 / `cdn.aistudio.dropshot.io` 신규)
  - i2i file input(`input[type=file][data-dropzone-accept=image]` 등)
- 세션 판정 텍스트("이미지 생성"/"워크스페이스"/"플랜 업그레이드") 현행 확인.
- 산출: 확정 셀렉터 표(변경 시 P1 반영). **사용자 협력 필요(로그인).**

## Phase 1a — 브라우저 런처 (통제된 중복, 위험 0)
- flowGenerator의 private `launchWithStealthFallback`+`ensurePlaywrightBrowserInstalled` 로직을 dropshotGenerator 내부 함수로 **복제**(import 불가하므로). 기존 Flow/ImageFX 무손상.
- 부채 기록: 향후 `src/image/uiAutomation/browserLauncher.ts` 추출+3엔진 dedup은 별도 증분(SPEC §1a).

## Phase 1b — 엔진 구현 (`src/image/dropshotGenerator.ts`)
flowGenerator.ts 구조를 모방, Dropshot 고유부만 교체:
- `getDropshotProfileDir()` → `app.getPath('userData')/dropshot-chromium-profile`.
- 복제한 런처 + Mutex(`_ensurePromise`) + headless 우선 → 미로그인 visible 폴링 + body-text `isLoggedIn`.
- per-item(키트 makeDropshotImage): board URL → before-snapshot → i2i면 setInputFiles → 프롬프트 fill → `button.absolute` 클릭 → 90초 폴링(신규 base64/cdn img) → dataUrl. **타임아웃 시 셀렉터 갱신 안내(R13), quota 소진 시 명확 메시지(R11).**
- 배치 루프 + **`writeImageFile()`(import ✓)** + **`probeDuplicate`/`computeAHash64`/`applyDiversityHint`(import ✓)** 중복차단·재시도 + IPC `image-generation:log` 직접 send + `onImageGenerated` 콜백. recovery coordinator 미적용.
- 시그니처: `generateWithDropshot(items, postTitle?, postId?, isFullAuto?, isShoppingConnect?, stopCheck?, onImageGenerated?): Promise<GeneratedImage[]>` (ImageFX 시그니처 모방 — stopCheck 포함, R12).
- 회귀: 라이브 불가 → 순수 헬퍼(snapshot diff/quota 텍스트 감지/i2i URL 매핑)만 분리해 단위테스트.

## Phase 2 — 등록 (SSOT 5곳)
1. `image/types.ts`: `ImageProvider`에 `'dropshot'` + `ALLOWED_PROVIDER` 추가.
2. `runtime/imageEngineCatalog.ts`: `DROPSHOT` 스펙(value 'dropshot', label '🍌 Dropshot 나노바나나 Pro', costKrw 0, koreanText true, freeTierNote "Pro 구독료별·구독자 무제한") + `IMAGE_ENGINE_CATALOG`에 추가.
3. `imageGenerator.ts`: import + 분기(L445~466 근처, generateWithFlow 호출부 args 미러) + `isKoreanTextSupportedEngine`(L61)에 'dropshot' 추가 + **auto/폴백 체인에서 제외**. (`SC_IMG2IMG_ENGINES` 편입은 P3 충실도 검증 후 결정 — R5).
4. `renderer/components/HeadingImageSettings.ts`: `ActiveImageSource`+`SOURCE_NAMES`에 'dropshot' 라벨(비용 정직 표기).
5. `__tests__/imageEngineRouting.test.ts`: 엔진 목록에 'dropshot' 추가 + 라우팅 통과 테스트.
- (선택 6번째) `imageGenerator.ts:241 providerDisplayNames`에 'dropshot' 라벨 — 없어도 fallback으로 raw 이름 표시(로깅 품질용).
- 회귀: vitest 전량 + lint + tsc.

## Phase 3 — i2i / 쇼핑커넥트 연동 (충실도 게이트)
- `item.referenceImageUrl`/`referenceImagePath` → 다운로드 버퍼 → setInputFiles(최대 4장).
- **충실도 검증(수동)**: dropshot i2i가 쇼핑 제품을 정확 재현하는가 vs 스타일만 변형하는가. 정확 재현 확인 시에만 `SC_IMG2IMG_ENGINES`에 'dropshot' 편입(R5). 미달이면 일반 i2i만 지원하고 쇼핑커넥트는 제외.
- 회귀 + 수동 i2i smoke.

## Phase 4 — 검증
- mock 단위(라우팅/어댑터/중복차단) GREEN + 전량 회귀 + lint + tsc.
- 수동 smoke(키트 §6 변형): 텍스트→이미지 1장, i2i 1장, 세션 재사용 2회차. (사용자 실행)

## 종료 조건
1. Phase 0 셀렉터 확정. 2. 단위/회귀 GREEN. 3. 수동 smoke 성공. 4. 사용자 OK.

## 게이트 위반 시 중단
신규 의존성 / 기존 엔진 회귀 / auto 체인 오염 / Chromium 패키징 미해결 / ToS 위반 신호.
