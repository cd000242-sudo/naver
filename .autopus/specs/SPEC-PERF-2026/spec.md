# SPEC-PERF-2026

> CPU 과부하 + 메모리 누수 + idle 부담 해소
> 작성일: 2026-05-24 · 기반: 30팀 병렬 agent 분석 (research.md) + 사용자 보고

## 1. Goal

| 시나리오 | 현재 추정 | 목표 |
|---------|----------|------|
| **idle CPU** (앱 켜놓고 무작업) | 10~30% | **<5%** |
| **단일계정 발행 CPU** | 40~60% | **<20%** |
| **10계정 1000큐 CPU** | 70~90% (saturation) | **<40%** |
| idle RSS (메모리) | TBD | **<500MB** |
| 발행 시 peak RSS | TBD | **<1.5GB** |
| 1시간 idle 후 RSS 증가 | 누적 (누수) | **<50MB** |
| 1000큐 sha256 누적 main thread | 30~60초 | **<5초** |
| 1000큐 temp 디스크 누적 | ~4GB | **<500MB** |
| Event loop lag p99 | TBD | **<50ms** |

## 2. Background

### 2.1 사용자 보고 (원문, 2026-05-24)
> "앱자체가 작업할때도 마찬가지이고 cpu를 너무 잡아먹는것같은데"

idle + 발행 작업 시 모두 CPU 과부하. 사용자 노트북 fan 소음 + 배터리 빠른 소모 추정.

### 2.2 30팀 분석 (research.md §3 발췌)
**P0 13건 발견** (즉시 차단 가능 또는 시스템 안정성 직격):
- Polling 4건 (license/dashboard/backdrop/100ms × 6000회)
- 메모리 누수 3건 (queueV2/addEventListener/preload)
- DOM 2건 (innerHTML/virtual scroll 부재)
- sha256/IPC 2건 (blob read 캐싱 부재 + Map 전체 직렬화)
- stealth/fingerprint 2건

총 **P0 즉시 Quick Win 가능 9건**, P1 10+건.

## 3. User Scenarios

| ID | 시나리오 | 사용 패턴 | 목표 |
|----|---------|----------|------|
| S1 | Idle | 앱 켜놓고 화면 안 봄 (잠시 자리 비움) | <5% CPU, fan 정지 |
| S2 | 단일계정 발행 | 1계정 큐 10개 발행 중 | <20% CPU, 노트북 발열 ↓ |
| S3 | 10계정 1000큐 | 다중계정 풀오토 | <40% CPU, OOM crash 0 |
| S4 | 노트북 배터리 | 외부 전원 없이 운영 | 1시간 작업 ≥ 70% 배터리 잔량 |

## 4. Functional Requirements

### FR1 — Polling / Timer 정리 (P0 quick win)
- FR1.1 ✅ **v2.10.349 적용** licenseManager 5분 polling → focus 게이팅 + unref
- FR1.2 ✅ **v2.10.349 적용** dashboardUI 시계 → visibilitychange 일시정지
- FR1.3 ✅ **v2.10.349 적용** multiAccountManager backdrop guard 1초 → 30초 + visibility 게이팅
- FR1.4 (P1) eventLoopWatchdog isActive=false 시 setInterval clearInterval (현재 tick 발생)
- FR1.5 (P1) main.ts 라이선스 체크 100ms × 6000회 polling → EventEmitter 신호 채널

### FR2 — Worker thread offload (P1~P2)
- FR2.1 ✅ **v2.10.349 적용 (부분)** flowMarathonHandlers sha256 → stream pipeline (메모리 효율)
- FR2.2 sha256 전체 → worker_threads (sha256Worker.ts 신규, base64Pool 패턴)
- FR2.3 JSON.parse 대용량 (>50KB LLM 응답) → worker

### FR3 — IPC 최적화 (P0~P1)
- FR3.1 ✅ **v2.10.349 적용** blob:read sha256 verifiedBlobs 캐시
- FR3.2 (P1) `automation:syncImageManager` Map 직렬화 → blobId 배열만 전달
- FR3.3 (P1) `library:getImageData` Base64 IPC → Uint8Array transferable

### FR4 — 메모리 누수 차단 (P0)
- FR4.1 ✅ **v2.10.349 적용** preload `trend:alert` cleanup 반환
- FR4.2 ✅ **v2.10.349 적용** continuousQueueV2 발행 완료 후 heavy payload nullify
- FR4.3 (P1) renderer.ts addEventListener 4개 IIFE → AbortController 패턴
- FR4.4 (P1) continuousPublishing addEventListener 4개 익명 화살표 → 명명 listener + cleanup
- FR4.5 (P1) DOMContentLoaded 645/967 중복 → 단일 init

### FR5 — Renderer DOM 최적화 (P0~P1)
- FR5.1 postListUI virtual scroll 도입 (100+ 게시물)
- FR5.2 innerHTML 전체 교체 → DocumentFragment 증분 렌더
- FR5.3 attachPostItemEventListeners → event delegation (querySelectorAll 11회 → 1회)
- FR5.4 inline onmouseover style 변이 → CSS hover (Forced Reflow 차단)
- FR5.5 instant scrollIntoView → smooth + 관성

### FR6 — Multi-Chromium 인스턴스 가드 (P1)
- FR6.1 동시 활성 계정 N≤5 cap (puppeteer-cluster 권장)
- FR6.2 N>5 시 queue ramping (시간대별 동적 활성)
- FR6.3 비활성 BrowserView suspend

### FR7 — temp 파일 cleanup (P1)
- FR7.1 `materializePublishingImages` `app.on('before-quit', cleanup)` 추가
- FR7.2 1000큐 후 temp 디스크 <500MB 보장

### FR8 — Telemetry (P2)
- FR8.1 `monitor/operationsDashboard` CPU% / RSS / event loop lag 추가
- FR8.2 Phase 1~7 hook 합산 (P5 SPEC-NAVER-PROTECTION-2026과 통합)

## 5. Non-Functional Requirements

| # | 항목 | 기준 |
|---|------|------|
| NFR1 | 회귀 0건 | vitest 2098+ PASS, lint 0 errors |
| NFR2 | 발행 정확도 손실 0 | queueSnapshot 1000개 회귀 가드 7/7 PASS 유지 |
| NFR3 | 1릴리즈 1~3 fix 준수 | [[feedback_no_cascade_fix]] |
| NFR4 | god file 캐스케이드 금지 | renderer.ts / main.ts / multiAccountManager.ts / continuousPublishing.ts / contentGenerator.ts |
| NFR5 | 매 Phase 회귀 검증 | git diff + vitest + lint + (god file 영역) full-flow |
| NFR6 | 측정 가능 | clinic.js + Task Manager 로그 없이 "개선됐다" 주장 금지 ([[feedback_no_speculation]]) |

## 6. Out of Scope

- Electron 메이저 업그레이드 (별도 SPEC: Phase 5C)
- god file 분할 리팩터 (별도 SPEC)
- residential proxy 도입 (SPEC-NAVER-PROTECTION-2026 영역)
- 신규 LLM 모델 교체
- 콘텐츠 알고리즘 변경 (AuthGR/QUMA-VL은 SPEC-NAVER-PROTECTION-2026)

## 7. Success Metrics

| Metric | 측정 방법 | 빈도 | 합격선 |
|--------|----------|------|-------|
| idle CPU | Windows Task Manager 5분 평균 | Phase별 | <5% |
| 단일 발행 CPU | 동상 | Phase별 | <20% |
| 10계정 CPU | 동상 | Phase 6 후 | <40% |
| 1000큐 sha256 누적 | console.time 로그 | Phase 2 후 | <5초 |
| RSS 1h idle 증가 | process.memoryUsage 비교 | 매 Phase 후 | <50MB |
| IPC 빈도 | preload 카운터 | Phase 3 후 | 50% 감소 |
| Event loop lag p99 | perf_hooks.monitorEventLoopDelay | 매 Phase 후 | <50ms |
| temp 디스크 1000큐 | `du -sh %TEMP%/blob-*` | Phase 4 후 | <500MB |

## 8. Constraints (운영 헌법)

- C1. **1릴리즈 1~3 fix** ([[feedback_no_cascade_fix]])
- C2. **매 Phase 회귀 검증** ([[feedback_regression_check_every_phase]])
- C3. **silent fallback 금지** ([[feedback_no_fallback]]) — Worker 실패 시 main thread fallback은 사용자 알림 동반
- C4. **추정/예상 결과 금지** ([[feedback_no_speculation]]) — release notes는 baseline 대비 실측만
- C5. **v2.10.301/337/285/346/347/348 호환** 유지

## 9. Risks (plan.md §5 상세)

- R1 (E1 cascade): renderer.ts/continuousPublishing.ts god file 침범 risk
- R2 (E2 regression): queueSnapshot immutable + 봇감지 backoff 호환성
- R3 (E3 trade-off): polling 빈도 ↓ → 응답성 ↓, Worker offload → 결과 지연
- R4 (E4 UX): virtual scroll 도입 시 사용자 UI 일관성 변화

## 10. 반박 조건

- baseline 측정 결과 idle CPU가 이미 <5%인 경우 → 사용자 보고가 특정 시나리오 한정 (재정의)
- Puppeteer Chrome이 CPU의 70%+ 차지하면 앱 레벨 최적화 효과 한계 → 별도 SPEC
- Worker thread offload가 IPC 직렬화 비용으로 역효과 → FR2 폐기, native addon 검토
- 사용자가 "CPU"가 아닌 "팬 소음/발열" 의미면 GPU/디스크 I/O 영역으로 SPEC 재기획

## 11. 회귀 가드

- vitest 2098 baseline + 신규 Quick Win 회귀 가드 (각 Phase별 +5~10 테스트)
- lint 0 errors, warnings +10 이내
- git diff 독립 검증 (reviewer agent)
- full-flow 1회 (god file 영역 변경 시 의무, 다만 test 인프라 사전 결함은 별도 SPEC)
- 1000큐 dry-run 텔레메트리 (Phase 6 이후)
- 롤백: Phase별 feature flag, 메트릭 +10% 악화 시 즉시 revert

## 12. v2.10.349 즉시 적용 Quick Win (본 SPEC P0 첫 7건)

| # | Fix | 효과 |
|---|-----|------|
| QW1 | preload trend:alert cleanup 반환 | 영구 listener 누수 차단 |
| QW2 | licenseManager focus 게이팅 + unref | idle 5분마다 무용 네트워크 차단 |
| QW3 | dashboardUI visibilitychange | 탭 hidden 시 시계 tick 정지 |
| QW4 | blob:read sha256 verified 캐시 | 1000큐 sha256 25~50초 → ~0초 |
| QW5 | continuousQueueV2 heavy payload nullify | 1000큐 후 RSS 누적 수백MB 차단 |
| QW6 | multiAccountManager backdrop 1초 → 30초 + visibility | idle CPU 5%↓ |
| QW7 | flowMarathonHandlers fs.readFile + sha256 → stream pipeline | 메모리 효율 + main thread yield |

vitest **2098/2098 PASS** (1 pre-existing licenseManagerRegression이 QW2 적용 후 해소). lint 0 errors. **회귀 0**.

## 13. Related

- [research.md](.autopus/specs/SPEC-PERF-2026/research.md) (30팀 분석 종합)
- [plan.md](.autopus/specs/SPEC-PERF-2026/plan.md) (Phase 분할)
- [acceptance.md](.autopus/specs/SPEC-PERF-2026/acceptance.md) (정량 메트릭)
- SPEC-NAVER-PROTECTION-2026 (E3 perf 영역 통합 검토)
- [[feedback_no_cascade_fix]] · [[feedback_regression_check_every_phase]] · [[feedback_no_fallback]] · [[feedback_no_speculation]]
