# SPEC-IMAGE-NARRATIVE-2026 — Acceptance Criteria

> Phase 완료 판정 메트릭. 모든 측정은 실측. 추정/예상 결과 금지 [[feedback_no_speculation]].

## 1. Executive Summary (핵심 메트릭 3건)

1. **사진 10장 → 발행 시간 <90초** — Quick Mode 기준
2. **Vision 추론 정확도 ≥75%** (사용자 5점 척도 평가 ≥4)
3. **기존 5개 모드 회귀 0건** — SEO/홈판/쇼핑/사용자정의/업체 풀오토 모두 정상

## 2. 메트릭 테이블 (Phase별 측정)

### 2.1 회귀 메트릭 (매 Phase 필수)

| Metric | Baseline (v2.10.393) | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|---------------------|--------|----------|------|----------|
| vitest pass | 2279/2279 | 2279+ PASS | `npx vitest run` | 매 Fix 후 | 1건이라도 회귀 |
| lint errors | 0 | 본 SPEC 변경 신규 errors 0 | `npm run lint` | 매 Fix 후 | 1건 신규 |
| lint warnings | 1015 | +20 이내 | 동상 | 매 Fix 후 | +30 초과 |
| build | exit 0 | exit 0 | `npm run build` | Phase 종료 시 | 실패 |
| 기존 5개 모드 글 생성 | PASS | PASS | dev CLI 각 모드 1회 | god file 영역 touch 시 | 1건 회귀 |

### 2.2 Vision 추론 메트릭 (Phase 1~2)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| **Vision JSON 파싱 성공률** | ≥95% | dev CLI 100건 | Phase 1 후 | <90% |
| **한국어 음식·장소 정확도** | ≥75% (5점 ≥4) | dogfood 10건 사용자 평가 | Phase 1 후 | <60% |
| Vision API 응답 속도 (이미지당) | <2초 (Gemini Flash) | console.time | Phase 1 후 | ≥4초 |
| 다중 이미지 병렬 처리 | 10장 5초 이내 | concurrency=5 측정 | Phase 1 후 | ≥15초 |
| Vision API 호출 실패율 | <5% | apiUsageTracker | Phase 1 후 | ≥10% |
| **Provider 폴백 동작** | Gemini 실패 시 GPT-4o 자동 (silent X, 모달) | 수동 테스트 (Gemini key 빼기) | Phase 1 후 | silent 폴백 |

### 2.3 글 생성 메트릭 (Phase 2~3)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| **글 길이 목표 달성률** | ≥90% (1500자 ±15%) | 글 100건 측정 | Phase 2 후 | <70% |
| **이미지-텍스트 일관성** | ≥85% (consistencyChecker score) | imageTextConsistencyChecker 자동 | Phase 2 후 | <70% |
| 카테고리 자동 분류 정확도 | ≥80% (사용자 수정률 ≤20%) | dogfood 10건 | Phase 2 후 | <60% |
| AuthGR 점수 | ≥0.6 | authgrDefense 자동 | Phase 2 후 | <0.4 |
| 본문에 사진 N장 모두 인라인 삽입 | 100% | 발행 검증 | Phase 4 후 | 누락 1건 |

### 2.4 UX 메트릭 (Phase 3~5)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| **사진 업로드 → 글 생성까지 시간** | <90초 (Quick Mode 10장) | 사용자 측정 | Phase 5 후 | ≥150초 |
| 사진 30장 업로드 → 추론 완료 | <2분 | 사용자 측정 | Phase 5 후 | ≥4분 |
| HEIC 자동 변환 성공률 | ≥95% | dogfood 10건 | Phase 3 후 | <80% |
| 신규 토글 UX 인지도 | ≥70% (베타 사용자) | 베타 설문 | Phase 5 후 | <40% |
| Quick Mode 완료율 | ≥60% (시작→발행) | 베타 사용자 | Phase 5 후 | <30% |
| 추론 결과 수정률 (white box) | 10~40% (적절) | telemetry | Phase 5 후 | <5% (무시) 또는 >70% (불신) |

### 2.5 비용 메트릭 (Phase 6)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| **이미지당 Vision API 비용 (Gemini Flash)** | <$0.005 | apiUsageTracker | 매 발행 | ≥$0.01 |
| 10장 글 1편 발행 비용 | <$0.05 | 동상 | Phase 6 후 | ≥$0.10 |
| 캐시 hit률 (재발행) | ≥40% | imageHashCache | Phase 6 후 | <20% |
| 비용 가드 동작 | 한도 초과 시 차단형 모달 | 수동 테스트 | Phase 6 후 | silent 통과 |
| 일일 비용 한도 디폴트 | $1 (200장) 사용자 조정 가능 | 설정 검증 | Phase 6 후 | 한도 미적용 |

### 2.6 신뢰성 메트릭 (Phase 4~5)

| Metric | 합격선 | 측정 방법 | 빈도 | 롤백 조건 |
|--------|--------|----------|------|----------|
| **풀오토 발행 성공률 (이미지 추론 모드)** | ≥90% (10건 중 9건) | dogfood + 베타 | Phase 4 후 | <70% |
| 본문에 사진 누락 | 0건 / 100 발행 | 발행 후 검증 | Phase 4 후 | ≥1건 |
| EXIF 발행 시 strip | 100% | xxd 바이너리 검사 | Phase 4 후 | 잔존 1건 |
| 환각 가드 트리거 (confidence <0.6) | 사용자 확인 강제 | 수동 테스트 | Phase 4 후 | skip 가능 |
| 사용자 수정 후 글 재생성 | 정상 작동 | 부분 재생성 검증 | Phase 4 후 | 전체 재생성만 |

## 3. v2.11.0 출시 합격 조건

Phase 0~5 누적 메트릭이 모두 합격선 만족:
1. vitest 2279+/2279+ PASS (신규 테스트 포함)
2. lint 0 errors, warnings +20 이내
3. 기존 5개 모드 풀오토 회귀 0건 (수동 검증)
4. 이미지 추론 모드 풀오토 10건 성공률 ≥90%
5. Vision 한국어 정확도 ≥75% (사용자 평가)
6. 이미지-텍스트 일관성 ≥85%
7. 발행 시간 <90초 (Quick Mode 10장)
8. 베타 사용자 3명 이상 출시 승인

## 4. 의존성

- **A (Vision API)**: Phase 1에서 Gemini 2.5 Flash + GPT-4o SDK 설치 확인 (`@google/generative-ai` 기존 + `openai` 기존, Claude는 신규 `@anthropic-ai/sdk` 추가)
- **B (apiUsageTracker)**: Phase 6에서 imageNarrative 카테고리 추가
- **C (사용자 베타)**: Phase 5에서 3~5명 모집
- **D (한국 지명 사전)**: Phase 2에서 카카오 reverse geocoding API 키 필요 (옵션 — EXIF GPS 있는 경우만)
- **E (full-flow 테스트)**: Phase 4에서 풀오토 자동화 테스트 인프라 (현재 사전 결함 — 별도 SPEC 필요)

## 5. 반박 조건

- Vision API 응답 시간 측정 시 네트워크 환경 변동 → 3회 측정 평균
- 한국어 정확도 평가는 주관적 — 사용자 5점 척도 + 평가자 3인 합산
- 이미지-텍스트 일관성 score는 휴리스틱 — 사용자 체감과 다를 수 있음
- 비용 가드 한도는 사용자 조정 가능 — 디폴트 한도는 권장값일 뿐
- 30장 초과 업로드 시 30장 자동 선별 시점에는 일부 사진 발행 누락 가능 (의도된 동작)

## 6. 회귀 가드 — Phase별 측정 절차

매 Phase 종료 시 (사용자 + AI 협업):
1. **AI**: `npx vitest run` → 2279+ PASS 확인
2. **AI**: `npm run lint` → 0 errors 확인
3. **AI**: `npm run build` → exit 0
4. **AI**: git diff 독립 검증 (reviewer agent)
5. **사용자**: 5개 기존 모드 풀오토 각 1회 (god file 영역 변경 시)
6. **사용자 (Phase 4+)**: 이미지 추론 모드 풀오토 3회
7. **AI + 사용자**: baseline 대비 메트릭 표 작성 → release notes 첨부

임의 1건이라도 롤백 조건 충족 시:
- 즉시 revert (cascade 금지)
- post-mortem 작성
- 다음 Fix 분할 재설계
- [[feedback_no_cascade_fix]] 적용

## 7. 사용자 합의 사항 (Phase 0 진입 전)

다음은 사용자가 사전 결정해야 측정 가능:

1. **Vision provider 4종 UI 노출** ✅ (사용자 결정: provider 선택 옵션 노출)
2. **모드 구조**: 직교 축 "글 소스" 토글 ✅ (사용자 결정)
3. **카테고리 분류**: 자동 + 사용자 오버라이드 ✅
4. **이미지 배치 v1**: EXIF 시간순 + 균등 분배 (AI 결정은 Phase 7)
5. **비용 한도 디폴트**: 일 $1 / 월 $30 (조정 가능)
6. **베타 사용자 모집**: 3~5명 (사용자 네트워크)
7. **dogfood 일정**: Phase 1·2 각 완료 후 사용자 직접 10건

## 8. v2.11.0 즉시 검증 가능 항목 (Phase 5 완료 시)

| # | 검증 항목 | 결과 시점 |
|---|----------|----------|
| 1 | vitest 2279+/2279+ PASS | Phase 1~5 각 |
| 2 | lint 0 errors | Phase 1~5 각 |
| 3 | 5개 기존 모드 회귀 0건 | Phase 2/3/4 후 |
| 4 | 이미지 추론 풀오토 10건 ≥9건 성공 | Phase 4 후 |
| 5 | Vision 한국어 정확도 ≥75% | Phase 1~2 후 |
| 6 | 이미지-텍스트 일관성 ≥85% | Phase 2 후 |
| 7 | Quick Mode 10장 <90초 | Phase 5 후 |
| 8 | 베타 3명 이상 승인 | Phase 5 후 |
| 9 | 이미지당 Vision 비용 <$0.005 | Phase 6 후 |
| 10 | EXIF strip 100% | Phase 4 후 |

## 9. Related

- [spec.md](spec.md)
- [plan.md](plan.md)
- [research.md](research.md)
- [[feedback_no_speculation]] · [[feedback_regression_check_every_phase]] · [[feedback_no_fallback]] · [[feedback_no_cascade_fix]]

🐙 Autopus
