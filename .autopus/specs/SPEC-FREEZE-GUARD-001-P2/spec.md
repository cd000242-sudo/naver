# SPEC-FREEZE-GUARD-001-P2: Base64 디코딩 worker_threads 분리

**Status**: draft
**Created**: 2026-05-17
**Domain**: FREEZE-GUARD
**Owner**: 박성현 (cd000242@gmail.com)
**Parent**: SPEC-FREEZE-GUARD-001 (Phase A1 — freeze-detection.spec.ts 인프라 완료, v2.10.240)
**Phase**: P2 (Base64 디코딩 분리)
**Depends on**: SPEC-FREEZE-GUARD-001 Phase A1 (E2E 감지 인프라)

---

## 1. 배경

`docs/diagnosis-2026-04-28/perf-summary.md`의 Top 5 핫스팟 중 **#1 항목**.

- `Buffer.from(b64, 'base64')` 동기 디코딩이 코드베이스 전반에 분산되어 있다.
- 사전 조사(`research.md`)에서 실측한 호출 위치: **src/ 하위 23곳**(perf-summary가 언급한 "12파일"은 메인 프로세스 핵심 경로 기준).
- 메인 프로세스 핫 패스에서 가장 큰 페이로드:
  - **gpt-image-2 / DeepInfra / Imagen 4**: 약 1.18MB Base64 → 디코딩 후 Buffer (이미지 생성 직후 1회)
  - **Gemini 2.5 Flash Image (nanoBananaPro)**: 1MB 이상 Base64를 헤딩당 1~3회 반복
  - **veo 비디오**: 단일 파일이 수 MB ~ 수십 MB
- perf-summary 추정: worker_threads 분리 시 "이미지 생성 직후 응답없음" 시나리오의 freeze 빈도 50% 이상 감소 (**추정치, 실측 전**).

본 SPEC은 메모리에 저장된 두 원칙을 엄수한다:

- **회귀 cascade 금지** (feedback_no_cascade_fix): 1릴리즈당 1~3 fix. 23곳을 단일 PR로 전환하지 않고 영향도 기반 단계 분할.
- **추정 효과 금지** (feedback_no_speculation): 본 SPEC에는 "예상 효과" 라벨이 붙은 항목만 추정 허용. 모든 성공 기준은 `freeze-detection.spec.ts`로 측정 가능한 수치만 사용.

---

## 2. 목적

| 분류 | 목표 |
|------|------|
| **메인 스레드 해방** | 1MB 이상 Base64 페이로드의 동기 디코딩을 메인 스레드에서 제거 |
| **회귀 없는 점진 적용** | feature별 1~3 fix 단위로 분할, 각 단계마다 freeze-detection.spec.ts 통과 검증 |
| **추상화** | `decodeBase64Async()` 헬퍼로 호출 지점 일관화 (worker pool은 헬퍼 내부 캡슐화) |
| **하위 호환** | 작은 페이로드(< 1MB 또는 토큰성)는 동기 경로 유지 — 워커 오버헤드 회피 |

---

## 3. 범위 (in)

R1. **메인 프로세스 측 1MB 이상 페이로드 디코딩** 호출 전부를 비동기 헬퍼로 대체.

대상 (사전 조사 결과 — 정확한 위치는 `research.md` 참조):

| 우선순위 | 파일 | 호출 수 | 페이로드 출처 | 사용자 핫 패스 |
|---|---|---|---|---|
| H1 | `src/image/nanoBananaProGenerator.ts` | 6 | Gemini Flash Image inline data (1MB+) | 이미지 생성 직후 1~3회/헤딩 |
| H1 | `src/main/ipc/imageHandlers.ts` | 5 | Gemini / Veo inline data (1MB ~ 수십 MB) | IPC 핸들러 — 발행 중 활성 |
| H2 | `src/image/openaiImageGenerator.ts` | 2 | gpt-image-2 b64_json (1.18MB) | 이미지 생성 1회 |
| H2 | `src/image/deepinfraGenerator.ts` | 3 | DeepInfra b64_json (1MB+) | 이미지 생성 1회 |
| H2 | `src/image/imageFxGenerator.ts` | 1 | ImageFX encodedImage (1MB+) | 이미지 생성 1회 |
| H3 | `src/image/nanoBananaProGenerator.ts` (Imagen 4 fallback line 135) | 1 | Imagen 4 bytesBase64Encoded | 폴백 경로 |
| H3 | `src/automation/imageHelpers.ts` | 1 | data URL → 임시 파일 | 발행 중 1회/이미지 |
| H3 | `src/main/services/BlogExecutor.ts` | 1 | 외부 입력 data URL | 발행 중 |
| H3 | `src/main.ts:6239` | 1 | 사용자 저장 다이얼로그 | 사용자 액션 시 |
| H3 | `src/main/ipc/imageDownloadHandlers.ts:40` | 1 | data URL 수동 다운로드 | 사용자 액션 시 |

H1 = 핫 패스 + 큰 페이로드 (최우선)
H2 = 이미지 생성 1회 (큰 페이로드)
H3 = 빈도 낮거나 사용자 액션 트리거

R2. **헬퍼 API**: `decodeBase64Async(input: string, opts?: { threshold?: number }): Promise<Buffer>`
- threshold(기본 256KB) 미만이면 동기 경로 (워커 오버헤드 회피)
- threshold 이상이면 워커로 위임

R3. **Worker pool 설계**: 단일 pool, 최대 동시성 = `os.cpus().length - 1` (최소 2, 최대 4).

---

## 4. 비범위 (out)

R4. **작은 토큰성 Base64**는 본 SPEC 범위 밖. 동기 경로 유지.
- `src/quotaManager.ts:46` (24바이트 salt) — 상수 디코딩, 1회성
- `src/account/blogAccountManager.ts:100` (암호화된 패스워드) — 수십~수백 바이트
- 이미지 ID / hash / 해시 토큰 등 임계값(256KB) 미만의 짧은 문자열

R5. **`src/tests/` 하위 테스트 스크립트**(test31flash.ts, testGeminiImage.ts) — 사용자 경로 아님. 제외.

R6. **Encoder(`Buffer.toString('base64')`) 분리는 제외**. 본 SPEC은 디코딩에만 집중.

R7. **Renderer 프로세스 Base64**는 본 SPEC 범위 밖. 메인 프로세스가 freeze 원인이며 renderer freeze는 별도 SPEC.

R8. **이미지 후처리(sharp 변환, EXIF 제거)**의 워커 분리는 별도 후속 SPEC. 본 SPEC은 디코딩까지만.

---

## 5. 성공 기준

`e2e/freeze-detection.spec.ts`의 임계 기준 + 추가 임계(P2 전용)로 측정.

R9. **회귀 가드** — 기존 freeze-detection.spec.ts 3개 테스트 전부 통과 유지:
- 앱 시작 5초 LongTask 누적 < 2000ms
- 환경설정 진입 응답 < 1500ms
- idle 1초 LongTask < 300ms

R10. **신규 임계 (P2 전용)** — `acceptance.md`에 정의된 신규 케이스:
- 이미지 생성 직후 LongTask 단일 < 200ms (현재 추정 600~1200ms)
- 발행 흐름 중 base64 디코딩 구간의 메인 스레드 점유 < 100ms

R11. **단계별 회귀 가드**: 각 단계(H1/H2/H3)마다 신규 임계 측정 → baseline 대비 악화 시 단계 중단 + 롤백.

R12. **헬퍼 단위 테스트**: `decodeBase64Async`에 대한 vitest 단위 테스트 신규 작성(`acceptance.md` 참조).

---

## 6. 안전 가드

R13. **폴백**: worker_threads 초기화 실패 / 워커 에러 시 동기 경로로 자동 폴백 + 1회 경고 로그. silent fail 금지.

R14. **메모리 누수 방지**: 워커는 풀로 재사용. 페이로드 전송은 `transferList`(ArrayBuffer) 활용으로 copy 회피.

R15. **타임아웃**: 워커 디코딩 5초 타임아웃. 초과 시 폴백 + 에러 보고.

R16. **개발 모드 진단**: `process.env.AUTOPUS_BASE64_DEBUG === '1'`일 때 각 디코딩의 size/duration 로깅.

---

## 7. Ref

- 부모: SPEC-FREEZE-GUARD-001 Phase A1 (v2.10.240, e2e/freeze-detection.spec.ts)
- 진단 소스: `docs/diagnosis-2026-04-28/perf-summary.md` #1
- 메모리: `feedback_no_cascade_fix.md`, `feedback_no_speculation.md`
