# 네이버 자동화 품질 P0 복구 결과

기준 감사: `docs/CONTENT_QUALITY_AUDIT_2026-09-22.md`. 릴리스 없음(코드 커밋만). 모든 수치는 2026-09-22 라이브 실행 로그·`generation-runs` 스냅샷에서 읽은 실측값이며, 추정 효과는 적지 않는다.

## 1. 커밋

| 해시 | 제목 | 파일 |
|---|---|---|
| `8f674457` | feat(source): 자료 파이프라인 문서화 — 건별 정제·관련도·신선도·출처 라벨·검색 상태 | 18 (+1,771 / −74) |
| `06fc9c55` | fix(postprocess): 후처리 비파괴화 — 출처 귀속 보존·결정론 휴머나이저·삭제형 스크러버 기본 OFF | 41 (+2,109 / −684) |
| `e44033f9` | fix(engine): 보조 호출 품질 티어 — 선택 엔진의 주 모델로, 재사용 캐시 키에 계정·일자 포함 (+ 구독 CLI 529 재시도) | 12 (+215 / −30) |
| `e4950782` | feat(quality): 생성 런 스냅샷 A~G + 파이프라인 무결성 게이트 + 절단/부분응답 계약 | 27 (+2,303 / −182) |
| (5번째) | test(quality): P0 회귀 테스트 + A/B 하네스 + 감사·복구 보고서 | `scripts/quality-ab-harness.cjs`, `docs/*` |

새 모듈: `src/content/{sourceDocument,sourceRelevance,sourceDocumentRender,sourcePipeline,searchStatus,attributionGuard,attributionEvidence,pipelineIntegrityGate,outputTruncation,postProcessTrace,structuredResponseContract}.ts`, `src/quality/{generationRunStore,generationRunTypes,generationRunResume}.ts`.
다른 세션의 미커밋 파일(`payment-page/sitemap.xml`, `spa/public/data/homefeed-stories.json`, `.claude/scheduled_tasks.lock`, 스크린샷·tmp)은 건드리지 않았고, `reset/checkout/clean` 은 실행하지 않았다.

## 2. 이전 파이프라인 (감사 기준)

```
검색(네이버 API) → 0건/429도 success:true
  → collectedText 한 덩어리("[자료 N — 제목]" 묶음, 출처 라벨 없음)
  → sourceNoiseFilter: 묶음 전체를 첫 "무단 전재/관련 기사" 마커에서 절단 (실측 29,099→7,992자, 73% 손실; 로그는 "껍데기 절단")
  → 지시문 ~10만자 : 자료 ~1만자 (9:1), "수치 없는 H2가 낫다" 4회
  → 본문 1콜 (MAX_TOKENS 잘림은 텍스트가 있으면 미감지 → jsonParser 8단 폴백이 제목만 남기고 "복구")
  → 후처리 21단: sanitizeContentFakeSources(모든 귀속 삭제) → 휴머나이저 strong(Math.random) → 상투구 임계 3 → selfCritique 4,500자 절단 → optimizer([A-Z]{5,}/할인 문장 삭제) → 팩트체크(gpt-4.1-mini, 문장 삭제 지시)
  → 발행 직전 정책 스크러버: source_materials 비면 숫자 문장 통삭제
  → 디스크 스냅샷 없음(A~D 전무), 로그에 "Grounding ON" 거짓 표기
```

## 3. 수정된 파이프라인

```
검색 → SearchStatus(SEARCH_OK|PARTIAL|EMPTY|RATE_LIMITED|BLOCKED) 반환, 0건/전건 크롤 실패는 success:false
  → SourceDocument[] (문서별 제목/출처/기관·매체/URL/게시일 KNOWN|UNKNOWN_DATE/신뢰등급)
  → prepareSourceMaterial: 문서별 꼬리 정제(60% 상한) → 관련도 채점 → 신선도(홈판 30일) → 출처 라벨 렌더
     로그: [SourcePipeline] raw_sources/raw_chars/clean_chars/removed_ratio/accepted/rejected(사유)/unknown_date
  → GenerationRun 생성: A-search-raw / B-research-input / C-final-prompt(instruction:source 자수) 저장
  → 본문 콜: 벤더·구독 에이전트 모두 body 모델 기록 + D-model-output 저장, finish_reason 절단 감지(Gemini/OpenAI 1회 예산 상향 재시도), 구독 CLI 529 → 15초 후 1회 재시도
  → jsonParser: 8단 폴백 제거(PartialResponseError), 1.5단 맨따옴표 이스케이프, structuredResponseContract 완성도 검사
  → 후처리 각 단계 recordPostProcessStep → E-postprocess-history(단계별 before/after 자수 + 삭제 문장)
     sanitizeContentFakeSources(evidence) 는 자료에 있는 귀속 보존 / 휴머나이저 light·결정론·숫자 보호 / 상투구 섹션 단위 / selfCritique 16,000자 / optimizer 삭제 규칙 제거 / 팩트체크 무수정 보고
  → pipelineIntegrityGate → AUTO_PUBLISH_OK | MANUAL_REVIEW (_generationIntegrity 부착)
  → F-final-before-publish 저장 → BlogExecutor: MANUAL_REVIEW/SOURCE_MATERIALS_MISSING 이면 발행 보류, 발행 시 G-published-payload
```

## 4. P0-1 자료 절단 BEFORE / AFTER (라이브, 같은 검색 결과에 옛 절단 로직 replay)

`scripts/quality-ab-harness.cjs --stage=source` (`tmp/quality-ab/2026-09-22T02-18-20-117Z/summary.md`)

| 키워드 | 검색 상태 | raw 자수 | BEFORE (옛 꼬리절단) | AFTER (새 파이프라인) | accepted/rejected | UNKNOWN_DATE | 라벨 문서 |
|---|---|---|---|---|---|---|---|
| 2026 청년도약계좌 조건 | SEARCH_OK | 29,891 | 9,634 (**32.2%**) | 23,201 (92.6%) | 6/2 | 0 | 6 |
| 청약통장 금리 | SEARCH_OK | 28,235 | 28,235 (100%) | 28,799 (98.7%) | 8/0 | 0 | 8 |
| 2026 셀토스 하이브리드 모의견적 | SEARCH_PARTIAL(뉴스 0건) | 28,513 | 28,513 (100%) | 23,630 (100%, 기각 2건 별도) | 6/2 | 0 | 6 |
| 변우석 텐텐 | SEARCH_OK | 25,301 | 6,750 (**26.7%**) | 12,418 (92.2%, 30일 신선도 기각 6) | 2/6 | 0 | 2 |
| 제주 10월 가볼만한곳 | SEARCH_OK | 25,635 | 25,635 (100%) | 21,233 (86.4%) | 7/1 | 0 | 7 |

- "AFTER 보존율"은 정제 손실만 잰다. 관련도/신선도 기각은 accepted/rejected 로 따로 센다(기각된 문서는 버려진 게 아니라 Writer 입력에서 제외된 것).
- 옛 로직은 문서 하나에 "무단 전재" 줄이 있으면 그 뒤 문서 전부를 잘랐다(청년도약계좌 68%·변우석 73% 손실). 새 로직은 문서마다 꼬리만 자르고 상한 60%.
- 초기 실행에서 뉴스 문서가 전부 UNKNOWN_DATE 로 나온 원인은 `fullTextCandidateOrder` 가 `pubDate` 를 버리던 것 — 수정 후 5키워드 unknown_date 0.

## 5. 검색 실패 처리

- `SearchStatus` 집계: HTTP 429 → `SEARCH_RATE_LIMITED`(EMPTY 보다 우선), 403/블록 → `SEARCH_BLOCKED`, 0건 → `SEARCH_EMPTY`, 일부 소스 실패 → `SEARCH_PARTIAL`. `naver/apiClient` 와 `sourceAssembler.collectContentFromPlatforms` 가 상태를 반환하고 0 URL·전건 크롤 실패는 `success:false`.
- 라이브 실측: 셀토스 뉴스(date) 0건 → `SEARCH_PARTIAL` 로 게이트 warn (`[SearchStatus] NAVER_NEWS(date): SEARCH_EMPTY (HTTP 200)`). 429/차단은 이번 실행에서 발생하지 않아 단위테스트(`searchStatus.test.ts`, `naverApiClientSearchStatus.test.ts`)로만 검증됨 — 라이브 429 재현은 미검증.
- 렌더러의 거짓 로그 "(최근 30일 이내 자료만 수집)" 제거 → `🔎 검색 상태:` 실제 값 출력.

## 6. 날짜 필터

- 네이버 API 는 날짜 필터를 지원하지 않는다(감사 확인). 대신 문서별 `pubDate` 를 `KNOWN|UNKNOWN_DATE` 로 라벨하고 `applyFreshnessPolicy` 가 홈판(homefeed)은 30일 초과를 `STALE` 로 기각, UNKNOWN_DATE 는 강등한다.
- 실측: 변우석 텐텐(홈판) 8건 중 6건 STALE 기각·2건 사용. SEO 모드는 기각 없이 라벨만.
- Writer 안내문: "UNKNOWN_DATE 자료의 시점을 '오늘/최근'으로 단정하지 않는다".

## 7. 출처 라벨 (Writer 입력 샘플, B-research-input)

```
※ 아래 [자료 Sxx] 번호표는 내부 식별자다. 본문에 'S01', '[자료 3]' 같은 번호표를 옮겨 적지 마라. 대신 실제 출처 귀속은 **적극적으로 써라**: '보건복지부 발표에 따르면', '기아 공식 가격표 기준', … 자료에 없는 기관·매체를 지어내지 않는다. UNKNOWN_DATE 자료의 시점을 '오늘/최근'으로 단정하지 않는다.

[자료 S06]
제목: 청년미래적금 2차 모집 대상, 소득 조건, 신청 방법(+ 청년도약계좌 갈아타기)
출처: 네이버 블로그
기관/매체: 네이버 블로그
URL: https://blog.naver.com/olivia446/224419421695
게시일: 2026-09-22 | KNOWN
자료 유형: blog · 신뢰 등급: BLOG
본문: …
```

남은 한계: 뉴스 문서의 기관/매체가 도메인(`sentv.co.kr`, `wikitree.co.kr`)으로만 잡힌다(매체명 매핑 없음).

## 8. 출처 귀속 보존 BEFORE / AFTER

- BEFORE(감사 P0-4): `sanitizeContentFakeSources` 가 모든 모드에서 "OO에 따르면/OO 발표" 문구를 삭제, 이어 `contentClaimSanitizer`·`materialNarrationStrip` 이 문장 통삭제.
- AFTER: `buildAttributionEvidence(source)` → `classifyAttributions(text, evidence)` 로 자료에 있는 기관·매체 귀속은 보존, 없는 귀속만 문구 단위 제거 + `_attributionReport{supported,unsupported,stripped}`.
- 라이브 실측(청약통장 금리 F-final): `국토교통부가 2026년 9월 21일 발표한 주거안정플랜에 청년드림청약통장 소득 기준을 연 5,000만원에서 7,000만원으로 높인다는 내용이 담겼습니다.` / `김이탁 국토교통부 제1차관은 이 플랜을 발표하면서 …` — 보존(E-history: `supported=22 unsupported=0 stripped=0`).
- 라이브에서 잡힌 오탐 2종(수정·테스트 고정, 4번째 커밋 이후 빌드에 반영):
  1. attributionGuard 가 맨 "`<X> 기준/자료`"를 귀속으로 오인 — 청년도약계좌 `"겹쳐서 기준"`(org="겹쳐서"), 변우석 `"만 8세 이상 기준으로"`(org="상") 를 잘라 문장이 깨짐 → 명시 꼬리(에 따르면/에서는)가 있을 때만 귀속.
  2. `stripInternalMarkers` 의 작성일 스탬프 제거가 문장 중간의 자료 시점까지 삭제 — 셀토스 `"기아 공식 가격표의 2026년 9월 1일 기준이고"` → `"기아 공식 가격표의 이고"` → 문장 첫머리 스탬프만 제거하도록 앵커.

## 9. 숫자 문장 보존 BEFORE / AFTER

- BEFORE(감사): 발행 직전 정책 스크러버가 `source_materials` 가 비면 숫자 문장 통삭제(`[Fidelity] 누락 샘플: 2025년 / 2023년 / 400만원 / 700억 / 5만명`). `contentOptimizer` 가 "N% 할인/무료 배송/최저가 보장/[A-Z]{5,}" 문장 삭제.
- AFTER: 삭제형 스크러버는 `CONTENT_POLICY_DESTRUCTIVE_SCRUB=1` 일 때만(기본 ADVISORY 보고), optimizer 삭제 규칙 제거, 휴머나이저는 숫자·날짜·%·인용·고유명사 보호 스팬.
- 라이브 실측 (마지막 Draft 본문 필드 → F-final, 콤마 정규화 숫자 기준):

| 키워드 | 숫자 문장 Draft→Final | 자료 유래 숫자 중 Final 소실 | 후처리 삭제 자수 | 후처리 삭제 문장 |
|---|---|---|---|---|
| 2026 청년도약계좌 조건 | 29 → 55 | 0 | 70 | 1 (오탐 ①, 수정됨) |
| 청약통장 금리 | 36 → 68 | 0 | 221 | 0 |
| 2026 셀토스 하이브리드 모의견적 | 49 → 89 | 0 (숫자) · 날짜 스탬프 오탐 ② 7곳 | 119 | 2 ("정리하자면" 오프너만 제거) |
| 변우석 텐텐 (홈판) | 6 → 9 | 0 | 207 | 6 (오탐 ①, 수정됨) |
| 제주 10월 가볼만한곳 | 54 → 101 | 0 | 150 | 0 |

- "Final 이 Draft 보다 숫자 문장이 많은" 이유: Draft 는 JSON 본문 필드만, Final 은 headings 렌더 + bodyPlain 두 표현을 모두 담는다.
- 핵심 숫자·기관 귀속이 Draft 에 있었는데 Final 에서 사라진 사례: 숫자 0건, 귀속·날짜는 위 오탐 2종(수정 후 단위테스트 고정; 변우석 재실행에서 미지원 귀속 0·삭제 문장 0 확인 — §15).

## 10. 소형 모델 개입 제거 (selected / actual)

- `resolveSelectedEngineRoute(generator, config, { tier: 'quality' | 'utility' })`: 설계도·소제목 보정·관통 판정·이슈 규율은 quality 티어 = 사용자 주 모델(openai→`resolveTextModelProfileForVendor`, claude→sonnet, gemini→`buildGeminiModelChain`), 쇼핑/URL 키워드 추출만 utility.
- 라이브 5편 `meta.actualModelsUsed`: 전부 `agent-claude / claude(구독)` — `blueprint(quality)`, `body`, `throughline-judge(quality)`, `side(agent-claude)`, `heading-repair(quality)`. 게이트 `NO_SILENT_MODEL_OVERRIDE=pass` 5/5.
- 로그 `[SideTask] blueprint: engine=claude(구독) tier=quality (selected=agent-claude)`.

## 11. Grounding requested / actual

- BEFORE: 로그 "Gemini grounding ON (강제)" 인데 `callGemini(useGrounding=false)`.
- AFTER: `const primaryDraftGrounding = false` 명시, meta `{groundingRequested, groundingActuallyUsed}` 는 `source.metadata.researchGrounding*` 실제 값. 라이브 5편 모두 `false/false`, 로그 `🧠 Grounding: OFF (본문 호출은 검색 도구 없이 나간다 — 2026-08-04 비용 정책) | research grounding requested=false used=false`.

## 12. JSON / MAX_TOKENS

- 절단: `isTruncatedFinishReason(provider, reason)` 을 비어 있지 않은 응답에도 적용. Gemini(`MAX_TOKENS`)/OpenAI(`length`)는 예산 1.5배(각 32,768 / 32,000 상한)로 1회 재시도, Claude/Perplexity 는 `OutputTruncatedError`. 라이브 5편 `outputTruncated=false`(구독 CLI 경로라 절단 재시도는 라이브 미검증).
- JSON: 8단 "제목만 남기는" 폴백 제거 → `PartialResponseError(PARTIAL_RESPONSE)`; 7단 정규식 재구성은 `__partial` 표시 → `jsonComplete=false` 경고. `STRUCTURED_CONTENT_SCHEMA` 는 selectedTitle 과 (introduction|bodyPlain) 누락만 치명.
- 라이브 제주 1차: 모델이 문자열 안에 맨 따옴표(`대표는 "제주의 술은…"라며`)를 써서 7단 전부 실패 → 예전이라면 8단이 제목만 남기고 발행, 지금은 정직하게 실패. 뿌리는 `tryFixJson` 의 따옴표 복구가 이스케이프 후 `inString` 을 닫아 홀짝이 뒤집힌 버그 + `smartCommaRecovery` 규칙 1-1 이 압축 JSON 의 `":"` 경계마다 쉼표 삽입. → 1.5단 `escapeStrayQuotesInStrings` 단독 재시도 추가, 실제 출력으로 파싱 확인(`✅ 1.5차 성공`), 재실행 AUTO_PUBLISH_OK.

## 13. Humanizer / Platitude / FactCheck 후처리 — 기존 vs 변경

| 단계 | 기존 | 변경 |
|---|---|---|
| Humanizer | 전 모드 strong, `Math.random`, 어미·숫자 무차별 치환 | 기본 **light**(설정·`HUMANIZER_INTENSITY` 로 strong), 결정론, 보호 스팬(숫자/날짜/%/인용/라틴/고유명사), `humanizeContentWithReport`. ※ 2026-07-30 "전 모드 strong" 지시를 뒤집음 — 사장님 확인 필요 |
| Platitude | 본문 전체 히트 ≥3 → 재생성, 일반 서술어(보통/일반적으로/흔히/대체로/다양한) 트리거 | 섹션 단위 히트, 일반 서술어 제외, MAX 5, `overlapTooLow` 만 재생성 트리거. 라이브 5편 재생성 트리거 0 |
| FactCheck | gpt-4.1-mini 고정, "문장 삭제" 지시, 8,000자 절단 무로그 | issues 계약 `{claim,status,issue,evidenceIds,suggestedCorrection}`, 기본 본문 무수정(`applyCorrections` 옵트인), 선택 엔진 caller, 절단 로그. 라이브 `applyPostDraftFactCheck` 5편 모두 0자 변화 |
| SelfCritique | 4,500자 절단 후 패치 적용(본문 뒤 25% 유실) | 16,000자, 초과 시 패치 미적용 + 범위 로그 |
| Optimizer | `[A-Z]{5,}`, "N% 할인/무료 배송/최저가 보장" 문장 삭제 | 삭제 제거, 로그만 |
| 정책 스크러버 | source_materials 비면 숫자 문장 통삭제 | `CONTENT_POLICY_DESTRUCTIVE_SCRUB=1` 옵트인, 기본 `ADVISORY_UNSUPPORTED_CLAIM`; `SOURCE_MATERIALS_MISSING` → manualReviewReasons(반자동 제외) |

## 14. Post-processing deletion 단계별 (라이브 청약통장 금리, E-postprocess-history)

```
removeDuplicateHeadings+RepeatedContent   9536→9450
headingPrefixStrip+optimizeHeadingsForMode 9441→9441
sanitizeContentFakeSources(evidence-aware) 9441→9441 (supported=18 unsupported=0 stripped=0)
filterExaggeratedContent                  9457→9451
humanize:light                            9451→9452
applyPostDraftFactCheck                   9452→9452
applyIssueDisciplineAudit                 9452→9452
optimizeContentForNaver                   9452→9452
stripAiConclusionOpeners+MaterialNarration 9396→9396
sanitizeStructuredContentClaims           9448→9448
```
셀토스 실행에서 추적 밖 구간(7169→7105, 8225→8173)이 드러나 `cleanEscape+stripInternalMarkers`, `removeEmojis+structureMarkers+tableBlocks`, `repairSentenceStyleHeadings`(모델 기록 포함) 3단계를 추가로 추적한다(4번째 커밋).

## 15. 5개 유형 실측 결과 (엔진: agent-claude 구독)

OpenAI 키는 크레딧 소진(`credit_balance_exhausted`), Codex 구독은 `rate_limited` 로 실행 불가 → 사장님 원칙(구독 경로 우선)대로 `--provider=agent-claude`.

| 키워드 | 모드 | 결정 | 모델(전 단계) | grounding | instr:source | 절단 | JSON | 미지원 귀속 | 후처리 단계 | 삭제 자수/문장 | 자료 숫자 소실 | 최종 자수 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026 청년도약계좌 조건 | seo | AUTO_PUBLISH_OK | claude(구독) | false/false | 4.51 (62,778:13,929) | ✗ | ✓ | 1(오탐) | 18 | 70/1 | 0 | 8,256 |
| 청약통장 금리 | seo | AUTO_PUBLISH_OK | claude(구독) | false/false | 3.33 (62,797:18,845) | ✗ | ✓ | 0 | 18 | 221/0 | 0 | 9,448 |
| 2026 셀토스 하이브리드 모의견적 | seo | AUTO_PUBLISH_OK (SEARCH_PARTIAL warn) | claude(구독) | false/false | 3.63 (61,388:16,901) | ✗ | ✓ | 0 | 18 | 119/2 | 0 | 8,193 |
| 변우석 텐텐 | homefeed | AUTO_PUBLISH_OK | claude(구독) | false/false | 8.54 (48,027:5,625) | ✗ | ✓ | 3(오탐) | 18 | 207/6 | 0 | 5,576 |
| 제주 10월 가볼만한곳 | seo | AUTO_PUBLISH_OK | claude(구독) | false/false | 3.95 | ✗ | ✓ | 0 | 18 | 150/0 | 0 | 9,950 |

- 1차 시도(`tmp/quality-ab-gen-claude5.log`)에서 4편이 상류 **529 Overloaded** 로 실패했는데 CLI 러너가 `nonzero_exit`(무재시도)로 뭉개고 봉투 JSON 을 300자에서 잘라 원인이 안 보였다 → `server_overloaded` 분류 + 봉투 `result` 노출 + 15초 뒤 1회 재시도(3번째 커밋). 재실행에서 529 3회 모두 재시도로 완주(`[AgentCli] claude server_overloaded — 구독 CLI 1회 자동 재시도`).
- 변우석 재실행(오탐 수정 빌드, runId `20260922-111828-d59y3v`): AUTO_PUBLISH_OK, 미지원 귀속 **0**, 후처리 삭제 문장 **0**(삭제 97자는 중복 소제목·과장 필터), 자료 숫자 소실 0, 추적 단계 21(새 3단계 포함), 최종 6,215자.

## 16. A~G 스냅샷 생성 확인

`%APPDATA%/better-life-naver/generation-runs/<runId>/` — 5편 모두 `A-search-raw.json, B-research-input.txt, C-final-prompt.txt, D-model-output.txt(시도별 append), E-postprocess-history.json, F-final-before-publish.txt, meta.json` 생성 확인 (runId: `20260922-092618-a7updt`, `20260922-101803-hx0pej`, `20260922-103511-q7i4rp`, `20260922-104940-neiyts`, 제주 `tmp/quality-ab/2026-09-22T02-04-05-905Z/results.json` 참조). `G-published-payload.json` 은 실제 발행 시 BlogExecutor 가 쓴다(이번엔 발행 안 함 → 미생성, 단위테스트로만 검증).

## 17. instruction:source 비율 변화

- BEFORE(감사 견적): 지시문 95,000~105,000자 : 자료 ~10,000자 ≈ **9:1**.
- AFTER 실측(C-final-prompt meta): SEO 3.33~4.51 : 1 (지시문 61,388~62,797자 : 자료 13,929~18,845자), 홈판 8.54 : 1 (자료가 신선도 기각으로 5,625자).
- 지시문 절감분은 프롬프트 다이어트(§13 base/geo-overlay/JSON 계약 문구)보다 자료가 3~18배 늘어난 효과가 크다. 지시문 자체는 여전히 6만 자 — P1 과제.

## 18. fact preservation 변화

- BEFORE(감사): 재료 19,293 → 본문 2,278자, fact 보존 43%; 원장 최근 10건 중 9건 `Source Fidelity` 경고.
- AFTER 실측: Draft→Final 자료 유래 숫자 소실 5편 0건(§9). Draft 자체의 자료 대비 반영률(Source→Draft)은 이번 범위 밖(모델 선택의 영역) — `factPreservationRate` 게이트 입력은 현재 `undefined`(pass) 로 남겨 두었다.

## 19. 자동 테스트 결과

- `npx vitest run`: **9,972 / 9,972 passed** (1,022 파일). 중간에 실패한 1건은 `blockingMitigationTop3.test.ts` 의 재시도 목록 소스 단언(529 추가로 갱신).
- `npx tsc --noEmit -p tsconfig.json`: 0 errors.
- `npm run build`: 성공. `npm run fingerprint:pin`: ✅ 일치(`31c57328…`). legacy-baseline ✅ 일치, attestation `5f1241f1…`.
- eslint(신규·변경 21파일): 0 errors / 2 warnings.
- 신규 테스트: `p0QualityRecovery`(24), `generationRunStore`(23), `sourceDocumentPipeline`, `sourceNoiseFilterBlocks`, `attributionGuard`(+맨 기준 오탐), `aiHumanizer`, `contentPlatitudeDetector`, `contentOptimizerLowQuality`, `claimRepairDestructiveScrub`, `publishInputReconcilerMaterialsRetention`, `jsonParserCompleteness`(+맨 따옴표), `structuredResponseContract`, `searchStatus`, `naverApiClientSearchStatus`, `retryCacheKeyScope`, `agentFailureMessage`(+529 봉투), `contentTextHelpersMarkers`(+문장 중간 시점 보존).

## 20. 남은 문제

1. **휴머나이저 기본 light** 는 2026-07-30 "전 모드 strong" 지시와 충돌 — 사장님 결정 필요(한 줄로 되돌릴 수 있음).
2. **SmartScheduler(`main.ts` ~1852)·다중계정(~5536) 키워드 경로**가 `rawText` 없이 `generateStructuredContent` 를 호출 → "원본 텍스트가 비어 있습니다" 실패 의심(기존부터). 이번에 손대지 않음, 별도 조사 필요.
3. 뉴스 문서 기관/매체가 도메인 문자열(매체명 매핑 없음). 관련도 채점이 토큰 겹침 기반이라 "청약통장 금리"에 서울 전세 기사(S01)가 accepted 로 들어옴.
4. 지시문 6만 자는 그대로(P1). Source→Draft 반영률(모델 압축)은 측정 항목만 있고 게이트 입력 미연결.
5. 라이브 미검증: OpenAI/Gemini/Perplexity 벤더 경로(크레딧 소진), 절단 재시도, 429/차단 SearchStatus, `CONTENT_POLICY_DESTRUCTIVE_SCRUB=1` 레거시, 실제 발행 시 G 저장·MANUAL_REVIEW UI 표시.
6. 하네스 4편 실패 원인이던 상류 529 는 환경 요인 — 재시도 1회로 충분한지는 더 봐야 한다.
7. 항목 22(키워드 출처)는 라벨 표기까지만(`LLM 확장 보조어 — 실제 연관검색어 아님`), 항목 29(Critic→Revision→Judge 루프)는 지시대로 미도입.

## 21. 다음 단계

1. 사장님 결정: 휴머나이저 기본 강도(light 유지 vs strong 복귀).
2. OpenAI 크레딧 충전 후 같은 하네스(`--provider=openai`)로 벤더 경로 절단 재시도·D 저장 확인 — 유료라 지시 시에만.
3. SmartScheduler/다중계정 키워드 경로 rawText 조사(별도 커밋).
4. 뉴스 매체명 매핑 + 관련도 채점에 제목/엔티티 가중.
5. 릴리즈는 라이브 반자동·전자동 발행 1회씩(MANUAL_REVIEW 표시 포함) 확인 후.
