# SPEC-FREEZE-GUARD-001-P2 구현 계획

## 1. Worker Pool 설계 결정

T1. **단일 공용 pool** 채택 (feature별 분리 X).
- 이유: Base64 디코딩은 stateless CPU 작업이며 feature 무관. 풀 다중화는 오버헤드만 증가.
- 위치: `src/main/workers/base64Pool.ts` (신규)
- 풀 크기: `Math.max(2, Math.min(4, os.cpus().length - 1))`

T2. **워커 스크립트**: `src/main/workers/base64Worker.ts` (신규)
- 입력: `{ id: string, b64: string }` 또는 transferList로 ArrayBuffer
- 출력: `{ id: string, ok: true, buffer: ArrayBuffer }` 또는 `{ id: string, ok: false, error: string }`

T3. **헬퍼 API**: `src/main/utils/base64Async.ts` (신규)
```
export async function decodeBase64Async(
  input: string,
  opts?: { threshold?: number; signal?: AbortSignal }
): Promise<Buffer>;
```
- threshold 기본 256KB. 미만 → 동기 `Buffer.from(input, 'base64')` 그대로 사용.
- threshold 이상 → 풀에 위임.

T4. **빌드 통합**: `tsconfig`/`electron-builder.json`에 `src/main/workers/` 포함 확인. worker 파일이 dist에 복사되도록 검증.

---

## 2. 단계별 적용 우선순위 (1릴리즈 1~3 fix 원칙)

회귀 cascade 금지 원칙(`feedback_no_cascade_fix`)에 따라 **5개 릴리즈로 분할**.

### Release P2-R1: 인프라 (코드 0줄 적용)
- [ ] T5: `base64Pool.ts` / `base64Worker.ts` / `base64Async.ts` 신규 작성
- [ ] T6: vitest 단위 테스트 작성 (`acceptance.md` UT-1~UT-6)
- [ ] T7: 신규 코드만 dist에 포함되는지 빌드 검증. 실제 호출 지점은 **변경 0**.

  → 출시 후 1주 안정성 관찰 (사용자 영향 없음 보장)

### Release P2-R2: H1 적용 (핫 패스 — 1릴리즈 1 fix)
- [ ] T8: `src/main/ipc/imageHandlers.ts` Gemini inline data 5곳 교체
- [ ] T9: 릴리즈 직후 freeze-detection.spec.ts 회귀 가드 + 신규 임계 측정
- [ ] T10: 사용자 보고/메트릭 1~2일 관찰

### Release P2-R3: H1 잔여 (1릴리즈 1 fix)
- [ ] T11: `src/image/nanoBananaProGenerator.ts` 6곳 교체
- [ ] T12: 릴리즈 직후 회귀 측정

### Release P2-R4: H2 일괄 (1릴리즈 3 fix — 모두 이미지 생성 1회 경로)
- [ ] T13: `src/image/openaiImageGenerator.ts` 2곳
- [ ] T14: `src/image/deepinfraGenerator.ts` 3곳
- [ ] T15: `src/image/imageFxGenerator.ts` 1곳
- [ ] T16: 릴리즈 직후 회귀 측정 + acceptance.md 신규 임계 통과 확인

### Release P2-R5: H3 잔여 (저빈도)
- [ ] T17: `src/automation/imageHelpers.ts`, `src/main/services/BlogExecutor.ts`, `src/main.ts:6239`, `src/main/ipc/imageDownloadHandlers.ts:40`, `src/image/nanoBananaProGenerator.ts:135` (Imagen 4 fallback)
- [ ] T18: 최종 freeze-detection.spec.ts baseline 갱신 + 본 SPEC 상태 `completed`로 전환

---

## 3. 호출 패턴 추상화 전략

T19. **Before**:
```
const buffer = Buffer.from(b64, 'base64');
await fsp.writeFile(path, buffer);
```

T20. **After**:
```
import { decodeBase64Async } from '../utils/base64Async';
const buffer = await decodeBase64Async(b64);
await fsp.writeFile(path, buffer);
```

T21. **불변성 원칙(coding-style.md)**: `let buffer = Buffer.from(...); buffer = await cropThumbnail(buffer)` 패턴은 그대로 유지. `decodeBase64Async`는 새 Buffer를 반환.

T22. **TypeScript 타입 명시**: 일부 호출 지점은 `let buffer: Buffer = Buffer.from(...)` 형태(예: nanoBananaProGenerator.ts:1475). `let buffer: Buffer = await decodeBase64Async(...)`로 교체.

---

## 4. 폴백/회귀 가드

T23. **자동 폴백 (헬퍼 내부)**:
- 워커 초기화 실패 → `Buffer.from()` 동기 + `console.warn('[base64Async] worker init failed, falling back to sync')`
- 워커 타임아웃(5초) → 동기 폴백 + 경고
- 워커 에러 메시지 반환 → 동기 폴백 + 경고
- silent fail 금지 (메모리 `feedback_no_fallback` 원칙: 다른 엔진으로 자동 전환은 금지지만, **같은 디코딩 작업을 동기로 처리**하는 안전망은 허용)

T24. **단계별 검증 게이트**:
각 Release(R2~R5) 직후 다음 통과해야 다음 단계 진행:
1. `npx playwright test e2e/freeze-detection.spec.ts` 통과 (회귀 0)
2. `acceptance.md` 신규 임계 미달 시 단계 보류 + 원인 분석
3. 1~2일간 사용자 보고 `이미지 생성 후 응답없음` 신규 보고 0건

T25. **롤백 절차**:
- 단일 파일 단위 교체 → 즉시 revert 가능
- 헬퍼 자체 문제 발견 시 헬퍼 내부 `threshold = Infinity`로 설정해 전 호출 동기 강제 (코드 한 줄 변경)

T26. **lint/test**:
- 각 단계 PR에서 `npm run build`, `npx vitest run src/__tests__/base64Async.test.ts`, `npx playwright test e2e/freeze-detection.spec.ts` 3종 통과 필수

---

## 5. 위험과 미해결 항목

T27. **transferList vs string 전송 결정 보류**:
- string으로 전달하면 V8가 copy. 1MB 전송은 메인 스레드 점유 발생 가능.
- 대안: 메인 스레드에서 ArrayBuffer 변환 후 transferList — 다만 변환 자체가 동기.
- R1 단계에서 둘 다 벤치마크 후 결정. **추정 금지 — 실측으로만 결론**.

T28. **워커 cold start 비용**:
- 첫 호출 시 워커 spawn 시간이 페이로드 디코딩보다 클 수 있음.
- 풀 prewarm 전략(앱 시작 직후 워커 1개 미리 spawn) 고려. R1 벤치마크 결과에 따라 결정.

T29. **Electron + worker_threads 알려진 이슈**:
- Electron v31 + Node v18에서 worker_threads는 안정. 단 packaging 시 worker 스크립트 경로(asar 내부) 주의.
- T4에서 검증 필요.

---

## 6. 본 SPEC이 건드리지 않는 영역

- Renderer 프로세스 코드 (renderer.ts, modules/ 등)
- `src/tests/test*.ts` 개발용 스크립트
- Base64 인코딩(`toString('base64')`) 경로
- 이미지 후처리(sharp 변환, EXIF 제거) — 별도 SPEC 필요
