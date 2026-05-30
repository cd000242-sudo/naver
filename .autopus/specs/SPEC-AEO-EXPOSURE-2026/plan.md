# SPEC-AEO-EXPOSURE-2026 — 실행 계획 v2 (진단 우선)

> 원칙: 진단 우선 · 1릴리즈당 1~3 fix · 매 릴리즈 회귀검증 · 강제 아닌 자문 · opt-in 게이트 · silent 금지.

## Phase 0.5 — 누락 레벨 분리 진단 (최우선 게이트, READ-ONLY)
- 기존 `analytics/exposureChecker.ts`를 계정 자신의 과거 우량 글에 적용 → 계정 레벨 vs 글 레벨 판정.
- 발행 패턴 어뷰징 가설 점검(빈도/시간대/구조동형도/AI지문).
- **분기**: 계정 레벨 → SPEC-NAVER-PROTECTION-2026 에스컬레이션, 형식 트랙 보류. 글 레벨 → 아래 진행.
- BAN 위험: 라이브 네이버 측정은 R7 backoff + 사용자 동의 플래그 하에서만. 사용자 실행 필요.

## Phase 1 — 코드 조사 (완료)
좌표: `prompts/seo/base.prompt`(783줄), `validators/seo/*Scanner.ts`, `services/contentValidationPipeline.ts`,
`content/qualityEvaluator.ts`(weights 0.60/0.25/0.15; regenerate<60/patch<80/safety<50), `contentSelfCritique.ts`,
`contentGenerator.ts`(생성/검증/retry MAX_ATTEMPTS=2 network-only), `analytics/serpProbe|exposureChecker|exposurePoller`,
`monitor/operationsDashboard.ts`, `automation/selectors/remoteUpdate.ts`.

## Phase 2 — 진단/스키마 확정 (코딩 전)
- `aeo_rules.json` 스키마 = 기존 스캐너 결과 타입 1:1. **DEFAULT_AEO_RULES = 현재 하드코딩 바이트 일치**(R6).
- serpProbe baseline R7 필터 설계(슬롯 제거 + 코호트 매칭).

## Phase 3 — 구현 (릴리즈 분할, 안전 순서)

### R0 (이번 단계, 위험 0 — 파이프라인 미연결 순수 모듈)
- **반균질화 구조 유사도 스캐너** `src/validators/seo/structuralSimilarityScanner.ts` (<200줄, pure function).
  - 글 골격(H2 패턴/문단 길이 분포/도입 패턴) 해시 + 직전 글들과의 유사도 점수.
  - 발행 파이프라인 미연결(advisory). 단위 테스트만. 회귀 위험 0.
  - 근거: 비평이 지목한 "노출에 더 결정적 변수(어뷰징 동형성)"를 정면으로 다루며, 강제와 무관해 자해 위험 없음.

### R1 (위험 낮음 — 비차단 자문 스캐너)
- 미구현 4검사 추가(각<200줄, 기존 패턴): comparison/sourceFooter/imageRatio/curiosityHook + H2 60%비율.
- 전부 **soft-score/경고**. `contentValidationPipeline`에 등록(비차단). 처음부터 config(DEFAULTS) 읽기 → R2 이중작성 방지.

### R2 (위험 낮음 — 숫자만 외부화)
- `src/aeoRulesManager.ts`(로더, `publishedPostTracker` 패턴). 정규식은 코드 DEFAULT, 숫자만 JSON.
- no-op 체크리스트(R6) 충족 후 `npx vitest run src/__tests__/seoValidators.test.ts src/__tests__/qualityEvaluator.test.ts`.

### R3 (위험 높음 — 게이트, 단독 릴리즈, Phase 0.5 "글 레벨" 확인 후에만)
- Tier-1 신호만 게이트. 재작성은 기존 `contentSelfCritique` 재사용, max_retries=2.
- circuit-breaker(R5): 재작성률 임계 초과 → log-only + 가시 경보.
- 동반: `base.prompt` 50줄 미만 패치(Tier-1만 강제화).
- 회귀: vitest 전량 + lint + full-flow(단일+연속) + **Red-Green**(게이트 ON+실패 픽스처→재작성, OFF→무변화).

## Phase 4 — 1차 검증
- 5키워드 전/후 점수. 발행 글 기존 `exposurePoller` 등록.

## Phase 5 — 1주 후 실측 (별도 세션)
- exposurePoller 24/48/72h 수집 → operationsDashboard `SearchExposureMetrics` + naverSearchApi backoff(GAP D).
- AEO점수 vs 실측 노출 + 반균질화 지표 상관 → aeo_rules.json v1.1.

## 종료 조건
1. Phase 0.5 진단 산출. 2. R0 구현 + 단위테스트 GREEN + 회귀 무손상. 3. 사용자 OK로 R1~ 진입.

## 게이트 위반 시 중단
의도치 않은 수정 / 기존 테스트 추가 손상(기존 1건 제외) / base.prompt 50줄 초과 / 신규 의존성 / BAN 위험.
