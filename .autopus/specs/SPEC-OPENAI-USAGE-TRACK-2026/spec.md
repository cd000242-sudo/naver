# SPEC-OPENAI-USAGE-TRACK-2026: OpenAI 사용량 추적 + Tier 진입 임박 안내

## 1. 목적

OpenAI Image/LLM 사용자에게 **현재 Tier 위치 + 다음 Tier까지 남은 결제액 + RPM 도달 임박 경고**를 사전 안내. 작업 16/17의 사후 경고(429 발생 후)를 보완하여 **사전 회피** 가능하게 한다.

근거: 사용자가 OpenAI Tier 시스템을 모르고 발행 시도 → 429 도달 → 작업이 중단되는 흐름이 흔함. 작업 17의 사후 모달로 알림은 가능하지만, 발행 1건 실패한 후라 사용자 시간/비용 손실 발생.

## 2. 배경

### 작업 16/17 한계
- 작업 16: 카드 클릭 시 정적 안내 모달 (사용자가 OpenAI 선택 시 1회)
- 작업 17: 429 발생 시 자동 모달 (사후 안내, 실패 후)
- **둘 다 사용자가 본인 현재 Tier·잔액·RPM 사용률을 모름**

### OpenAI 공식 API 한계

| API | 제공 정보 | 한계 |
|---|---|---|
| `GET /v1/usage` | 일일 토큰 사용량 (date 단위) | RPM 실시간 X, Tier 정보 X |
| `GET /v1/dashboard/billing/credit_grants` | 크레딧 잔액 | **비공식 endpoint** (admin key 필요할 수 있음) |
| `GET /v1/dashboard/billing/usage` | 누적 사용량 (월 단위) | **비공식 endpoint** |
| `Response header: x-ratelimit-remaining-requests` | 현재 1분간 남은 RPM | 매 응답마다 갱신, 실시간 추적 가능 |

→ **`x-ratelimit-remaining-requests` 헤더가 가장 안정적**. 매 호출마다 받아 추적하면 임박 경고 가능.

## 3. 작업 분리 근거

| 항목 | 작업 16/17 | 본 SPEC |
|---|---|---|
| 트리거 | 카드 클릭 / 429 발생 | 매 호출의 응답 헤더 |
| 영역 | UI 모달만 | main 프로세스 IPC + renderer state + UI |
| 안정성 | 정적 텍스트 (변동 0) | OpenAI 비공식 endpoint 의존 (변동 위험) |
| 회귀 위험 | 낮음 | 中 (main 프로세스 변경 + IPC 추가) |

→ 별도 SPEC로 분리. 작업 16/17이 먼저 안정화된 후 진행.

## 4. 범위

### In Scope
1. **rate-limit 헤더 추적**:
   - `src/image/openaiImageGenerator.ts` axios 응답에서 `x-ratelimit-remaining-requests` / `x-ratelimit-reset-requests` 헤더 파싱
   - 매 호출 결과를 IPC로 renderer에 전달 (`openai:rateLimit-update`)
2. **renderer state 저장**:
   - `localStorage.openaiRateLimit_<model>` — 마지막 측정값 + timestamp
3. **임박 경고 표시**:
   - 남은 RPM 비율 (`remaining / limit`)이 20% 이하 시 toast 알림
   - 0% 도달 임박 시 작업 16의 모달 자동 호출 (`'rate-limit-imminent'` 모드 추가)
4. **사용량 대시보드** (선택):
   - 메인 풀오토 이미지 설정 모달에 "현재 OpenAI 상태" 박스 추가
   - 잔액 / 일일 토큰 사용 / 현재 RPM 잔여 표시

### Out of Scope (별도 SPEC 또는 후속)
- 결제 누적액 추적 (비공식 endpoint, admin key 필요 → 보류)
- 다음 Tier 진입까지 카운트다운 (위와 동일)
- gpt-4o 등 LLM 모델 추적 (이미지 외 — 별도)

## 5. 제약

- **no_speculation**: 비공식 endpoint 사용 시 데이터 정확성 보증 X 명시
- **no_cascade_fix**: 단일 릴리즈로 마감, 회귀 검증 통과 못 하면 전체 롤백
- **surgical change**: `openaiImageGenerator.ts` 응답 헤더 파싱 영역만 손댐
- **언어 정책**: 코드 주석 영어, 사용자 노출 한글
- **OpenAI ToS 준수**: 비공식 endpoint 사용 시 user-agent 명시 + rate limit 자체 준수

## 6. 구현 초안

### Step 1: openaiImageGenerator.ts 헤더 파싱

```typescript
// axios 응답 후
const remaining = response.headers['x-ratelimit-remaining-requests'];
const limit = response.headers['x-ratelimit-limit-requests'];
const resetAt = response.headers['x-ratelimit-reset-requests']; // ISO 8601 또는 초

if (remaining != null && limit != null) {
  // main 프로세스 → IPC → renderer
  webContents?.send('openai:rateLimit-update', {
    model: currentModel,
    remaining: Number(remaining),
    limit: Number(limit),
    resetAt,
    timestamp: Date.now(),
  });
}
```

### Step 2: preload IPC 노출

```typescript
onOpenAiRateLimitUpdate: (cb: (data: ...) => void) =>
  ipcRenderer.on('openai:rateLimit-update', (_e, data) => cb(data)),
```

### Step 3: renderer 핸들러

```typescript
// 통합 위치 (App 진입 시 1회 등록)
(window as any).api?.onOpenAiRateLimitUpdate?.((data: any) => {
  const ratio = data.remaining / data.limit;
  localStorage.setItem(`openaiRateLimit_${data.model}`, JSON.stringify(data));

  if (ratio === 0) {
    // 작업 17과 동일한 모달 (사후 안내)
    (window as any).showOpenAiTierWarningModal?.('rate-limit-hit');
  } else if (ratio <= 0.2) {
    // 임박 경고 toast
    (window as any).toastManager?.warning(`⚠️ OpenAI RPM ${data.remaining}/${data.limit} 남음 (${Math.round(ratio*100)}%)`);
  }
});
```

### Step 4 (선택): UI 대시보드

`HeadingImageSettings.ts` 메인 모달에 박스 추가:
```
🦆 OpenAI 현재 상태 (gpt-image-1.5)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━
   RPM 잔여: 3/5 (60%)
   다음 reset: 35초 후
   마지막 측정: 12초 전
```

## 7. 회귀 검증 게이트

1. `npx vitest run` — 전체 통과
2. `npx tsc --noEmit` — 0 errors
3. 수동: OpenAI 엔진으로 발행 5회 → 토스트 알림 표시 확인 (남은 RPM 비율 단계별)
4. main 프로세스: 헤더 누락 응답에도 throw 없이 graceful 처리 (`remaining == null`)

## 8. 다음 단계

1. **research** 보강:
   - OpenAI rate limit 헤더 공식 문서 인용 (`platform.openai.com/docs/api-reference`)
   - `x-ratelimit-remaining-requests` 안정성 검증 (각 모델별 헤더 차이)
2. **planner** 에이전트 정밀 구현 계획
3. **executor + reviewer** 워크플로우
4. 단계 분할: rate limit 헤더 파싱 (1주) → 임박 경고 toast (3일) → 대시보드 (1주)

## 9. 우선순위

**중간**. 작업 16/17의 사후 안내가 일단 사용자 시간 손실의 즉각적 통증을 막아주므로, 본 SPEC의 사전 안내는 UX 개선이지 critical fix는 아님. 사용자가 명시 요청 시 진행.

## 10. 관련

- 작업 16: OpenAI Tier 경고 (카드 클릭, 정적)
- 작업 17: 429 발생 시 자동 모달 (사후, 동적)
- 본 SPEC: 실시간 추적 + 임박 경고 (사전, 동적)
- 사용자 보고 (2026-05-27): "GPT는 초보들 불편함" → 정확한 진단·안내 필요

## 11. 작성 메타

- 작성일: 2026-05-27
- 작성자: Claude Opus 4.7 + 사용자 위임
- 상태: **draft** (구현 미시작)
- 트리거: 사용자 "추가 가능 추가해줘" (2026-05-27) 중 "(2) 사용량 추적" 부분 — 비공식 API 의존으로 별도 SPEC 분리 결정
