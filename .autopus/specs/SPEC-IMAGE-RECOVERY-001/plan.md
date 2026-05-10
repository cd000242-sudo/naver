# SPEC-IMAGE-RECOVERY-001: 구현 계획

**Status**: draft
**Last updated**: 2026-05-09

---

## Phase 0: 사전 준비 (오늘, 1시간 이내)

목표: Phase 1 진입 전 구조와 진단 토대 마련.

### Task 0.1: ErrorCode enum 확장
- 파일: `src/errors/ErrorCode.ts` (또는 그에 준하는 위치)
- 추가 코드:
  - `RECOVERY_TRIGGERED` — 자동 복구 시작
  - `RECOVERY_EXHAUSTED` — 자동 복구 한도 초과 → 모달
  - `RECOVERY_BLOCKED_BY_QUOTA` — 한도 초과로 복구 포기
  - `RECOVERY_BLOCKED_BY_FORBIDDEN` — IP/계정 문제로 복구 불가
  - `RECOVERY_BLOCKED_BY_UI_CHANGE` — Flow 셀렉터 변경 감지
- 사용자 메시지 매핑 + 한국어화

### Task 0.2: Recovery Coordinator 모듈 신설
- 파일: `src/image/recoveryCoordinator.ts` (신규, ~150 LOC)
- 책임:
  - 헤딩 단위 자동 복구 시도 횟수 추적
  - 회복 불가능 에러 분류
  - 운영 대시보드 메트릭 송출
- 인터페이스:
  ```typescript
  interface RecoveryCoordinator {
    tryRecover(error: AutomationError, context: HeadingContext): Promise<RecoveryResult>
    canRecover(errorCode: string): boolean
    notifyToast(message: string): void
    notifyBlockingModal(code: string, options: ModalOption[]): Promise<UserChoice>
  }
  ```

### Task 0.3: 차단형 모달 컴포넌트 신설
- 파일: `src/renderer/components/RecoveryBlockingModal.ts` (신규, ~120 LOC)
- 요구사항:
  - 사용자 명시 동의 버튼 없이 자동 닫힘 금지 (M-2)
  - "다른 엔진 자동 전환" 버튼 절대 만들지 않음 (M-3)
  - 진행 중 배치 상태 저장 트리거 (M-4)
- 7종 모달 변형 (B1~B7) 지원

---

## Phase 1: 자동 복구 핵심 (반나절)

목표: 사용자가 가장 자주 막히는 R1/R2/R3/R6 자동 복구 활성화.

### Task 1.1: R1 — Google 세션 401 자동 재로그인 (ImageFX/Flow)
- 파일: `src/image/imageFxGenerator.ts` (라인 1051-1054, 1178), `src/image/flowGenerator.ts` (487-490)
- 변경:
  ```typescript
  // 현재: 즉시 throw
  // 변경: 1회 토큰 캐시 폐기 + 재로그인 시도 후 throw
  if (errorCode === 'IMAGEFX_AUTH_EXPIRED' && !context.recovery.r1Tried) {
    context.recovery.r1Tried = true
    cachedToken = null
    cachedTokenExpiry = 0
    coordinator.notifyToast('🔄 Google 세션 만료 — 자동 재로그인 시도')
    return await retryWithFreshSession(prompt)
  }
  ```
- 회복 한도: 헤딩당 1회 (사용자가 의도적으로 로그아웃했을 가능성 차단)
- 회복 실패 시: 차단형 모달 B5

### Task 1.2: R2 — 일시 네트워크 timeout 헤딩 단위 백오프 재시도
- 파일: `src/image/recoveryCoordinator.ts`, `src/image/imageFxGenerator.ts` (2070-2140 부근), `src/image/flowGenerator.ts` (1240-1337 부근)
- 변경:
  - 현재: 일부만 재시도 (HTTP 503은 5×attempt, NO_IMAGES는 3회)
  - 통일: 일시 timeout 류는 헤딩 단위 **2초 → 4초 → 8초** 백오프 3회
  - 단, HTTP 429/403/안전필터는 재시도 금지 (즉시 모달)
- 헤딩 격리: 3회 모두 실패 시 그 헤딩만 스킵, 다음 헤딩은 카운터 리셋

### Task 1.3: R3 — AdsPower 양쪽 실패 시 Playwright 단독 자동 전환
- 파일: `src/image/imageFxGenerator.ts` (979-1007, 1748-1762)
- 현재: 일부 케이스만 폴백 (ECONNREFUSED 등)
- 변경:
  - WebSocket URL 부재(494-496), CDP 연결 실패(502/560/647), 일일 한도 외 모든 AdsPower 에러 → Playwright 폴백
  - 폴백 시점에 토스트 1회: `🔄 AdsPower 연결 불가 — 자체 브라우저로 전환`
  - 본 세션 내에서는 다시 AdsPower 시도하지 않음 (`_adsPowerSessionDisabled = true`)
  - 사용자가 설정에서 직접 OFF 하지 않은 한, 다음 앱 재시작 시 다시 시도

### Task 1.4: R6 — 이미지 다운로드 < 1024바이트 1회 재요청
- 파일: `src/image/flowGenerator.ts` (892-921), `src/image/imageUtils.ts` (50-72)
- 변경:
  - 현재: 즉시 reject (썸네일 가능성 있어서)
  - 변경: 5초 대기 후 같은 URL 1회 재요청. 두 번째도 작으면 reject 유지.
  - 이유: Flow는 generation 직후 우선 썸네일을 반환하고, ~5초 후 풀해상도로 교체하는 패턴 관찰됨 (research.md 참고).

---

## Phase 2: 셀렉터·로그인 강화 (1일)

목표: Flow UI 변경·로그인 지연 등 환경 의존 실패를 줄이기.

### Task 2.1: R4 — Flow 셀렉터 다중 폴백 + remoteUpdate 강제 갱신
- 파일: `src/automation/selectors/flowSelectors.ts` (신규 또는 확장)
- 변경:
  ```typescript
  // 현재 (flowGenerator.ts:651-662): 단일 정규식
  // 변경: 다중 셀렉터 배열 + 우선순위
  export const FLOW_NEW_PROJECT_BUTTON = [
    'button:has-text(/새 프로젝트|New project|新しいプロジェクト/)',
    'button[aria-label*="project"][aria-label*="new"]',
    'a[href*="/new"]',
    'button:has-text("add_2")', // Material Icon fallback
  ]
  ```
- remoteUpdate: 진입 시 1회 강제 갱신 (네트워크 가능 시), 실패해도 무시
- 6종 셀렉터(F1 새 프로젝트, F3 입력창, F5 전송 버튼, 쿠키 배너, 프로필 메뉴, 로그아웃)에 동일 패턴 적용

### Task 2.2: R5 — 로그인 활성도 폴링 + 자동 timeout 연장
- 파일: `src/image/imageFxGenerator.ts` (878-923), `src/image/flowGenerator.ts` (405-451)
- 변경:
  - 현재: 5분/10분 고정 timeout
  - 변경: 5초마다 URL/DOM 변화 폴링.
    - 변화 있음 → timeout 5분 추가 연장 (사용자가 진행 중)
    - 변화 없음 + 1분 경과 → 토스트 `로그인 진행 중인지 확인해주세요`
    - 누적 30분 도달 → 무조건 차단형 모달 B5
  - 로그인 창이 닫힌 경우 즉시 중단

---

## Phase 3: 차단형 모달 + 메트릭 (1일)

목표: 자동 복구 안 되는 케이스를 명확히 차단·안내.

### Task 3.1: 7종 차단형 모달 구현
- 파일: `src/renderer/components/RecoveryBlockingModal.ts`
- 모달 변형 7종:
  - **B1 IP 차단**: "외부 프록시 등록 / 다른 Google 계정 / 취소" 3택
  - **B2 안전 필터**: "프롬프트 수정 / 그대로 시도 / 취소" 3택
  - **B3 시간당 한도**: "1시간 후 알림 예약 / 다른 계정 / 취소" 3택
  - **B4 브라우저 미설치**: Chrome/Edge 다운로드 링크 + 닫기
  - **B5 로그인 30분 초과**: "다시 로그인 / 취소"
  - **B6 Flow UI 변경**: "1시간 후 자동 재시도 / 다른 엔진 설정 열기 / 취소"
  - **B7 회복 불가능**: 정확한 원인 코드 + 닫기 (배치 중단)
- 모든 모달은 **차단형** — 사용자 클릭 없이 진행 안 됨

### Task 3.2: 진행 중 배치 체크포인트 저장
- 파일: `src/image/recoveryCoordinator.ts`, `src/main/ipc/flowMarathonHandlers.ts`
- 모달 노출 시 `progress.json` 강제 flush
- 사용자가 모달에서 "취소" 선택 시 다음 헤딩으로 안 넘어가고 그 자리에서 종료
- 다음 실행 시 체크포인트에서 재개 가능

### Task 3.3: operationsDashboard 메트릭 (D-3)
- 파일: `src/monitor/operationsDashboard.ts`
- 추가 메트릭:
  - R1~R8 발생 횟수 (24h/7d/30d)
  - 평균 복구 소요 시간 (ms)
  - 자동 복구 성공률 (%) — 메모리 원칙상 추정값 아닌 실측만
  - 차단 모달 노출 횟수 + 사용자 선택 분포
- UI: 기존 대시보드 탭에 "복구" 섹션 신규

---

## Phase 4: 테스트 + 검증 (반나절)

### Task 4.1: 단위 테스트 12개
- 파일: `src/__tests__/recoveryCoordinator.test.ts`
- 케이스:
  - R1 1회만 시도하는지
  - R2 백오프 2/4/8초 정확한지
  - R3 같은 세션 내 AdsPower 재시도 안 하는지
  - R4 다중 셀렉터 우선순위
  - R5 활성도 폴링 timeout 연장
  - R6 5초 후 1회 재요청
  - 회복 불가능 에러는 즉시 모달
  - silent 폴백이 일어나지 않는지 (grep 가드)
  - 헤딩 단위 카운터 리셋
  - 모달 동의 없이 자동 닫힘 안 되는지
  - 체크포인트 저장 트리거
  - 메트릭 집계 정확도

### Task 4.2: 통합 테스트 3개
- 파일: `src/__tests__/recoveryIntegration.test.ts`
- 시나리오:
  - **시나리오 A**: ImageFX 401 → R1 자동 복구 → 두 번째 헤딩 정상
  - **시나리오 B**: Flow 입력창 못 찾음 → R4 다중 셀렉터 성공 → 정상 생성
  - **시나리오 C**: HTTP 403 → 즉시 B1 모달 → 사용자 "취소" → 배치 종료 + 체크포인트 저장

### Task 4.3: silent 폴백 회귀 가드
- grep 스크립트: `tools/check-silent-fallback.sh`
- 검사 패턴:
  - `imageSource = 'gemini'` 등 자동 변경 코드
  - `model = 'flash'` 등 모델 자동 변경 코드
- 발견 시 빌드 실패

### Task 4.4: 수동 E2E (사용자 시나리오)
- 케이스 1: AdsPower 종료 후 ImageFX 실행 → 자동 Playwright 폴백 + 토스트
- 케이스 2: Google 계정 로그아웃 후 ImageFX 실행 → 자동 재로그인 안내
- 케이스 3: 인터넷 끊고 Flow 실행 → 백오프 3회 후 헤딩 격리 + 다음 헤딩

---

## Phase 5: 릴리즈 + 모니터링 (반나절)

### Task 5.1: v2.10.75 릴리즈
- 변경 로그에 본 SPEC 정확한 영향 범위 기재 (추정 효과 금지)
- 릴리즈 후 1일간 운영 대시보드 R1~R8 발생률 모니터링
- 비정상 급증 시 핫픽스 또는 롤백 검토

### Task 5.2: 사용자 가이드 업데이트
- 파일: `docs/troubleshooting-image-generation.md` (신규)
- 7종 모달 각각의 사용자 행동 가이드 한국어 작성
- 외부 프록시 등록 방법 스크린샷 첨부

---

## 일정 요약

| Phase | 분량 | 의존 |
|-------|------|------|
| Phase 0 | 1시간 | — |
| Phase 1 | 반나절 | Phase 0 |
| Phase 2 | 1일 | Phase 0 |
| Phase 3 | 1일 | Phase 0, 1 |
| Phase 4 | 반나절 | Phase 1, 2, 3 |
| Phase 5 | 반나절 | Phase 4 |
| **총** | **약 3.5일** | — |

---

## 롤백 전략

- **Phase 1만**: `coordinator.tryRecover()` 진입 직전에 feature flag (`RECOVERY_AUTO`) 추가.
  - 비활성화 시 기존 동작(에러 즉시 throw)으로 회귀.
- **Phase 3 모달**: feature flag (`RECOVERY_BLOCKING_MODAL`) 분리.
  - 비활성화 시 기존 토스트로만 노출.
- 두 flag 모두 기본값 ON, 환경변수 `RECOVERY_DISABLE=1` 로 off 가능.

---

## 의사결정 필요 사항

1. **Phase 1만 갈지 vs 1+2+3 전체** — 사용자 결정 필요.
2. **R3에서 AdsPower 자동 OFF 후 같은 세션 내 재시도 정책** — 절대 안 함 vs 1회만 허용.
   기본 제안: 절대 안 함 (silent 재시도가 사용자에게 더 큰 혼란 유발).
3. **R5 로그인 활성도 폴링 30분 상한** — 30분 vs 1시간.
   기본 제안: 30분 (그 이상이면 사용자 의지 부재로 판단).
4. **B1 IP 차단 모달에 "VPN 자동 활성화" 옵션** — 절대 추가 안 함 (앱 권한 밖).
