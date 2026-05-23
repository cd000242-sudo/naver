# SPEC-NAVER-PROTECTION-2026

> 다중계정 풀오토 발행 시 네이버 보호조치 우회 + 2026 Q2 로직 매칭
> 작성일: 2026-05-24 · 기반: HANDOFF-ISSUE-3.md + 30팀 병렬 agent 보고서 종합

## 1. Goal

**6큐 / 100큐 / 1000큐 풀오토 다중계정 발행 시 네이버 보호조치(reCAPTCHA · SMS · 발행제한 · IP차단 · fingerprint · AuthGR · QUMA-VL · 행동분석) 트리거율 <1% (계정·일 기준)**

측정: `(보호조치 이벤트 수 / 발행 시도 수)` — 7일 rolling window, 시나리오별(6/100/1000큐) 독립 집계.

## 2. Background — 왜 지금인가

### 2.1 사용자 보고
> "에이전트팀으로 풀오토 다중계정발행해도 보호조치안걸리고 현재 네이버로직에 맞게끔 수정"

### 2.2 외부 환경 (research.md §1 참조)
- 네이버 2026 Q2: **AuthGR LLM-driven 신뢰도 평가 본격 적용** ([news.nate](https://news.nate.com/view/20251217n25536)) — 다계정 동일 톤은 즉시 저신뢰 분류
- 일일 100건 하드캡 + **1시간 텀 합의선** ([Threads @pocke_tpotatoes](https://www.threads.com/@pocke_tpotatoes/post/C_mSWNVzJq1)) — 현 코드 3분 floor와 17배 격차
- **JA4 / HTTP/2 fingerprint 표준화** ([FoxIO JA4](https://github.com/FoxIO-LLC/ja4)) — JA3 randomization 무력화
- **CreepJS 80% 적중** ([Databay](https://databay.com/blog/how-sites-detect-headless-browsers)) — stealth plugin 역탐지 시그널화
- **KatFishNet (ACL 2025)** — 한국어 LLM 글 SOTA detector ([github](https://github.com/Shinwoo-Park/katfishnet))

### 2.3 격차 (research.md §3 발췌)
| # | 보호조치 | 판정 | 우선 |
|---|---------|------|------|
| 1 | 로그인 챌린지 | 부분 | P1 |
| 2 | 발행 빈도 | **부분** | **P0** |
| 3 | IP 차단 | **N** | **P0** |
| 4 | Fingerprint (디바이스+TLS) | 부분 | **P0** |
| 5 | 이미지 (AuthGR) | 부분 | P1 |
| 6 | 콘텐츠 (QUMA-VL) | 부분 | **P0** |
| 7 | 행동 패턴 | **N** | **P0** |

5/7 카테고리가 P0. 다중계정 시 즉시 트리거 가능.

## 3. User Scenarios

### 3.1 시나리오 A — 단일계정 6큐 (현행 안정 운영)
- 기존 흐름 (v2.10.301/337/285/346) 회귀 0건 보장
- 보호조치 트리거 0건 유지 (현 baseline)

### 3.2 시나리오 B — 5계정 100큐
- 계정별 IP 분산 (proxy 필수 또는 ADB IP rotation)
- 계정별 stable fingerprint (deterministic randomization, 4계정+ 클러스터 회피)
- 발행 인터벌 ≥60분 (실무 합의선), 계정 간 stagger ≥15분
- 보호조치 트리거율 <1%

### 3.3 시나리오 C — 10계정 1000큐
- queueSnapshot immutable (v2.10.346) 유지
- 시간대별 동적 분산 (오전 9~12 peak, 새벽 <10%)
- 봇감지 회복 자동화 (계정 격리, 큐 일시정지, 사용자 알림 — silent fallback 금지)
- 일일 한도 / 계정 24건, 전체 200건 dynamic ceiling
- 1000큐 dry-run 텔레메트리 측정 → 트리거율 <1%, 완료 시간 5일 이내 (24시간 운영 가정)

## 4. Functional Requirements

### FR1. 로그인 챌린지 회피 (P1)
- FR1.1 NID 5회 로그인 시도 hard cap (계정+IP 차원)
- FR1.2 디바이스 변동 시 OTP 발생 사전 차단 — session/fingerprint 안정성 보장
- FR1.3 reCAPTCHA v3 노출 시 텔레메트리 기록 (자동 해결 OoS)
- FR1.4 캡차 모달 감지 시 차단형 모달 + 사용자 수동 처리 ([[feedback_no_fallback]])

### FR2. 발행 빈도 동적 분산 (P0)
- FR2.1 `postLimitManager` 계정ID 인자 추가 — 다계정 독립 카운팅
- FR2.2 최소 인터벌 floor 60분으로 상향 (현 3분 → 60분), 사용자 설정은 60분~ 권장 + 30분 미만 차단 모달
- FR2.3 hourly window 리셋 경계 버그 수정 (`postLimitManager.ts:116-120`)
- FR2.4 `checkGoldenZone` 호출 사이트 추가 — 강제 차단 정책 활성화
- FR2.5 시간대별 가중치 테이블 (오전 9~12 peak, 새벽 2~6 ≤10% 강제)
- FR2.6 신생 계정(≤30일) 일 1~3건 보수 모드 자동 적용
- FR2.7 외부 링크 글당 1~2개 검증, 3개+ 경고
- FR2.8 일일 하드캡 99건 도달 시 강제 대기 모달

### FR3. IP 분산 (P0)
- FR3.1 `proxyManager.getProxyUrl()` null → 다계정 hard-block 옵션 (기본 활성, 사용자 명시 해제만 단일 IP 허용)
- FR3.2 계정별 sticky proxy 매핑 (1계정 = 1회선 lifetime)
- FR3.3 WebRTC leak 차단 — Chrome launch args `--enforce-webrtc-ip-permission-check` + `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` 추가
- FR3.4 ADB IP rotation 옵션 유지 (mobile carrier trust 우위 활용)
- FR3.5 IP reputation 사전 체크 (IPQS/AbuseIPDB) — fraud_score ≥75 회선 자동 제외 (opt-in)

### FR4. Fingerprint 강화 (P0)
- FR4.1 계정별 stable fingerprint seed (accountId 해시 충돌 회피 — substring prefix 추가)
- FR4.2 `hardwareConcurrency` / `deviceMemory` / `languages` / `platform` 계정별 randomization (현재 전 계정 동일)
- FR4.3 screen / WebGL pool 확장 (`seed % 4` → seed % 16+)
- FR4.4 Canvas/Audio context noise inject (stealth 미커버 영역)
- FR4.5 Font enumeration jitter
- FR4.6 **headless:true 4곳 제거** (smartCrawler/productSpecCrawler/imageLibrary/editorHelpers)
- FR4.7 **Playwright 5곳 stealth 적용** (urlUtils, imageFxGenerator 4곳)
- FR4.8 UA 일관성 강제 — Electron Chromium 실버전 동기화, 하드코딩 UA 제거
- FR4.9 TLS JA3/JA4 우회 — 네이버 직접 호출은 Chromium net stack 강제 (Node fetch/axios/undici 금지 lint rule)
- FR4.10 HTTP/2 SETTINGS 검증 (Chrome ref 값과 diff)

### FR5. 이미지 (AuthGR) 강화 (P1)
- FR5.1 EXIF PNG ancillary chunks 완전 제거 — sharp `exif().strip()` 명시 호출
- FR5.2 AI 생성 흔적 감지 추가 (perceptual hash 분포, frequency analysis)
- FR5.3 ALT 자동 생성기 도입 — 글당 ALT uniqueness 100%
- FR5.4 `materializePublishingImages` temp 파일 cleanup (`app.on('before-quit')` 핸들러)
- FR5.5 `processImageForUpload` dead code 정리 또는 활성화

### FR6. 콘텐츠 (QUMA-VL) 강화 (P0)
- FR6.1 헤딩 구조 4단 고정 해제 — 글마다 2~6단 동적 분포
- FR6.2 도입부/CTA 보일러 회전 (cosine similarity <0.7 across N posts)
- FR6.3 한국어 perplexity 측정 모듈 도입 (KatFishNet 신호 — POS n-gram + 공백/쉼표 분포)
- FR6.4 burstiness 측정 + 임계 ≥0.60 가드
- FR6.5 humanizer 강화 — 3~5단어 fragment + 25+단어 winding 의도적 혼합
- FR6.6 작성자 인사 / 페르소나 인사 템플릿 ≥10종 회전
- FR6.7 외부 링크/키워드 밀도 자동 검증

### FR7. 행동 패턴 인간화 (P0)
- FR7.1 `editorHelpers` 고정 delay 5/10/15ms → Box-Muller 분포 30~120ms (이미 `typingUtils.ts:71` 존재)
- FR7.2 `imageHelpers` mouse 텔레포트 제거 — `steps: ≥5` 옵션 강제 + Bezier 보간
- FR7.3 클릭 전 hover dwell 50~300ms
- FR7.4 `scrollIntoView({ behavior: 'instant' })` → `'smooth'` + 관성 시뮬레이션
- FR7.5 상수 좌표 mouse.move 제거 (smartCrawler/productSpecCrawler)
- FR7.6 타이핑 KS-test 분포 검증 (p>0.05 vs 휴먼 baseline)
- FR7.7 lint rule — `no-fixed-keyboard-delay`, `no-coord-teleport`, `no-instant-scroll`

### FR8. 봇감지 회복 자동화 (P1, FR1.4와 연계)
- FR8.1 캡차/SMS/2FA DOM 감지 (read-only detector 모듈 신규)
- FR8.2 감지 후 계정 격리 + 큐 일시정지
- FR8.3 사용자 수동 처리 UI (silent fallback 금지)
- FR8.4 회복 후 워밍업 재실행 → 재시도

### FR9. 텔레메트리 + 자동 튜닝 (P2)
- FR9.1 `monitor/operationsDashboard.ts` 확장 — 트리거율 7일 rolling
- FR9.2 보호조치 4종 카운터 (캡차/SMS/차단/속도제한)
- FR9.3 트리거율 >0.5% 시 P1/P2 파라미터 자동 보수화 (`autoTuner.ts` 신규)
- FR9.4 텔레메트리 원격 리포트 (opt-in only, 개인정보 제외)

## 5. Non-Functional Requirements

| # | 항목 | 기준 | 측정 |
|---|------|------|------|
| NFR1 | 회귀 0건 | vitest 2098/2098 PASS, lint 0 errors | 매 Phase 후 |
| NFR2 | 발행 시간 증가 | baseline +30% 이내 | telemetry P50 |
| NFR3 | 1릴리즈 1~3 fix 준수 | god file 침범 카운터 ≤3 | E1 cascade gate |
| NFR4 | god file 캐스케이드 금지 | renderer.ts / multiAccountManager.ts / main.ts / naverBlogAutomation.ts 침범 시 Fix 분할 | E1 검수 |
| NFR5 | 1000큐 메모리 | <2GB 추가 (vs baseline) | E3 perf |
| NFR6 | temp 디스크 누적 | <2GB / 1000큐 실행 후 | E3 perf |
| NFR7 | 매 Phase 회귀 검증 | git diff 독립 + vitest + lint + (god file 영역) full-flow | [[feedback_regression_check_every_phase]] |

## 6. Out of Scope

- **네이버 ToS 위반** — 가짜 계정 생성, 결제 우회, 자체 시스템 침입
- **Residential proxy 자동 조달/구매** — 인프라 외주 (사용자 직접 구매)
- **캡차 자동 해결** — 2Captcha/CapSolver 등 외주 솔버 통합 ([[feedback_no_fallback]] — silent fallback 금지)
- **godfile 전면 리팩토링** — 본 SPEC은 회피 로직 추가만 (분할은 별도 SPEC)
- **신규 LLM 도입** — 현 Anthropic/Gemini/OpenAI/Perplexity 4종 유지
- **HHEM / CoVe** — 비용 평가 미완 (보류, A6 결정)

## 7. Success Metrics

| Metric | 합격선 | 측정 방법 | 측정 빈도 |
|--------|--------|----------|----------|
| 트리거율 | <1% (6/100/1000큐 각각) | telemetry `publishResult.protectionTriggered` | Phase 종료 시 1000큐 |
| Fingerprint uniqueness | 100% (계정 N개 = 지문 N개) | hash 비교 (10계정 샘플) | Phase 4 후 |
| JA3/JA4 일치 | Chrome stable ±5% | wireshark + ja4er 외부 검증 | Phase 4 후 1회 |
| BotD score | >0.8 평균 | botd.fpjs.io | Phase 7 후 10세션 |
| 타이핑 KS-test | p>0.05 vs 휴먼 baseline | scipy.stats.ks_2samp | Phase 7 후 |
| 발행 간격 σ/μ | >0.25 | telemetry publishInterval | Phase 2 후 100건 |
| 세션 워밍업 | ≥3페이지 & ≥30초 | telemetry warmupPages/warmupDwellMs | 매 발행 |
| 회귀 0건 | 2098/2098 PASS, 0 errors | vitest + lint | 매 Phase 후 |
| 발행 시간 P50 | baseline ×1.30 이하 | telemetry publishDurationMs | Phase 종료 시 |
| temp 디스크 | <2GB / 1000큐 | `du -sh %TEMP%/blob-*` | E3 측정 |

## 8. Constraints (운영 헌법)

- C1. **1릴리즈 1~3 fix 준수** ([[feedback_no_cascade_fix]]) — god file 4건+ touch 시 Phase 분할 의무
- C2. **매 Phase 회귀 검증** ([[feedback_regression_check_every_phase]]) — git diff 독립 + vitest + lint + (god file 영역) full-flow
- C3. **silent fallback 금지** ([[feedback_no_fallback]]) — 사용자 선택 모델/IP/proxy 실패 시 차단형 모달 + 명시 동의
- C4. **추정/예상 결과 금지** ([[feedback_no_speculation]]) — 릴리즈 노트는 실측 사실만
- C5. **v2.10.301 봇감지 backoff + v2.10.337 jitter + v2.10.285 로그인 시차 + v2.10.346 queueSnapshot 호환 유지** (NFR1)
- C6. **풀오토 다중계정 흐름 우선** (`multiAccountManager.ts:2924 ma-start-publish-btn`)

## 9. Risks (요약, plan.md §5 상세)

- R1 (E1 cascade): god file 4개 (renderer.ts 13K, main.ts 14K, naverBlogAutomation.ts 9K, multiAccountManager.ts) — 본 SPEC P1/P2/P4가 모두 god file 영역 touch 가능성
- R2 (E2 regression): v2.10.346 queueSnapshot immutable copy가 fingerprint/jitter 변경과 결합 risk
- R3 (E3 perf): 1000큐 fingerprint randomization 추가 CPU + 텔레메트리 IPC 부담
- R4 (E4 UX): 발행 인터벌 60분 floor 시 1000큐 → 50~91시간 (3~4일) 실행 — 사용자 기대 격차

## 10. 반박 조건 (SPEC 가정이 깨질 조건)

- 네이버가 행동분석을 IP/계정 차원이 아닌 **세션 토큰** 단일 차원으로 전환 → FR3/FR4 무력화
- reCAPTCHA → 네이버 자체 challenge 전환 → FR1 재설계
- 1000큐 메모리 한계가 텔레메트리보다 먼저 도달 → NFR1 충돌
- 네이버 2026 Q3에 AuthGR 완화 발표 → FR6 P0 → P2 강등
- 사용자 환경이 1계정 1IP 전제라면 FR3 P0 → P2 강등
- 외부 KatFishNet/BotD/JA4er 등 측정 서비스 차단/deprecate → 대체 지표 필요

## 11. 회귀 가드 (본 SPEC 자체 검증)

- vitest: 2098 baseline + 신규 보호조치 회피 단위 테스트 ≥30건
- lint: 0 errors 유지, warnings +10 이내
- diff: 매 Phase git diff 독립 리뷰 agent
- 통합: full-flow 6/100큐 실측, 1000큐는 dry-run 텔레메트리
- 롤백: Phase별 feature flag, NFR3/NFR4 위반 시 즉시 revert
- ESLint custom rules — `no-fixed-keyboard-delay`, `no-coord-teleport`, `no-direct-naver-fetch`, `no-instant-scroll`

## 12. Related

- HANDOFF-ISSUE-3.md (인덱스)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/plan.md` (Phase 분할)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/acceptance.md` (정량 검수)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` (외부+코드 매핑)
- 회귀 가드 룰: [[feedback_no_cascade_fix]], [[feedback_regression_check_every_phase]], [[feedback_no_fallback]], [[feedback_no_speculation]]
- 기존 흐름: v2.10.285, v2.10.301, v2.10.337, v2.10.346
