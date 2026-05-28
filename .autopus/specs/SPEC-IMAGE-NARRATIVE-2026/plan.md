# SPEC-IMAGE-NARRATIVE-2026 — 구현 Plan

> **8 Phase × 6주 × 17~22 commits × ~2,500~3,200 LOC**
> 권장 첫 사용자 가시 릴리즈: **v2.11.0** (Phase 4 완료 시점)

## 0. 핵심 결론

- **Critical Path**: Phase 0 → 1 → 2 → 3 → 4 → 5 (약 12~14 영업일)
- **위험 집중**: Phase 4 (`fullAutoFlow.ts` 통합) — 독립 minor 버전(v2.11.0) 격리 권장
- **dead code 점진 도입**: Phase 1~3은 v2.10.394~399에 dead code로 누적, Phase 4에서 UI 노출
- **god file 진입 분산**: 5개 파일 × 총 17 hunk, 1릴리즈당 ≤3 hunk 룰 엄격 준수

## 1. Phase 분할

### Phase 0 — SPEC 작성 & 사용자 승인 (이 문서)
- **산출물**: spec/plan/acceptance/research 4파일
- **추정**: 1 commit / ~1,500 라인 docs / 0.5일
- **god file**: 0 hunk
- **선행**: 없음 (시작점)
- **사용자 검증**: EARS 요구사항 + Vision provider 선택 옵션 + 이미지 N 범위 승인
- **릴리즈**: v2.10.394 (SPEC만)

### Phase 1 — Vision API Wrapper (격리, 회귀 위험 0)
- **산출물**:
  - `src/imageNarrative/types.ts` (~120 LOC)
  - `src/imageNarrative/visionInference/visionRouter.ts` (~150 LOC) — provider 선택 + 폴백
  - `src/imageNarrative/visionInference/geminiVisionAdapter.ts` (~180 LOC)
  - `src/imageNarrative/visionInference/gpt4oVisionAdapter.ts` (~180 LOC)
  - `src/imageNarrative/visionInference/claudeVisionAdapter.ts` (~180 LOC, 옵션)
  - `src/imageNarrative/visionInference/inferencePrompts.ts` (~100 LOC, 한국어)
  - `src/__tests__/imageNarrativeVision.test.ts` (~250 LOC)
- **추정**: 3 commits / 7 신규 파일 / ~1,160 LOC / 2일
- **god file**: 0 hunk (격리)
- **검증**: vitest 2279+N PASS, dev CLI로 이미지 5장 → JSON 결과 확인
- **롤백**: 디렉터리 삭제
- **릴리즈**: v2.10.395 (dead code)

### Phase 2 — 추론 결과 합성 + 글 생성 파이프라인
- **산출물**:
  - `src/imageNarrative/inferenceAggregator/aggregator.ts` (~200 LOC)
  - `src/imageNarrative/inferenceAggregator/exifEnricher.ts` (~150 LOC) — EXIF + GPS
  - `src/imageNarrative/inferenceAggregator/ordering.ts` (~120 LOC) — 시간순/공간순
  - `src/imageNarrative/inferenceAggregator/hallucinationGuard.ts` (~180 LOC)
  - `src/imageNarrative/narrativeBuilder/builder.ts` (~200 LOC) — Vision → 글 prompt
  - `src/prompts/imageNarrative/{base,travel,food,lodging,daily,review}.prompt` (각 ~100 LOC)
  - `src/contentGenerator.ts` (**1 hunk**, ~15 LOC) — `'image-narrative'` 모드 동적 import 분기
  - `src/__tests__/imageNarrativeBuilder.test.ts` (~200 LOC)
- **추정**: 4 commits / 6 신규 + 1 기존 수정 / ~1,360 LOC / 2일
- **god file**: `contentGenerator.ts` 1 hunk
- **검증**: dev CLI로 이미지 5장 → 글 1편 생성, vitest + 기존 5개 모드 회귀 의무
- **롤백**: 1 commit revert
- **릴리즈**: v2.10.396~397 (dead code)

### Phase 3 — UI 신규 진입점 (직교 축 토글 + Quick Mode)
- **산출물**:
  - `public/index.html` (**2 hunk**): "글 소스" 토글 + 이미지 업로드 영역
  - `src/renderer/modules/imageNarrativeMode.ts` (~280 LOC) — 메인 화면 진입
  - `src/renderer/modules/imageNarrativeUpload.ts` (~180 LOC) — 드래그/파일/폴더
  - `src/renderer/modules/imageNarrativeReview.ts` (~280 LOC) — Vision 결과 검토 UI
  - `src/renderer/modules/imageNarrativeQuickMode.ts` (~250 LOC) — 3단 1-페이지
  - `public/styles.css` (~80 LOC, 카드 + 업로드 영역)
  - `src/renderer/renderer.ts` (**3 hunk**, ~20 LOC) — wire-up
- **추정**: 4 commits / 5 신규 + 2 기존 수정 / ~1,090 LOC / 2일
- **god file**: `renderer.ts` 3 hunk, `index.html` 2 hunk
- **검증**: 앱 실행 → 토글 클릭 → 업로드 → 추론 결과 표시 (글 생성은 Phase 4에서)
- **롤백**: renderer + index.html revert + 모듈 파일 삭제
- **릴리즈**: v2.10.398~399 (UI 활성, 발행은 미연결)

### Phase 4 — 풀오토 통합 + 이미지 자동 배치 (CRITICAL)
- **산출물**:
  - `src/renderer/modules/fullAutoFlow.ts` (**3 hunk**, ~30 LOC) — narrative 모드 분기
  - `src/imageNarrative/placement/inferenceImageMapper.ts` (~150 LOC) — imageMap 변환
  - `src/imageAssigner.ts` (**1 hunk**, ~10 LOC) — 'narrative' 모드 case 추가
  - `src/main.ts` (**1 hunk**, ~15 LOC) — IPC 핸들러 `vision:infer-and-write`
  - `src/preload.ts` (**1 hunk**, ~5 LOC) — API 노출
  - `src/__tests__/imageNarrativePlacement.test.ts` (~180 LOC)
- **추정**: 4 commits / 2 신규 + 4 기존 수정 / ~390 LOC / 3일
- **god file**: `fullAutoFlow.ts` 3 hunk, `main.ts` 1 hunk
- **검증**: UI 업로드 → "발행 시작" → 자동 글 생성 + 이미지 배치 + 네이버 발행 1회 성공. **기존 5개 모드 풀오토 회귀 의무.**
- **롤백**: 독립 minor 다운그레이드 (v2.11.0 → v2.10.402)
- **릴리즈**: **v2.11.0 ⭐** (정식 출시, dead code → 활성)

### Phase 5 — 회귀 검증 + 베타 + 안정화
- **산출물**:
  - 회귀 검증 보고서 (5개 기존 모드 각 1회 실행)
  - `CHANGELOG.md` v2.11.0 항목
  - 베타 사용자 3~5명 피드백 수집
  - 작은 fix 1~3개
- **추정**: 2~3 commits / ~50 LOC fix / 3~5일 (베타 대기 포함)
- **god file**: 미세 fix만 (1 hunk 이내)
- **검증**: vitest + lint + full-flow 5회 연속 + 베타 3명 승인
- **릴리즈**: v2.11.1~v2.11.2 (안정화)

### Phase 6 — 비용/성능 최적화
- **산출물**:
  - `src/imageNarrative/cost/imageHashCache.ts` (~120 LOC) — Vision 호출 캐시
  - `src/imageNarrative/cost/imageResizer.ts` (~100 LOC) — Vision 전 1024px 리사이즈
  - `src/apiUsageTracker.ts` (**1 hunk**, ~10 LOC) — imageNarrative 카테고리 추가
  - `src/imageNarrative/cost/budgetGuard.ts` (~100 LOC) — 일/월 한도 차단
- **추정**: 2 commits / 3 신규 + 1 기존 수정 / ~330 LOC / 2일
- **god file**: `apiUsageTracker.ts` 1 hunk
- **검증**: 동일 이미지 2회 호출 시 캐시 hit, 비용 50% 절감
- **릴리즈**: v2.11.3 (옵션)

### Phase 7 — 고도화 (사용자 명시 요청 시만)
- **산출물**:
  - 카테고리 자동 톤 매칭
  - 사진 부족 시 무료 사진 자동 추가
  - 인스타 동시 발행
- **추정**: 3~4 commits / ~600 LOC / 3일
- **god file**: renderer.ts 1 hunk
- **검증**: feature flag로 점진 노출
- **릴리즈**: v2.11.4~v2.11.7 (옵션)

## 2. Gantt-style 의존성

```
Phase 0 [SPEC]              ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  v2.10.394
Phase 1 [Vision Wrapper]     ░▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░  v2.10.395
Phase 2 [Aggregator+Builder]  ░░▓▓▓░░░░░░░░░░░░░░░░░░░░░░░  v2.10.396~397
Phase 3 [UI 직교축+Quick]      ░░░░▓▓▓░░░░░░░░░░░░░░░░░░░░░  v2.10.398~399
Phase 4 [FullAuto+Place] ⭐     ░░░░░▓▓▓▓░░░░░░░░░░░░░░░░░  v2.11.0
Phase 5 [Beta+Stabilize]            ░░░▓▓▓▓░░░░░░░░░░░░░░  v2.11.1~2
Phase 6 [Optimization]                  ░░░▓▓░░░░░░░░░░░░  v2.11.3
Phase 7 [Advanced — 옵션]                   ░░░░░▓▓▓▓░░░░  v2.11.4~7
```

| 의존성 | 차단 관계 |
|--------|----------|
| Phase 1 → Phase 2 | Vision wrapper 없이 글 생성 prompt 빌드 불가 |
| Phase 2 → Phase 4 | 글 생성 파이프 없이 풀오토 통합 불가 |
| Phase 3 → Phase 4 | UI 진입점 없이 풀오토 활성화 불가 |
| Phase 4 → Phase 5 | 통합 완료 후만 베타 가능 |
| Phase 0 → 모든 Phase | golden-principles #9 HARD-GATE (SPEC 없이 코드 작업 금지) |

## 3. 회귀 위험 매핑

| Phase | 진입 god file | 영향 범위 | 위험 등급 | 완화 |
|-------|--------------|----------|----------|------|
| 0 | 없음 | 문서만 | NONE | — |
| 1 | 없음 | 격리 | NONE | 신규 디렉터리 |
| 2 | `contentGenerator.ts` 1 hunk | 5개 기존 모드 | **MED** | 5개 모드 각 1회 글 생성 회귀 |
| 3 | `renderer.ts` 3 hunk, `index.html` 2 hunk | 모드 선택 UI 전체 | **HIGH** | 6개 토글 상태 회귀 |
| 4 | `fullAutoFlow.ts` 3 hunk, `main.ts` 1 hunk | 풀오토 플로우 전체 | **CRITICAL** | full-flow 5회 + 5개 모드 풀오토 회귀 |
| 5 | 미세 fix | 신규 모드만 | LOW | 베타 피드백 |
| 6 | `apiUsageTracker.ts` 1 hunk | 비용 추적 | LOW | 비용 회귀 |
| 7 | renderer.ts 1 hunk | 신규 모드만 | MED | feature flag |

**경고**: Phase 4가 단일 위험 집중. 별도 minor 버전 격리 의무.

## 4. 롤백 전략

| Phase | 롤백 방법 | 사용자 영향 |
|-------|----------|------------|
| 0 | SPEC 폐기 | 0 |
| 1 | `src/imageNarrative/` 삭제 | 0 (dead code) |
| 2 | contentGenerator revert + 신규 파일 삭제 | 0 (dead code) |
| 3 | renderer + index.html revert + 모듈 삭제 | 0 (dead code) |
| 4 | **minor 다운그레이드 v2.11.0 → v2.10.402** | 풀오토 사용자 영향 |
| 5 | 베타 안내 + minor 다운그레이드 | 베타 사용자만 |
| 6 | 캐시 비활성화 flag | 비용 증가만 |
| 7 | feature flag OFF | 신규 사용자만 |

## 5. 사용자 검증 포인트 (Phase별)

| Phase | 사용자가 확인할 것 |
|-------|------------------|
| 0 | EARS 요구사항 + Vision provider 4종 선택 옵션 + 이미지 N 범위 |
| 1 | dev CLI로 이미지 5장 → Vision JSON 결과 확인 |
| 2 | dev CLI로 이미지 5장 → 글 1편 1500자+ 생성 |
| 3 | 앱 UI에서 "글 소스" 토글 + 업로드 grid + 추론 결과 표시 |
| 4 | 풀오토 1회 성공 + 다른 5개 모드 풀오토 회귀 0건 |
| 5 | 베타 사용자 3명 이상 승인 |
| 6 | 비용 50% 절감 측정 |
| 7 | 톤 자동 매칭 정확도 |

## 6. 선행 결정 (Phase 0 완료 전)

1. **Vision provider 최종 4종 확정**: Gemini Flash (디폴트) / GPT-4o / Claude Sonnet (경고) / DeepInfra Llama (경고)
2. **이미지 N 범위**: 3~30장 (소제목 5~7개 × 사진 3~5장)
3. **카테고리 분류**: 자동 (Vision 추론) + 사용자 오버라이드
4. **이미지 배치 알고리즘 v1**: EXIF 시간순 + 소제목 균등 분배 (AI 결정은 Phase 7로)
5. **비용 가드 한도**: 일 200장 / 월 5000장 디폴트, 사용자 조정 가능
6. **사용자정의 모드 처리**: 유지 (5개 모드 변경 0, 직교 축 추가만)

## 7. 총 작업량 요약

| 항목 | 추정치 |
|------|--------|
| 총 commits | 17~22 |
| 총 신규 파일 | 약 18~22개 |
| 총 신규 LOC | 약 2,500~3,200 |
| god file 진입 | 5개 파일, 총 17 hunk (분산) |
| 기간 | Critical Path 12~14 영업일, 총 6주 |
| 위험 집중 | Phase 4 (fullAutoFlow 통합) — v2.11.0 격리 |
| 첫 사용자 가시 릴리즈 | v2.11.0 (Phase 4) |

## 8. Related

- [spec.md](spec.md)
- [acceptance.md](acceptance.md)
- [research.md](research.md)

🐙 Autopus planner
