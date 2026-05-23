# SPEC-IMAGE-MODEL-001 — 실행 플랜

원칙: 1 Phase = 1 릴리즈 = 1-3 파일 fix 한도 (`feedback_no_cascade_fix`).
모든 Phase는 회귀 검증 통과 후 다음 Phase 진입.

## Phase 0 — 옵션 B 흡수: 빌드 정의 자동 동기화

> Phase 0 implemented: 2026-05-23, executor agent

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.338 |
| 변경 파일 | `electron-builder.yml`, `scripts/sync-build-define.js` (신규) |
| 추가 LOC | +80 |
| 수정 LOC | +12 |
| 삭제 LOC | 0 |
| 회귀 위험 | **낮음** — 빌드 메타 한정 |

근거: 모델 마이그레이션 도중 빌드 정의 불일치가 회귀를 가린다. 모델 변경 전에 빌드 메타를 정확히 만든다.

### 회귀 검증
- `npm run release` 산출물 NSIS + portable 양쪽 productName/setName 일치 확인.
- 기존 v2.10.337 설치본 위에 v2.10.338 설치 시 userData 분기 발생 0건 (`project_userdata_split_fix.md` 회귀 가드).
- 수동 E2E: 설치 → 실행 → 종료 → 재실행 → localStorage 보존.

### 롤백
커밋 revert로 즉시 가능. feature flag 불필요.

---

## Phase 1 — blob store IPC 신설 (메인 프로세스 단독)

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.339 |
| 변경 파일 | `src/main/blobStore/index.ts` (신규), `src/main/blobStore/fsBackend.ts` (신규), `src/main/ipc/blobHandlers.ts` (신규), `src/main/ipc/index.ts` (+5줄), `src/preload.ts` (+14줄) |
| 추가 LOC | +320 |
| 수정 LOC | +19 |
| 삭제 LOC | 0 |
| 회귀 위험 | **0** — 렌더러는 아직 호출하지 않음 |

내용: `read/has/write/materializeTempFile` IPC를 메인 프로세스에 신설. 렌더러 코드 변경 없음. 단위 테스트만으로 검증.

### 회귀 검증
- `tests/unit/blobStore.test.ts` (신규): write → read 라운드트립, has 정확성, missing → placeholder 응답, materializeTempFile LRU.
- `tests/unit/blobStore.idempotent.test.ts`: 동일 sha256 두 번 write → 같은 blob-id 반환.
- 287/287 기존 vitest 통과 유지.
- 수동 E2E: 앱 실행, 기존 게시물 목록 정상 렌더 (Phase 1은 렌더러 미수정이므로 변화 없어야 함).

### 롤백
신규 모듈 + IPC만 추가했으므로 커밋 revert로 즉시 가능.

> Phase 1 implemented: 2026-05-23, executor agent

---

## Phase 2 — 신규 이미지 생성 경로에 blob-id 발급

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.340 |
| 변경 파일 | `src/image/types.ts:39-49`, `src/image/imageUtils.ts:51-179` |
| 추가 LOC | +60 |
| 수정 LOC | +30 |
| 삭제 LOC | 0 |
| 회귀 위험 | **중간** — `GeneratedImage` 타입 전파 |

내용: `writeImageFile`이 blob store에 쓰면서 동시에 legacy `filePath`/`url`도 발급 (이중 쓰기). `GeneratedImage`에 `blobId`, `sha256`, `byteSize`, `mimeType`, `width`, `height`, `createdAt` 추가. legacy 필드는 deprecated 마킹만.

### 회귀 검증
- `tests/unit/imageUtils.writeImageFile.test.ts`: blob 쓰기 + legacy filePath 동시 발급, sha256 정확성.
- `tests/integration/image-generation-roundtrip.test.ts`: 이미지 생성 → blob.read로 동일 바이트 회수.
- 기존 이미지 생성 E2E (`npm run test:images`) 회귀 0건.
- 수동 E2E: 새 게시물에 이미지 추가 → blob 디렉터리에 파일 생성 확인 → 기존 썸네일 표시 정상.

### 롤백
이중 쓰기이므로 코드 revert 시 legacy 경로만 남고 정상 동작.

> Phase 2 implemented: 2026-05-23, executor agent
> Changed files: src/image/types.ts, src/image/imageUtils.ts, src/main/blobStore/singleton.ts, src/main/ipc/blobHandlers.ts, src/__tests__/imageUtils.writeImageFile.test.ts, src/__tests__/image-generation-roundtrip.test.ts
> Tests: 10 new tests passed (6 writeImageFile + 4 roundtrip), 2024/2025 total vitest passed (1 pre-existing failure in licenseManagerRegression unrelated to Phase 2)

---

## Phase 3 — postManager.ts 절대경로 전파 버그 차단

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.341 |
| 변경 파일 | `src/renderer/modules/postManager.ts` (+1 import, 3블록 교체), `src/renderer/utils/imageStorageNormalize.ts` (신규) |
| 추가 LOC | +90 |
| 수정 LOC | +4 |
| 삭제 LOC | -28 |
| 회귀 위험 | **높음** — god file 3블록 동시 수정 |

내용: 3블록에서 localStorage에 저장하기 전 절대경로(`filePath`, `file://`, Windows drive, POSIX /path)가 display 필드(`previewDataUrl`, `url`)로 전파되는 것을 차단한다. 자동 import(legacy 절대경로 → blob-id 발급)는 비동기 IPC가 필요하여 `saveGeneratedPost`/`saveGeneratedPostFromData`/`updatePostImages`의 동기 흐름과 맞지 않으므로 **Phase 6 마이그레이션 스크립트에 위임**한다. Phase 3 완료 시점의 동작 명세:
- **신규 저장**: 절대경로는 `filePath`에만 남고 `previewDataUrl`/`url` 필드 오염 0.
- **기존 저장(레거시)**: 변경 없음. 사용자가 Phase 6 마이그레이션 실행 시 변환.

근거: `feedback_no_cascade_fix`에 따라 3블록을 한 릴리즈에 묶는 것은 위험하지만, 세 블록이 동일한 정규화 함수를 공유하므로 함수 1개를 추가하고 3호출 지점을 교체하는 형태로 응집. 회귀 검증을 강화하여 보상.

### 회귀 검증
- `tests/unit/postManager.normalize.test.ts`: 3블록 각각에 대해 절대경로 입력 → blob-id 출력 정확성.
- `tests/integration/postManager.cross-pc.test.ts`: 다른 PC mock (절대경로 = `/foreign/path`) → 정규화 후 ERR 0건.
- `tests/integration/postManager.empty-dir.test.ts`: 빈 디렉터리 + legacy 메타 → placeholder 응답.
- 287/287 vitest 통과 유지 + 신규 케이스 통과.
- 수동 E2E: v2.10.340 설치본의 localStorage를 v2.10.341로 업그레이드 → 깨진 썸네일 0건.

### 롤백
정규화 함수가 부재해도 legacy 분기가 살아있으므로 revert 가능. 단, Phase 4 진입 전 필수.

> Phase 3 implemented: 2026-05-23, executor agent
> Changed files: src/renderer/utils/imageStorageNormalize.ts (new, +82 LOC), src/renderer/modules/postManager.ts (+1 import, 3 blocks replaced, -28/+4 LOC), src/__tests__/imageStorageNormalize.test.ts (new, +170 LOC)
> Correction applied: "auto import to blob store" deferred to Phase 6 migration script. Phase 3 only blocks absolute path propagation to display fields.

---

## Phase 4 — 렌더 전 검증을 blob 존재 확인으로 교체

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.342 |
| 변경 파일 | `src/renderer/modules/postListUI.ts:73-115` |
| 추가 LOC | +35 |
| 수정 LOC | +25 |
| 삭제 LOC | 0 |
| 회귀 위험 | **중간** |

내용: batch validate를 `electronAPI.blobs.has(blobId[])` 일괄 호출로 교체. 누락 blob은 placeholder로 즉시 렌더. `cleanupStaleImageReferences`는 호출 유지 (Phase 7에서 제거).

> Phase 4 implemented: 2026-05-23, executor agent
> Changed files: src/renderer/utils/imageDisplayHelpers.ts (new, +78 LOC), src/__tests__/imageDisplayHelpers.test.ts (new, +145 LOC), src/renderer/modules/postListUI.ts (+1 import, 3 blocks replaced, -38/+8 LOC net), scripts/copy-static.mjs (+4 LOC)

### 회귀 검증
- `tests/integration/postListUI.has-check.test.ts`: blob 존재/누락 mock → placeholder vs 실제 썸네일 정확 분기.
- Playwright 스크린샷 diff: 깨진 썸네일 프레임 0건 (`tests/e2e/post-list-render.spec.ts`).
- 수동 E2E: 게시물 50개 렌더 시 첫 프레임 깨진 썸네일 0건.

### 롤백
batch validate 함수만 revert 시 기존 동작 복원.

---

## Phase 5 — 자동발행 blob 소비 어댑터 (재설계: 진입점 1곳만)

> **SPEC 정정 (2026-05-23)**: 원래 계획(automation god file 2개 30+ 지점 교체)은
> `feedback_no_cascade_fix` 위반 — god file 침습 최소화 원칙에 따라 안 A로 재설계.
> automation god file(`imageHelpers.ts`, `editorHelpers.ts`) 변경 0줄.

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.343 |
| 변경 파일 | `src/main/utils/materializePublishingImages.ts` (신규 +60 LOC), `src/main.ts` (+7줄, 진입점 어댑터 호출), `src/preload.ts` (+1줄, blobId 타입 확장), `src/__tests__/materializePublishingImages.test.ts` (신규 +90 LOC) |
| automation 변경 | **0줄** — imageHelpers.ts, editorHelpers.ts 미수정 |
| 회귀 위험 | **중간** (god file 침습 최소, 진입점 1곳 한정) |

**핵심 설계**: blobId 있고 filePath 없는 image만 materialize하여 filePath 채움.
automation god file은 기존 fs 코드 그대로 — filePath가 채워져 있으면 정상 동작.

변경 흐름:
1. `ipcMain.handle('automation:run', ...)` 진입 직후 어댑터 호출 (dynamic import 3줄)
2. `payload.generatedImages` 배열에서 blobId 있는 항목만 `materializeTempFile`로 임시 경로 취득
3. `filePath` 채워진 채로 기존 `AutomationService.executePostCycle(payload)` 위임
4. automation god file은 `image.filePath`만 보면 되므로 코드 변경 불필요

### 회귀 검증
- `src/__tests__/materializePublishingImages.test.ts` (신규 8케이스): 빈 입력, pass-through, materialize, null 반환, throw, 혼합, 불변성 확인.
- `npx vitest run` — baseline 2069 대비 회귀 0건, +8 신규 PASS.
- `npm run lint` — 신규 errors 0건.
- `npm run build` — exit 0.
- `git diff HEAD -- src/automation/` — 변경 0줄 (automation god file 미수정 확인).

### 롤백
main.ts 어댑터 호출 7줄 revert로 즉시 원복. 신규 모듈은 dead code가 되지만 기능 영향 0.

> Phase 5 implemented: 2026-05-23, executor agent
> Changed files: src/main/utils/materializePublishingImages.ts (new), src/__tests__/materializePublishingImages.test.ts (new), src/main.ts (+7줄 진입점), src/preload.ts (+1줄 타입)
> automation/ changes: 0 lines (core invariant preserved)

---

## Phase 6 — 마이그레이션 도메인 로직 + IPC (옵션 C: UI 통합 분리)

> **SPEC 정정 (2026-05-23, 옵션 C 채택)**:
> 원래 plan.md는 `src/renderer/modules/settingsUI.ts`에 UI 통합을 포함했으나,
> `settingsUI.ts`가 실제로 존재하지 않아 Phase 6b로 분리.
> 본 Phase 6은 마이그레이션 도메인 로직 + IPC + 테스트만 포함한다.
> UI 통합은 Phase 6b에서 별도 진행.

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.344 |
| 변경 파일 | `src/main/migration/imageModelV1.ts` (신규), `src/main/ipc/migrationHandlers.ts` (신규), `src/main/ipc/index.ts` (+3줄), `src/preload.ts` (+11줄), `src/__tests__/imageModelMigrationV1.test.ts` (신규) |
| 추가 LOC | +370 |
| 수정 LOC | +14 |
| 삭제 LOC | 0 |
| 회귀 위험 | **중간** — 신규 모듈이지만 사용자 데이터 변경 |
| renderer 변경 | **0줄** |
| automation 변경 | **0줄** |

내용: dry-run 기본 (`dryRunImageModelV1`), apply (`applyImageModelV1`), restore (`restoreFromBackup`). 자동 백업 → sha256 검증 → 변환 → 검증. 재실행 시 idempotent. IPC 3개 채널 등록. renderer는 `window.electronAPI.migration.imageModelV1.{dryRun|apply|restore}` 로 호출 가능.

### 회귀 검증
- `src/__tests__/imageModelMigrationV1.test.ts` (신규 12케이스): dryRun 5케이스, apply 6케이스, restore 2케이스.
- `npx vitest run src/__tests__/imageModelMigrationV1.test.ts` — 신규 테스트 PASS.
- `npx vitest run` — baseline 2077 대비 회귀 0건.
- `npm run lint` — 신규 errors 0건.
- `npm run build` — exit 0.

### 롤백
사용자별 백업 디렉터리에서 복원. 마이그레이션 트랜잭션 마커가 있으면 자동 롤백 안내 다이얼로그 표시.

> Phase 6 implemented: 2026-05-23, executor agent
> Changed files: src/main/migration/imageModelV1.ts (new), src/main/ipc/migrationHandlers.ts (new), src/main/ipc/index.ts (+3줄), src/preload.ts (+11줄), src/__tests__/imageModelMigrationV1.test.ts (new)
> Option C applied: UI integration deferred to Phase 6b (settingsUI.ts does not exist)
> renderer changes: 0 lines | automation changes: 0 lines

---

## Phase 7 — 레거시 필드 deprecated 처리 (7a + 7b 분할)

> **분할 결정 (2026-05-23)**: 원래 Phase 7은 (1) @deprecated JSDoc, (2) cleanupStaleImageReferences 제거,
> (3) automation 호환 분기 제거를 포함했으나, (3)이 god file 30+ 지점에 걸쳐있어
> [[feedback_no_cascade_fix]] 위반. Phase 7a (안전 부분)와 Phase 7b (automation 정리)로 분할.

### Phase 7a — @deprecated 마킹 + cleanupStaleImageReferences 제거 (완료)

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.345 |
| 변경 파일 | `src/image/types.ts` (deprecated JSDoc 4개), `src/renderer/modules/postManager.ts` (cleanupStaleImageReferences 함수+상수+변수+주석 ~140줄 제거), `src/renderer/renderer.ts` (import 1줄 + 호출 블록 제거) |
| 추가 LOC | +16 (JSDoc) |
| 삭제 LOC | ~155 |
| 회귀 위험 | **낮음** — Phase 4 blob 검증이 대체하므로 체감 변화 0 |

내용: `filePath`, `previewDataUrl`, `savedToLocal`, `url` 필드에 `@deprecated` JSDoc 추가.
`cleanupStaleImageReferences` 함수 자체 삭제 (Phase 4 imageDisplayHelpers.ts가 동일 역할 대체).
`src/automation/` 호환 분기는 Phase 7b로 미룸.

> Phase 7a implemented: 2026-05-23, executor agent

### 회귀 검증 (7a)
- vitest 2091/2091 PASS (baseline 대비 회귀 0건).
- `npm run lint` 신규 errors 0건.
- `npm run build` exit 0.

### Phase 7b — automation 호환 분기 제거 (별도 작업)

| 항목 | 내용 |
|------|------|
| 릴리즈 | v2.10.346 (별도 진행) |
| 변경 파일 | `src/automation/imageHelpers.ts`, `src/automation/editorHelpers.ts` |
| 추가 LOC | 0 |
| 삭제 LOC | ~25 |
| 회귀 위험 | **중간** — god file 30+ 지점 cascade 위험, 별도 정찰 필요 |

> 별도 작업으로 진행 — automation god file 30+ 지점 cascade 위험. 정찰 후 작업 범위 재확인 필요.

### 롤백 (7a)
삭제 코드 복원 가능하나, Phase 6 마이그레이션이 완료된 사용자는 legacy 필드 자체가 없으므로 의미 없음. revert 대신 hotfix 권장.

---

## 릴리즈 매핑 요약

| Phase | 릴리즈 | 누적 LOC (+/-) |
|-------|--------|----------------|
| 0 | v2.10.338 | +92 / 0 |
| 1 | v2.10.339 | +447 / 0 |
| 2 | v2.10.340 | +537 / 0 |
| 3 | v2.10.341 | +657 / 0 |
| 4 | v2.10.342 | +717 / 0 |
| 5 | v2.10.343 | +837 / 0 |
| 6 | v2.10.344 | +1262 / 0 |
| 7 | v2.10.345 | +1297 / -180 |

총 ~7주 (Phase 당 평균 1주, Phase 6은 사용자 데이터 변경이라 2주 가능).
