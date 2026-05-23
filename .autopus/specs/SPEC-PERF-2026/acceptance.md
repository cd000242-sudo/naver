# SPEC-PERF-2026 — Acceptance Criteria

> Phase 완료 판정 메트릭. 모든 측정은 실측. 추정/예상 결과 금지 [[feedback_no_speculation]].

## 1. Executive Summary

핵심 메트릭 3건:
1. **idle CPU <5%** — 앱 켜놓고 화면 안 봐도 fan 정지 (1시간 ≥70% 배터리 잔량)
2. **1시간 idle 후 RSS 증가 <50MB** — 메모리 누수 0
3. **1000큐 sha256 누적 <5초** — 1000개 발행 후 main thread 블로킹 미만

## 2. 메트릭 테이블

### 2.1 회귀 메트릭 (매 Phase 필수)

| Metric | Baseline (v2.10.349) | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|---------------------|--------|----------|------|----------|
| vitest pass | **2098/2098** | 2098+ PASS | `npx vitest run` | 매 Fix 후 | 1건이라도 회귀 |
| lint errors | **0** | 본 SPEC 변경 신규 errors 0 | `npm run lint` | 매 Fix 후 | 1건 신규 |
| lint warnings | 1014 | +10 이내 | 동상 | 매 Fix 후 | +20 초과 |
| build | exit 0 | exit 0 | `npm run build` | Phase 종료 시 | 실패 |
| queueSnapshot 1000개 회귀 가드 | **7/7** | 7+ PASS | `npx vitest run src/__tests__/multiAccountQueueSnapshot.test.ts` | god file 영역 touch 시 | 1건 회귀 |

### 2.2 CPU 메트릭 (Phase별 측정)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| **idle CPU 5분 평균** | **<5%** | Windows Task Manager (앱 켜고 무작업) | Phase 종료 시 3회 평균 | ≥10% |
| 단일계정 발행 CPU | <20% | Task Manager (1계정 큐 10개 발행) | Phase 종료 시 | ≥30% |
| 5계정 다중 발행 CPU | <30% | 동상 (5계정 큐 50개) | Phase 6 후 | ≥45% |
| 10계정 1000큐 CPU | <40% | 동상 (dry-run 텔레메트리) | Phase 6 후 | ≥60% |
| Event loop lag p99 | <50ms | `perf_hooks.monitorEventLoopDelay` | Phase 2 후 | ≥150ms |
| sha256 누적 (1000큐) | <5초 | console.time 로그 | Phase 2 후 | ≥30초 |
| Worker pool 부하 분포 | 균등 ±10% | clinic.js flame | Phase 2 후 | 한 worker가 80% 초과 |

### 2.3 메모리 메트릭 (Phase 4 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| **idle RSS** | **<500MB** | Task Manager (앱 부팅 후 5분) | Phase 종료 시 | ≥800MB |
| 발행 peak RSS | <1.5GB | Task Manager (1000큐 dry-run 피크) | Phase 6 후 | ≥2.5GB |
| **1h idle 후 RSS 증가** | **<50MB** | 부팅 직후 vs 1h idle RSS 차이 | Phase 4 후 | ≥100MB (누수) |
| 1000큐 후 RSS 증가 | <200MB | dry-run 전후 비교 | Phase 6 후 | ≥500MB |
| Heap snapshot - DOM nodes (게시물 100건) | ≤1000 노드 | DevTools Memory | Phase 5 후 | ≥3000 (virtual scroll 부재) |
| Heap snapshot - listener count | 안정적 (재호출 시 일정) | DevTools Memory | Phase 4 후 | 매 reload 누적 |

### 2.4 IPC 메트릭 (Phase 3 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 발행당 IPC 호출 | ≤20 메시지 | preload IPC 카운터 | Phase 3 후 | ≥40 |
| 1000큐 IPC 총량 | <10K | 동상 7일 rolling | Phase 6 후 | ≥20K |
| blob:read 200 blob 시간 | <50ms | console.time | Phase 2 후 | ≥200ms |
| syncImageManager 페이로드 크기 | <10KB (blobId 배열만) | preload 로깅 | Phase 3 후 | ≥50KB |
| console interceptor 빈도 | <10/초 (자동화 중) | webContents.send 카운터 | Phase 3 후 | ≥30/초 |

### 2.5 디스크 메트릭 (Phase 4 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 1000큐 후 temp 누적 | **<500MB** | `du -sh %TEMP%/blob-*` | Phase 4 후 | ≥2GB |
| blob 디렉터리 1000큐 후 크기 | 증분 ≤이미지 총 byteSize | `du -sh userData/blob-store/` | Phase 6 후 | 2배 초과 (dedup 실패) |

### 2.6 Renderer DOM 메트릭 (Phase 5 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 게시물 1000건 첫 렌더 시간 | <300ms | DevTools Performance | Phase 5 후 | ≥1000ms |
| 스크롤 FPS | ≥55 | DevTools FPS meter | Phase 5 후 | <30 |
| forced reflow 횟수 / refresh | ≤10 | DevTools Performance | Phase 5 후 | ≥50 |
| Long task >50ms / refresh | 0 | 동상 | Phase 5 후 | ≥1 |

### 2.7 UX 메트릭 (E4)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 발행 시간 P50 (변경 후) | baseline ×1.10 이내 | telemetry publishDurationMs | Phase 종료 시 | ×1.30 초과 |
| 1000큐 총 실행 시간 (10계정) | <120시간 (5일) | telemetry | P6 후 dry-run | ≥168시간 |
| UI 응답성 (클릭 → 반응) | <100ms | 수동 + e2e | 매 Phase 후 | ≥300ms |
| 사용자 모달 차단형 동작 | 100% silent fallback 0 | e2e 시나리오 | 매 Phase 후 | silent 1건 |
| 노트북 1시간 발열 변화 | 손에 차가운 수준 | 사용자 베타 피드백 | Phase 종료 시 | 손이 따뜻함 |
| 노트북 fan 소음 (idle) | 거의 안 들림 | 사용자 베타 피드백 | Phase 종료 시 | 들림 |

## 3. v2.10.349 적용 후 (Quick Win 7건) 즉시 측정 가능

| Metric | v2.10.348 baseline | v2.10.349 예상 | 측정 책임 |
|--------|-------------------|---------------|----------|
| idle CPU 5분 평균 | TBD | -10~20% (3건 polling 정리) | 사용자 직접 측정 |
| 1h idle 후 RSS 증가 | TBD | -수백MB (queueV2 nullify + cleanup) | 사용자 직접 |
| 1000큐 sha256 누적 | 30~60초 | 25~30초 (blob:read 캐시 + stream pipeline) | dry-run 후 측정 |
| trend:alert listener 누수 | 영구 누수 | 0 (cleanup 반환) | 코드 검증 ✅ |

## 4. 의존성

- **A (계측 인프라)**: P0에서 baseline 측정 — 사용자 직접 Task Manager 5분 평균 / RSS 측정
- **B (test 인프라)**: test:full-flow Electron context mocking 별도 SPEC 필요 (현재 사전 결함, v2.10.348 hotfix는 명령어만 복구)
- **C (clinic.js)**: P2 Worker offload 검증 — `npm install -D clinic` 필요 (사용자 결정)
- **E4 (UX baseline)**: 사용자 노트북 모델 + 발열/fan 상태 baseline 기록 필요

## 5. 반박 조건

- 측정 환경 불일치 (타 백그라운드 앱 부하) 시 재측정
- Windows 절전 프로파일 활성 시 무효
- 1회 측정만으로 합격 선언 금지 (idle CPU 3회 평균 + RSS 3회 평균)
- clinic.js 미도입 시 P2 worker 부하 분포 메트릭 측정 불가 → 합격선 완화
- 사용자 노트북 사양 (CPU 코어 수, RAM)에 따라 절대값 변동 — 상대 비교 (baseline 대비) 우선

## 6. 회귀 가드 — Phase별 측정 절차

매 Phase 종료 시 (사용자 + AI 협업):
1. **AI**: `npx vitest run` → 2098+ PASS 확인
2. **AI**: `npm run lint` → 0 errors 확인
3. **AI**: `npm run build` → exit 0
4. **AI**: git diff 독립 검증 (reviewer agent)
5. **사용자**: Windows Task Manager 5분 평균 측정 (idle / 발행 중)
6. **사용자**: 1시간 idle 후 RSS 비교
7. **사용자**: .exe 더블클릭 → 기능 smoke (god file 변경 시)
8. **AI + 사용자**: baseline 대비 메트릭 표 작성 → release notes 첨부

임의 1건이라도 롤백 조건 충족 시:
- 즉시 revert (cascade 금지)
- post-mortem 작성
- 다음 Fix 분할 재설계
- [[feedback_no_cascade_fix]] 적용

## 7. 사용자 합의 사항 (Phase 0 진입 전)

다음 baseline은 사용자가 실측해야 측정 가능:

1. **idle CPU 5분 평균** (Task Manager, 앱 켜놓고 무작업)
2. **단일계정 발행 CPU 평균** (1계정 큐 10개)
3. **idle RSS + 1h 후 RSS** (앱 부팅 후 5분 / 1시간 후 비교)
4. **현재 발행 시간 P50** (telemetry 또는 수동)
5. **노트북 모델 + 발열/fan 상태 baseline**
6. (선택) **temp 디스크 1000큐 dry-run 후 크기** — 1000큐 dry-run 가능한 시점

## 8. v2.10.349 즉시 검증 가능 항목

| # | 검증 항목 | 결과 |
|---|----------|------|
| 1 | vitest 2098/2098 PASS | ✅ |
| 2 | lint 0 errors | ✅ |
| 3 | 1014 warnings 유지 (변동 없음) | ✅ |
| 4 | 코드 변경 ≤200줄 (7 fix 합산) | ✅ |
| 5 | god file 영역 침범 ≤2 hunk (multiAccountManager + continuousPublishing 각 1 hunk) | ✅ |
| 6 | queueSnapshot 1000개 회귀 가드 7/7 PASS | ✅ |
| 7 | trend:alert cleanup 반환 (코드 검증) | ✅ |
| 8 | continuousQueueV2 nullify (코드 검증) | ✅ |
| 9 | blob:read verifiedBlobs 캐시 (코드 검증) | ✅ |

## 9. Related

- [spec.md](.autopus/specs/SPEC-PERF-2026/spec.md)
- [plan.md](.autopus/specs/SPEC-PERF-2026/plan.md)
- [research.md](.autopus/specs/SPEC-PERF-2026/research.md)
- [[feedback_no_speculation]] · [[feedback_regression_check_every_phase]]
