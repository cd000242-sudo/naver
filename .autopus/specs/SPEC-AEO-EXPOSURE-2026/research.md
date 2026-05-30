# SPEC-AEO-EXPOSURE-2026 — 조사/비평 근거 (research)

## A. 코드 대조 조사 (4 에이전트, read-only, 2026-05-29)

1. **프롬프트 시스템**: `seo_master_prompt_v1.md` 없음. 실제 `src/promptLoader.ts`(1226줄) + `src/prompts/seo/base.prompt`(783줄) + 모드×카테고리×톤×정체성 멀티레이어(6,349줄/50+파일). buildFullPrompt(`contentGenerator.ts:~2299`). AEO 룰 일부 이미 강제(P-A~P-F), 일부 권장(F2 출처).
2. **검증기**: `validators/seo/{definitionFirstSentence,mainKeywordPosition,faqHeading,longtailDepth}Scanner.ts` + `services/contentValidationPipeline.ts` + `contentQualityChecker.ts`(P-A~P-F) + `content/qualityEvaluator.ts`(pass≥80&safety≥50 / regenerate<60) + `authgrDefense.ts`. `contentGenerator.ts:~700` 자동 invoke. AEO+DIA 9항목: 1완전(FAQ)/4부분/4미구현. critical 이슈는 로그만(비차단). regenerate 판정은 미연결.
3. **발행 파이프라인**: 단일=`fullAutoFlow.ts:3385 executeBlogPublishing`→`renderer.ts:8368`→`naverBlogAutomation.ts:4684`. 양산=`continuousPublishing.ts:4988`. hook 지점=`contentGenerator.ts:1226 runPostGenValidator`(0원 아티팩트 blocking). retry=network-only(MAX_ATTEMPTS=2). StructuredContent(HTML content + headings[] + collectedImages[]). flag 패턴=`isFeatureEnabled('validator')`.
4. **설정/모니터/검색**: configManager userData JSON 패턴(`publishedPostTracker`/`cohortStore`/`blogAccountManager`). 검색/노출 이미 구현=`serpProbe`/`exposureChecker`(노출 1~30위)/`exposurePoller`(24/48/72h, EXPOSURE_POLLER_ENABLED)/`naverSearchApi`/`serpHistory`. 셀렉터 중앙화=`automation/selectors/`+`remoteUpdate`. backoff/rate-limit 명시 로직 없음.

## B. 적대적 비평 (3 라운드)

### R2 테스트 파괴 위험 (reviewer)
- 위험도 MEDIUM. 하드코딩: 4스캐너 다수 정규식+숫자, pipeline 0.6/2/70, qualityEvaluator WEIGHTS 5세트+60/80/50.
- 의존 테스트: `seoValidators.test.ts`(21), `contentValidationPipeline.test.ts`(14), `qualityEvaluator.test.ts`(14, weights===0.60 직접 assert).
- no-op 조건: DEFAULT 바이트 일치 / optional rules param / 정규식은 코드 유지(직렬화 금지) / 로드 실패 폴백.
- 총 2434 테스트(171 파일), 기존 실패 1건=licenseManagerRegression L5(stale-fetch write-guard, trial vs premium — 라이선스 race, 무관).

### AEO 실효성 제1원칙 (architect, confidence 표기)
- per-post 형식→노출 인과 **약함(high)**: 통합검색 누락=후보 풀 진입 실패=계정 권위 게이트. 형식은 풀 진입 후 순위 다툼만.
- 자동화 도구 역설 **(high)**: 5/7 누락 1순위 용의자=발행 패턴 어뷰징 감지. 9신호 강제→골격 동형화→어뷰징 패턴 악화.
- 빈 표 양산 **(high)**: 강제+재생성 루프=cargo cult. 저품질 필터 학습 타깃.
- D.I.A.+ 역설 **(high)**: 9신호 균질 격자가 경험/독창성 축과 적대적.
- serpProbe baseline **(medium-high)**: 상위10=뉴스/플레이스/광고/인플루언서 권위 오염. 슬롯 필터+코호트 매칭 없으면 재현 불가.
- 놓친 변수: ①계정 어뷰징 플래그 ②체류/클릭 행동 신호 ③키워드 경쟁도·계정 적합도.
- 권고: 진단 우선(계정 vs 글 분리) → 어뷰징 배제 → 그 후 형식.

### GAP A 배선 (reviewer + 조사3 종합)
- regenerate 판정은 미연결. 새 배선보다 **기존 `contentSelfCritique`(피드백 재작성) 재사용이 우월**. `feedback_loop`은 few-shot 주입이라 별개. 양산 경로 글당 LLM 재호출 2회 추가는 비용/지연 부담 → circuit-breaker 필수.

## C. v2 설계 반영
진단 우선(Phase 0.5) 신설 / 9신호 강제→Tier-1 게이트+Tier-2 자문 / 반균질화 스캐너(R0) 최우선 안전 구현 / serpProbe R7 필터 / GAP A는 selfCritique 재사용 / R2 no-op 조건 고정.
