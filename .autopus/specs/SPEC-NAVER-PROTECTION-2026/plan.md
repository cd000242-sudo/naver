# SPEC-NAVER-PROTECTION-2026 — Implementation Plan

> **총 8 Phase (P0~P7), 예상 기간 9~12주, 릴리즈 22~30회.**
> [[feedback_no_cascade_fix]] 엄격 적용 — god file 1릴리즈 1~3 fix 분할.
> [[feedback_regression_check_every_phase]] 매 Fix 후 git diff 독립 + vitest + lint + (god file 영역) full-flow.

## 0. 의존성 그래프

```
                       ┌─ P3 (Fingerprint 강화) ─┐
                       │                          │
P0 (격차 확정)  ──→ ──┤  P2 (발행 빈도 동적)   ──┼──→ P5 (워밍업 + 행동) ──→ P6 (회복) ──→ P7 (텔레메트리/튜닝)
   │                   │                          │                                  ↑
   └─→ P1 (셀렉터/IP 인프라) ─────────────────────┘                                  │
                       │                                                              │
                       └─ P4 (콘텐츠/이미지) ─────────────────────────────────────────┘
```

- **P0**: 격차 매트릭스 확정 (문서만, 코드 변경 0)
- **P1**: 셀렉터 remoteUpdate 활성화 + IP 인프라 — 모든 후속 Phase의 기반
- **P2 ∥ P3 ∥ P4**: 3개 도메인 병렬 가능 (파일 충돌 적음)
- **P5**: P2/P3/P4 결과를 행동에 통합
- **P6**: P5 워밍업 위에 회복 hook
- **P7**: 1~6 Phase 텔레메트리 hook 집계 + 자동 튜닝

## 1. Phase 개요

| Phase | 목표 | 영향 파일 (god file ★) | LOC | 릴리즈 | 기간 |
|-------|------|----------------------|-----|--------|------|
| P0 | 격차 확정 + research 보강 | docs only | ~200 | 0 | 2일 |
| P1 | 셀렉터 활성화 + IP 인프라 | selectors/, proxyManager, browserSessionManager★ | ~600 | 4~5 | 1.5주 |
| P2 | 발행 빈도 동적 분산 | postLimitManager, publishingStrategy, smartScheduler, intervalJitter, multiAccountManager★ | ~700 | 4~5 | 2주 |
| P3 | Fingerprint 강화 | stealth/ (신규), browserSessionManager★, crawler 8곳 | ~900 | 5~6 | 2주 |
| P4 | 콘텐츠/이미지 (AuthGR/QUMA-VL) | authgrDefense, contentGenerator★, qualityEnhancer, imageFormatPipeline, imageTextConsistencyChecker | ~800 | 4~5 | 2주 |
| P5 | 워밍업 + 행동 인간화 | humanBehavior/ (신규), sessionPersistence, editorHelpers, imageHelpers, naverBlogAutomation★ | ~700 | 4~5 | 2주 |
| P6 | 봇감지 회복 자동화 | protection/ (신규), main.ts★, multiAccountManager★, renderer.ts★ (UI 모달) | ~500 | 4~5 | 1.5주 |
| P7 | 텔레메트리 + 자동 튜닝 | monitor/, protection/autoTuner.ts (신규) | ~400 | 2~3 | 1주 |

**god file 침범 카운터** (E1 cascade gate):
- `renderer.ts` (13K줄): P6에서만 ≤3 헝크
- `main.ts` (14K줄): P3·P6에서 각각 ≤3 헝크
- `naverBlogAutomation.ts` (9K줄+): P5·P6에서 각각 ≤3 헝크
- `multiAccountManager.ts`: P2·P6에서 각각 ≤3 헝크
- `contentGenerator.ts`: P4에서 ≤3 헝크 (8K줄)
- `browserSessionManager.ts`: P1·P3에서 각각 ≤3 헝크

Phase 진입 전 reviewer agent로 영향 파일 LOC 측정 → 헝크 분할안 사전 검수 (E1 게이트).

---

## 2. Phase 상세

### P0 — 격차 확정 + research.md 보강 (2일, docs only)

**입력**: 30팀 보고서 (A1~A8, B1~B8, C1~C6, D1~D4, E1~E4)
**산출**:
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` (작성됨)
- 격차 매트릭스 확정 (research.md §3)
- 사용자 SPEC 검토 + 승인

**회귀 가드**: doc-only, build/test 변동 없음. lint 영향 0.

**Fix 분할**: 1 commit (docs).

---

### P1 — 셀렉터 활성화 + IP 인프라 (1.5주, 4~5 릴리즈)

**핵심**: 후속 Phase의 모든 가드/검증이 IP/셀렉터 인프라에 의존.

- **Fix 1.1** — 셀렉터 remoteUpdate 활성화
  - `src/automation/selectors/remoteUpdate.ts:28` category union 확장 (place/flow/shopping/topblogger 추가)
  - `main.ts` 진입점에서 `schedulePeriodicCheck` 호출 (1줄 wiring)
  - 9개 fallback `[]` 무chain 셀렉터에 최소 1개 fallback 추가
  - 회귀: vitest (selectors 회귀 가드 신규 5건) + lint
- **Fix 1.2** — proxy null 차단 (FR3.1)
  - `crawler/utils/proxyManager.ts:140-158` — getProxyUrl null 시 다계정 hard-block 옵션
  - `browserSessionManager.ts:246` fall-through 제거
  - `account/blogAccountManager.ts:484-497` — proxy 필수 필드 마이그레이션 (UI 알림)
  - 회귀: vitest (proxy null 케이스 unit) + 단일계정 1IP smoke
- **Fix 1.3** — WebRTC leak 차단 (FR3.3)
  - launch args `--enforce-webrtc-ip-permission-check` + `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` 추가
  - browserSessionManager 핵심 호출 1곳 + crawlerBrowser 1곳 (heuristic 자동 적용)
  - 회귀: vitest (launch args 검증) + Playwright e2e (BrowserLeaks WebRTC test)
- **Fix 1.4** — sticky proxy 매핑 (FR3.2)
  - 계정ID → 회선 1:1 lifetime 매핑 (`account/proxyMapping.ts` 신규)
  - 검증: 같은 계정 = 같은 IP across N runs
  - 회귀: vitest
- **Fix 1.5** (선택) — IP reputation 사전 체크 (FR3.5, opt-in)
  - IPQS/AbuseIPDB 통합 (사용자 API key 입력)
  - fraud_score ≥75 회선 자동 제외
  - 회귀: vitest mock + opt-in flag

**god file 침범**: `browserSessionManager.ts` 2~3 헝크 (Fix 1.2, 1.3 합산). E1 사전 검수 통과 시 진행.

**회귀 가드 (Phase 종료 시)**:
1. `npx vitest run` → 2098 + 신규 5~10건 PASS
2. `npm run lint` → 0 errors
3. `npm run test:full-flow` 단일계정 1IP
4. 다중계정 2개 + 2 proxy smoke
5. BrowserLeaks WebRTC leak 0건 확인 (수동)

---

### P2 — 발행 빈도 동적 분산 (2주, 4~5 릴리즈) — P3과 병렬 가능

- **Fix 2.1** — `postLimitManager` 계정ID 인자 추가 (FR2.1)
  - `postLimitManager.ts` 전체 함수 시그니처 변경 — accountId 필수
  - 호출 사이트 (`BlogExecutor.ts:539-541` 외) 일괄 수정
  - 회귀: vitest (다계정 카운터 분리 5건) + 100큐 dry-run
- **Fix 2.2** — hourly window 리셋 경계 버그 (FR2.3)
  - `postLimitManager.ts:116-120` — `>` → `>=` + lastHourReset null 처리
  - 회귀: vitest (boundary case 5건)
- **Fix 2.3** — 인터벌 60분 floor (FR2.2)
  - `SAFE_PUBLISH_MIN_INTERVAL_SEC` 180 → 3600
  - 사용자 설정 <30분 차단 모달 (renderer touch)
  - 회귀: vitest + multiAccountManager smoke
- **Fix 2.4** — `checkGoldenZone` 강제 차단 호출 사이트 추가 (FR2.4)
  - `validatePublishAllowed`에 통합
  - 새벽 2~6시 발행 비율 ≤10% 강제
  - 회귀: vitest (시간대별 분포 분포 검증 1000회 sampling)
- **Fix 2.5** — 시간대 가중치 + 신생 계정 (FR2.5, 2.6, 2.7)
  - `smartScheduler.ts` 시간대 가중치 테이블 (오전 9~12 peak)
  - `publishingStrategy.ts` 신생 계정(≤30일) 자동 감지 + 일 1~3건
  - 외부 링크 글당 3개+ 경고
  - 회귀: vitest

**god file 침범**: `multiAccountManager.ts` 2 헝크 (Fix 2.1 후속).

**회귀 가드**: vitest (분포 chi-square) + 100큐 dry-run (실발행 없음) + 기존 v2.10.337 jitter 호환성

---

### P3 — Fingerprint 강화 (2주, 5~6 릴리즈) — P2와 병렬 가능

- **Fix 3.1** — 계정별 stable fingerprint seed (FR4.1, 4.2)
  - `src/automation/stealth/fingerprintProfile.ts` 신규
  - accountId hash 충돌 회피 (substring prefix)
  - hardwareConcurrency/deviceMemory/languages/platform 계정별 randomization
  - `browserSessionManager.ts:459-462` touch (3~5줄)
  - 회귀: vitest (10계정 unique 검증)
- **Fix 3.2** — screen/WebGL pool 확장 (FR4.3)
  - `browserSessionManager.ts:208,216` — `seed % 4` → `seed % 16`
  - WebGL renderer pool 4종 → 12종 확장
  - 회귀: vitest
- **Fix 3.3** — Canvas/Audio noise + Font jitter (FR4.4, 4.5)
  - `src/automation/stealth/canvasNoise.ts`, `audioNoise.ts`, `fontJitter.ts` 신규
  - page.evaluateOnNewDocument 주입
  - 회귀: vitest (noise 결정성 — 같은 seed = 같은 noise)
- **Fix 3.4** — **headless:true 4곳 제거** (FR4.6)
  - smartCrawler.ts:746, productSpecCrawler.ts:364/477/535, imageLibrary.ts:274, editorHelpers.ts:1574
  - `headless: false` 또는 `headless: 'new'` Chrome native headless로 전환
  - 회귀: vitest + e2e smoke 각 크롤러
- **Fix 3.5** — **Playwright 5곳 stealth 적용** (FR4.7)
  - crawler/utils/urlUtils.ts:48-50, image/imageFxGenerator.ts:989/1005/1023/1047
  - playwright-extra + stealth() 적용
  - 회귀: vitest + ImageFX smoke
- **Fix 3.6** — UA 일관성 + TLS 우회 (FR4.8, 4.9, 4.10)
  - 하드코딩 UA 제거 (browserFactory.ts:37, naverBlogCrawler.ts:146)
  - ESLint custom rule `no-direct-naver-fetch` — analytics/agents/engagement 18+ 사이트 금지
  - 네이버 도메인 호출은 Chromium net stack 강제 (page.evaluate 또는 webRequest 라우팅)
  - 회귀: vitest + lint (신규 lint rule)
- **Fix 3.7** (선택) — JA4 측정 가드
  - `tests/integration/ja4-probe.test.ts` — `tls.scrapfly.io` hash 비교
  - Chrome stable ±5% 임계
  - 회귀: integration test (외부 의존 — opt-in)

**god file 침범**: `browserSessionManager.ts` 3 헝크 (Fix 3.1, 3.2 합산), `main.ts` 1 헝크.

**회귀 가드**: vitest (fingerprint diff test) + CreepJS 점수 측정 (수동, baseline 비교)

---

### P4 — 콘텐츠/이미지 (AuthGR/QUMA-VL) 강화 (2주, 4~5 릴리즈) — P2/P3과 병렬 가능

- **Fix 4.1** — 헤딩 구조 동적화 (FR6.1)
  - `contentGenerator.ts:7172-7189` 4단 고정 → 2~6단 동적 분포
  - 프롬프트 템플릿 5종 회전
  - 회귀: vitest (분포 측정 100건) + 글 품질 수동 검토 10건
- **Fix 4.2** — 도입부/CTA 보일러 회전 (FR6.2)
  - `qualityEnhancer.ts:64, 647-667` CTA 5종 → 30종+ pool
  - `commentChain.ts:144`, `commentResponder.ts:30`, `agents/persona.ts:40-42` 인사 10종+ 회전
  - cosine similarity <0.7 across N posts (vitest 가드)
  - 회귀: vitest
- **Fix 4.3** — 한국어 perplexity / KatFishNet 신호 (FR6.3, 6.4)
  - `src/content/katFishSignal.ts` 신규 — POS n-gram + 공백/쉼표 분포 측정
  - `src/content/burstiness.ts` 신규 — 임계 ≥0.60 가드
  - `authgrDefense.ts` 통합 hook
  - 회귀: vitest (KatFishNet 임계 + burstiness 100건 sample)
- **Fix 4.4** — humanizer 강화 (FR6.5)
  - 3~5단어 fragment + 25+단어 winding 의도적 혼합
  - 프롬프트 + 후처리 양쪽 적용
  - 회귀: vitest (분포 측정)
- **Fix 4.5** — EXIF + ALT + temp cleanup (FR5.1, 5.3, 5.4)
  - `imageFormatPipeline.ts:196-210` — sharp `exif().strip()` 명시 호출
  - PNG ancillary chunks 제거 + 단위 테스트
  - ALT 자동 생성기 (`flowGenerator.ts:1276-1375` 확장) — uniqueness 100%
  - `materializePublishingImages.ts` — `app.on('before-quit')` cleanup hook
  - 회귀: vitest (EXIF 바이너리 검증) + e2e (1000큐 후 temp <2GB)
- **Fix 4.6** (선택) — AI 이미지 감지 (FR5.2)
  - perceptual hash 분포 + frequency analysis
  - 배치 내 시각적 중복 감시
  - 회귀: vitest

**god file 침범**: `contentGenerator.ts` 2~3 헝크 (Fix 4.1, 4.2).

**회귀 가드**: vitest + 글 100건 sample 외부 detector(GPTZero/ZeroGPT/Originality) 자유티어 round-trip 비교 (수동)

---

### P5 — 워밍업 + 행동 인간화 (2주, 4~5 릴리즈)

- **Fix 5.1** — humanBehavior 모듈 (FR7.2, 7.3, 7.5)
  - `src/automation/humanBehavior/mouseTrajectory.ts` 신규 — Bezier curve + Fitts + tremor + 가속도
  - `humanBehavior/typingRhythm.ts` 신규 — dwell/flight time (kor 자모 고려)
  - `humanBehavior/scrollInertia.ts` 신규 — 관성 시뮬레이션
  - 회귀: vitest (분포 측정 1000회 sampling)
- **Fix 5.2** — editorHelpers 고정 delay 제거 (FR7.1)
  - `editorHelpers.ts:784, 943, 957, 2048-2174, 2201` — `safeKeyboardType` delay 옵션 → `typingRhythm` 위임
  - ESLint custom rule `no-fixed-keyboard-delay`
  - 회귀: vitest + e2e (단일계정 발행 smoke)
- **Fix 5.3** — imageHelpers mouse 텔레포트 제거 (FR7.2)
  - `imageHelpers.ts:1550, 1606, 1822` — `page.mouse.move(x, y)` → `mouseTrajectory.moveTo(page, x, y)`
  - 더블클릭 고정 타이밍 (`1551-1564`) → jitter
  - ESLint custom rule `no-coord-teleport`
  - 회귀: vitest + e2e
- **Fix 5.4** — `scrollIntoView({ behavior: 'instant' })` → `'smooth'` + 관성 (FR7.4)
  - naverBlogAutomation.ts:4879, 4949, 2917 / imageHelpers.ts:1525, 1788
  - ESLint custom rule `no-instant-scroll`
  - 회귀: vitest + e2e
- **Fix 5.5** — 세션 워밍업 강화 (FR1.2, 세션 안정성)
  - `sessionPersistence.ts` 워밍업에 페이지 chain (메인 → 이웃새글 → 내블로그 → 글쓰기)
  - dwell 30초 + 스크롤 + hover
  - `naverBlogAutomation.ts:3730-3736` 예외 무시 제거 — 실패 시 재시도 1회 + 알림
  - 회귀: vitest + 단일계정 login full-flow + 로그인 성공률 baseline 비교

**god file 침범**: `naverBlogAutomation.ts` 2~3 헝크 (Fix 5.4, 5.5).

**회귀 가드**: vitest + BotD score 측정 (수동, >0.8) + 타이핑 KS-test (p>0.05)

---

### P6 — 봇감지 회복 자동화 (1.5주, 4~5 릴리즈) — **god file 다중 touch, 가장 위험**

- **Fix 6.1** — 봇감지 detector (FR8.1)
  - `src/protection/botDetectionDetector.ts` 신규 — read-only DOM 감지 (캡차/SMS/2FA 모달)
  - 회귀: vitest (모의 DOM 5건)
- **Fix 6.2** — 회복 정책 (FR8.2)
  - `protection/botDetectionRecovery.ts` 신규 — 격리/큐 정지/회복 워밍업 재실행
  - 회귀: vitest (정책 unit)
- **Fix 6.3** — `main.ts:4108` wiring (god file 1 헝크 ≤50줄, FR8 통합)
  - 사전 차단 + 회복 hook 추가
  - v2.10.301 호환성 유지
  - 회귀: vitest + multiAccount queueSnapshot 회귀 가드 (v2.10.346 보강 재실행 필수)
- **Fix 6.4** — `multiAccountManager.ts` 격리된 계정 queueSnapshot 안전 제외 (god file 1 헝크 ≤50줄)
  - v2.10.346 immutable copy 패턴 유지
  - 격리 큐 별도 보관
  - 회귀: vitest (격리 회귀 가드 5건) + 100/1000큐 dry-run
- **Fix 6.5** — UI 알림 모달 (FR1.4, FR8.3, [[feedback_no_fallback]])
  - `renderer.ts` (god file) UI 모달 추가 — 1 헝크 ≤80줄
  - 사용자 수동 처리 → 명시 동의 후 재개
  - silent fallback 절대 금지
  - 회귀: e2e + 수동 UI smoke

**god file 침범**: `main.ts` 1 헝크, `multiAccountManager.ts` 1 헝크, `renderer.ts` 1 헝크 — 모두 별도 릴리즈.

**회귀 가드** (강화):
- vitest 2098 + 신규 ≥15건
- 100큐 dry-run 100% (queueSnapshot 회귀 가드 v2.10.346 재실행 필수)
- 1000큐 dry-run 텔레메트리 측정
- full-flow 단일계정 (god file 영역 touch 시 의무)
- e2e UI smoke (수동 + 자동)

---

### P7 — 텔레메트리 + 자동 튜닝 (1주, 2~3 릴리즈)

- **Fix 7.1** — operationsDashboard 확장 (FR9.1, 9.2)
  - `monitor/operationsDashboard.ts` — 트리거율 7일 rolling, 4종 카운터
  - Phase 1~6 hook 합산
  - 회귀: vitest + dashboard render smoke
- **Fix 7.2** — autoTuner (FR9.3)
  - `protection/autoTuner.ts` 신규 — 트리거율 >0.5% 시 P2/P3 파라미터 자동 보수화
  - 결정성 (같은 입력 = 같은 출력)
  - 회귀: vitest
- **Fix 7.3** (선택) — 원격 텔레메트리 (FR9.4, opt-in)
  - 사용자 명시 동의 후만 활성
  - 개인정보 제외 (계정명/IP/콘텐츠 미전송)
  - 회귀: vitest (opt-out 검증)

**god file 침범**: 없음.

**회귀 가드**: vitest + dashboard smoke + autoTuner 결정성 테스트

---

## 3. 매 Phase 회귀 검증 절차 (의무)

[[feedback_regression_check_every_phase]] 엄격 적용. 매 Fix 커밋 직후 (자가 보고 금지, 독립 실행):

1. **git diff 독립 검증** — `git diff HEAD~1` 의도 외 변경 없음 확인 (reviewer agent 독립 실행)
2. **vitest** — `npx vitest run` 전체 PASS (현재 baseline 2098/2098)
3. **lint** — `npm run lint` 0 errors (warnings 증가 없음)
4. **god file 영역 touch 시** `npm run test:full-flow` 단일계정 추가 실행
5. **Phase 종료 시**
   - 다중계정 6큐 smoke (실발행) + 트리거 발생 0건
   - 100큐 dry-run 텔레메트리
   - 1000큐 dry-run 텔레메트리 (P6 이후)
6. **회귀 발견 시 즉시 revert**, cascade 금지 [[feedback_no_cascade_fix]]
7. **Phase 결과 발표**: 추정/예상 금지 [[feedback_no_speculation]], 실측 수치만

---

## 4. 릴리즈 노트 정책

매 Fix → 1 릴리즈 (이슈 cascade 차단).

| 릴리즈 노트 항목 | 내용 |
|------------------|------|
| 변경 사실 | git diff에서 추출, 실제 변경 라인만 |
| 측정 수치 | vitest 통과 수, lint errors, 트리거율 baseline 비교 |
| ❌ 금지 | "X% 향상", "더 안전", "트리거 회피 강화" 등 추정 표현 |
| 회귀 가드 결과 | git diff/vitest/lint/full-flow 모든 항목 PASS 표시 |

---

## 5. Risk 매트릭스 (E1·E2·E3·E4 종합)

### 5.1 god file cascade risk (E1)

| god file | LOC | 본 SPEC 침범 Phase | 침범 헝크 (예상) | E1 게이트 |
|---------|-----|-------------------|----------------|-----------|
| renderer.ts | 8,809 (Phase 5B 후) | P6 (UI 모달) | 1 헝크 ≤80줄 | PASS |
| main.ts | ~14,000 | P6 (wiring) | 1 헝크 ≤50줄 | PASS |
| naverBlogAutomation.ts | ~9,000 | P5 (스크롤+워밍업) | 2~3 헝크 | WARN (3 경계, 분할 검토) |
| multiAccountManager.ts | ? | P2 (계정ID 추가), P6 (격리) | 2 헝크 | PASS |
| contentGenerator.ts | ~8,000 | P4 (헤딩+보일러) | 2~3 헝크 | WARN |
| browserSessionManager.ts | ~1,000 | P1 (proxy 차단), P3 (fingerprint) | 5 헝크 | **분할 필수** |

**조치**:
- naverBlogAutomation.ts P5 → Fix 5.4/5.5 별도 릴리즈로 분할 (2+1 헝크)
- contentGenerator.ts P4 → Fix 4.1/4.2 별도 릴리즈 (2+1 헝크)
- browserSessionManager.ts P1+P3 → Fix 1.2 (1 헝크), Fix 1.3 (1 헝크), Fix 3.1 (2 헝크), Fix 3.2 (1 헝크) 각각 별도 릴리즈

### 5.2 기존 흐름 호환성 (E2)

| 기존 흐름 | 본 SPEC 충돌 risk | 가드 |
|----------|------------------|------|
| v2.10.301 봇감지 backoff | P6 Fix 6.3 직접 touch | vitest + main.ts diff 검증 |
| v2.10.337 intervalJitter ±40% | P2 Fix 2.3, 2.5 변경 | vitest 분포 chi-square + baseline 비교 |
| v2.10.285 로그인 시차 (botBackoff.ts) | P1 sticky proxy + P5 워밍업 | vitest + 다계정 실측 |
| v2.10.346 queueSnapshot immutable | P2 Fix 2.1 계정ID + P6 Fix 6.4 격리 | f996e266 회귀 가드 7건 재실행 의무 |
| v2.10.226~237 PlatitudeDetector v2 | P4 Fix 4.3 (KatFishNet 통합) | vitest + 호환성 테스트 |

### 5.3 성능 (E3)

- 1000큐 fingerprint randomization: ~16,000 sha256 = ~32초 (Worker thread 분리 미필요)
- 텔레메트리 IPC: 매 발행 1회 → 1000건 × ~1ms = 1초 (병목 아님)
- temp 파일 cleanup (P4 Fix 4.5) — `app.on('before-quit')` 추가로 <2GB 보장
- queueSnapshot deep copy: 100→1000큐 시 메모리 +N×K → vitest perf 측정

### 5.4 UX (E4)

- **현재 1000큐 50~91시간** (3분 floor + 쿨다운 + 캡차)
- 본 SPEC 60분 floor 적용 시: 1000큐 × 60분 = **41.6일** (24시간 × 24건 가정)
- **합리적 운영**: 사용자 1계정 24건/일 → 1000건은 42일. 다계정 분산 권장 (10계정 × 24건 = 240/일, 4.2일)
- UI 진행률 + 예상 완료 시각 표시 (P6 UI 모달 통합)
- 기본값 권장 배너 (인터벌 60분+)

### 5.5 반박 조건 (Phase 순서)

1. **A1 후속 조사로 네이버 2026 Q3 콘텐츠 강화 확인 시** → P4를 P3보다 우선
2. **B6 매핑 결과 queueSnapshot이 fingerprint와 강결합 발견 시** → P2/P3 병렬 → 직렬 전환
3. **C2 TLS fingerprint가 P0 트리거 1순위 판명 시** → P3 Fix 3.7(JA4)이 선택 → 필수 승격
4. **사용자 6큐 실측 트리거율 이미 <1%** → P5~P7 ROI 재평가, P7만 먼저 실행하여 측정

---

## 6. 사용자 승인 게이트

본 plan.md 사용자 검토 후 승인:

- **P0 시작 조건**: 사용자 spec.md/plan.md/acceptance.md/research.md 4파일 검토 완료
- **P1 시작 조건**: 사용자 proxy 인프라 정책 결정 (외부 proxy 사용 여부 + 회선 풀)
- **P3 시작 조건**: headless:true 4곳 제거 시 사용자 기능 영향 확인 (크롤러 dependent UX)
- **P6 시작 조건**: god file 다중 touch 진입 — 회귀 검증 baseline 수치 사용자 합의
- **P7 시작 조건**: 텔레메트리 원격 전송 (FR9.4) 사용자 opt-in 정책 결정

각 게이트 미통과 시 Phase 진입 차단.

---

## 7. Related

- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/spec.md` (요구사항)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/acceptance.md` (정량 검수)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` (외부+코드 매핑)
- HANDOFF-ISSUE-3.md (인덱스)
- [[feedback_no_cascade_fix]] · [[feedback_regression_check_every_phase]] · [[feedback_no_fallback]] · [[feedback_no_speculation]]
