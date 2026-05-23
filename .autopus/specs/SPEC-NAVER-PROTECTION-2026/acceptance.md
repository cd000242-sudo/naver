# SPEC-NAVER-PROTECTION-2026 — Acceptance Criteria

> Phase 완료 판정 메트릭. 모든 측정은 실측. 추정/예상 결과 금지 [[feedback_no_speculation]].

## 1. Executive Summary (핵심 메트릭 3건)

1. **트리거율 <1%** — 1000큐 풀오토 실행 시 보호조치 발생률. 합격 = 10건 이하 / 1000큐 시도.
2. **Fingerprint uniqueness 100%** — N개 계정 = N개 고유 지문 (canvas/WebGL/AudioContext/font hash 4종 모두 계정별 상이).
3. **사용자 발행 시간 baseline +30% 이내** — humanization으로 인한 속도 저하 허용선. 초과 시 자동 롤백.

---

## 2. 메트릭 테이블 (Phase별 측정)

### 2.1 회귀 메트릭 (매 Phase 필수)

| Metric | Baseline (현재) | 합격선 | 측정 방법 | 측정 빈도 | 롤백 조건 |
|--------|----------------|--------|----------|----------|----------|
| vitest pass | 2098/2098 | 2098+ PASS | `npx vitest run` | 매 Fix 후 | 1건이라도 회귀 |
| lint errors | 1 (기존, `flowMarathonHandlers.ts:375` 별건) | 본 SPEC 변경 신규 errors 0 | `npm run lint` | 매 Fix 후 | 1건이라도 신규 |
| lint warnings | 966 | +10 이내 | 동상 | 매 Fix 후 | +20 초과 |
| 빌드 | exit 0 | exit 0 | `npm run build` | Phase 종료 시 | 실패 1건 |
| 단일계정 full-flow | PASS (수동 확인) | PASS | `npm run test:full-flow` | god file 영역 touch 시 | 실패 |

### 2.2 트리거율 메트릭 (Phase 6 이후 측정 가능)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 트리거율 (단일계정 6큐) | 0건 / 6 시도 | telemetry `publishResult.protectionTriggered` 7일 rolling | Phase 종료 시 | ≥1건 1주 |
| 트리거율 (5계정 100큐) | <1.0% (≤1건 / 100) | 동상 | Phase 종료 시 | ≥2.0% 2회 연속 |
| 트리거율 (10계정 1000큐) | <1.0% (≤10건 / 1000) | 동상 (dry-run 텔레메트리 가능) | P6 종료 시 + 운영 7일 rolling | ≥2.0% 2회 연속 |
| 캡차 발생률 | <0.5% | 동상 (캡차 카운터) | Phase 종료 시 | ≥1.0% |
| SMS 발생률 | <0.1% | 동상 | Phase 종료 시 | ≥0.3% |
| 차단/속도제한 발생률 | <0.5% | 동상 | Phase 종료 시 | ≥1.0% |

### 2.3 Fingerprint 메트릭 (Phase 3 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| Fingerprint uniqueness (계정 간) | 100% (10계정 = 10 hash) | 자체 `getAccountConsistentProfile()` JSON.stringify hash 비교 | Phase 3 후 | 중복 1건 이상 |
| hardwareConcurrency 분포 | 4/6/8/12/16 균등 (계정 분산) | telemetry sampling | Phase 3 후 | 동일값 80%+ |
| deviceMemory 분포 | 4/8/16 균등 | 동상 | Phase 3 후 | 동일값 80%+ |
| WebGL renderer 분포 | 12+ 종 | 동상 | Phase 3 후 | 4종 이하 |
| CreepJS 점수 (탐지율) | <50% (현재 80% 추정) | https://abrahamjuliot.github.io/creepjs/ 수동 측정 (Phase 3 후 1회) | Phase 3 후 | ≥70% |
| JA3/JA4 일치 | Chrome stable ±5% | wireshark + tls.scrapfly.io hash | Phase 3 후 1회 | 미일치 |
| BotD score (휴먼 판정) | >0.8 평균 (10세션) | botd.fpjs.io 수동 | Phase 5 후 | <0.6 |

### 2.4 행동 메트릭 (Phase 5 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 타이핑 KS-test p-value | >0.05 vs 휴먼 baseline | scipy.stats.ks_2samp (telemetry keystroke interval) | Phase 5 후 | p<0.01 |
| 타이핑 평균 dwell | 50~150ms | telemetry | 매 발행 | <30ms 또는 >300ms |
| 마우스 mousemove steps 평균 | ≥5 steps | ESLint custom rule + runtime spy | 매 발행 | <3 |
| 클릭 전 hover dwell | 50~300ms 평균 | telemetry | 매 발행 | <20ms |
| 스크롤 instant 비율 | 0% (모두 smooth) | ESLint `no-instant-scroll` | 매 Fix | 1건이라도 instant |
| 발행 간격 σ/μ (표준편차/평균) | >0.25 | telemetry publishInterval | Phase 2 후 100건 | <0.15 |
| 새벽(02~06시) 발행 비율 | ≤10% | telemetry | Phase 2 후 7일 | >15% |

### 2.5 콘텐츠 메트릭 (Phase 4 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| Burstiness 평균 | ≥0.60 | `src/content/burstiness.ts` 100건 sample | Phase 4 후 | <0.40 |
| KatFishNet POS n-gram 다양성 | 한국어 휴먼 baseline ±10% | `src/content/katFishSignal.ts` | Phase 4 후 | -20% 미만 |
| 헤딩 단수 분포 | 2~6 균등 | telemetry | Phase 4 후 100건 | 4단 80%+ |
| 도입부 cosine similarity (N posts) | <0.7 평균 | qualityEnhancer 단위 테스트 | Phase 4 후 100건 | >0.85 |
| CTA pool size | ≥30종 | 정적 코드 검사 | Phase 4 종료 시 | <20종 |
| 인사 pool size | ≥10종 | 정적 코드 검사 | Phase 4 종료 시 | <5종 |
| 외부 detector round-trip | GPTZero "Human" 50%+ (자유티어, 10건 sample) | 수동 측정 | Phase 4 후 1회 | "AI" 80%+ |
| ALT 텍스트 uniqueness | 100% (글당) + ≥20자 자연 문장 | 단위 테스트 | Phase 4 후 | 중복 1건 또는 공백 패딩 |

### 2.6 이미지 메트릭 (Phase 4 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| EXIF 잔존 metadata | 0건 | `xxd` PNG ancillary chunks 바이너리 검사 | Phase 4 후 | tEXt/zTXt/iTXt 발견 |
| 이미지 hash uniqueness (배치 내) | 100% (perceptual hash Hamming distance ≥10) | 단위 테스트 | Phase 4 후 | 중복 |
| temp 파일 누적 (1000큐 후) | <2GB | `du -sh %TEMP%/blob-*` | E3 측정 1회 | >4GB |

### 2.7 IP / 네트워크 메트릭 (Phase 1 이후)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| WebRTC leak | 0건 | https://browserleaks.com/webrtc 수동 | Phase 1 후 | 1건 |
| DNS leak | 0건 | https://browserleaks.com/dns | Phase 1 후 | 1건 |
| 계정-IP sticky uniqueness | 100% (1계정 = 1회선 lifetime) | telemetry | Phase 1 후 | 동일 계정 IP 변동 |
| ASN 다양성 | DC ASN 비율 ≤5% | proxyManager dashboard | Phase 1 후 7일 | >10% |
| IPQS fraud_score 회선 | ≤75 (활성 회선) | IPQS API | 일일 (opt-in) | >75 회선 활성 |
| Node fetch → naver.com 호출 | 0건 (lint rule) | `no-direct-naver-fetch` ESLint | 매 commit | 1건 |

### 2.8 UX 메트릭 (E4)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 발행 시간 P50 | baseline ×1.30 이하 | telemetry publishDurationMs | Phase 종료 시 | ×1.50 초과 |
| 1000큐 총 실행 시간 (10계정) | <120시간 (5일) | telemetry 큐 시작~종료 | P6 후 dry-run | >168시간 (7일) |
| 진행률 표시 정확도 | ±10% (예상 vs 실측 완료 시각) | UI 비교 | P6 후 | ±20% |
| 사용자 모달 차단형 동작 | 100% (silent fallback 0건) | e2e 시나리오 | P6 후 | silent 1건 |
| 단일계정 6큐 baseline 발행 시간 | 측정 필요 (P0에서 측정) | telemetry | P0 | — |

### 2.9 메모리 / 성능 (E3)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| 1000큐 메모리 증가 (vs baseline) | <2GB | Electron process memory monitoring | P6 후 dry-run | >4GB |
| sha256 연산 (fingerprint) | <40초 / 1000건 | benchmark | P3 후 | >60초 |
| blob:hasMany 200 blob | <50ms | 단위 벤치 | P4 후 | >200ms |
| IPC 메시지 빈도 (텔레메트리) | 매 발행 1회 (≤2 메시지) | profiler | P7 후 | >10/발행 |

---

## 3. 의존성

- **A8 (rate baseline)**: 트리거율/발행 시간 baseline. P0에서 단일계정 6큐 baseline 측정 필수 — 없으면 메트릭 비교 불가
- **B (fingerprint/TLS)**: uniqueness · JA3 메트릭의 측정 대상
- **C (humanization)**: BotD · KS-test 메트릭의 측정 대상
- **E3 (perf)**: 1000큐 메모리/CPU baseline 필요
- **E4 (UX trade-off)**: +30% 발행 시간 상한선 사용자 수용도 검증

---

## 4. 반박 조건 (메트릭 부적절 조건)

- **외부 서비스 차단**: BotD/JA4er/CreepJS/IPQS/AbuseIPDB deprecate 시 → 대체 지표 필요 (자체 측정 모듈 신규 SPEC)
- **KS-test 휴먼 baseline 표본 부족**: <30이면 통계 무의미 → P0에서 휴먼 baseline 수집 선결 (사용자 실측 키스트로크 30+ 세션)
- **트리거율 1000큐 과대**: 일 운영량(평균 50~200큐) 대비 과대 → 7일 누적 측정으로 보정
- **HHEM / CoVe 채택 보류**: per-call $ 비용 평가 미제출 — 본 SPEC은 KatFishNet + burstiness만 채택
- **시간대 가중치 baseline**: "휴먼 정상 발행 분포" 정량 데이터 없음 → A8 보고서 + 자체 운영 데이터로 추정. 추정값임을 명시
- **Fingerprint uniqueness 100% 요구**: hash 충돌 확률 (생일 역설) — 1000계정 운영 시 0.0001% 충돌 가능. 100% 요구는 1000계정 미만 환경

---

## 5. 회귀 가드 — Phase별 측정 절차

### 5.1 모든 Phase 종료 시
1. `npx vitest run` → 2098/2098 + 신규 PASS
2. `npm run lint` → 본 SPEC 변경 신규 errors 0건
3. `npm run build` → exit 0
4. git diff 독립 검증 (reviewer agent) — 의도 외 변경 없음

### 5.2 god file 영역 touch 시 (추가)
5. `npm run test:full-flow` 단일계정
6. 다중계정 2계정 smoke
7. 100큐 dry-run 텔레메트리 (P2 이후)
8. 1000큐 dry-run 텔레메트리 (P6 이후)

### 5.3 Phase별 특수 측정
| Phase | 추가 측정 |
|-------|----------|
| P0 | 단일계정 6큐 baseline 측정 (트리거율/발행시간/메모리) |
| P1 | WebRTC leak 수동 / 다계정 + 다 proxy smoke |
| P2 | 발행 간격 분포 chi-square 1000회 sampling |
| P3 | CreepJS 점수 수동 측정 / fingerprint hash diff |
| P4 | GPTZero 자유티어 round-trip 10건 / EXIF 바이너리 검증 / 한국어 perplexity 100건 sample |
| P5 | BotD 점수 수동 / 타이핑 KS-test 30+ 세션 |
| P6 | queueSnapshot v2.10.346 회귀 가드 7건 재실행 의무 / 1000큐 dry-run 텔레메트리 / UI 모달 e2e |
| P7 | autoTuner 결정성 테스트 / dashboard render smoke |

### 5.4 임의 1건이라도 롤백 조건 충족 시
- 즉시 revert (cascade 금지)
- post-mortem 작성
- 다음 Fix 분할 재설계
- [[feedback_no_cascade_fix]] 적용

---

## 6. 사용자 합의 사항 (Phase 0 진입 전)

다음 baseline은 사용자가 합의해야 측정 가능:

1. **단일계정 6큐 baseline 트리거율** — 현재 0건 가정. 실측 1회 필요 (P0)
2. **발행 시간 baseline P50** — 현재 측정값 없음. P0 측정 후 ×1.30 계산
3. **휴먼 타이핑 baseline** — 사용자 30+ 세션 실측 키스트로크 (P0~P5 사이 수집)
4. **proxy 인프라 정책** — 외부 proxy 사용 여부 + 회선 풀 (P1 진입 전)
5. **CreepJS 현재 탐지율 baseline** — 수동 측정 1회 (P3 진입 전)
6. **IPQS/AbuseIPDB API key** — opt-in (P1 Fix 1.5 진입 전)

---

## 7. Related

- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/spec.md` (요구사항)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/plan.md` (Phase 분할 + 회귀 가드)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` (외부+코드 매핑)
- [[feedback_no_speculation]] · [[feedback_regression_check_every_phase]]
