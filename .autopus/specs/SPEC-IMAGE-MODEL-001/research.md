# SPEC-IMAGE-MODEL-001 — 리서치

## 1. 정찰 결과 (file:line)

### 1.1 현재 데이터 모델
- **`src/image/types.ts:39-49`** `GeneratedImage`:
  - `filePath: string` — 절대경로 (예: `C:\Users\박성현\...\image.png`)
  - `url: string` — `blob:` 또는 `data:` (런타임 한정, 직렬화 시 의미 없음)
  - 두 필드의 의미가 코드 경로마다 다름 — 어떤 곳은 `url` 우선, 어떤 곳은 `filePath` 우선.

### 1.2 신규 이미지 발급
- **`src/image/imageUtils.ts:51-179`** `writeImageFile(bytes, meta)`:
  - 사용자 PC 절대경로에 fs.writeFile.
  - 두 표현(filePath + previewDataUrl)이 동시에 발급되는 유일한 지점 — blob store 통합 진입점으로 적합.
  - **검증 필요(미해결)**: 메인 프로세스 함수이므로 `URL.createObjectURL`은 사용 불가. 현 구현은 Base64 data URL을 만들어 `previewDataUrl`로 반환하는 것으로 추정. Phase 2 진입 전 정확한 동작 확인 필요.

### 1.3 localStorage 저장 경로 (3블록 절대경로 전파 버그)
- **`src/renderer/modules/postManager.ts:469-478`** — 생성 시 저장 (write path 1)
- **`src/renderer/modules/postManager.ts:674-682`** — 수정 시 저장 (write path 2)
- **`src/renderer/modules/postManager.ts:841-850`** — 가져오기 시 저장 (write path 3)
- 세 블록 모두 `GeneratedImage`를 그대로 JSON.stringify 하여 `filePath`(절대경로)가 박제됨.
- 정규화 코드(674-682)에서 `previewDataUrl: img.previewDataUrl || img.url || img.filePath || ''` 패턴이 있어, previewDataUrl이 비면 절대경로가 모든 필드로 전파됨 — **핵심 버그**.
- **`src/renderer/utils/postStorageUtils.ts:11`** `GENERATED_POSTS_KEY` — localStorage 키.

### 1.4 사후 청소
- **`src/renderer/modules/postManager.ts:256-385`** `cleanupStaleImageReferences`:
  - 렌더 직후 fs.existsSync로 깨진 참조 검색.
  - 첫 프레임의 깨진 썸네일을 막을 수 없음 — 사후 청소의 본질적 한계.
  - `STALE_IMAGE_CLEANUP_DONE_KEY` v2 플래그로 1회만 실행 → 백업과 함께 다른 PC 복원 시 재실행 안 됨.

### 1.5 렌더 전 검증
- **`src/renderer/modules/postListUI.ts:73-115`** batch validate:
  - fs 존재 여부만 확인.
  - filePath/savedToLocal/url 검사하지만 previewDataUrl 필드 자체는 안 검사 → 절대경로가 previewDataUrl로 전파된 경우 통과시킴.
  - 의미적 검증(다른 PC에서 같은 메타가 유효한가?) 불가.

### 1.6 IPC 시그니처
- **`src/preload.ts:55`** electronAPI 전체 export
- **`src/preload.ts:134-136`** 기존 fs 헬퍼
- **`src/preload.ts:632-650`** 이미지 관련 IPC — blob store 확장 지점.

### 1.7 자동발행 측 fs 직접 접근 (어댑터 필요)
- **`src/automation/imageHelpers.ts:1123`** `fs.readFile(img.filePath)` 직접 호출
- **`src/automation/imageHelpers.ts:1374`** 동일 패턴 반복
- **`src/automation/imageHelpers.ts:2136-2199`** 이미지 업로드 메인 함수 — fs 의존도 가장 높음
- **`src/automation/imageHelpers.ts:2769-2775`** 후처리 fs 호출
- **`src/automation/editorHelpers.ts:820-933`** 본문 삽입 — `img.url || img.filePath` 분기
- **`src/automation/editorHelpers.ts:1210-1515`** 발행 직전 변환 — 동일 분기

## 2. 옵션 비교

| 옵션 | (a) blob-id + main lookup | (b) per-post 상대경로 | (c) Base64 inline |
|------|---------------------------|----------------------|-------------------|
| localStorage 부담 | 메타만 (~1KB/이미지) | 메타만 + 경로 | 바이트 전체 (수 MB) |
| 5MB 한도 위반 | X | X | **O** (1게시물도 초과 가능) |
| 다른 PC 복원 | O (blob-id만 의미 있음) | △ (디렉터리 구조 보존 필요) | O |
| 사용자 백업/복원 | O (userData/blobs 폴더 복사) | △ (디렉터리 누락 시 깨짐) | O (localStorage 자체) |
| 자동발행 어댑터 비용 | 중 (materializeTempFile) | 저 (경로 prefix만 변경) | 고 (모든 fs 호출 변경) |
| 마이그레이션 비용 | 중 | 저 | 고 (Base64 인코딩) |
| dedup 가능 | O (sha256 키) | X | X |
| 메모리 부담 | 저 | 저 | **고** (렌더러가 모든 바이트 보유) |
| **채택** | **O** | X | X |

### 폐기 근거
- **(b) per-post 상대경로**: 사용자 백업/복원 시 디렉터리 구조 보존이 불완전. 사용자가 `userData/posts/` 일부만 복사하면 절대경로 전파와 같은 문제 재발.
- **(c) Base64 inline**: localStorage 5MB 한도. 이미지 4개짜리 게시물 1개로도 초과 가능. 메모리 부담도 크다.

## 3. localStorage 한도 측정 방법

```js
// 콘솔에서 실행
function measureLocalStorage() {
  let total = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += (key.length + localStorage[key].length) * 2; // UTF-16
    }
  }
  return { totalBytes: total, totalMB: (total / 1024 / 1024).toFixed(2) };
}
```

- Chromium 기본 한도: **약 5MB per origin** (10MB까지 늘릴 수 있으나 Electron 기본값은 5MB).
- 옵션 (c) 폐기 근거의 정량 측정 도구.

## 4. 자동발행이 현재 어떻게 쓰는가

### `imageHelpers.ts:2136-2199` 인용 (의역)
```ts
// 1. img.filePath로 fs.readFile
// 2. 바이트를 multipart/form-data로 변환
// 3. 네이버 이미지 업로드 API 호출
// 4. 응답 URL을 img.url로 덮어씀
```

→ 어댑터 후:
```ts
// 1. materializeTempFile(img.blobId) → tempPath
// 2. tempPath를 fs.readFile (이하 동일)
// 3. ...
// 4. 발행 종료 시 unlink(tempPath)
```

### `editorHelpers.ts:820-933` 인용 (의역)
```ts
const src = img.url || img.filePath;
// src를 <img src="..."> 본문에 삽입
```

→ 어댑터 후:
```ts
const src = await materializeTempFile(img.blobId);
// src를 <img src="file://..."> 본문에 삽입
// 발행 사이클 종료 후 unlink
```

## 5. 백업/복원 사용자 워크플로우

### 현재 (취약)
1. 사용자가 `%APPDATA%/better-life-naver/Local Storage` 복사 → 다른 PC 붙여넣기
2. localStorage의 `filePath`가 원래 PC 경로 → 다른 PC에서 ENOENT
3. 게시물 목록 깨짐 → 수동 복구 불가

### 마이그레이션 후
1. 사용자가 `%APPDATA%/better-life-naver/blobs/` + `Local Storage` 양쪽 복사 → 다른 PC 붙여넣기
2. localStorage의 `blobId`가 blobs 디렉터리에서 lookup 성공 → 정상 동작
3. blobs 디렉터리만 누락 → placeholder 표시 + 사용자에게 누락 안내

### 자동 백업 (마이그레이션 시)
- `{userData}/backup/migrations/SPEC-IMAGE-MODEL-001-{ulid}/`
- 안에 `localStorage.json`, `filepath-images/`(절대경로 파일 전체 복사), `manifest.json`(sha256 매니페스트)
- 복원 시: `scripts/restore-migration.ts {backup-ulid}` 로 일괄 복원.

## 6. 미해결 의문

1. **Q1**: `blob-id` 명명을 ULID로 할지 UUIDv7으로 할지. 둘 다 시간 순 정렬 가능. → **ULID 선택** (Phase 1에서 `package.json` 의존성 확인 필요).
2. **Q2**: 마이그레이션 도중 사용자가 새 이미지 생성 시 처리. → **Phase 6 마이그레이션 UI에서 마이그레이션 중 이미지 생성 잠금** (트랜잭션 마커 파일 존재 시 차단).
3. **Q3**: blob 디렉터리 fan-out 깊이. 1단계(2자) vs 2단계(2자/2자). → **1단계 채택** (사용자별 이미지 수가 수만 건 이하 예상, 2단계는 과설계).
4. **Q4**: 자동발행 materialized temp file의 unlink 책임 — 호출자 vs LRU 자동. → **LRU + 호출자 명시 unlink 권장** (이중 안전망).
5. **Q5**: legacy 필드 제거 시점 — Phase 7 즉시 vs 6주 deprecated 후. → **6주 deprecated 후** (외부 스크립트 호환).
6. **Q6 (미해결)**: 카페 모드(SPEC-CAFE-MODE-001)와 blob store 공유 vs 분리. → **본 SPEC 범위 외, 카페 모드 SPEC에서 결정**.
7. **Q7 (미해결)**: `writeImageFile`이 메인 프로세스 함수인데 `previewDataUrl`이 어떻게 발급되는지 정확히 확인 필요 (Base64 data URL 추정). Phase 2 진입 전 검증.
