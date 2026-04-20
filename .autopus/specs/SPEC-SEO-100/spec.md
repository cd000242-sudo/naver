# SPEC-SEO-100: SEO 모드 93~95점 엔진

## 1. 목적

SEO 모드(통합검색 + AI 브리핑 CUE: + 스마트블록 대응)의 노출/터짐 확률을 현재 ~70점 → **93~95점**으로 끌어올린다. 홈판(SPEC-HOMEFEED-100)이 95점 상한이었다면 SEO는 2점 낮은 93~95점 — 블로그 도메인 권위가 나무위키/공식사이트와의 통합랭킹 천장이기 때문이다.

## 2. 배경

2026-04-20 Agent Teams 토론(architect + planner) 합의. 홈판 로드맵에서 구축한 공용 인프라의 80%를 재사용한다.

## 3. SEO vs 홈판 알고리즘 차이

| 축 | 홈판 | SEO |
|---|---|---|
| 노출 경로 | 탐색 피드 추천 | 통합랭킹 + AI 브리핑 + 스마트블록 |
| 경쟁자 | 다른 블로그만 | 나무위키/공식사이트/카페/지식iN 동시 경쟁 |
| 핵심 신호 | CTR + 초기 반응 24~48h | 체류시간 + 재검색 없음 + AI 인용 |
| 검증 기간 | 24~48h | **2주** |
| 시간대 영향 | 강함 (피크 타임) | 약함 (상시 검색) |
| 썸네일 영향 | CTR 50% 결정 | 낮음 (제목+요약 우선) |

## 4. 공용 인프라 재사용 (새로 만들지 말 것)

- `src/analytics/featureFlagTracker.ts` — FeatureFlag enum에 SEO 전용 값만 추가
- `src/analytics/postMetricsStore.ts` — 스키마 그대로, 2주 스냅샷만 추가로 쌓임
- `src/analytics/cohortAnalyzer.ts` — SEO cohort도 동일 API로 비교
- `src/learning/recentWinnersExtractor.ts` — SEO winners도 same extractor
- `src/services/contentValidationPipeline.ts` — 파사드 **내부에 mode 분기 추가**
- `src/services/priceNormalizer.ts` — SEO에서도 유효 (쇼핑커넥트 글)
- `src/services/publishMetadataRecorder.ts` — 공용

## 5. SEO 모드 Skip 항목

- 썸네일 자동 생성: 검색 결과는 제목+요약이 핵심, 썸네일 영향 < 10%
- `homefeedOptimalSlots`: 검색은 상시, 피크 영향 < 5%
- 24~48h A/B: SEO는 2주 검증 루프가 맞는 시간 단위

## 6. 4주 로드맵

### W1 — SEO Validator 분기 + 3개 스캐너 (70→80, 완료: 2026-04-20)

- [x] `contentValidationPipeline.ts`에 `mode: 'seo' | 'homefeed'` + `mainKeyword`, `title` 옵션 추가. 기본값은 homefeed라 기존 호출자 영향 없음.
- [x] `src/validators/seo/definitionFirstSentenceScanner.ts` — 각 H2 첫 문장 "A는 B이다", "핵심은 ~", "결론부터 말하면" 패턴 검증. hitRatio 0.6 미만 시 warning. AI 브리핑 인용 대응.
- [x] `src/validators/seo/mainKeywordPositionScanner.ts` — 제목 앞 3자 + 도입부 첫 100자 + 결론 반복 검증 + 전체 키워드 밀도/출현 횟수 카운트.
- [x] `src/validators/seo/faqHeadingScanner.ts` — 질문형 소제목 패턴(물음표, 의문사, "~차이") 감지. 1~2개 권장 범위 밖(0 또는 3+)일 때 경고.
- [x] FeatureFlag enum에 `seo_definition_scanner`, `seo_keyword_position`, `seo_faq_heading`, `seo_longtail_depth` 추가.
- [x] 테스트 16 cases + Red-Green-Red 검증. 전체 458/458 PASS. tsc 0 에러.

### W2 — SEO 프롬프트 SECTION 체계 리팩토링 + CUE 답변블록 규칙 (80→87)

- [ ] `src/prompts/seo/base.prompt` 821줄 → 600줄 이내
- [ ] 홈판 스타일 SECTION 0~13 체계: R0-x 절대 규칙, H1~Hn 환각 방지, B1~Bn AI 패턴 블랙리스트
- [ ] SECTION 신설: CUE 답변블록(각 H2 첫 문장 정의문 40~80자), 롱테일 수직 파고들기, 통합랭킹 경쟁 원칙
- [ ] `recentWinnersBlock` 주입 지점을 SECTION 최상단으로 표준화

### W3 — SEO 2주 검증 루프 지표 수집 (87→90)

- [ ] `postMetricsStore` 수동 입력 UI 추가 (D+7, D+14 스냅샷)
- [ ] `cohortAnalyzer`에 `timeWindow: 7 | 14 | 30` 파라미터 추가
- [ ] AI 브리핑 인용 여부 플래그 (metric에 `aiBriefingCited?: boolean` 추가 — 수동 확인)

### W4 — SEO 피드백 루프 + 롱테일 깊이 스캐너 (90→93~95)

- [ ] `recentWinnersExtractor`를 SEO에서도 호출 (buildFullPrompt 이미 지원)
- [ ] `src/validators/seo/longtailDepthScanner.ts` — 단일 빅키워드 사용 경고, 3~4어절 조합 권장
- [ ] SPEC 리뷰 완료 후 SPEC-SEO-100 완료 마킹

## 7. 예상 점수

| 단계 | 점수 | 근거 |
|---|---|---|
| 시작 (2026-04-20) | 70 | 프롬프트만 있고 SEO 검증 없음 |
| W1 완료 | 80 | Validator SEO 분기 + 3 스캐너 |
| W2 완료 | 87 | 프롬프트 체계화 + CUE 답변블록 |
| W3 완료 | 90 | 2주 검증 데이터 축적 |
| W4 완료 | **93~95** | 피드백 루프 + 롱테일 깊이 |

**93~95 상한 근거**:
- 통합랭킹에서 블로그 < 나무위키/공식사이트 (도메인 권위 천장)
- 2주 검증 루프는 피드백 속도가 홈판(24h)보다 8배 느림 → 수렴 한계
- AI 브리핑 인용은 확률적 — 구조 최적화해도 100% 보장 불가

## 8. 제약 (Agent Teams 합의)

- ❌ 경쟁문서 갭 분석 (나무위키 스크래핑)은 스코프 아웃 — 정책 리스크 + 외부 API 복잡도
- ❌ SEO Validator가 문체 수정 금지 — AuthGR 역지문 회피 (홈판과 동일)
- ❌ validator 차단 게이트 금지 — 발행은 항상 진행

## 9. 관련 파일

### 신규 (W1~W4)
- `.autopus/specs/SPEC-SEO-100/spec.md` (이 문서)
- `src/validators/seo/definitionFirstSentenceScanner.ts` (W1)
- `src/validators/seo/mainKeywordPositionScanner.ts` (W1)
- `src/validators/seo/faqHeadingScanner.ts` (W1)
- `src/validators/seo/longtailDepthScanner.ts` (W4)

### 수정
- `src/services/contentValidationPipeline.ts` (W1)
- `src/analytics/featureFlagTracker.ts` (W1 — FeatureFlag 추가)
- `src/prompts/seo/base.prompt` (W2 — 리팩토링)
