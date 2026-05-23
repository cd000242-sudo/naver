# SPEC-PERF-2026 — Implementation Plan

> **총 7 Phase (P0~P6), 예상 기간 6주, 릴리즈 15~20회.**
> [[feedback_no_cascade_fix]] god file 1릴리즈 1~3 fix 엄수.
> [[feedback_regression_check_every_phase]] 매 Fix 후 git diff 독립 + vitest + lint.

## 0. 의존성 그래프

```
P0 (baseline 측정) ─→ P1 (polling 정리, quick win) ─┬→ P2 (worker offload) ─→ P3 (IPC 최적화)
                                                      │
                                                      ├→ P4 (메모리 누수 차단) ─→ P5 (renderer DOM)
                                                      │
                                                      └→ P6 (multi-Chrome 가드)
```

- **P1 (quick win)** 이미 v2.10.349로 7건 적용 완료 — 본 plan은 잔여 P0/P1 + P2~P6 진행
- P2, P4 병렬 가능 (다른 파일군, 독립 도메인)
- P5는 P4 완료 후 (메모리 누수 차단 위에 DOM 최적화)
- P6은 P1 완료 후 독립 진행 가능

## 1. Phase 개요

| Phase | 목표 | 영향 파일 (god file ★) | LOC | 릴리즈 | 기간 |
|-------|------|----------------------|-----|--------|------|
| P0 | Baseline 측정 + 격차 확정 | docs only | ~200 | 0 | 3일 |
| **P1 (적용 완료 일부)** | Polling/timer 정리 | licenseManager, dashboardUI, multiAccountManager★, main.ts★ wiring | ~100 (적용) +50 (잔여 FR1.4/1.5) | 1 적용 + 1~2 잔여 | 1주 |
| P2 | Worker thread offload | workers/sha256Worker.ts (신규), blobStore, flowMarathonHandlers, contentGenerator★ | ~400 | 3~4 | 2주 |
| P3 | IPC 최적화 | preload, syncImageManager, library:getImageData | ~250 | 2~3 | 1주 |
| P4 | 메모리 누수 차단 | renderer.ts★, continuousPublishing★, postManager, preload | ~250 | 3~4 | 1.5주 |
| P5 | Renderer DOM 최적화 | postListUI, imageManagementTab | ~400 | 3 | 1.5주 |
| P6 | Multi-Chromium 가드 | multiAccountManager★, browserSessionManager | ~200 | 2 | 1주 |

## 2. Phase 상세

### P0 — Baseline 측정 + 격차 확정 (3일, docs only)

**측정 항목 (사용자 직접 실행)**:
1. **idle CPU** Windows Task Manager 5분 평균 (앱 켜고 무작업)
2. **단일계정 발행 CPU** 1계정 큐 10개 발행 중 평균
3. **10계정 1000큐 CPU** dry-run (실발행 아님)
4. **RSS idle** + **1시간 idle 후 RSS 증가**
5. **현재 발행 시간 P50** (telemetry publishDurationMs 또는 수동)
6. **temp 디스크** (`du -sh %TEMP%/blob-*` 1000큐 후)

사용자 합의 baseline 확정 후 P1 잔여 + P2 진입.

**회귀 가드**: docs only, 코드 변경 0.

---

### P1 — Polling/timer 정리 (적용 완료 v2.10.349 + 잔여)

**적용 완료 (v2.10.349)**:
- ✅ Fix 1.1 licenseManager focus 게이팅 + unref
- ✅ Fix 1.2 dashboardUI visibilitychange
- ✅ Fix 1.3 multiAccountManager backdrop 1초 → 30초 + visibility
- ✅ Fix 1.6 preload trend:alert cleanup
- ✅ Fix 4.2 continuousQueueV2 heavy payload nullify
- ✅ Fix 3.1 blob:read sha256 캐시
- ✅ Fix 2.1 (부분) flowMarathonHandlers stream pipeline

**잔여 (P1 후속, 1~2 릴리즈)**:
- Fix 1.4 eventLoopWatchdog suspend/resume — `isActive=false` 시 clearInterval + 재시작
- Fix 1.5 main.ts 라이선스 체크 100ms × 6000회 polling → EventEmitter (god file 1 hunk ≤30줄)
- Fix 4.3 renderer.ts addEventListener 4개 IIFE → AbortController 패턴 (god file 1 hunk)

**회귀 가드**: vitest + lint + idle 5분 CPU 측정

---

### P2 — Worker thread offload (2주, 3~4 릴리즈) — P4와 병렬 가능

- **Fix 2.2** workers/sha256Worker.ts 신규 (base64Pool 패턴 재활용)
- **Fix 2.3** blobStore read sha256 → worker offload (verifiedBlobs 캐시 + worker pool 보완)
- **Fix 2.4** flowMarathonHandlers stream pipeline + worker (메모리 + CPU 동시 절감)
- **Fix 2.5** contentGenerator★ JSON.parse 대용량 (>50KB) → worker (god file 1 hunk, 호출점만)

**회귀 가드**: vitest + clinic.js flame (worker pool 부하 분포 검증) + 1000큐 dry-run

---

### P3 — IPC 최적화 (1주, 2~3 릴리즈)

- **Fix 3.2** automation:syncImageManager Map 전체 직렬화 → blobId 배열만 전달
- **Fix 3.3** library:getImageData Base64 IPC → Uint8Array transferable
- **Fix 3.4** console interceptor LOG_FORWARD_PREFIXES 필터 강화 (현재 자동화 중 초당 10~50회)

**회귀 가드**: vitest + IPC 카운터 측정 (50%↓ 목표) + UI 일관성 e2e

---

### P4 — 메모리 누수 차단 (1.5주, 3~4 릴리즈) — P2와 병렬 가능

- **Fix 4.4** continuousPublishing★ addEventListener 4개 익명 화살표 → 명명 listener + cleanup (god file 1 hunk)
- **Fix 4.5** DOMContentLoaded 645/967 중복 → 단일 init (renderer.ts★ 1 hunk)
- **Fix 4.6** finalStructuredContent closure 캡처 해제 (continuousPublishing 1 hunk)
- **Fix 4.7** Phase 7a cleanupStaleImageReferences 부재 후속 — Phase 6 미마이그레이션 사용자 fallback

**god file 침범**: renderer.ts 1 hunk + continuousPublishing.ts 2 hunk. 분할 commit 필수.

**회귀 가드**: vitest + 1시간 idle 후 RSS 비교

---

### P5 — Renderer DOM 최적화 (1.5주, 3 릴리즈) — P4 완료 후

- **Fix 5.1** postListUI virtual scroll (100+ 게시물, ~150줄 신규 모듈)
- **Fix 5.2** innerHTML 전체 교체 → DocumentFragment 증분 렌더
- **Fix 5.3** attachPostItemEventListeners → event delegation (querySelectorAll 11회 → 1회)
- **Fix 5.4** inline onmouseover style 변이 → CSS hover (HTML 문자열 정리)
- **Fix 5.5** instant scrollIntoView → smooth + 관성

**회귀 가드**: vitest + Chrome DevTools Performance recording (Long Task <50ms)

---

### P6 — Multi-Chromium 가드 (1주, 2 릴리즈) — P1 완료 후 독립

- **Fix 6.1** multiAccountManager★ 동시 활성 계정 N≤5 cap (god file 1 hunk)
- **Fix 6.2** N>5 시 queue ramping (시간대별 동적 활성)
- **Fix 6.3** 비활성 BrowserView suspend
- **Fix 6.4** browserSessionManager★ Chrome 인스턴스 풀 정리 (god file 1 hunk)

**god file 침범**: multiAccountManager 1 hunk + browserSessionManager 1 hunk. 분할 commit.

**회귀 가드**: vitest + 10계정 동시 발행 CPU 측정 (40%↓ 목표) + queueSnapshot 회귀 가드 재실행

---

## 3. 매 Phase 회귀 검증 절차 (의무)

매 Fix 커밋 직후:
1. `git diff HEAD~1` 독립 검증 (reviewer agent)
2. `npx vitest run` 전체 PASS (현재 baseline **2098/2098**)
3. `npm run lint` 0 errors
4. **god file 영역 touch 시** `npm run test:full-flow` (test 인프라 회복 후) 또는 수동 .exe 더블클릭
5. **Phase 종료 시**:
   - idle CPU 5분 측정 (Task Manager)
   - 발행 1건 CPU 측정
   - RSS 1h idle 측정
6. 회귀 발견 시 즉시 revert ([[feedback_no_cascade_fix]])

## 4. 릴리즈 노트 정책

| 항목 | 내용 |
|------|------|
| 변경 사실 | git diff 추출, 실제 변경 라인만 |
| 측정 수치 | vitest 통과 수, lint errors, CPU/RSS baseline 대비 |
| ❌ 금지 | "X% 향상", "더 빠름" 등 추정 표현 ([[feedback_no_speculation]]) |
| 회귀 가드 결과 | git diff/vitest/lint/CPU 측정 모두 PASS 표시 |

## 5. Risk 매트릭스 (E1~E4 종합)

### 5.1 god file cascade (E1)

| god file | LOC | 본 SPEC 침범 Phase | 침범 hunk (예상) | 가드 |
|---------|-----|-------------------|----------------|------|
| renderer.ts | 10,471 | P1(Fix 1.5/4.5), P4(Fix 4.5) | 2 hunk 누적 | 분할 commit |
| main.ts | 8,217 | P1(Fix 1.5) | 1 hunk | OK |
| continuousPublishing.ts | 5,247 | P4(Fix 4.4/4.6) | 2 hunk | 분할 commit |
| multiAccountManager.ts | 4,888 | P6(Fix 6.1) | 1 hunk | OK |
| contentGenerator.ts | ~8,000 | P2(Fix 2.5) | 1 hunk | OK |
| browserSessionManager.ts | ~1,000 | P6(Fix 6.4) | 1 hunk | OK |

### 5.2 회귀 호환성 (E2)

| 기존 흐름 | 충돌 risk | 가드 |
|----------|----------|------|
| v2.10.301 봇감지 backoff | P6 multi-Chrome 가드와 결합 | 회귀 가드 vitest 재실행 |
| v2.10.337 intervalJitter | 영향 없음 | — |
| v2.10.285 로그인 시차 | 영향 없음 | — |
| v2.10.346 queueSnapshot | P4 continuousQueueV2 추가 변경 시 충돌 가능 | queueSnapshot 1000개 회귀 가드 7/7 PASS 의무 |
| v2.10.347 SPEC-IMAGE-MODEL-001 | P2/P3 blob 관련 | blobStore unit test 통과 의무 |
| v2.10.348 보안 hotfix | 영향 없음 (보안 추가는 누적) | — |

### 5.3 Trade-off (E3, SPEC-NAVER-PROTECTION-2026 통합)

| 항목 | 본 SPEC (CPU↓) | SPEC-NAVER (보호조치) | 결정 |
|------|---------------|---------------------|------|
| polling 빈도 ↓ | CPU -10% | backoff 정확도 ↓ risk | E2 호환성 검증 필수 |
| Worker offload | main blocking ↓ | blob store v2.10.347 호환 | 본 SPEC 우선 |
| Multi-account cap N≤5 | CPU ↓ + 안전성 ↑ | 사용자 선택권 ↓ | UI 옵션 제공 |
| fingerprint randomize | CPU +1초/1000큐 | uniqueness 100% | 무시 가능 |

### 5.4 UX 영향 (E4)

| 변경 | 사용자 체감 | 대응 |
|------|------------|------|
| idle CPU <5% | fan 정지, 노트북 발열 ↓ | 긍정 |
| 발행 시간 변동 | 미미 (Worker offload는 await으로 흡수) | 진행률 표시 정확도 +10% |
| virtual scroll | 스크롤 동작 약간 다름 | 사용자 베타 피드백 수집 |
| Multi-account 5 cap | 10계정 운영 시 시간 +20% | 옵션으로 해제 가능 |

## 6. 사용자 승인 게이트

- **P0 시작**: 사용자가 spec.md/plan.md/acceptance.md/research.md 4파일 검토 완료
- **P2 시작**: P0 baseline 측정 + 사용자 합의
- **P5 시작**: virtual scroll UI 변경 사용자 동의 (UX 영향 큼)
- **P6 시작**: Multi-account cap 정책 사용자 합의

각 게이트 미통과 시 Phase 진입 차단.

## 7. Related

- [spec.md](.autopus/specs/SPEC-PERF-2026/spec.md)
- [acceptance.md](.autopus/specs/SPEC-PERF-2026/acceptance.md)
- [research.md](.autopus/specs/SPEC-PERF-2026/research.md)
- SPEC-NAVER-PROTECTION-2026 (E3 영역 통합)
- [[feedback_no_cascade_fix]] · [[feedback_regression_check_every_phase]] · [[feedback_no_fallback]] · [[feedback_no_speculation]]
