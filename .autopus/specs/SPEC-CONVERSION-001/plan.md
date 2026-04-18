# SPEC-CONVERSION-001 - Plan

## Levels Overview

| Level | 목적 | 선행 의존 | 예상 | Feature Flag |
|---|---|---|---|---|
| L2 | 체인드 LLM + 경쟁 데이터 + 벤치마크 50건 | SPEC-REVIEW-001 P0~P2 완료 | 1~2주 | `CHAINED_GEN_V1` |
| L3 | RAG + 트렌드 + 이미지 일관성 강화 | L2 완료, 특히 L2-4(벤치마크 50건) | 3~4주 | `RAG_RETRIEVAL_V1`, `TREND_INJECT_V1` |
| L4 | 편집자 퇴고 + 전환 데이터 역반영 + 브랜드 톤 | L3 완료, 운영 데이터 최소 3개월 축적 | 분기~연간 | `EDITOR_LAYER_V1`, `CONVERSION_RLHF_V1`, `BRAND_TONE_V1` |

롤아웃: L2-1 -> (L2-2 || L2-4) -> L2-3(REVIEW-001 P1 대기) -> L3-1 -> (L3-2 || L3-3) -> L4-1 -> L4-2 -> L4-3.

## Dependency Graph

```
SPEC-REVIEW-001 P0 --+
SPEC-REVIEW-001 P2 --+--> L2-1 (체인드 파이프라인)
                     |       |
                     |       +--> L2-2 (경쟁 제품 수집) --+
                     |       |                            |
                     |       +--> L2-4 (상위 50 벤치) ----+
                     |                                    |
SPEC-REVIEW-001 P1 --+--> L2-3 (블로그 댓글 통합) --------+
                                                          v
                                                    L3-1 (RAG retrieval)
                                                          |
                                                          +--> L3-2 (트렌드)
                                                          |
                                                          +--> L3-3 (이미지 일관성)
                                                                    |
                                                                    v
                                                              L4-1 (편집자)
                                                                    |
                                                                    +--> L4-2 (RLHF)
                                                                    |
                                                                    +--> L4-3 (브랜드 톤)
```

## Task Decomposition

### L2 - 체인드 LLM + 벤치마크 (1~2주)

#### L2-1. 체인드 프롬프팅 파이프라인

| Task | Description | File | Agent | Duration |
|---|---|---|---|---|
| T2-1.1 | 5단계 파이프라인 오케스트레이터 골격 | `src/content/chainedGeneration.ts` (신규, <250줄) | executor | 3h |
| T2-1.2 | Stage 1: 카테고리 분류기 | `src/content/categoryClassifier.ts` (신규, <150줄) | executor | 2h |
| T2-1.3 | Stage 2: 페르소나 빌더 | `src/content/personaBuilder.ts` (신규, <200줄) | executor | 3h |
| T2-1.4 | Stage 3: 본문 초안 생성 어댑터 | `src/content/draftWriter.ts` (신규, <200줄) | executor | 2h |
| T2-1.5 | Stage 4: 팩트 체크(REVIEW-001 factChecker 경유) | `src/content/factGate.ts` (신규, <150줄) | executor | 2h |
| T2-1.6 | Stage 5: 전환 최적화 퇴고 | `src/content/conversionOptimizer.ts` (신규, <250줄) | executor | 4h |
| T2-1.7 | 단계별 프롬프트 분리 | `src/prompts/affiliate/chain/stage{1~5}.prompt` | executor | 3h |
| T2-1.8 | Feature flag `CHAINED_GEN_V1` 게이트 | `src/content/chainedGeneration.ts` + `src/contentGenerator.ts` 엔트리 | executor | 1h |
| T2-1.9 | 단계별 캐싱(카테고리/페르소나) | `src/content/chainCache.ts` (신규, <150줄) | executor | 2h |
| T2-1.10 | 단계별 비용/지연 메트릭 | `src/monitor/operationsDashboard.ts` (확장) | executor | 1.5h |
| T2-1.11 | E2E 통합 테스트 3건 | `tests/content/chained-gen.test.ts` (신규) | tester | 3h |

**롤백 조건**: 동일 입력 A/B에서 기존 단일 콜 대비 품질 저하(체류시간 proxy 지표 -10% 이하) -> flag OFF.

#### L2-2. 경쟁 제품 비교 데이터 수집

| Task | Description | File | Agent | Duration |
|---|---|---|---|---|
| T2-2.1 | 네이버쇼핑 검색 결과 셀렉터 DOM 조사 | `scripts/spike/shopping-competitor-dom.ts` (신규) | main session | 1h |
| T2-2.2 | 셀렉터 엔트리 신설 | `src/automation/selectors/shoppingCompetitorSelectors.ts` (신규, <150줄) | executor | 1h |
| T2-2.3 | 경쟁 제품 수집기 본체 | `src/crawler/competitorDataCollector.ts` (신규, <250줄) | executor | 4h |
| T2-2.4 | 가격 포지셔닝 문장 생성 유틸 | `src/content/pricePositioning.ts` (신규, <150줄) | executor | 2h |
| T2-2.5 | 체인드 Stage 3에 경쟁 데이터 주입 | `src/content/draftWriter.ts` 수정 | executor | 1h |
| T2-2.6 | 수집 실패 시 fallback(경쟁 데이터 없음 블록 생략) | `src/content/chainedGeneration.ts` | executor | 1h |
| T2-2.7 | 수집 단위 테스트 + 모킹 fixture 3건 | `tests/crawler/competitor.test.ts` (신규) | tester | 2h |

**롤백 조건**: 수집 성공률 50% 미만 -> 셀렉터 재조사 또는 flag OFF.

#### L2-3. 블로그 댓글·Q&A 통합 (REVIEW-001 P1 후속)

| Task | Description | File | Agent | Duration |
|---|---|---|---|---|
| T2-3.1 | REVIEW-001 `userVoice` 필드를 페르소나 단계에 주입 | `src/content/personaBuilder.ts` 수정 | executor | 2h |
| T2-3.2 | 댓글 기반 FAQ 섹션 자동 생성 | `src/content/faqBuilder.ts` (신규, <200줄) | executor | 3h |
| T2-3.3 | FAQ 섹션 프롬프트 | `src/prompts/affiliate/chain/faq.prompt` (신규) | executor | 1h |
| T2-3.4 | 댓글 없을 때 FAQ 스킵 분기 | `src/content/chainedGeneration.ts` | executor | 1h |
| T2-3.5 | 통합 테스트(댓글 5개 주입 시 FAQ 생성 확인) | `tests/content/faq-build.test.ts` | tester | 1.5h |

**선행 의존**: SPEC-REVIEW-001 P1 완료. 미완료 시 L2-3은 L3 단계로 이월.

#### L2-4. 상위 50개 벤치마크 수집

| Task | Description | File | Agent | Duration |
|---|---|---|---|---|
| T2-4.1 | 카테고리 목록 정의(쇼핑 주요 10개) | `scripts/benchmark/categories.json` (신규) | main session | 30min |
| T2-4.2 | 상위 블로거 수집 스크립트 | `scripts/benchmark/top-blogger-collector.ts` (신규, <250줄) | executor | 5h |
| T2-4.3 | 구조/분량/키워드 분석기 | `src/content/benchmarkAnalyzer.ts` (신규, <250줄) | executor | 4h |
| T2-4.4 | 분석 결과 저장 스키마(JSON) | `data/benchmarks/schema.md` | executor | 1h |
| T2-4.5 | 50건 초기 수집 실행 및 검증 | (스크립트 실행) | main session | 2h |
| T2-4.6 | 저작권 리스크 완화(원문 TTL 7일) | `src/content/benchmarkAnalyzer.ts` | executor | 1h |

**롤백 조건**: 수집 건수가 카테고리당 3건 미만으로 편중 -> 카테고리 정의 재조정.

### L3 - RAG + 트렌드 (3~4주)

#### L3-1. RAG 기반 성공글 참조

| Task | Description | File | Agent | Duration |
|---|---|---|---|---|
| T3-1.1 | 벡터DB 기술 선정 결정 기록 | `docs/decisions/D-2026-rag-vectordb.md` | main session | 2h |
| T3-1.2 | 벡터 저장 추상화 계층 | `src/rag/vectorStore.ts` (신규, <200줄) | executor | 4h |
| T3-1.3 | 임베딩 어댑터 | `src/rag/embedder.ts` (신규, <150줄) | executor | 3h |
| T3-1.4 | Retriever(top-5 유사 검색) | `src/rag/retriever.ts` (신규, <200줄) | executor | 4h |
| T3-1.5 | 벤치마크 50건 초기 임베딩 적재 | (스크립트) | main session | 2h |
| T3-1.6 | 체인드 Stage 3·5에 retrieval 결과 주입 | `src/content/draftWriter.ts`, `conversionOptimizer.ts` | executor | 3h |
| T3-1.7 | Retrieval 정확도 수작업 레이블 100건 작성 | `data/rag/eval-labels.json` | main session | 4h |
| T3-1.8 | Retrieval 정확도 측정 스크립트 | `scripts/rag/eval-accuracy.ts` | tester | 2h |
| T3-1.9 | Feature flag `RAG_RETRIEVAL_V1` | (전반) | executor | 1h |

#### L3-2. 실시간 트렌드·시즌

| Task | Description | File | Agent | Duration |
|---|---|---|---|---|
| T3-2.1 | 네이버 검색어 트렌드 수집(API 또는 크롤링) | `src/trend/trendCollector.ts` (신규, <200줄) | executor | 4h |
| T3-2.2 | 시즌 분기 판정 유틸 | `src/trend/seasonResolver.ts` (신규, <100줄) | executor | 1h |
| T3-2.3 | 체인드 Stage 3에 트렌드·시즌 주입 | `src/content/draftWriter.ts` | executor | 2h |
| T3-2.4 | 트렌드 캐시(6시간 TTL) | `src/trend/trendCache.ts` (신규, <100줄) | executor | 1h |
| T3-2.5 | 단위 테스트 5건 | `tests/trend/*.test.ts` | tester | 2h |

#### L3-3. 이미지-텍스트 생성 일관성 강화

| Task | Description | File | Agent | Duration |
|---|---|---|---|---|
| T3-3.1 | 본문 핵심 키워드 추출 | `src/content/keywordExtractor.ts` (신규, <150줄) | executor | 2h |
| T3-3.2 | 키워드 -> 이미지 프롬프트 매핑 | `src/image/promptBuilder.ts` (확장) | executor | 3h |
| T3-3.3 | 역검증(생성 이미지 설명이 본문 주장과 일치하는지) | `src/image/imageTextConsistencyChecker.ts` (확장) | executor | 3h |
| T3-3.4 | 불일치 시 재생성 또는 교체 로직 | `src/image/imageTextConsistencyChecker.ts` | executor | 2h |
| T3-3.5 | 일관성 테스트 시나리오 3건 | `tests/image/consistency.test.ts` | tester | 2h |

### L4 - 장기 (분기~연간)

#### L4-1. 편집자 LLM 퇴고 레이어

| Task | Description | File | Agent |
|---|---|---|---|
| T4-1.1 | 편집자 페르소나 프롬프트 설계 | `src/prompts/affiliate/chain/editor.prompt` | main session |
| T4-1.2 | 퇴고 레이어 본체 | `src/content/editorLayer.ts` (신규, <250줄) | executor |
| T4-1.3 | diff 로깅(원본 대비 변경률) | `src/content/editorDiff.ts` (신규, <150줄) | executor |
| T4-1.4 | 변경률 임계 초과 시 원본 유지 | `src/content/editorLayer.ts` | executor |
| T4-1.5 | A/B 체류시간 측정 파이프라인 | `src/monitor/engagementMetrics.ts` (확장) | executor |

#### L4-2. 전환 데이터 RLHF (프롬프트 튜닝)

| Task | Description | File | Agent |
|---|---|---|---|
| T4-2.1 | 클릭/전환 추적 수단 결정(애널리틱스 vs UTM pixel) | `docs/decisions/D-conversion-tracking.md` | main session |
| T4-2.2 | 전환 데이터 저장 스키마 | `src/monitor/conversionStore.ts` (신규) | executor |
| T4-2.3 | 성과 상위글 공통 패턴 추출 스크립트 | `scripts/rlhf/extract-patterns.ts` | main session |
| T4-2.4 | 프롬프트 개선 제안 자동 리포트 | `scripts/rlhf/prompt-review.ts` | main session |

#### L4-3. 브랜드별 톤 학습

| Task | Description | File | Agent |
|---|---|---|---|
| T4-3.1 | 계정별 과거 발행 글 벡터화 | `src/rag/brandEmbedder.ts` (신규) | executor |
| T4-3.2 | 계정별 페르소나 자동 갱신 | `src/content/personaBuilder.ts` (확장) | executor |
| T4-3.3 | 다계정 일관성 테스트 | `tests/content/brand-tone.test.ts` | tester |

## Rollout Strategy

1. **L2 단계적 공개**: `CHAINED_GEN_V1`을 OFF로 배포 -> 내부 테스트 1주 -> 전체 계정 10% 롤아웃 -> 2주 모니터링 -> 100%.
2. **L3는 L2 100% 롤아웃 이후 시작**. `RAG_RETRIEVAL_V1`은 별도 flag.
3. **L4는 L2/L3 운영 데이터 최소 3개월 축적 후**. 분기 단위로 재평가.

## Cost Estimation

| 단계 | 기존 대비 LLM 콜 증가 | 근거 |
|---|---|---|
| L2-1 체인드 | 3~5배 (stage 5개) | 각 stage 1 콜, 단 카테고리/페르소나는 캐시 히트 시 0.3~0.5배 감쇄 |
| L2-2 경쟁 수집 | +0.2배 | 추출 콜 1회 |
| L3-1 RAG | +0.1배 | 임베딩 콜(문서당 1회 영구 캐시) + retrieval 검색은 LLM 콜 아님 |
| L3-2 트렌드 | 무시가능 | API/크롤링만 |
| L4-1 편집자 | +1배 | 초안 완성 후 재평가 1콜 |
| **전체 예상** | **기존 대비 4~7배** | 상한을 `CHAINED_GEN_V1` flag로 통제 가능 |

완화 전략: (1) stage별 모델 등급 분리(초안=저렴, 퇴고=고급), (2) 카테고리·페르소나 캐시, (3) 월간 비용 상한을 `operationsDashboard`에 게이지로 노출.

## Feature Flag 체계

| Flag | 단계 | 기본값 | 목적 |
|---|---|---|---|
| `CHAINED_GEN_V1` | L2-1 | OFF | 체인드 파이프라인 활성 |
| `COMPETITOR_DATA_V1` | L2-2 | OFF | 경쟁 제품 수집 |
| `BENCHMARK_SEED_V1` | L2-4 | OFF | 벤치마크 기반 프롬프트 시드 |
| `RAG_RETRIEVAL_V1` | L3-1 | OFF | RAG 검색 주입 |
| `TREND_INJECT_V1` | L3-2 | OFF | 트렌드·시즌 주입 |
| `IMG_CONSISTENCY_V2` | L3-3 | OFF | 이미지 일관성 강화 |
| `EDITOR_LAYER_V1` | L4-1 | OFF | 편집자 퇴고 |
| `CONVERSION_RLHF_V1` | L4-2 | OFF | 전환 데이터 역반영 |
| `BRAND_TONE_V1` | L4-3 | OFF | 브랜드 톤 학습 |
