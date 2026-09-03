# SPEC-BLUEPRINT-2026 — 실행 계획

## Phase 0 · 기준선 측정 (0.5일)
- 드라이버(`tmp/one-article-shopping.cjs`)로 홈판 10편 + SEO 10편 생성(GPT-5.6 Terra 기준, Gemini 3.6 · Codex 각 3편 보조).
- 로그 파서(`tmp/blueprint-baseline.cjs`)로 기록: 게이트 decision 분포, 재생성·패치 발화율, 프롬프트 길이, 인용 수, 도입부 상황 단서 통과, 곁가지 문단 수, 소요 시간.
- 산출: `.autopus/specs/SPEC-BLUEPRINT-2026/baseline.json` + 하네스 P30 기준선 표.

## Phase 1 · 설계도 모듈 (1일, 순수 함수 우선)
- `src/content/blueprint/blueprintSchema.ts` — 타입 + JSON 스키마(에이전트·API 공용).
- `src/content/blueprint/buildBlueprintPrompt.ts` — 재료·키워드·모드 → 프롬프트. 인용은 "재료 원문 그대로, 없으면 빈 배열", 사실은 "발췌 동봉", 제외 주제는 "키워드와 무관한 재료 덩어리".
- `src/content/blueprint/parseBlueprint.ts` — 파싱·검증: quotes 는 재료에 글자 단위로 존재해야 함(없으면 버림), facts.snippet 도 재료에 존재, 길이 상한, 필드 누락 시 부분 채택.
- `src/content/blueprint/generateBlueprint.ts` — `complete(prompt)` 주입, 타임아웃 20초, 실패 시 null. 로그 한 줄(`[Blueprint] 인용 n·사실 n·제외 n·소요 ms`).
- 테스트: 스키마 파싱 5건(정상·누락·조작·타임아웃·빈 재료), 프롬프트 계약 2건.
- 지문 매니페스트 등록.

## Phase 2 · 프롬프트 결합 (1일)
- `src/content/blueprint/materialFromBlueprint.ts` — 설계도 + facts.snippet 을 "사실 자료" 블록으로 조립(기존 `=== 사실 자료 ===` 형식 유지, 번호표·안내문 규칙 그대로). 원문은 facts 가 가리키는 문단만 발췌.
- contentGenerator 배선(최소): 생성 루프 진입 전 1회 `generateBlueprint` → 성공 시 source.rawText 대신 조립 블록을 프롬프트에 사용, 실패 시 기존 경로. `[PromptBuilder]` 로그에 프롬프트 길이 추가.
- 홈판·SEO 프롬프트에 설계도 사용 규칙 3줄: "readerSituation 으로 도입부를 시작, quotes 를 그대로 인용, offTopic 은 다루지 않는다". 규칙 추가는 이 3줄만(프롬프트 다이어트는 별건으로 분리).
- 계약 테스트 확인: finalize 반환 핀·V3 early return·지문·레거시 베이스라인(프롬프트 바이트 변경 → 재계산).

## Phase 3 · 필드 바인딩 (0.5일)
- `readerSituation` 소비: 도입부 첫 문장에 상황 단서(`SITUATION_CUES`)가 없으면 기존 도입부 패치(짧은 호출)에 readerSituation 을 넘겨 다시 쓰게 한다 — 이미 있는 `generateHomefeedIntroOnlyPatch` 에 인자 하나 추가.
- `quotes` 소비: 본문 인용 0 이고 설계도 quotes 가 있으면 삽입 보정(`quoteInsertionPatch`, 짧은 호출: 어느 문단 뒤에 어떤 발언을 넣을지 JSON) — 재생성보다 싸다. 실패 시 기존 Faithfulness 재시도 경로.
- 로그: `[Blueprint] 바인딩: 도입부 패치 n · 인용 삽입 n`.

## Phase 3.5 · 품질 최극한 모드 (0.5일, 사장님 제안)
- `configManager` 에 `qualityMaxMode?: boolean`(SENSITIVE 아님) + 설정 모달(priceInfoModal) 체크박스 1개, 문구: "품질 최극한 모드 — 추가 비용과 시간이 더 걸립니다. 대신 상위노출·홈판노출 가능성을 끌어올립니다."
- `geminiCostOptimizer.resolveContentGenerationCostPolicy` 에 `qualityMax` 플래그 → contentGenerator 에서 QUALITY_ATTEMPT_LIMIT +1, quality90 하드 목표, 소보정 항상, 최종 자기비평 1회, 설계도 항상(에이전트 포함).
- 생성 로그 첫 줄에 `품질 정책: max=ON` 과 예상 배수 표시. 렌더러 진행 문구에도 "최극한 모드: 시간이 더 걸립니다".
- 테스트: 정책 해석 3건(OFF 기본·ON·env 우선), 예산 계산 2건.

## Phase 4 · 효과 검증 (0.5일)
- Phase 0 과 같은 20편 재생성 → 발화율·인용·도입부·곁가지·길이·시간·비용 비교표(하네스 P30).
- 엔진 3종(GPT-5.6 Terra, Gemini 3.6 flash, Codex) 각 3편으로 엔진 간 편차 확인.
- 라이브: 사용자정의 1편 + 홈판 1편 발행 후 게이트 로그.

## Phase 5 · 마감
- 하네스 P30 결과, 릴리즈 노트(사장님 승인 시), 메모리 갱신.

## 위험과 대응
| 위험 | 대응 |
|---|---|
| 설계도가 틀린 축을 잡으면 본문이 그쪽으로 간다 | facts 에 원문 발췌 동봉 + 조작·근거 검사 그대로 통과 필수. 설계도 angle 은 키워드 질의를 벗어나면 폐기 |
| 원문 축소로 사실 누락 | Source Fidelity 보존율 측정 유지, 기준선 대비 하락 시 발췌 범위 확대 |
| god file 계약 테스트 충돌 | 새 모듈에 로직, contentGenerator 는 호출 3~4줄. 핀 라인 건드리지 않음 |
| 에이전트 엔진 시간 | 기본 생략(봉투가 분석 수행). 켜면 CLI 1회 추가(1~3분) — 30분 상한 안 |
| 비용 | 저비용 티어 라우트, 입력 30K자 상한, 통과 글 0 유지 |

## 롤백
- 설정 `blueprintStage=false` 또는 env `CONTENT_BLUEPRINT_STAGE=0` → Phase 2 배선이 기존 경로로. 모듈은 남아도 호출되지 않는다.

## 파일 (예상 크기)
- 신규: `src/content/blueprint/{blueprintSchema,buildBlueprintPrompt,parseBlueprint,generateBlueprint,materialFromBlueprint,quoteInsertionPatch}.ts` 각 80~200줄, 테스트 6개.
- 수정: `src/contentGenerator.ts`(배선 ≤10줄), `src/prompts/homefeed/base.prompt`·`src/prompts/seo/base.prompt`(3줄), `src/configManager.ts`(설정 1개), `src/contentQualityV3/candidateRuntimeFingerprint.ts`(등록), 레거시 베이스라인·attestation.

## 일정 요약
Phase 0~5 합계 약 3.5일(실측 대기 시간 포함). Phase 0 결과를 먼저 보고한 뒤 Phase 1 착수.
