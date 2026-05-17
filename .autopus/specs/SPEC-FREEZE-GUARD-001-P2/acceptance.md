# SPEC-FREEZE-GUARD-001-P2 수락 기준

본 SPEC은 `feedback_no_speculation` 원칙에 따라 **측정 가능한 임계**만 수락 기준으로 인정한다.
부모 SPEC `e2e/freeze-detection.spec.ts`의 임계를 회귀 가드로 유지하고, P2 전용 임계를 추가한다.

---

## 1. 회귀 가드 시나리오 (기존 임계 유지)

### S1: 앱 시작 5초 LongTask 누적 < 2000ms
- **Given**: P2 변경이 적용된 빌드(`dist/main.js`)
- **When**: Electron 앱 부팅 후 main window가 dom ready 직후 5초 측정
- **Then**: PerformanceObserver `longtask` 누적 duration < 2000ms, 단일 < 500ms
- **검증**: `npx playwright test e2e/freeze-detection.spec.ts -g "앱 시작 직후 5초간"`

### S2: 환경설정 진입 응답 < 1500ms
- **Given**: P2 변경 적용 빌드
- **When**: 환경설정 버튼 클릭
- **Then**: 모달 visible 까지 1500ms 미만 + 진입 후 2초 LongTask 누적 < 1500ms
- **검증**: 동일 e2e 테스트

### S3: idle 1초 LongTask 누적 < 300ms
- **Given**: 앱 안정화 후 (2초 대기)
- **When**: 1초 측정
- **Then**: LongTask 누적 < 300ms
- **검증**: 동일 e2e 테스트

---

## 2. P2 신규 수락 시나리오

### S4: 이미지 생성 직후 메인 스레드 LongTask 단일 < 200ms
- **Given**: P2-R2 또는 R3 적용 빌드 + 이미지 생성 엔진(Gemini/OpenAI/DeepInfra/Imagen) 1개 활성
- **When**: 헤딩 1개에 대해 이미지 생성 1회 트리거 → 응답 수신 직후 3초간 LongTask 측정
- **Then**: 단일 LongTask < 200ms (이전 추정 600~1200ms — 측정 후 baseline 확정)
- **검증**: 신규 e2e 케이스 `e2e/base64-decode.spec.ts` (R1 단계에서 신규 작성)

### S5: 발행 흐름 중 base64 디코딩 구간 메인 스레드 점유 < 100ms
- **Given**: P2 H1 단계 이상 적용
- **When**: 발행 시작 → 이미지 첨부 단계까지 진행 → 그 구간의 LongTask 측정
- **Then**: base64 디코딩에 기인한 LongTask 합 < 100ms
- **검증**: 신규 e2e 케이스 (계측 가능 시) 또는 `AUTOPUS_BASE64_DEBUG=1` 환경변수로 헬퍼 자체 로그 검증

### S6: 워커 폴백 시나리오
- **Given**: 워커 초기화 실패를 모킹(또는 worker 파일 임시 rename)
- **When**: `decodeBase64Async(b64)` 호출
- **Then**: 동기 폴백으로 정상 Buffer 반환 + `console.warn('[base64Async] worker init failed')` 1회 출력
- **검증**: vitest UT-5

---

## 3. 단위 테스트 항목 (`src/__tests__/base64Async.test.ts` — R1 단계에서 신규 작성)

| ID | 케이스 | 기대 |
|---|---|---|
| UT-1 | threshold 미만(1KB) 입력 | 동기 경로, 반환 Buffer 내용 일치 |
| UT-2 | threshold 이상(2MB) 입력 | 워커 경로, 반환 Buffer 내용 일치 |
| UT-3 | 잘못된 Base64 입력 | 동기/워커 모두 Buffer.from과 동일 동작 (Buffer.from은 invalid 문자 무시 — 동일 동작 유지) |
| UT-4 | 빈 문자열 | 빈 Buffer 반환 (동기 경로) |
| UT-5 | 워커 초기화 실패 (모킹) | 동기 폴백 + warn 1회 |
| UT-6 | 워커 타임아웃 (5초 초과 모킹) | 동기 폴백 + warn 1회 |
| UT-7 | 동시 호출 10개 | 풀 한도 내 처리, 모두 정상 반환 |
| UT-8 | AbortSignal abort | reject 또는 폐기. 메모리 leak 없음 |

---

## 4. 빌드/배포 게이트

| Gate | 명령 | 기준 |
|---|---|---|
| Lint | `npm run lint` | 신규 파일 0 error, warning 새로 증가 없음 |
| Build | `npm run build` | 0 error, worker 파일이 dist에 포함됨 |
| Unit | `npx vitest run src/__tests__/base64Async.test.ts` | 8/8 통과 |
| E2E | `npx playwright test e2e/freeze-detection.spec.ts` | 3/3 통과 |
| 신규 E2E | `npx playwright test e2e/base64-decode.spec.ts` (R1에서 작성) | S4 통과 |

---

## 5. 릴리즈별 수락 매트릭스

| Release | 수락 시나리오 | 추가 검증 |
|---|---|---|
| P2-R1 (인프라) | UT-1~UT-8, 빌드 통과, S1~S3 변동 없음 | 사용자 영향 0 확인 |
| P2-R2 (imageHandlers.ts) | S1~S3 + S5 부분 통과 | Gemini 이미지 생성 경로 보고 1~2일 관찰 |
| P2-R3 (nanoBananaProGenerator.ts) | S1~S3 + S4(Gemini 엔진) | 동일 |
| P2-R4 (openai/deepinfra/imagefx) | S1~S3 + S4 (3개 엔진 추가) | 발행 흐름 1회 통합 측정 |
| P2-R5 (저빈도 잔여) | S1~S6 전부 + 사용자 보고 0건 | 본 SPEC `completed` 전환 |

---

## 6. 본 SPEC을 완료 처리하지 못하는 조건

R-FAIL-1. **S4 기준 단일 LongTask 200ms 미달 실패**: H1+H2 적용 후에도 충족 못 하면, 다른 핫스팟(perf-summary #2 동기 fs, #4 JSON.parse)이 주범 — 본 SPEC 결과만으로 closure 불가, 별도 SPEC 필요.

R-FAIL-2. **사용자 보고 신규 freeze 신호**: 각 릴리즈 후 1~2일 내 "이미지 생성 후 응답없음" 신규 보고가 발생하면 즉시 단계 보류 + 원인 분석 후 재개.

R-FAIL-3. **worker_threads 폴백 빈도 > 10%**: 운영 메트릭에서 폴백 발생률이 10%를 넘으면 워커 인프라 자체 재검토 필요.

---

## Ref

- 부모 SPEC: SPEC-FREEZE-GUARD-001 Phase A1
- 측정 도구: `e2e/freeze-detection.spec.ts`
- 진단: `docs/diagnosis-2026-04-28/perf-summary.md` #1
