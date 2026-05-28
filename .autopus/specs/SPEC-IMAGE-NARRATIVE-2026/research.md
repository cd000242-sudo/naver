# SPEC-IMAGE-NARRATIVE-2026 — Research

> 2026-05-28 Autopus 5-agent team 분석 종합 (architect/planner/explorer/spec-writer Vision API/general-purpose UX)

## 1. Executive Summary

5 agent 병렬 분석 결과 **3가지 핵심 의사결정** 도출:
1. **모드 구조**: 직교 축 "글 소스" 토글 (UX 권장, architect/planner의 6번째 카드 안 기각)
2. **Vision provider**: Gemini 2.5 Flash 디폴트 + 사용자 선택 UI 노출 (4종)
3. **god file 침범**: contentGenerator.ts 1 hunk + fullAutoFlow.ts 3 hunk + renderer.ts 3 hunk (분산)

## 2. Architect Agent — 아키텍처

**핵심 권장**:
- `src/imageNarrative/` 격리 디렉터리 + `contentGenerator.ts` 단일 분기 1 hunk (<20줄)
- 동적 import로 god file에 신규 import 0개 추가
- 8단계 데이터 플로우 (입력 → 비용 견적 → EXIF → Vision → 합성 → 사용자 검토 → 글 생성 → 배치 → 발행)
- 5중 환각 가드:
  1. EXIF Ground Truth (GPS reverse geocoding 우선)
  2. 신뢰도 점수 임계값 (0.6 미만 빨강)
  3. 2-pass 검증 (provider A → B sanity check)
  4. 사용자 검토 단계 강제
  5. 한국 지명/메뉴 보정 사전

**위험 우선순위**: Vision 비용 폭증 (R1, $30만/월 가능) > 한국어 오인식 (R2) > 응답 속도 (R3)

**총 신규 코드**: ~2,500~3,000 LOC, 모듈 13~15개 (각 300줄 한도 준수)

## 3. Planner Agent — 8 Phase Plan

**Critical Path**: Phase 0 → 1 → 2 → 3 → 4 → 5 (12~14 영업일)
**총 commits**: 17~22
**god file 진입**: 5개 파일 × 17 hunk (1릴리즈당 ≤3 hunk 룰 엄격 분산)

| Phase | 산출물 | 추정 | god file | 위험 |
|-------|--------|------|----------|------|
| 0 | SPEC 4파일 | 0.5일 | 0 | NONE |
| 1 | Vision wrapper (격리) | 2일 | 0 | NONE |
| 2 | aggregator + builder + contentGenerator 분기 | 2일 | 1 hunk | MED |
| 3 | UI 직교 축 토글 + Quick Mode | 2일 | 5 hunk | HIGH |
| 4 | fullAutoFlow 통합 + 이미지 배치 | 3일 | 4 hunk | **CRITICAL** |
| 5 | 베타 + 안정화 | 3~5일 | 미세 | LOW |
| 6 | 최적화 | 2일 | 1 hunk | LOW |
| 7 | 고도화 (옵션) | 3일 | 1 hunk | MED |

**위험 집중**: Phase 4 (fullAutoFlow 통합) — **독립 minor 버전 v2.11.0으로 격리** 권장.

## 4. Explorer Agent — 기존 코드 매핑

**재사용 가능 모듈**:
| 영역 | 파일 | 재사용 방식 |
|------|------|------------|
| ImageManager | `src/renderer/modules/imageManagerCore.ts` (1225줄) | imageMap 자료구조 그대로 |
| 이미지 업로드 | `src/renderer/modules/imageManagementTab.ts` | UI 컴포넌트 차용 |
| 이미지 배치 | `src/imageAssigner.ts` (332줄) | 'narrative' 모드 case 추가 (1 hunk) |
| 이미지 일관성 | `src/image/imageTextConsistencyChecker.ts` | Vision 검증 패턴 레퍼런스 |
| 포맷 변환 | `src/image/imageFormatPipeline.ts` | HEIC 자동 변환 |
| Gemini SDK | `@google/generative-ai` (이미 설치) | Vision adapter |
| OpenAI SDK | `openai` (이미 설치) | GPT-4o 폴백 |
| AuthGR | `src/authgrDefense.ts` | AI 탐지 우회 |
| 비용 추적 | `src/apiUsageTracker.ts` | imageNarrative 카테고리 추가 |

**신규 생성 권장**:
- `src/imageNarrative/` (전체 디렉터리, 격리)
- `src/prompts/imageNarrative/` (카테고리별 prompt)
- `src/renderer/modules/imageNarrativeMode.ts` (메인 진입)
- `src/renderer/modules/imageNarrativeQuickMode.ts` (3단 1-페이지)
- `src/renderer/modules/imageNarrativeReview.ts` (Vision 결과 검토)

## 5. Vision API Researcher — Provider 비교

### 5.1 비교 표 (8 차원 × 4 API)

| 차원 | Gemini 2.5 Flash ⭐ | GPT-4o | Claude Sonnet 4.6 | DeepInfra Llama 4 |
|------|---------------------|--------|---------------------|---------------------|
| **이미지당 비용** | **~$0.00039** | ~$0.0019 | ~$0.0047 | ~$0.00008 |
| 출력 비용 (1M tokens) | $2.50 | $10.00 | $15.00 | $0.30 |
| 한국어 음식·장소 | 강함 | 매우 강함 | 강함 (직역체) | **미검증** |
| 응답 속도 | 800~1500ms | 1500~2500ms | 2000~3000ms | 1000~2000ms |
| Rate Limit (초기) | 500 RPM | Tier 1: 500 RPM | 더 제한적 | 무제한 ($/req) |
| 다중 이미지 batch | 3000장 가능 (1M context) | ~20장 | 100장+ (1M context) | 5~10장 |
| JSON Strict | **native** (responseJsonSchema) | `json_schema strict` | tool_use 간접 | 가변 |
| 할루시네이션 | 중 | 낮음 (보수적) | 매우 낮음 | 중~높 |
| Node.js SDK | 이미 설치 ✅ | 이미 설치 ✅ | 신규 추가 필요 | OpenAI 호환 |

### 5.2 비용 시뮬레이션 (10장/글, 월 100글 = 월 1,000장)

| 모델 | 월 총 비용 | 1만 발행 (월 100K장) |
|------|-----------|----------------------|
| **Gemini Flash** | **$1.14** | **$114** |
| GPT-4o | $4.91 | $491 |
| Claude Sonnet | $9.20 | $920 |
| DeepInfra Llama 4 | $0.17 | $17 |

→ Gemini Flash vs GPT-4o: **4.3배 저렴**, vs Claude: **8배 저렴**

### 5.3 신규 코드 분량

- 7 신규 파일 + 2 기존 수정 = **약 1,450 LOC**
- 신규 파일 (각 300줄 한도 준수):
  - `inferenceTypes.ts` (~80)
  - `geminiInferencer.ts` (~180)
  - `openaiInferencer.ts` (~170)
  - `claudeInferencer.ts` (~180, 옵션)
  - `inferenceCoordinator.ts` (~200)
  - `inferencePromptBuilder.ts` (~150, 한국어)
  - `imageInferredContentGenerator.ts` (~250)

### 5.4 권장 설계

- **R1**: Gemini 1차 + OpenAI 폴백 (shoppingImageAnalyzer 패턴 재사용)
- **R2**: 이미지당 1회 호출 (병렬 5), batch 합치기 금지
- **R3**: Gemini 2.5의 `responseJsonSchema`로 출력 강제 (확정 schema)
- **R4**: 비용 가드레일 — apiUsageTracker + 차단형 모달
- **R5**: 사용자 결정 (UI 노출) — 디폴트 Gemini Flash + 4종 선택 가능

## 6. UX Strategy Agent — 사용자 워크플로우

### 6.1 페르소나 분석

| Tier | 페르소나 | PMF | 매칭도 |
|------|---------|-----|--------|
| A | 사진 보유 + 시간 빈곤 (직장인, 부업러) | 갤러리 200장 쌓여있는데 글 못 씀 | ★★★★★ |
| B | 인플루언서·체험단 | 협찬 후기 매번 비슷 | ★★★★ |
| C | 1인 미디어 (카페·식당 사장) | 가게 사진으로 매달 발행 | ★★★★★ |
| D | 순수 SEO 부업러 | (해당 없음 — 사진 없음) | ★ |

### 6.2 차별화 5가지

| # | 차별화 | vs ChatGPT | vs 손글 |
|---|--------|-----------|---------|
| 1 | **이미지-텍스트 일관성 자동 검증** | 환각 차단 (ChatGPT는 사진 무시 가능) | 자연 (같음) |
| 2 | **사진 N장 → 발행, 한 워크플로우** | 7단계 → 2단계 | 30~90분 → 3~5분 |
| 3 | EXIF 시간순 + GPS 자동 추론 | Vision으로 못 함 | 수동 |
| 4 | 카테고리별 글 구조 자동 분기 | 사용자가 명시 | 수동 |
| 5 | AuthGR 방어 통합 | 미적용 | (수동 회피) |

### 6.3 모드 구조 (UX 결정)

**권장**: 직교 축 "글 소스" 토글

```
┌─ 콘텐츠 모드 (글 성격) ─┐  ┌─ 글 소스 (입력 방식) ─┐
│ SEO · 홈판 · 쇼핑      │  │ 키워드 시작 (기본)     │
│ 사용자정의 · 업체홍보   │  │ 사진 시작 (NEW)        │
└────────────────────────┘  └────────────────────────┘
        (어떤 글)                    (어디서 출발)
```

**조합 가치**:
- SEO + 사진 = Tier A (사진 보유 SEO 부업러)
- 홈판 + 사진 = Tier B (인플루언서 협찬)
- 업체홍보 + 사진 = Tier C (가게 사진으로 매달 발행)
- 쇼핑커넥트 + 사진 = Tier B (사용 후기)

→ 1 신규 진입점 × 5개 모드 = **5배 가치 폭** (6번째 카드는 1/5 가치)

### 6.4 사용자 워크플로우 (5 Stage)

```
Stage 1: 이미지 입력 (10~30초)
   ├─ 드래그&드롭 (PC 폴더)
   ├─ 파일 선택 (다중)
   ├─ 폴더 전체 (webkitdirectory)
   └─ "스마트폰 → PC sync" 가이드

Stage 2: AI 추론 + 사용자 확인 (30~60초)  ★ white box 핵심
   ├─ Vision 분석 진행률 바
   ├─ 추론 결과 패널 (수정 가능)
   │   ├─ 장소/대상/카테고리/일시 (L1)
   │   ├─ 사진별 캡션 (L2)
   │   └─ 감정·분위기 태그 (L3)
   └─ 사용자 1-click 수정

Stage 3: 글 옵션 (10초)
   ├─ 추천 콘텐츠 모드 (AI 추천 배지)
   ├─ 길이 (800/1500/2500)
   ├─ 말투 (~해요/~합니다/반말)
   └─ 이미지 배치 (자동/캡션/2장씩)

Stage 4: 미리보기 + 부분 재생성 (40~90초)
   ├─ 글 + 이미지 인라인 미리보기
   ├─ 소제목별 재생성
   └─ 캡션 인라인 수정

Stage 5: 발행 (자동)
   ├─ 카테고리 선택
   ├─ 즉시/예약
   └─ 발행 완료
```

### 6.5 Quick Mode (사이드바 단축 진입)

3단 1-페이지 레이아웃:
```
┌─ Quick Mode ─────────────────────────────────────┐
│ [1.사진]    [2.추론확인]    [3.발행]               │
│ 드래그       장소: ___      카테고리: ___          │
│ 12장 ✅     카테고리: ___   SEO점수: 87           │
│ [▶]        [✏수정]         [🚀발행]              │
└─────────────────────────────────────────────────┘
```

→ 부업러 단순 진입점 (스크롤 X, 탭 X, 모달 X)

### 6.6 사용성 위험 10가지

| # | 위험 | 완화 |
|---|------|------|
| R1 | "추론 결과 어떻게 믿나" 불신 | white box + 1-click 수정 + 신뢰도 표시 |
| R2 | 30장 추론 1~2분 → 이탈 | 진행률 + 백그라운드 + 병렬화 |
| R3 | iPhone HEIC 업로드 실패 | 자동 변환 (imageFormatPipeline 연결) |
| R4 | 추론 완전 틀림 | Stage 2 강제 (skip 옵션 X) |
| R5 | 동일 사진 재발행 → 중복 탐지 | 같은 셋 감지 → 경고 + 다른 각도 강제 |
| R6 | 개인정보 (얼굴/번호판) | 자동 블러 옵션 + EXIF strip |
| R7 | 사진 부족 (1~2장) | 최소 3장 알림 + 스톡 추가 옵션 |
| R8 | 카테고리 자동 분류 실패 | 추론 결과 화면 라디오 노출 |
| R9 | 부업러 인내심 부족 | Stage 1·2 백그라운드 prefetch |
| R10 | 수정 후 재생성 비용 | 부분 재생성 (소제목별) |

### 6.7 첫 사용 60초 시나리오

```
0초:  앱 실행 → "글 소스" 토글 발견
3초:  "📸 사진 시작 (NEW)" 클릭
5초:  온보딩 모달 1/3 → [시작하기]
10초: [예시로 체험] 클릭 → 사전 캐시 추론
17초: 추론 결과 (장소: 제주 흑돼지 / 맛집 / 4월 12일)
20초: [다음] 클릭
22초: 옵션 화면 (디폴트만)
24초: [✨ 글 생성] 클릭 → 30초 카운트다운
54초: 미리보기 → "🚀 발행" CTA
```

## 7. Agent 간 의견 불일치 + 해결

| 항목 | Architect/Planner | UX | 최종 결정 |
|------|-------------------|-----|----------|
| 모드 구조 | 6번째 카드 추가 | **직교 축 토글** | UX 안 (5배 가치) |
| 사용자정의 모드 | 유지 | 유지 | 일치 |
| Vision 노출 | 자동만 (R5) | (의견 없음) | **사용자 명시: 노출 (4종 선택 UI)** |
| 단축 진입 | 메인 화면만 | **Quick Mode 별도** | UX 안 |

## 8. 외부 자료 참고

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Claude API Pricing 2026](https://www.metacto.com/blogs/anthropic-api-pricing-a-full-breakdown-of-costs-and-integration)
- [Claude Vision Token Calculation](https://platform.claude.com/docs/en/build-with-claude/vision)
- [DeepInfra Multimodal Models](https://deepinfra.com/models/multimodal)
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)

## 9. 다음 액션

1. **Phase 1 진입 결정** (사용자) — Vision wrapper 격리 작업 시작
2. **베타 사용자 사전 모집** (사용자) — Phase 5 위해 3~5명
3. **Vision API 키 사전 발급** (사용자) — Gemini Flash + GPT-4o 디폴트, Claude/DeepInfra는 사용자 결정
4. **카카오 reverse geocoding API 키** (사용자) — Phase 2 EXIF GPS 보강
5. **dogfood 일정 합의** (사용자) — Phase 1·2 각 완료 후 10건 사용자 직접 평가

## 10. Related

- [spec.md](spec.md)
- [plan.md](plan.md)
- [acceptance.md](acceptance.md)

🐙 Autopus 5-agent team
