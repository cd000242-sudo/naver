# SPEC-IMAGE-MODEL-001 — 이미지 모델 재설계 (blob-id 기반)

| 항목 | 값 |
|------|----|
| Status | draft |
| Created | 2026-05-23 |
| Domain | IMAGE |
| Owner | 박성현 (cd000242@gmail.com) |
| Related | SPEC-IMAGE-RECOVERY-001 (선행), SPEC-CONVERSION-001 (간접) |

## 1. 배경

현재 생성 이미지의 메타데이터는 `localStorage` (`GENERATED_POSTS_KEY`, `postStorageUtils.ts:11`)에 저장되고, 바이트는 사용자 PC의 절대경로(`writeImageFile`, `imageUtils.ts:51-179`)에 떨어진다. `GeneratedImage` (`types.ts:39-49`)는 `filePath`(절대경로)와 `url`(blob: 또는 data:)을 동시에 보유하는데, 이 두 필드의 의미가 코드 경로마다 달라 다음 문제가 발생한다:

- **절대경로 전파 버그** — `postManager.ts:469-478, 674-682, 841-850` 세 블록에서 절대경로가 다른 PC로 복사되거나 빈 디렉터리에서 복원될 때 그대로 살아남아 `ENOENT`를 유발한다.
- **사후 청소의 한계** — `cleanupStaleImageReferences` (`postManager.ts:256-385`)는 렌더 후 깨진 참조를 추적해 지우는 방식이라, 첫 렌더 한 프레임 동안 깨진 썸네일이 노출되고 자동발행 큐는 이미 절대경로를 잡아 실패한다.
- **렌더 전 검증의 일관성 부족** — `postListUI.ts:73-115`의 batch validate는 fs 존재 여부만 묻고, 같은 메타가 다른 PC에서 의미를 잃었는지(예: 사용자 변경)는 검증하지 못한다.
- **자동발행과 어댑터 부재** — `imageHelpers.ts:1123, 1374, 2136-2199, 2769-2775`와 `editorHelpers.ts:820-933, 1210-1515`는 `img.url || img.filePath` 분기로 fs를 직접 읽기 때문에, 모델이 바뀌면 자동발행 전체가 깨진다.

옵션 B(electron 버전과 빌드 정의 자동 동기화)는 이전 세션이 별개로 식별했으나 본 SPEC의 Phase 0에 흡수한다 — 모델 마이그레이션 도중 빌드 정의 불일치가 회귀를 가린다는 위험 때문.

## 2. 목적

이미지 바이트의 저장 단위를 "blob-id"로 정규화하고, localStorage는 메타데이터(blob-id + 의미적 속성)만 담도록 한다. 렌더러는 fs 절대경로를 알지 못하며, main process가 blob-id를 받아 바이트를 lookup한다. 그 결과:

- 다른 PC 복원 / Documents 미러 / userData 분기 사이에 절대경로 전파가 원천 불가능.
- 누락 시 placeholder 응답으로 사후 청소 단계 자체를 제거.
- 자동발행은 `materializeTempFile(blobId) → tempPath` 어댑터로 기존 fs 코드를 최소 침습으로 재사용.

## 3. 범위

### In
- `GeneratedImage` 스키마 변경 (`types.ts:39-49`)
- main process blob store + IPC (`preload.ts:55, 134-136, 632-650`)
- 신규 이미지 발급 경로 (`imageUtils.ts:writeImageFile`)
- localStorage 메타 정규화 (`postManager.ts:469-478, 674-682, 841-850`)
- 렌더 전 검증 (`postListUI.ts:73-115`)
- 자동발행 어댑터 (`imageHelpers.ts:2136-2199`, `editorHelpers.ts:820-933, 1210-1515`)
- 기존 데이터 마이그레이션 스크립트 (idempotent + dry-run + 자동 백업)

### Out
- 이미지 생성 알고리즘 자체 변경
- 카페 모드 별도 저장 (SPEC-CAFE-MODE-001 관할)
- 클라우드 동기화

### Non-Goals
- Base64 inline 저장 (localStorage 5MB 한도 위반)
- per-post 디렉터리 상대경로 (사용자 백업/복원 시 무결성 보장 불가)
- 다른 PC로의 실시간 동기화

## 4. 핵심 요구사항

### R-1. blob-id 데이터 스키마

```ts
// src/image/types.ts
interface GeneratedImage {
  blobId: string;          // ULID, 신규 필드 (primary key)
  mimeType: string;        // 'image/png' | 'image/jpeg' | 'image/webp'
  width: number;
  height: number;
  byteSize: number;        // 무결성 검증용
  sha256: string;          // 마이그레이션 dedup 키
  createdAt: number;       // epoch ms
  // ---- legacy (deprecated, Phase 7에서 제거) ----
  filePath?: string;
  url?: string;
}
```

- `blobId`는 ULID. 시간순 정렬 가능하므로 마이그레이션 백업 디렉터리 명명에도 재사용.
- 실제 바이트는 `{userData}/blobs/{blobId[0:2]}/{blobId}.{ext}`에 저장. 2자 디렉터리 fan-out으로 단일 디렉터리 inode 폭증 방지.

### R-2. main process lookup IPC

```ts
// src/preload.ts (확장)
window.electronAPI.blobs = {
  read: (blobId: string) => Promise<BlobReadResult>;
  has: (blobId: string) => Promise<boolean>;
  materializeTempFile: (blobId: string) => Promise<string | null>; // 자동발행 어댑터
  write: (bytes: Uint8Array, meta: BlobMetaInput) => Promise<GeneratedImage>;
};

type BlobReadResult =
  | { ok: true; bytes: Uint8Array; meta: GeneratedImage }
  | { ok: false; reason: 'missing' | 'corrupt'; placeholder: string }; // placeholder: blob:URL of 1x1 png
```

- `read`는 누락/손상 시에도 throw 하지 않는다. placeholder를 반드시 반환.
- `materializeTempFile`은 자동발행 전용. 호출 시 `os.tmpdir()`에 LRU 보관, 호출자 책임으로 unlink. fs 직접 접근하던 `imageHelpers.ts:1123, 1374`를 어댑터로 흡수.

### R-3. 누락 blob placeholder 응답

- 어떤 호출 경로(렌더, 자동발행, 검증)에서도 누락 blob은 placeholder로 응답하여 ERR 0건 보장.
- 누락 사실은 `monitor/operationsDashboard.ts` 메트릭으로 비동기 보고 — UI는 계속 동작.

### R-4. 마이그레이션 idempotent + dry-run + 자동 백업

기존 사용자 데이터(`filePath` 보유) 마이그레이션 스크립트:

1. dry-run 모드 기본값. `--apply` 플래그 없으면 보고서만 출력.
2. 시작 전 `{userData}/backup/migrations/SPEC-IMAGE-MODEL-001-{ulid}/` 디렉터리에 localStorage 전체 + 참조된 절대경로 파일 전체를 복사. 백업 완료 SHA256 검증 후에만 진행.
3. 각 `GeneratedImage`에 대해:
   - `filePath` 존재 → 바이트 읽어 sha256 계산 → 동일 sha256 blob이 store에 있으면 dedup, 없으면 신규 blob-id 발급.
   - `filePath` 누락 → blob-id를 생성하되 placeholder 마킹.
4. 같은 입력으로 2회 이상 실행해도 동일 결과 (idempotent).
5. 실패 시 백업 디렉터리에서 복원 절차 문서화.

### R-5. 자동발행 호환 (materializeTempFile 어댑터)

- `imageHelpers.ts:2136-2199, 2769-2775`의 fs 직접 접근 → `materializeTempFile(blobId)` 호출로 치환.
- `editorHelpers.ts:820-933, 1210-1515`의 `img.url || img.filePath` 분기 → `img.blobId`만 받도록 단일화. legacy 필드는 Phase 7까지 호환 분기로 유지.
- 자동발행 한 사이클이 끝나면 materialized temp file 자동 unlink.

### R-6. 렌더 전 검증을 blob 존재 확인으로 교체

- `postListUI.ts:73-115`의 batch validate → `electronAPI.blobs.has(blobId)` 일괄 호출로 교체.
- 누락 시 placeholder를 즉시 표시하고 깨진 썸네일 프레임 0건.
- `cleanupStaleImageReferences` (`postManager.ts:256-385`)는 Phase 4 완료 시 호출 불필요 — Phase 7에서 제거.

## 5. 비요구사항

- localStorage 용량 최적화 자체는 부수 효과일 뿐 본 SPEC의 목표 아님.
- blob store에 LRU eviction은 도입하지 않음 (사용자가 의도적으로 삭제하기 전까지 영구 보관).
- 동시성: blob write는 같은 sha256 충돌 시 마지막 쓰기가 이긴다 (멱등이므로 안전).

## 6. 의존성

- 선행: SPEC-IMAGE-RECOVERY-001 (이미지 복구 메커니즘) — 마이그레이션 시 복구 로직 재사용.
- 도구: `ulid` npm 패키지 (Phase 1 시작 시 `package.json` 확인 필요 — 부재 시 추가).
- Phase 0 옵션 B: electron-builder define 자동 동기화 — 모델 변경 도중 빌드 메타 불일치 차단.

## 7. 참고 코드 위치

| 파일 | 라인 | 의미 |
|------|------|------|
| `src/image/types.ts` | 39-49 | `GeneratedImage` 기존 스키마 |
| `src/image/imageUtils.ts` | 51-179 | `writeImageFile` — 신규 blob 발급 진입점 |
| `src/renderer/modules/postManager.ts` | 256-385 | `cleanupStaleImageReferences` (Phase 7 제거) |
| `src/renderer/modules/postManager.ts` | 469-478, 674-682, 841-850 | 절대경로 전파 3블록 |
| `src/renderer/modules/postListUI.ts` | 73-115 | 렌더 전 batch validate |
| `src/renderer/utils/postStorageUtils.ts` | 11 | `GENERATED_POSTS_KEY` |
| `src/preload.ts` | 55, 134-136, 632-650 | IPC 시그니처 확장 지점 |
| `src/automation/imageHelpers.ts` | 1123, 1374, 2136-2199, 2769-2775 | fs 직접 접근 → 어댑터 교체 |
| `src/automation/editorHelpers.ts` | 820-933, 1210-1515 | `img.url || img.filePath` 분기 |

## 8. 변경 영향 추정

| 영역 | 추가 LOC | 수정 LOC | 삭제 LOC | 위험 |
|------|---------|---------|---------|------|
| main process blob store | +280 | 0 | 0 | 낮음 (신규 모듈) |
| preload IPC | +40 | 0 | 0 | 낮음 |
| GeneratedImage 스키마 | +18 | -2 | 0 | 중간 (타입 전파) |
| postManager.ts | +60 | -45 | 0 | 높음 (god file, 3블록 fix) |
| postListUI.ts | +20 | -25 | 0 | 중간 |
| imageUtils.ts | +50 | -15 | 0 | 중간 |
| imageHelpers.ts | +30 | -40 | 0 | 높음 (자동발행 god file) |
| editorHelpers.ts | +20 | -30 | 0 | 높음 (자동발행 god file) |
| 마이그레이션 스크립트 | +400 | 0 | 0 | 중간 (idempotent 검증 필수) |
| 합계 | ~+918 | ~-157 | 0 | — |

회귀 cascade 절대 금지 원칙(MEMORY.md `feedback_no_cascade_fix`)에 따라 Phase 단위로 1릴리즈당 1-3 파일 fix 한도를 강제한다.

## 9. 위험

- **R-위험-1**: 자동발행 god file 침습 — `imageHelpers.ts`, `editorHelpers.ts`는 정찰한 라인 외에도 fs 의존이 산재. Phase 5에서 grep으로 잔재 fs 호출 0건 확인 필요.
- **R-위험-2**: 마이그레이션 도중 사용자가 앱 종료 — Phase 6에서 트랜잭션 마커 파일로 재개 가능하게 설계.
- **R-위험-3**: blob-id 충돌 (ULID 충돌은 사실상 0) — sha256 검증으로 이중 안전망.
- **R-위험-4**: legacy 필드(`filePath`, `url`)에 의존하는 외부 스크립트/플러그인 — Phase 7 deprecated 경고 6주 후 제거.
- **R-위험-5**: 옵션 B(빌드 정의 동기화) 누락 시 마이그레이션 회귀가 빌드 메타 불일치로 가려짐 — Phase 0 우선 처리.

## 10. 성공 기준

검증 가능한 사실만 (MEMORY.md `feedback_no_speculation`):

- **G-1**: 다른 PC 시뮬레이션 테스트(절대경로 mock + 빈 디렉터리)에서 깨진 이미지 참조 ERR 0건. 측정: `tests/integration/image-model-cross-pc.test.ts`.
- **G-2**: 마이그레이션 스크립트 2회 실행 결과 blob-id, sha256, byteSize 100% 동일.
- **G-3**: 자동발행 풀플로우(`npm run test:full-flow`) 회귀 0건. 마이그레이션 전후 동일 게시물 발행 성공률 동일 또는 상승.
- **G-4**: 287/287 vitest 통과 유지. 신규 단위 테스트(blob store, materializeTempFile, migration) 추가 후 합계 ≥310 통과.
- **G-5**: 렌더링 첫 프레임에서 placeholder가 아닌 깨진 썸네일 노출 0건. 측정: Playwright 스크린샷 diff.
