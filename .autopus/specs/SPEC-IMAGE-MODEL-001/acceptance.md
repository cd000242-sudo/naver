# SPEC-IMAGE-MODEL-001 — 수락 기준

검증 가능한 사실만 (MEMORY.md `feedback_no_speculation`). 추정 효과 ("개선됨", "향상됨") 금지.

## 1. 단위 테스트

### A-1. blob store 라운드트립
- **파일**: `tests/unit/blobStore.test.ts`
- **케이스**:
  - `write(bytes, meta) → blobId` 발급, `read(blobId)` 결과 바이트 정확히 일치 (sha256 비교).
  - `has(missingBlobId)` 결과 `false`.
  - `read(missingBlobId)` 결과 `{ok: false, reason: 'missing', placeholder: blob:URL}`.
- **통과 조건**: 모든 케이스 PASS, 실패 0건.

### A-2. blob store idempotent
- **파일**: `tests/unit/blobStore.idempotent.test.ts`
- **케이스**: 동일 sha256 bytes로 write 2회 → 같은 blob-id 반환, 디스크 파일 1개만 존재.
- **통과 조건**: blob-id 100% 일치.

### A-3. materializeTempFile
- **파일**: `tests/unit/imageHelpers.materialize.test.ts`
- **케이스**:
  - blob-id → tempPath, 파일 존재.
  - 같은 blob-id 2회 호출 → LRU 캐시 hit (같은 tempPath 반환).
  - 명시 unlink 후 다시 호출 → 새 tempPath 발급.
- **통과 조건**: 모든 케이스 PASS, temp 디렉터리 leak 0건.

### A-4. postManager 정규화
- **파일**: `tests/unit/postManager.normalize.test.ts`
- **케이스**: 3블록(469, 674, 841) 각각에 대해:
  - 입력: `{filePath: '/abs/path/img.png', url: 'blob:...', blobId: 'xxx'}`
  - 출력: `{blobId: 'xxx'}` (filePath, url 제거됨)
- **통과 조건**: 3블록 모두 PASS.

## 2. 통합 테스트

### A-5. 이미지 생성 → blob 회수 라운드트립
- **파일**: `tests/integration/image-generation-roundtrip.test.ts`
- **시나리오**: `writeImageFile(bytes, meta)` → `electronAPI.blobs.read(result.blobId)` → 동일 바이트 회수.
- **통과 조건**: sha256 100% 일치.

### A-6. 다른 PC 시뮬레이션
- **파일**: `tests/integration/postManager.cross-pc.test.ts`
- **시나리오**:
  - mock fs: 원래 PC 절대경로(`/foreign/path/img.png`) 누락.
  - localStorage에 `{blobId: 'xxx', filePath: '/foreign/path/img.png'}` 주입.
  - blob store에는 정상 blob 존재.
  - `loadPosts()` 호출 → 렌더링.
- **통과 조건**:
  - 렌더링된 이미지 src는 `blob:` URL (blob store에서 회수).
  - ERR 0건, console.error 0건.

### A-7. 빈 디렉터리 시뮬레이션
- **파일**: `tests/integration/postManager.empty-dir.test.ts`
- **시나리오**:
  - localStorage에 메타 5개.
  - blob store 디렉터리 비어있음.
  - `loadPosts()` 호출.
- **통과 조건**:
  - 5개 모두 placeholder 표시.
  - ERR 0건, console.error 0건.
  - `monitor/operationsDashboard.ts`에 missing 카운트 5 보고.

### A-8. postListUI batch has check
- **파일**: `tests/integration/postListUI.has-check.test.ts`
- **시나리오**: blob 일부 존재 / 일부 누락 mock → batch validate 호출.
- **통과 조건**: 존재 → 실제 썸네일, 누락 → placeholder.

## 3. 마이그레이션 검증

### A-9. idempotent
- **파일**: `tests/integration/migration.idempotent.test.ts`
- **시나리오**: 동일 입력 데이터로 마이그레이션 2회 실행.
- **통과 조건**:
  - 2회 모두 종료 코드 0.
  - 결과 localStorage 100% 동일 (JSON deep equal).
  - blob 디렉터리 100% 동일 (파일 수, sha256, 크기).

### A-10. dry-run
- **파일**: `tests/integration/migration.dry-run.test.ts`
- **시나리오**: `--apply` 없이 실행.
- **통과 조건**:
  - 디스크 변경 0건 (blob 디렉터리 생성 X, localStorage 변경 X).
  - 보고서 출력 (변환 예정 이미지 수, 누락 추정 이미지 수).

### A-11. 부분 실패 복원
- **파일**: `tests/integration/migration.partial-failure.test.ts`
- **시나리오**: 마이그레이션 중간에 강제 중단 (SIGKILL mock) → 재실행.
- **통과 조건**:
  - 트랜잭션 마커 파일 감지.
  - 재실행 시 idempotent 보장 (A-9와 동일 결과).

### A-12. 백업 복원
- **파일**: `tests/integration/migration.backup-restore.test.ts`
- **시나리오**: 마이그레이션 실행 → `scripts/restore-migration.ts {backup-ulid}` 호출.
- **통과 조건**:
  - 마이그레이션 전 localStorage 100% 복원.
  - 절대경로 파일 100% 복원 (sha256 일치).

## 4. 자동발행 회귀 가드

### A-13. 자동발행 풀플로우
- **명령**: `npm run test:full-flow`
- **기준**: SPEC 적용 전(v2.10.337) baseline 대비 회귀 0건.
- **통과 조건**:
  - 게시물 발행 성공 (네이버 응답 200).
  - 이미지 업로드 성공 (모든 이미지 네이버 CDN URL 응답).
  - 본문에 이미지 4개 모두 정상 삽입.
  - materialized temp file leak 0건 (테스트 종료 후 temp 디렉터리 깨끗).

### A-14. 자동발행 unit
- **파일**: `tests/unit/imageHelpers.publish.test.ts`
- **케이스**: blob-id 기반 mock publish → materializeTempFile 호출 → 네이버 API mock 응답 → unlink 호출 검증.
- **통과 조건**: 모든 mock 호출 시퀀스 일치.

## 5. 렌더링 가드

### A-15. 깨진 썸네일 첫 프레임 0건
- **파일**: `tests/e2e/post-list-render.spec.ts` (Playwright)
- **시나리오**:
  - 게시물 50개 (이미지 200개 메타 보유, 절반은 blob 누락).
  - 앱 시작 → 게시물 목록 렌더링.
  - 첫 프레임 스크린샷.
- **통과 조건**:
  - 스크린샷에 깨진 이미지 아이콘(브라우저 기본) 0건.
  - 누락 100개는 placeholder로 표시 (1x1 png blob URL).

## 6. 전체 회귀

### A-16. 기존 vitest 통과
- **명령**: `npx vitest run`
- **기준**: SPEC 적용 전 287/287.
- **통과 조건**: 신규 테스트 포함 ≥310/≥310 PASS, FAIL 0건.

### A-17. lint
- **명령**: `npm run lint`
- **기준**: SPEC 적용 전 0 errors / 966 warnings.
- **통과 조건**: errors 0건 유지 (warnings 증감은 허용 — 추적만).

### A-18. 빌드
- **명령**: `npm run build`
- **통과 조건**: exit 0, NSIS + portable 산출물 양쪽 생성.

## 7. 성공 기준 종합 (spec.md G-1~G-5 매핑)

| SPEC G | 검증 acceptance | 측정 명령 |
|--------|----------------|-----------|
| G-1 (다른 PC ERR 0) | A-6, A-7 | `npx vitest run tests/integration/postManager.cross-pc.test.ts tests/integration/postManager.empty-dir.test.ts` |
| G-2 (마이그레이션 idempotent) | A-9 | `npx vitest run tests/integration/migration.idempotent.test.ts` |
| G-3 (자동발행 회귀 0) | A-13, A-14 | `npm run test:full-flow` |
| G-4 (vitest 통과) | A-16 | `npx vitest run` |
| G-5 (깨진 썸네일 0) | A-15 | `npx playwright test tests/e2e/post-list-render.spec.ts` |

모든 acceptance PASS = SPEC 완료 조건 충족. Phase 별 release 시점에 해당 Phase의 acceptance 부분 집합을 통과해야 진입 가능.
