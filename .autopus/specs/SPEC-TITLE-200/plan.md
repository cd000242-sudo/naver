# SPEC-TITLE-200 구현 계획

## Phase 1 (1주, 자동검증)
- T1 `titleScorer.ts` AC1+AC2+AC4. neoHookTitles/titleCockpit 가산점 재사용
- T2 `titleEngineV2.ts` zod입력 + 모드라우팅 + 결과정규화
- T3 SEO/HOMEFEED 모드 프롬프트 분리(prompts/seo/base.prompt + neoHookTitles 인용 only)
- T4 단위테스트 모드별8 + 스코어러12. Red-Green-Red
- T5 `parseTitles()` 호환 어댑터(점진 이행)

## Phase 2 (2주, 재생성+중복방지)
- T6 `dedupChecker.ts` 임베딩(ada-002 또는 nano-banana) + `data/title-embeddings.json` 캐시
- T7 `regenerator.ts` 80미만/dedup거부 시 재호출. MaxRetry=2 hard cap
- T8 AFFILIATE/BUSINESS 모드 + `adLawDictionary.ts`
- T9 AC3+AC5+AC6+AC7 스캐너
- T10 통합 10케이스(S1~S10) Green

## Phase 3 (1개월, 학습데이터)
- T11 `data/title-outcomes.jsonl` 발행후 24h CTR+7일 체류(postMetricsStore 재사용)
- T12 코호트분석 90+ vs 70~80 실측 비교 → weight 자동튜닝
- T13 `recentWinnersExtractor` 패턴 → 상위20% few-shot 캐시

## 전략
- 재사용: NEO_HOOK_TEMPLATES, analyzeTitle, scoreTitleForHomefeed, postMetricsStore, recentWinnersExtractor. 신규는 검증/라우터만
- 차단게이트 금지(HOMEFEED 합의 따름) — 실패 시 최고점 폴백
- subagent: T8 (광고법사전+2모드) 200줄+ 예상 → executor 분리
