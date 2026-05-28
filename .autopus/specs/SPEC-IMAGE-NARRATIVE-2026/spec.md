# SPEC-IMAGE-NARRATIVE-2026 — 이미지 추론 글 모드

> **Status**: Draft (Phase 0)
> **Created**: 2026-05-28
> **Author**: Autopus 5-agent team (architect/planner/explorer/vision/UX)
> **Target Release**: v2.11.0 (Phase 5 완료 시점)

## 1. Executive Summary

사용자 보유 이미지 N장 (3~30장) → AI Vision 추론 → 한국어 여행기/맛집/숙박/일상/리뷰 글 자동 작성 → 이미지 자동 배치 → 네이버 블로그 자동 발행.

**핵심 차별화**:
1. 이미지-텍스트 일관성 자동 검증 (`imageTextConsistencyChecker.ts` 활용) — ChatGPT 환각 차단
2. 사진 N장 → 발행, 한 워크플로우 (ChatGPT 7단계 → 본 기능 2단계)
3. EXIF 시간순 + GPS 장소 자동 추론
4. 카테고리별 글 구조 자동 분기
5. AuthGR 방어 통합

## 2. Goal (목표 메트릭)

| Metric | Baseline | 합격선 | 측정 방법 |
|--------|----------|--------|----------|
| 사진 10장 → 발행 시간 | N/A (신규) | <90초 | 사용자 측정 |
| Vision 추론 정확도 (한국어 음식·장소) | N/A | >75% (사용자 평가 5점 척도 ≥4) | dogfood 10건 |
| 이미지-텍스트 일관성 | N/A | >85% (consistencyChecker score) | 자동 검증 |
| 이미지당 Vision API 비용 | N/A | <$0.005 (Gemini Flash 기준) | apiUsageTracker |
| AI 탐지 우회 (AuthGR) | 기존 모드와 동등 | ≥0.6 (사용자 측 측정) | 외부 검증 |

## 3. Scope

### 3.1 In Scope
- 신규 "글 소스" 직교 축 토글 (키워드 / 사진) — 5개 모드와 AND 결합
- 사진 업로드 UX (드래그/파일/폴더, HEIC 자동 변환, EXIF 활용)
- AI Vision 추론 — **사용자가 provider 선택** (Gemini 2.5 Flash 디폴트, GPT-4o/Claude/DeepInfra 옵션)
- 추론 결과 white box (수정 가능 UI)
- 카테고리 자동 분류 (여행/맛집/숙박/일상/리뷰)
- 이미지 자동 배치 (시간순/공간순/소제목 분산)
- Quick Mode 별도 진입점 (3단 1-페이지)

### 3.2 Out of Scope (Phase 7 이후)
- 사진 검색 보강 (사진 부족 시 무료 사진 자동 추가)
- 사진 보정 자동화 (밝기/색상)
- 인스타 동시 발행
- 음성 메모 보강 (사진 + 음성 → 글)

## 4. Functional Requirements (EARS)

### FR-1: 글 소스 토글
WHEN 사용자가 메인 화면에서 콘텐츠 모드 선택 영역 위 "글 소스" 토글을 클릭하면,
THE SYSTEM SHALL "키워드 시작" (디폴트) 또는 "사진 시작" 중 하나를 활성화하고,
"사진 시작" 선택 시 이미지 업로드 영역을 슬라이드 다운으로 표시한다.

### FR-2: 이미지 업로드
WHEN 사용자가 "사진 시작" 활성 상태에서 이미지를 드래그앤드롭, 파일 선택, 폴더 전체 선택 중 하나로 업로드하면,
THE SYSTEM SHALL 3~30장 범위 내에서 이미지를 수락하고,
HEIC 포맷은 자동으로 JPG 변환 (imageFormatPipeline.ts),
EXIF 메타데이터를 추출 (timestamp, GPS, camera) 후 메모리 보관, 발행 시 strip한다.

### FR-3: Vision Provider 선택
WHEN 사용자가 "사진 시작" 모드 진입 시 Vision Provider 옵션을 선택하면,
THE SYSTEM SHALL 다음 4개 옵션 중 하나를 적용한다:
- (디폴트) Gemini 2.5 Flash — 비용 효율 최고, 한국어 음식·장소 강점
- GPT-4o — 한국어 묘사 자연스러움 최상
- Claude Sonnet 4.6 — 보수적 정확성, 비용 8배 (경고 표시)
- DeepInfra Llama 4 Scout — 최저 비용, 한국어 미검증 (경고 표시)

### FR-4: Vision 추론 + 사용자 확인
WHEN 사용자가 이미지 업로드 완료 후 "추론 시작"을 클릭하면,
THE SYSTEM SHALL 각 이미지에 대해 Vision API를 병렬 호출 (concurrency=3~5),
다음 필드를 가진 JSON 결과를 사용자에게 노출 (수정 가능):
- 장소 추정 (location_hint, 신뢰도 표시)
- 시간/날짜 (EXIF DateTimeOriginal 기반)
- 카테고리 (food/travel/lodging/daily/review/cafe 자동 분류)
- 사진별 1~2줄 캡션 (description_ko)
- 감정·분위기 태그

### FR-5: 환각 방지 가드
WHEN Vision 추론 결과의 confidence < 0.6인 항목이 있으면,
THE SYSTEM SHALL 해당 항목을 빨강 표시 + 사용자 입력 요청,
EXIF GPS가 있는 경우 카카오 reverse geocoding으로 장소 추정 보강,
글 발행 전 사용자 확인 단계를 강제 (skip 불가).

### FR-6: 글 생성
WHEN 사용자가 추론 결과 확인 후 "글 생성" 클릭하면,
THE SYSTEM SHALL 다음 옵션 적용 + 카테고리별 prompt 로드:
- 콘텐츠 모드 (SEO/홈판/사용자정의/업체 — 사용자 선택)
- 글 길이 (800/1500/2500자)
- 말투 (~해요/~합니다/반말)
- 글 스타일 (감성/정보/후기/일기, 옵션)
이후 `prompts/imageNarrative/{travel,food,lodging,...}.prompt` + Vision 추론 결과 + customPrompt(있으면) 결합 → contentGenerator 호출.

### FR-7: 이미지 자동 배치
WHEN 글 생성 완료 후,
THE SYSTEM SHALL 추론 결과의 imageRefs를 ImageManager.imageMap 형식으로 변환,
imageAssigner의 'narrative' 신규 모드로 위임 (헤딩별 사진 분배: 균등 / 캡션별 / 묶음 중 사용자 선택).

### FR-8: 미리보기 + 부분 재생성
WHEN 사용자가 미리보기 화면에서 소제목을 클릭하면,
THE SYSTEM SHALL 해당 소제목만 재생성 가능 (전체 재생성과 분리).

### FR-9: 발행
WHEN 사용자가 "발행" 클릭하면,
THE SYSTEM SHALL 기존 fullAutoFlow 흐름으로 위임,
카테고리/즉시·예약/SEO 점수를 표시 후 자동 발행.

### FR-10: 비용 가드레일
WHEN 사용자의 Vision API 누적 비용이 일/월 한도에 근접하면,
THE SYSTEM SHALL 차단형 모달로 경고 (feedback_no_fallback 룰),
사용자 명시 동의 없이 silent fallback 금지.

## 5. Non-Functional Requirements

| 영역 | 요구사항 |
|------|---------|
| **성능** | 10장 추론 + 글 생성 + 미리보기 ≤90초 (Quick Mode) |
| **비용** | 이미지당 ≤$0.005 (Gemini Flash 기준) |
| **회귀** | 기존 5개 모드 (SEO/홈판/쇼핑/사용자정의/업체) 동작 영향 0 |
| **god file** | contentGenerator.ts ≤1 hunk, fullAutoFlow.ts ≤3 hunk, renderer.ts ≤3 hunk |
| **보안** | EXIF GPS 발행 시 strip, 이미지 base64는 메모리에서만 |
| **언어** | 코드 주석 영어, commit 한국어, AI 응답 한국어 |
| **호환성** | 기존 customPrompt 흐름 (base + 추가) 유지 |

## 6. 의존성

- **Vision API**: Gemini 2.5 Flash (1순위), GPT-4o (폴백), Claude/DeepInfra (옵션)
- **기존 코드 재활용**: ImageManager.imageMap, imageAssigner, imageTextConsistencyChecker, imageFormatPipeline, authgrDefense, apiUsageTracker
- **신규 모듈**: src/imageNarrative/ (격리 디렉터리)
- **신규 prompts**: src/prompts/imageNarrative/{base,travel,food,lodging,daily,review}.prompt
- **신규 UI 모듈**: src/renderer/modules/imageNarrativeMode.ts, imageNarrativeReview.ts, imageNarrativeUpload.ts

## 7. 위험 + 완화

| # | 위험 | 영향 | 확률 | 완화 |
|---|------|------|------|------|
| R1 | Vision API 비용 폭증 | 매우 큼 | 높음 | Gemini Flash 디폴트 + 비용 한도 + 사전 견적 표시 |
| R2 | 한국어 지명/메뉴 오인식 | 큼 | 높음 | EXIF GPS + 카카오 reverse geocoding + 사용자 확인 단계 강제 |
| R3 | 응답 속도 지연 (10장 × 3초) | 큼 | 중간 | 병렬 호출 (concurrency 3~5) + 진행도 스트리밍 |
| R4 | god file 분기 누락 → 5개 모드 회귀 | 매우 큼 | 낮음 | 단일 분기점 + 5개 모드 풀오토 회귀 의무 |
| R5 | HEIC 변환 실패 | 신뢰 붕괴 | 중간 | 클라이언트 자동 변환 + 실패 시 알림 |
| R6 | EXIF 없는 이미지 | 중간 | 높음 | Vision 추론만 사용 + 사용자 입력 요청 |
| R7 | 사용자 검토 단계 스킵 시 환각 발행 | 큼 | 중간 | 검토 단계 강제 ON + confidence<0.6 차단 |
| R8 | 부업러 학습 곡선 | 중간 | 중간 | Quick Mode 별도 진입 + 60초 시연 시나리오 |

## 8. Decision Log

| 결정 | 선택 | Rejected | Why |
|------|------|----------|-----|
| 모드 구조 | "글 소스" 직교 축 토글 | 6번째 카드 추가 | 5개 모드 × 사진 = 5배 가치 폭 (UX 권장) |
| Vision 디폴트 | Gemini 2.5 Flash | GPT-4o / Claude | 비용 4~8배 차이, 한국어 강점 동등 |
| Provider 노출 | UI 옵션 (4종) | 자동만 (숨김) | 사용자 명시 요청 |
| 추론 결과 | White box (수정 가능) | Black box | 신뢰성, 디버깅 가능 |
| Carousel 단위 | 이미지당 1회 호출 (병렬) | batch 1요청 N장 | 한 장 오류가 전체 망치지 않음 |
| 카테고리 | 자동 분류 + 사용자 오버라이드 | 자동만 | 잘못된 분류 시 escape hatch |

## 9. Related

- [plan.md](plan.md) — 8 Phase 구현 plan
- [acceptance.md](acceptance.md) — 검증 메트릭
- [research.md](research.md) — 5-agent 분석 종합
- [[feedback_no_fallback]] — silent fallback 금지 (Vision provider 선택, 비용 가드)
- [[feedback_no_cascade_fix]] — Phase별 god file 진입 ≤3 hunk
- [[feedback_regression_check_every_phase]] — 매 Phase 회귀 검증 의무
- [[feedback_no_feature_bloat]] — Quick Mode 디폴트 자동, advanced 옵션 접힘

🐙 Autopus
