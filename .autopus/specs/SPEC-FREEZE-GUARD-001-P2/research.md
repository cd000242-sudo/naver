# SPEC-FREEZE-GUARD-001-P2 리서치

## 1. Grep 실측 결과 (2026-05-17)

명령: `Buffer.from\([^)]*['"]base64['"]\)` (src/ 전체)
**총 23건 발견** — perf-summary가 언급한 "12파일"은 메인 프로세스 핵심 경로 기준 추정치였고, 본 SPEC은 실측 23건을 기준으로 H1/H2/H3 우선순위로 분류한다.

### 1.1 H1 — 핫 패스 + 큰 페이로드 (사용자 freeze 직접 유발)

| 파일:라인 | 컨텍스트 1줄 | 페이로드 |
|---|---|---|
| `src/main/ipc/imageHandlers.ts:378` | Gemini 응답 inlineData → fsp.writeFile (테스트 이미지) | 1MB+ |
| `src/main/ipc/imageHandlers.ts:611` | Gemini 응답 inlineData → fsp.writeFile (fallback 경로) | 1MB+ |
| `src/main/ipc/imageHandlers.ts:820` | Gemini inlineData → cachePath 저장 | 1MB+ |
| `src/main/ipc/imageHandlers.ts:916` | Gemini inlineData → cachePath 저장(다른 모델) | 1MB+ |
| `src/main/ipc/imageHandlers.ts:1219` | Veo inlineData → 비디오 파일 (mp4) | 수 MB ~ 수십 MB |
| `src/image/nanoBananaProGenerator.ts:1334` | fbPart.inlineData.data → `let fbBuffer: Buffer = Buffer.from(..., 'base64') as Buffer` (fallback 본체) | 1MB+ |
| `src/image/nanoBananaProGenerator.ts:1475` | 메인 generate 루프 `let buffer: Buffer = Buffer.from(imageData, 'base64')` → cropThumbnail → sharp 처리 | 1MB+ |
| `src/image/nanoBananaProGenerator.ts:1744` | 후처리 직전 `let finalBuffer: Buffer = Buffer.from(part.inlineData.data, 'base64')` | 1MB+ |
| `src/image/nanoBananaProGenerator.ts:1883` | edit 경로 inlineData 디코딩 | 1MB+ |
| `src/image/nanoBananaProGenerator.ts:1964` | 다른 edit 변종 경로 디코딩 | 1MB+ |

**H1 호출 빈도**: 헤딩(이미지 1개)당 1~3회. 일반 발행에서 5~10 헤딩 = 한 발행당 5~30회 호출. 메인 스레드 직격.

### 1.2 H2 — 이미지 생성 1회 (큰 페이로드)

| 파일:라인 | 컨텍스트 | 페이로드 |
|---|---|---|
| `src/image/openaiImageGenerator.ts:221` | OpenAI b64_json (gpt-image-2 메인 경로 retry 루프 내부) | 1.18MB |
| `src/image/openaiImageGenerator.ts:365` | OpenAI b64_json (대체 경로) | 1.18MB |
| `src/image/deepinfraGenerator.ts:730` | DeepInfra b64_json (FLUX 메인) | 1MB+ |
| `src/image/deepinfraGenerator.ts:784` | DeepInfra b64_json (재시도 경로) | 1MB+ |
| `src/image/deepinfraGenerator.ts:947` | DeepInfra Redux img2img 응답 | 1MB+ |
| `src/image/imageFxGenerator.ts:1384` | ImageFX encodedImage | 1MB+ |

**H2 호출 빈도**: 이미지 생성 1회당 1번. 헤딩(이미지 1개)당 1회. H1과 다른 점은 엔진별 1회씩만 호출 (재시도 시 제외).

### 1.3 H3 — 저빈도 또는 폴백 경로

| 파일:라인 | 컨텍스트 | 페이로드 |
|---|---|---|
| `src/image/nanoBananaProGenerator.ts:135` | Imagen 4 fallback `bytesBase64Encoded` | 1MB+ (폴백만) |
| `src/automation/imageHelpers.ts:699` | data URL → 임시 파일 (발행 중 1회) | 가변 (수십 KB ~ 수 MB) |
| `src/main/services/BlogExecutor.ts:293` | 외부 입력 base64 → posts/{id}/image | 가변 |
| `src/main.ts:6239` | 사용자가 저장 다이얼로그로 이미지 저장 시 | 가변 |
| `src/main/ipc/imageDownloadHandlers.ts:40` | 수동 다운로드 — data URL 분기 | 가변 |

### 1.4 비범위 (작은 페이로드 — 동기 유지)

| 파일:라인 | 페이로드 | 사유 |
|---|---|---|
| `src/account/blogAccountManager.ts:100` | 패스워드 복호화 (수백 바이트) | < 256KB |
| `src/quotaManager.ts:46` | 24바이트 고정 salt | 상수, 1회성 |
| `src/tests/test31flash.ts:76` | 테스트 스크립트 | 사용자 경로 아님 |
| `src/tests/testGeminiImage.ts:72` | 테스트 스크립트 | 사용자 경로 아님 |

---

## 2. 페이로드 크기 근거

**예상 효과** 라벨 (실측 전 — `feedback_no_speculation` 준수):

- gpt-image-2 (`b64_json`): perf-summary 측정값 **1.18MB** — 1024×1024 PNG 평균 크기 근거
- DeepInfra FLUX: 1024×1024 PNG ≈ 1~2MB Base64 — 실측 전, 코드 컨텍스트 추정
- Gemini 2.5 Flash Image (`inlineData.data`): perf-summary "1MB+" — 실측 전, 모델 출력 사양 기반
- Veo 비디오 (`inlineData.data` with mimeType video/*): 수 MB ~ 수십 MB — 실측 전, 사양 기반
- Imagen 4 (`bytesBase64Encoded`): 1024×1024 PNG ≈ 1MB Base64 — 실측 전

**실측 계획**: P2-R1 인프라 단계에서 `AUTOPUS_BASE64_DEBUG=1` 환경변수로 각 호출의 size를 로깅 후 baseline 확정. **추정치는 SPEC 본문에서 의사결정 근거로 사용하지 않는다**.

---

## 3. 호출 패턴 분석

### 3.1 공통 패턴 A: `const buffer = Buffer.from(b64, 'base64')`
- 대다수 호출. 단순 교체 가능.
- 예: `imageHandlers.ts:378`, `openaiImageGenerator.ts:221`

### 3.2 공통 패턴 B: `let buffer: Buffer = Buffer.from(b64, 'base64')` 후 재할당
- `nanoBananaProGenerator.ts:1475`, `:1744`, `:1334`
- `let`이라 `await decodeBase64Async()`로 교체해도 타입 호환 — 안전.

### 3.3 공통 패턴 C: 직접 인라인 `fsp.writeFile(path, Buffer.from(b64, 'base64'))`
- `imageHandlers.ts:820`, `:916`, `BlogExecutor.ts:293`
- 두 줄로 분리해야 함: `const buf = await decodeBase64Async(b64); await fsp.writeFile(path, buf);`

### 3.4 공통 패턴 D: data URL 파싱 직후 `Buffer.from(matches[2], 'base64')`
- `imageHelpers.ts:699`, `imageDownloadHandlers.ts:40`, `main.ts:6239`
- 동일하게 헬퍼 호출로 교체.

---

## 4. worker_threads vs 대안 검토

| 옵션 | 장점 | 단점 |
|---|---|---|
| **worker_threads** (선정) | Node.js 표준. 안정. Electron v31 호환. transferList로 zero-copy 가능 | cold start, packaging 이슈 가능성 |
| child_process | 격리 강함 | spawn 비용 큼, IPC 오버헤드, 부적합 |
| setImmediate 청크 분할 | 구현 단순 | 메인 스레드는 여전히 점유. freeze 근본 해결 안 됨 |
| Native addon (N-API) | 가장 빠름 | 빌드 복잡, electron-builder 통합 부담 |

**결정**: worker_threads. perf-summary 권고와 동일. R1 단계에서 cold start와 transferList 비용 실측.

---

## 5. Electron + worker_threads 알려진 주의점

- Worker 스크립트는 dist에 별도 파일로 존재해야 함 (인라인 string 가능하나 디버깅 어려움).
- electron-builder `extraResources`/`asarUnpack` 설정 검토 필요 — R1 단계 T4.
- Electron v31은 Node v20 내장. `worker_threads` API는 안정 등급(stable).

---

## 6. 설계 결정

D1. **단일 pool**: feature별 분리 X. CPU 작업이라 풀 다중화 이점 없음.
D2. **threshold 기반 분기**: 256KB 미만은 동기 — 워커 round-trip 오버헤드(추정 10~50ms, 실측 필요)가 디코딩 비용보다 클 가능성.
D3. **동기 폴백**: 워커 실패 시 silent fail 금지하되 디코딩 자체는 동기로라도 완수. 사용자에게 보이는 동작은 그대로.
D4. **AbortSignal 지원**: 발행 중단 시 dangling 워커 작업 방지.
D5. **debug 환경변수**: `AUTOPUS_BASE64_DEBUG=1`로 각 호출 size/duration 로깅 — baseline 확정 및 회귀 분석에 활용.

---

## 7. 메모리 원칙 준수 체크리스트

- [x] **feedback_no_cascade_fix**: 23곳을 5개 릴리즈로 분할 (R1~R5)
- [x] **feedback_no_speculation**: SPEC 본문 추정 수치는 "예상 효과" 라벨로 격리. 수락 기준은 측정 가능한 임계만 사용
- [x] **feedback_no_fallback**: silent 폴백 금지 원칙 준수. 단 헬퍼 내부 동기 폴백은 "같은 작업의 안전망"이라 허용 — 다른 엔진/모델 전환과는 성격이 다름
- [x] **language-policy**: SPEC 한국어 작성 (ai_responses=ko)
- [x] **file-size-limit**: 신규 파일 3개(`base64Pool.ts`, `base64Worker.ts`, `base64Async.ts`) 모두 200줄 미만 목표 (300줄 한도)

---

## 8. 의존성 및 후속 작업

- 부모: SPEC-FREEZE-GUARD-001 Phase A1 (e2e 인프라) — 완료 (v2.10.240)
- 동시 권고된 P0/P1: perf-summary가 P0(Adaptive Limiter)과 P1(동기 fs)을 먼저 처리하라 권고. 본 SPEC(P2)은 P0/P1과 **독립적으로 진행 가능**하나, 핫스팟 합산 효과 측정은 P0/P1 적용 이후 baseline에서 평가하는 것이 정확.
- 후속 SPEC 후보: 이미지 후처리(sharp, EXIF) 워커 분리, Renderer 프로세스 freeze 별도 처리.

---

## Ref

- Grep 명령: `Buffer\.from\([^)]*['"]base64['"]\)` (src/)
- 진단 문서: `docs/diagnosis-2026-04-28/perf-summary.md`
- E2E baseline: `e2e/freeze-detection.spec.ts` (v2.10.240, 2026-05 작성)
