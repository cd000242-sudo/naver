# SPEC-IMAGE-RECOVERY-001: 인수 기준

**Status**: draft

본 문서는 SPEC 완료를 판정하는 **객관적 검증 기준**이다.
메모리의 [Evidence-Based Completion] 원칙에 따라 모든 항목은 **실측 명령어로 증명** 가능해야 한다.

---

## A. 자동 복구 동작 (R1~R8)

### A.1 R1 — Google 세션 401 자동 재로그인

**Given**: ImageFX 호출 시 첫 응답이 HTTP 401
**When**: `recoveryCoordinator.tryRecover()` 진입
**Then**:
- [ ] `cachedToken`이 null로 초기화됨
- [ ] 토스트 `🔄 Google 세션 만료 — 자동 재로그인 시도` 1회 노출
- [ ] 재로그인 성공 시 같은 헤딩 이미지 생성 정상 진행
- [ ] 재로그인 실패 시 차단형 모달 B5 노출
- [ ] 같은 헤딩 내 R1 시도는 **1회만** (2회째는 즉시 모달)
- [ ] 다음 헤딩에서는 R1 카운터 리셋됨

**증명 명령**:
```bash
npx vitest run src/__tests__/recoveryCoordinator.test.ts -t "R1 retries once per heading"
```

### A.2 R2 — 일시 네트워크 timeout 백오프 재시도

**Given**: 헤딩 이미지 생성 시 일시 네트워크 timeout
**When**: 백오프 재시도 진입
**Then**:
- [ ] 1회차 실패 → 2초 대기
- [ ] 2회차 실패 → 4초 대기
- [ ] 3회차 실패 → 8초 대기
- [ ] 3회 모두 실패 시 그 헤딩만 스킵 (배치 중단 X)
- [ ] HTTP 429/403/안전필터는 백오프 적용 안 됨 (즉시 모달)
- [ ] 다음 헤딩에서 백오프 카운터 리셋

**증명 명령**:
```bash
npx vitest run src/__tests__/recoveryCoordinator.test.ts -t "R2 backoff sequence"
```

### A.3 R3 — AdsPower 양쪽 실패 시 Playwright 단독 자동 전환

**Given**: AdsPower API 응답 실패 (WebSocket URL 부재 또는 CDP 연결 실패)
**When**: `connectViaAdsPower()` 호출
**Then**:
- [ ] Playwright 단독 폴백 즉시 진행
- [ ] 토스트 `🔄 AdsPower 연결 불가 — 자체 브라우저로 전환` 1회 노출
- [ ] 본 세션 내 AdsPower 재시도 안 함 (`_adsPowerSessionDisabled = true`)
- [ ] 사용자 설정값(`adspower_enabled`)은 변경하지 않음 — 다음 앱 재시작 시 다시 시도
- [ ] AdsPower 일일 한도(`Exceeding daily limit`)는 별도 처리 — 이미 폴백되므로 그대로 유지

**증명 명령**:
```bash
npx vitest run src/__tests__/recoveryCoordinator.test.ts -t "R3 AdsPower fallback once per session"
```

### A.4 R4 — Flow 셀렉터 다중 폴백

**Given**: Flow `새 프로젝트` 버튼 1차 셀렉터 미매칭
**When**: 다중 셀렉터 시도
**Then**:
- [ ] 우선순위 순서대로 4개 셀렉터 시도
- [ ] 첫 매칭에서 즉시 클릭
- [ ] 모두 실패 시 `remoteUpdate` 강제 갱신 1회 시도
- [ ] 갱신 후에도 실패 시 차단형 모달 B6 노출
- [ ] 동일 패턴 6종 셀렉터에 적용 (F1, F3, F5, 쿠키 배너, 프로필 메뉴, 로그아웃)

**증명 명령**:
```bash
npx vitest run src/__tests__/recoveryCoordinator.test.ts -t "R4 selector fallback priority"
grep -rn "FLOW_NEW_PROJECT_BUTTON\b" src/automation/selectors/ src/image/flowGenerator.ts
```

### A.5 R5 — 로그인 활성도 폴링

**Given**: Google 로그인 창 열림
**When**: 5초마다 활성도 폴링
**Then**:
- [ ] URL 변화 또는 DOM 변화 감지 시 timeout 5분 추가 연장
- [ ] 1분 무변화 시 토스트 `로그인 진행 중인지 확인해주세요`
- [ ] 누적 30분 도달 시 무조건 차단형 모달 B5
- [ ] 로그인 창 강제 종료 시 즉시 중단

**증명 명령**:
```bash
npx vitest run src/__tests__/recoveryCoordinator.test.ts -t "R5 login activity polling"
```

### A.6 R6 — 이미지 다운로드 < 1024바이트 1회 재요청

**Given**: 이미지 다운로드 응답 크기 < 1024바이트
**When**: 다운로드 검증 단계
**Then**:
- [ ] 5초 대기 후 같은 URL로 1회 재요청
- [ ] 두 번째도 < 1024바이트 시 reject 유지
- [ ] 두 번째 정상 크기 시 그대로 사용

**증명 명령**:
```bash
npx vitest run src/__tests__/recoveryCoordinator.test.ts -t "R6 small image retry"
```

### A.7 R7 — aHash 계산 실패 시 SHA256 단독 비교

**Given**: aHash 계산 중 sharp 예외
**When**: 중복 검출 단계
**Then**:
- [ ] SHA256 비교만 수행
- [ ] aHash 실패 진단 로그 `[RECOVERY:R7]` 기록
- [ ] 후속 헤딩에서는 aHash 정상 시도 (영구 비활성화 안 함)

### A.8 R8 — 마라톤 콜드 스타트 정리 실패

**Given**: 마라톤 시작 시 `purgeFlowSessionStorage` 예외
**When**: 콜드 스타트 정리 단계
**Then**:
- [ ] 경고 로그 `[RECOVERY:R8]` 기록 후 마라톤 진행
- [ ] 누적 카운터 증가 (운영 대시보드에 표시)
- [ ] 3회 누적 시 다음 마라톤 시작 전 사용자에게 안내

---

## B. 차단형 모달 (B1~B7)

### B-Common 공통 요구사항
- [ ] 사용자 명시 동의 버튼 없이 자동으로 닫히지 않음
- [ ] "다른 엔진으로 자동 전환" 버튼 **부재** (코드 grep 검증)
- [ ] 노출 시점에 진행 중 배치 체크포인트 강제 flush
- [ ] 모달 노출 로그 `[RECOVERY:HALT]` + 원인 코드 + 사용자 선택 결과

**증명 명령**:
```bash
grep -rn "imageSource\s*=\s*['\"]" src/renderer/components/RecoveryBlockingModal.ts
# 결과 0건이어야 함 (silent 폴백 부재 검증)
```

### B.1 IP 차단 (HTTP 403)
- [ ] 메시지: "Google이 한국 IP를 차단했을 수 있습니다."
- [ ] 옵션 3개: `외부 프록시 등록` / `다른 Google 계정으로 로그인` / `취소`
- [ ] "VPN 자동 활성화" 옵션 부재

### B.2 안전 필터 차단
- [ ] 메시지: 차단 사유(safety/blocked/harmful/policy 키워드 노출)
- [ ] 옵션 3개: `프롬프트 수정` / `그대로 시도` / `취소`
- [ ] 프롬프트 수정 선택 시 입력창에 현재 프롬프트 자동 채움

### B.3 시간당 한도 (HTTP 429)
- [ ] 옵션 3개: `1시간 후 알림 예약` / `다른 Google 계정` / `취소`
- [ ] 알림 예약 선택 시 OS 알림 또는 토스트로 1시간 후 트리거

### B.4 브라우저 미설치
- [ ] Chrome 다운로드 링크 + Edge 다운로드 링크
- [ ] "관리자 권한으로 앱 실행" 안내 텍스트

### B.5 로그인 30분 초과
- [ ] 옵션 2개: `다시 로그인` / `취소`

### B.6 Flow UI 변경
- [ ] 옵션 3개: `1시간 후 자동 재시도` / `다른 엔진 설정 열기` / `취소`
- [ ] "다른 엔진 설정 열기"는 **설정 페이지로 이동만** — 실제 변경은 사용자가 수동

### B.7 회복 불가능 에러
- [ ] 정확한 ErrorCode 표시
- [ ] 옵션 1개: `닫기` (배치 중단)

---

## C. silent 폴백 부재 검증

### C.1 코드 정적 검증
```bash
# 1. 이미지 소스 자동 변경 코드 부재
grep -rn "imageSource\s*=\s*['\"]" src/ | grep -v "test\|\.md\|\.json"
# 예상: 사용자 입력 처리부 외 0건

# 2. 모델 자동 변경 코드 부재
grep -rn "subWorkProvider\s*=\s*['\"]" src/ | grep -v "test\|\.md\|\.json"
# 예상: 사용자 설정 저장부 외 0건

# 3. silent fallback 키워드 부재
grep -rn "silent.*fallback\|auto.*switch.*engine" src/ | grep -v "test\|\.md\|\.json"
# 예상: 0건
```

### C.2 동적 검증
- [ ] 통합 테스트 시나리오 C에서 사용자 "취소" 클릭 후 다음 헤딩으로 자동 진행 안 됨
- [ ] 통합 테스트에서 `imageSource`, `subWorkProvider` 값이 시작 시점과 종료 시점 동일

---

## D. 메트릭 + 운영 대시보드

### D.1 메트릭 집계
- [ ] R1~R8 각각 24h/7d/30d 발생 횟수
- [ ] 평균 복구 소요 시간 (ms, 실측)
- [ ] B1~B7 모달 노출 횟수 + 사용자 선택 분포

### D.2 대시보드 UI
- [ ] `src/monitor/operationsDashboard.ts`에 "복구" 섹션 추가
- [ ] 추정값 표시 금지 — 모든 수치는 실측 카운터 기반

**증명 명령**:
```bash
grep -rn "RecoverySection\|RecoveryMetrics" src/monitor/
```

---

## E. 헤딩 격리 정책

- [ ] 헤딩 i 자동 복구 실패 시 → 헤딩 i+1 정상 시작
- [ ] 헤딩 i 회복 불가능 에러 시 → 배치 즉시 중단 + 체크포인트 저장
- [ ] 3연속 헤딩 실패 시 → 배치 중단 (현재 정책 유지)

**증명 명령**:
```bash
npx vitest run src/__tests__/recoveryIntegration.test.ts -t "heading isolation"
```

---

## F. 회귀 테스트 (기존 동작 유지)

본 SPEC 변경이 다음 기존 동작을 깨지 않아야 함:

- [ ] v2.7.94/v2.8.3에서 잡힌 silent 폴백 회귀 재발 없음
- [ ] AdsPower 일일 한도 시 Playwright 폴백 정상 동작 (이미 있던 로직)
- [ ] 마라톤 모드에서 한 글 실패해도 다음 글 진행
- [ ] 287개 기존 단위 테스트 모두 통과

**증명 명령**:
```bash
npx vitest run --reporter=verbose
# 결과: 287 passed (기존) + 12 새로 추가 = 299 passed
```

---

## G. 빌드 + 릴리즈 검증

- [ ] `npm run build` 성공 (exit 0, 0 errors)
- [ ] `npm run release` NSIS 설치 파일 생성 성공
- [ ] 패키징된 exe 더블클릭 후 ImageFX/Flow 정상 동작
- [ ] feature flag `RECOVERY_DISABLE=1` 환경변수로 off 가능
- [ ] 릴리즈 노트에 추정 효과 수치(%) 0건 (메모리 원칙)

**증명 명령**:
```bash
npm run build 2>&1 | tee build.log
echo "Exit code: $?"
grep -i "error" build.log | grep -v "0 errors"
```

---

## H. 사용자 시나리오 수동 검증

릴리즈 직전 수동 E2E:

| # | 시나리오 | 기대 결과 |
|---|---------|----------|
| H.1 | AdsPower 종료 후 ImageFX 실행 | Playwright 자동 전환 토스트 + 정상 생성 |
| H.2 | Google 계정 로그아웃 후 ImageFX 호출 | R1 자동 재로그인 안내 |
| H.3 | 인터넷 끊고 Flow 실행 | 백오프 3회 후 헤딩 격리 |
| H.4 | 시간당 한도 초과 시 ImageFX 실행 | B3 모달 + 1시간 알림 예약 동작 |
| H.5 | Flow에서 새 프로젝트 버튼 일부러 가린 상태 | R4 다중 셀렉터 → 미매칭 → B6 모달 |
| H.6 | 모달에서 "취소" 선택 | 그 자리에서 종료 + 체크포인트 저장 |
| H.7 | 다음 실행에서 체크포인트 재개 | 멈춘 헤딩부터 진행 |

각 시나리오별로 **스크린샷 또는 로그**를 SPEC 완료 보고서에 첨부.

---

## I. 완료 정의

본 SPEC은 다음 모든 조건을 만족하면 `Status: completed` 로 변경:

1. A.1 ~ A.8 모든 자동 복구 동작 검증 통과
2. B.1 ~ B.7 모든 차단형 모달 검증 통과
3. C silent 폴백 부재 정적/동적 검증 통과
4. D 메트릭 대시보드 표시 확인
5. E 헤딩 격리 통합 테스트 통과
6. F 기존 회귀 테스트 모두 통과
7. G 빌드 + 릴리즈 검증 통과
8. H.1 ~ H.7 수동 E2E 모두 기대 결과 일치
9. v2.10.75 패키징된 exe 더블클릭 검증 완료

**부분 통과 = 미완료** (메모리 [SDD Review Enforcement] 원칙).
