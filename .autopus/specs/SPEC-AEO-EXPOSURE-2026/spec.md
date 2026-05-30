# SPEC-AEO-EXPOSURE-2026: 노출 회복 — 진단 우선 재설계 (v2)

**Status**: draft
**Created**: 2026-05-29
**Revised**: 2026-05-29 (v2 — 자가비평 2라운드 반영, 진단 우선으로 전면 재설계)
**Domain**: AEO / EXPOSURE
**Target Module**: better-life-naver (root, cross-module)
**Version Context**: v2.11.6 기준 (총 2434 vitest, 기존 1건 실패: licenseManagerRegression L5 — 무관)
**선행/관련**: SPEC-NAVER-PROTECTION-2026(계정 보호), SPEC-SEO-100, SPEC-REVIEW-001, SPEC-CONVERSION-001
**입력 문서**: "BLN 노출 회복 클로드 코드 명령 v2.0" (LEADERNAM/Soeng, 2026-05-29)

## 0. v2가 v1을 뒤집은 이유 (자가비평 결과)

v1 플랜(per-post AEO 9신호 강제 → 미달 시 재생성)은 적대적 비평에서 **부호가 반대일 수 있는 자해 구조**로 판명됐다.

- **인과 단절 (confidence high)**: "통합검색 누락"은 후보 풀 진입 실패다. 진입 게이트키퍼는 per-post 형식이 아니라 **계정 권위(C-Rank)/출처 신뢰/어뷰징 플래그**다. 형식 최적화는 "이미 풀에 들어온 글들의 순위 다툼"에서만 작동 — 누락은 그 이전 단계 문제다.
- **자동화 도구 역설 (confidence high)**: 이 앱은 자동화 발행 도구다. 5/7 누락의 1순위 용의자는 **발행 패턴이 어뷰징으로 감지된 것**. 9개 신호를 모든 글에 강제하면 글 골격이 동형화(template signature)되어 **어뷰징/자가표절 패턴을 키운다** → 노출을 올리는 게 아니라 깎을 수 있다.
- **cargo cult (confidence high)**: "비교표 1개 이상 강제 + 미달 시 재생성"은 LLM에 "표 만들면 통과" 보상을 줘 빈 표/동어반복 표를 양산. 네이버 저품질 필터의 학습 타깃을 자처.
- **D.I.A.+ 역설 (confidence high)**: 9신호 강제는 경험/독창성(D.I.A.+ 평가축)과 부분 적대적. 균질 격자가 1인칭 경험 서사를 밀어낸다.
- **오염된 baseline (confidence medium-high)**: serpProbe 상위10 무필터는 뉴스/플레이스/광고/인플루언서 권위 슬롯로 채워져 신생/부업 블로그에 재현 불가. 교란변수를 정답으로 역전파.

**결론: 진단 없는 처방을 멈추고, "누락이 계정 레벨인가 글 레벨인가"를 먼저 분리 진단한다. 형식 최적화는 글 레벨 문제로 확인된 뒤에만, 그것도 강제가 아니라 자문(advisory)+반균질화로 한다.**

## 1. 보고서/v1 주장 vs 실제 코드 (대조 — 유지)

| 주장 | 실제 코드 | 판정 |
|---|---|---|
| `seo_master_prompt_v1.md`(420줄) | `src/prompts/seo/base.prompt` 783줄 + 멀티레이어 6,349줄. F1~F6 게이트 + Section -1 + P-A~P-F | 불일치 |
| "검증기 없음" | `validators/seo/`(4스캐너)+`contentValidationPipeline`+`contentQualityChecker`+`qualityEvaluator`(pass/patch/regenerate)+`authgrDefense`, `contentGenerator:~700` 자동 invoke | 이미 존재 |
| `monitors/search_position.ts` | `analytics/serpProbe`+`exposureChecker`(노출 1~30위)+`exposurePoller`(24/48/72h, opt-in)+`naverSearchApi`+`serpHistory` | 신설 시 중복 |
| `config/naver_selectors.json` | `automation/selectors/`+`remoteUpdate.ts` | 신설 시 중복 |
| `config/aeo_rules.json` | userData JSON 패턴 존재 | 채택(조건부) |
| 9신호 강제 | 1완전/4부분/4미구현 | 강제 자체가 위험 → 자문화 |

## 2. 진단 우선 전략 (v2 핵심)

### 2.1 Phase 0.5 — 누락 레벨 분리 진단 (최우선, READ-ONLY, 신규)
형식 작업 착수 전 반드시 통과해야 할 게이트.

- 기존 `exposureChecker.ts`를 **계정 자신의 과거 글**에 적용: 5/7 이전에 노출되던 글이 지금도 노출되는가?
  - 과거 우량 글까지 누락 → **계정 레벨**(C-Rank/어뷰징) → 형식 패치는 무효. SPEC-NAVER-PROTECTION-2026로 에스컬레이션.
  - 신규 글만 누락, 과거 글 생존 → **글 레벨** → 형식 작업(자문) 정당화.
- 동시에 발행 패턴 어뷰징 가설 점검: 발행 빈도/시간대 균일도/구조 동형도/AI 지문(authgrDefense burstiness 재사용).
- 산출물: "계정 레벨 / 글 레벨 / 혼합" 판정 + 근거 데이터. 이 판정이 이후 Phase 진입 여부를 결정.

### 2.2 형식 검사는 강제가 아니라 2계층 (재설계)
글 레벨로 확인된 경우에만:

- **Tier-1 (게이트 적격, 고신뢰·저균질위험)**: 첫 200자 답변 존재, 출처 푸터 존재. 답변 적합성에 직접 기여하고 글 전체를 템플릿화하지 않음.
- **Tier-2 (soft-score/경고만, 절대 하드 강제 금지)**: 비교표, FAQ, H2질문형60%, 호기심후크, 이미지비율, 단락다양성. 강제 시 동형화 위험 → 점수·경고만, 자동 재생성 트리거 금지.
- **비교표 검사는 의미 인식 또는 자문 전용**: 셀 정보 중복도/신규 사실 포함 여부를 보되, 신뢰 판정이 어려우면 advisory. 표 삽입 목적의 자동 재생성 금지.

### 2.3 반균질화 가드 (신규, 노출에 더 직결되는 변수)
- 계정의 최근 N개 글 **구조 골격 유사도**(H2 패턴/문단 분포/도입 패턴 해시) + authgrDefense burstiness를 추적해 **동형성에 페널티**. 자동화 어뷰징 패턴을 능동적으로 줄인다.
- 이는 비평이 지목한 "노출에 더 결정적인 변수(어뷰징 플래그)"를 직접 겨냥.

## 3. 진짜 갭 (재정렬)

- **GAP 0 (신규·최우선)**: 누락 레벨 진단 부재. 계정 vs 글 분리 없이 형식 처방 중.
- **GAP A**: 검증기가 발행을 게이트 안 함(`qualityEvaluator` regenerate 미연결). → **새 regenerate 대신 기존 `contentSelfCritique` 경로 재사용/확장**(이미 피드백 재작성 수행, feedback_loop은 few-shot 주입이라 별개).
- **GAP B**: AEO 검사 4개 미구현 — 단, **자문/soft-score로** 추가(강제 아님).
- **GAP C**: 임계값 하드코딩 → 숫자만 `userData/aeo_rules.json` 외부화(정규식은 코드 DEFAULT 유지).
- **GAP D**: `exposurePoller`→`operationsDashboard` 미연결 + `naverSearchApi` backoff 없음.
- **GAP E (신규)**: 반균질화 가드 부재.

## 4. 요구사항 (EARS)

- **R1**: `aeo_check.ts` 모놀리식 신설 금지. 검사는 기존 `validators/seo/*Scanner.ts` 패턴(파일당<200줄), `contentValidationPipeline`에 등록.
- **R2**: `monitors/search_position.ts`, `config/naver_selectors.json` 신설 금지. 기존 `analytics/exposure*`, `selectors/remoteUpdate` 재사용.
- **R3 (전면 강화)**: 어떤 형식 검사도 **Phase 0.5 진단에서 "글 레벨" 확인 전에는 발행을 게이트하지 않는다.** 게이트는 Tier-1 신호로 한정, opt-in 플래그(기본 OFF).
- **R4**: 게이트의 재작성은 기존 `contentSelfCritique`를 재사용, `max_retries=2` 하드 가드.
- **R5**: circuit-breaker — 롤링 N개 글에서 재작성률이 임계 초과 시 자동 log-only 폴백 + **가시적 경보**(대시보드+UI). silent 금지(feedback_no_fallback).
- **R6**: `aeo_rules.json`은 `userData/aeo_rules.json`, 부재 시 `DEFAULT_AEO_RULES` 폴백. **DEFAULT는 현재 하드코딩과 바이트 일치**, 스캐너 `rules` 파라미터는 optional, 정규식은 코드 유지.
- **R7**: serpProbe baseline은 **슬롯 타입 필터(뉴스/플레이스/광고/지식인 제외) + 코호트 매칭(유사 지수/운영기간)** 후 형식 변수만 추출. 표본 부족 시 통계검정력 한계를 보고하고 advisory로만 사용.
- **R8**: 9신호 동시 강제 금지(균질화 방지). Tier-2는 점수/경고만.
- **R9**: 매 릴리즈 1~3 fix, git diff 독립검증 + vitest 전량(2434, 기존 실패 1건 제외 회귀 없음) + lint + (god file 영역) full-flow.
- **R10**: Phase 5 실측 전 추정 효과 카피 금지(feedback_no_speculation).

## 5. KPI / 정직한 한계

- 진짜 KPI: `exposurePoller` 24/48/72h 실측 노출 위치 + 계정 단위 노출 분포 변화.
- 검증기 점수는 보조 지표일 뿐. 형식은 노출의 필요조건도 아닐 수 있음(계정 레벨이면 무효).
- 자동화 도구 특성상 **균질화가 역효과** — 반균질화 지표를 동등 비중으로 추적.
- 메이트 선정·AI 브리핑 인용은 다축 평가라 자동화 보장 불가.

## 6. 사용자 결정 (2026-05-29)

- Phase 0 데이터: serpProbe baseline 대체(단, R7 필터 적용).
- 진행: /goal 활성 — 플랜을 자가비평 반복으로 완성 후 검증된 다음 단계 착수, 전 테스트 통과.

## 7. 비목표

- 외부 유입 설계 별도 SPEC. 계정 권위 회복은 SPEC-NAVER-PROTECTION-2026 소관(본 SPEC은 진단으로 라우팅만).
