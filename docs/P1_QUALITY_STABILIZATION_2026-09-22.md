# 네이버 자동화 P1 품질 안정화 결과

기준: P0 복구(`8f674457`~`127484e9`) 위에서 진행. 릴리스 없음. 모든 수치는 2026-09-22 라이브 실행(`generation-runs`·`tmp/quality-ab`)에서 읽은 실측값. Critic Loop 는 지시대로 구현하지 않음.

## 1. 커밋

| 해시 | 내용 |
|---|---|
| `1e8df71d` | feat(source): 관련도 v2 — 엔티티·본문 우선 채점, 주제별 신선도, 매체명, A2 랭킹 기록, 리서치 요약 |
| `6f0ff9bf` | feat(source): 모든 발행 경로 공통 Source Builder — SmartScheduler·다중계정 복구, SOURCE_EMPTY 게이트, 애매 자료 선택엔진 판정 |
| `cc1e3a9e` | fix(humanizer): DEFAULT = LIGHT 확정 — strong 은 config.humanizerIntensity 명시 선택만 |
| `e2ebd0bd` | fix(quality): selfCritique 전체 평가(구간 분할)·귀속 보존, 재사용 캐시 로컬 일자 버킷, 지문 핀 |
| `802eff39` | fix(source): 본문 밀도 관련도·수집 시점 사전검사·과거 자료 stale 유지·매체명 originallink |
| `e1757cae` | refactor(prompt): 다이어트 1차 — 중복 사본·죽은 텍스트·충돌 규칙 정본화, PROMPT_DRY_RUN 측정 게이트 |
| `7efe9c0c` | refactor(prompt): 다이어트 2차 — GEO 오버레이 정본 위임, ES 병합, OFFICIAL/SEO-90 한국어 우선순위 5줄 |
| (8번째) | fix(source): 여행/방법류 EVERGREEN 분류 + P1 보고서 |

다른 세션 파일(`sitemap.xml`, `homefeed-stories.json`, `scheduled_tasks.lock`) 미접촉, reset/checkout/clean 없음.

## 2. Humanizer — LIGHT 확정

- `config.humanizerIntensity?: 'light'|'strong'` (기본 light, 설정 파일 키로만 노출 — UI 항목 없음), `contentHumanizationPolicy` 결정 문서화, 호출부는 요청 필드 → config → 환경변수 순으로만 configured 전달. 모드로 strong 강제하는 코드는 소스 가드 테스트가 막는다(`contentPostGenerationIntegrity`).
- 2026-07-30 "전 모드 strong" 지침 폐기를 CLAUDE.md 에 기록. 어떤 강도에서도 숫자·금액·날짜·정책명·기관명·제품명·인물명·고유명사·직접 인용은 보호 스팬(`aiHumanizer.test` protected spans)으로 변경 금지.

## 3. SmartScheduler 경로

**원인(코드 추적)**: `main.ts prepareSmartScheduledContent` 가 `{ type:'keyword', value }` 만 만들어 생성기를 불렀다. 생성기는 `source.type` 을 어디서도 읽지 않고(`grep` 0건) rawText 가 없으면 `contentGenerator.ts` 진입 가드에서 "원본 텍스트가 비어 있습니다" throw → **항상 실패하던 죽은 경로**. 검색·정제·라벨은 렌더러 수동 경로만 수행.

**수정**: `content/generationSourceBuilder.buildKeywordGenerationSource` — 수집(검색 API 자격증명 순서·그라운딩 옵트인·얇은 자료 확장) → 0건이면 분해 재검색 1회 → `assembleContentSource`(sourceDocuments/searchStatus/realtimeCrawlRequested) → `SourceStatus`. 정책 컨텍스트 `source_materials` 에 실제 수집 문서 주입. SOURCE_EMPTY/PIPELINE_FAILED 는 `SourceEmptyError` → 발행 보류(MANUAL_REVIEW) 로그.

**실측(같은 함수 체인, `tmp/p1-paths-probe.cjs`)**: `2026 청년도약계좌 조건` → status=SOURCE_OK, docs 7, rawText 42,859자, policy source_materials 7 → run `20260922-141126-nhecxx` AUTO_PUBLISH_OK, A2 기록, 전 단계 claude(구독), 자료 숫자 소실 0, "서민금융진흥원 안내에 따르면" 귀속 보존.
※ 실제 스케줄러 트리거(앱 UI·로그인)는 헤드리스로 못 돌려 함수 체인 동일성만 검증.

## 4. 다중계정 경로

**원인**: 동일 — `{ type, value }` 만 전달. 키워드/URL 모두 rawText 없이 호출.
**수정**: 키워드 → 같은 `buildKeywordGenerationSource`; URL → 렌더러 URL 플로우와 같은 `assembleContentSource({ rssUrl })`. 정책 `source_materials` 에 수집 문서(전엔 키워드 문자열 자체). SOURCE_EMPTY 는 `manualReviewRequired` 결과로.
**실측(URL 체인)**: `https://n.news.naver.com/mnews/article/016/0002698122` → rawText 2,060 → run `20260922-141821-5l57l9` AUTO_PUBLISH_OK, 자료 숫자 소실 0. 이 실행에서 attributionGuard 오탐 1종 발견·수정(§7).

## 5. 공통 Source Pipeline — 경로별 비교

| 단계 | 수동(렌더러) | 홈판 | SmartScheduler | 다중계정 키워드 | 다중계정/렌더러 URL |
|---|---|---|---|---|---|
| 검색·수집 | `content:collectFromPlatforms` → `collectKeywordMaterials` | 동일 | `collectKeywordMaterials` | `collectKeywordMaterials` | `assembleContentSource(rssUrl)` 기사 크롤 |
| SourceDocument·cleaned·라벨·pubDate·URL·type | ✓ | ✓ | ✓ | ✓ | URL 모드: 단일 기사(문서 라벨 없음, 블록 정제만) |
| research input(리서치 요약+라벨 문서) | `prepareSourceMaterial` | ✓ | ✓ | ✓ | 레거시 문자열 경로 |
| source_materials(정책) | rawText 기반 | ✓ | 수집 문서 7건 | 수집 문서 | 기사 본문 1건 |
| SOURCE_EMPTY 게이트 | 생성기 진입 가드 | ✓ | 빌더 throw + 진입 가드 | 동일 | (기사 없으면 assemble 실패) |
| 무결성 게이트·A~G·A2 | ✓ | ✓ | ✓ | ✓ | ✓ |

남은 차이: URL 모드는 SourceDocument 구조가 아니라 레거시 문자열(자료 1건이라 관련도·신선도 대상 아님). 렌더러는 assembly 를 직접 조립(빌더와 같은 필드).

**SOURCE_EMPTY 실측**: 무의미 키워드 `zxqvw 없는키워드 9917` → 1차 0건 → 분해 재검색 → `SourceEmptyError` (Writer 미호출). 1차 실행에서 `SOURCE_PIPELINE_FAILED` 로 분류되던 것을 `SEARCH_EMPTY` 는 `SOURCE_EMPTY` 로 교정.

## 6. 관련도 개선 — BEFORE / AFTER

7성분(mainEntityMatch·mainKeywordMatch·intentMatch·freshnessScore·sourceQuality·titleRelevance·bodyRelevance) + 기각 사유(ENTITY_MISMATCH·BODY_IRRELEVANT·TOO_OLD·DUPLICATE·LOW_SOURCE_QUALITY·JUDGE_IRRELEVANT). 본문 600자 이상이면 본문 관련도(0.6)가 제목(0.2)을 이긴다. 본문 엔티티 신호는 밀도(1,000자당 2회=1.0)·위치(앞 30% 가산, 뒤 30% 단독 언급 0). 0.35~0.55 는 ambiguous → 선택 엔진 utility 티어 1회 배치 판정(judgeAmbiguousSources), 판정 모델은 A2 에 기록. 1차는 코드만, 모든 검색 결과를 LLM 으로 평가하지 않음.

**"청약통장 금리" 무관 기사 BEFORE/AFTER** (라이브 `tmp/p1-probe3.cjs`):

| 자료 | BEFORE(P0, 토큰 겹침) | AFTER 1차(밀도 전) | AFTER 최종 |
|---|---|---|---|
| 서울 아파트 전세 6억3000만원… (sentv) | ACCEPT | ACCEPT 0.71 (본문 "청약통장" 1회=bodyRelevance 1.0) | REJECT 0.32 BODY_IRRELEVANT |
| 119만호 공적주택 꺼낸 李정부 | ACCEPT | ACCEPT 0.73 | REJECT 0.41 |
| 2030년까지 공적주택 119만호 공급 (kdpress) | ACCEPT | ACCEPT 0.71 | REJECT 0.32 |
| 30억대에도 청약 최고 32대 1… 아파텔 | ACCEPT | ACCEPT 0.73 | REJECT 0.34 |
| 전국 1순위 청약 경쟁률 5.34대 1 | ACCEPT | ACCEPT 0.73 | ambiguous 0.53 → **judge=reject**(claude 구독) |
| 청약통장→종합저축 전환 1년 더 연장 | ACCEPT | ACCEPT 0.90 | ACCEPT 0.90 |

수집 시점 사전검사(`sourceRelevancePrecheck`)로 무관 기사가 8슬롯을 쓰지 않아 최종 8/8 통과(7 강한 관련 + 1 ambiguous). 후보 풀 6+8→8+10, 건당 2,500→3,200자, 총 18,000→20,000자.

## 7. 무관 기사 — 5개 실측(A2 사람 검토)

| 키워드 | 수집 | accepted | rejected(사유) | irrelevantAccepted(검토) |
|---|---|---|---|---|
| 2026 청년도약계좌 조건 | 7 | 6 | 1 LOW_SOURCE_QUALITY(자산 격차 칼럼) | 0 — 6건 모두 청년미래적금 갈아타기(후속 상품, 키워드 직접 언급) |
| 청약통장 금리 | 8 | 7 | 1 JUDGE_IRRELEVANT(청약 경쟁률, judge=reject) | **0** |
| 2026 셀토스 하이브리드 모의견적 | 7 | 7 | 0 | 1 경계("현대 2026 신형 아반떼 CN7" 0.77 — 셀토스 비교 언급) |
| 변우석 텐텐 (홈판) | 8 | 3 (원기사 1건 stale 유지) | 5 TOO_OLD(관련 2 + 무관 브랜드 기사 2 + GQ 1) | 0 |
| 제주 10월 가볼만한곳 | 7 | 6 | 1 TOO_OLD(**오기각** — 10월 행사 기사, 주제가 NEWS_ISSUE 로 분류) | 2 경계(제주 접근성 177곳·추석 행사) |

"청약통장 금리 → 서울 전세 일반기사" 류 명백한 무관 자료의 Writer 유입: **0건**. 제주 오기각은 여행/방법류 EVERGREEN 어휘 클래스 추가로 교정(8번째 커밋, `topicFreshness.test` 고정). 경계 3건은 엔티티가 실제로 본문에 반복되는 비교·연계 글이라 허용 가능한 수준으로 판단 — 임계 조정은 A2 누적 후.

## 8. 뉴스 매체명

`resolveSourceName({ url, originalLink, title, sourceType })` → `{ sourceName|null, domain }`. 뉴스 `originallink` 를 후보에 실어 원문 도메인으로 푼다(`sedaily.com`, `imaeil.com`, `biz.heraldcorp.com`, `starnewskorea.com` 실측). 매체명 테이블 32곳(`publisherDomains.ts`), 제목 꼬리(" - 연합뉴스") 추출, 추정 불가면 null → Writer 입력엔 "(미확인) · 도메인" — 지어내지 않는다. 남은 한계: 수집기가 도메인 문자열을 sourceName 폴백으로 넣어 A2 에 `wikitree.co.kr · wikitree.co.kr` 처럼 보임(이름 아닌 도메인이라 날조는 아님), 네이버 뉴스 페이지의 매체 로고 alt 는 미사용.

## 9. freshness 평가

`classifyTopicType`: POLICY(신청·지원·공고…)/CAR(견적·트림…)/EVERGREEN(가볼만한·여행·방법·추천·비교·후기·정리…)/NEWS_ISSUE(뉴스 비중>50% 또는 연도 토큰). 반감기 7/60/120/365일, 기각 30/365/540/∞일. 홈판은 NEWS_ISSUE 강제. 신선한 자료 3건 미만이면 관련도 ≥0.8 인 과거 자료를 stale 라벨("과거 자료 — 현재 정보로 취급 금지")로 유지 — 변우석 원기사 보존 실측. 실측 분류: 청년도약계좌 POLICY, 청약통장 EVERGREEN, 셀토스 CAR, 변우석 NEWS_ISSUE, 제주 NEWS_ISSUE→(수정 후) EVERGREEN.

## 10. Prompt 다이어트

측정: `PROMPT_DRY_RUN=1`(모델 호출 0) + `scripts/prompt-budget-report.cjs`. 인벤토리 `docs/PROMPT_BUDGET_2026-09-22.md`(블록표·중복 15테마·충돌 16쌍·저가치·재핀 대상).

| 모드 | BEFORE (P0 런) | AFTER (같은 키워드 dry-run) | 최종 5편 실측 |
|---|---|---|---|
| SEO instruction | 63,051 | **56,316** (−10.7%) | 52,777~54,305 |
| SEO 자료 | 18,591 | 21,163 | 17,344~26,979 |
| SEO instruction:source | 3.39 : 1 | **2.66 : 1** | 1.96 / 2.20 / 2.34 / 3.13 |
| 홈판 instruction | 48,275 | 49,211* | 47,826 |
| 홈판 자료 | 5,377 | 8,127 | 9,516 |
| 홈판 instruction:source | 8.98 : 1 | 6.06 : 1 | **5.03 : 1** |

\* 홈판 like-for-like 제거 ≈ −6.3K(홈판 제목 제약 −1,237·OFFICIAL −2,510·STYLE OVERRIDE #2 −1,684·TITLE −550·ANGLE −306)이나 총량이 는 이유: 카테고리가 연예 issue-story 로 풀려 `[주장·사실 규율]` 1,786자가 정당하게 들어오고(P0 인벤토리가 "빠져 있다"고 지적한 블록), 리서치 요약(자료 유래 ~1.3K)이 스크립트 정의상 지시문으로 계산됨.

**충돌 규칙 제거**: §4-1 귀속(H6 정본: 익명 전언 금지·실명 귀속 1~3곳, render·geo 가 같은 문구), §4-2 숫자(H5 "있는 숫자 그대로, 없을 때만 범용"), §4-3 서식(2열 표 허용, geo 표 금지 삭제), §4-9 첫 소제목 주어 강제 삭제, §4-11 "너는 오늘 날짜를 모른다" → todayIs 판정 기준, §4-16 temperature 죽은 텍스트. 우선순위 문장을 base 머리로. 영문 OFFICIAL/SEO-90 → 한국어 5줄.
**미완(정직)**: 홈판 제목 블록 8→1(−4.7K)·첫 화면 스펙 7→1(−3.2K)·CTA 6→1·자가점검·소제목 정본화 — pinned 테스트 10~15개(수백 단언)라 두 에이전트 모두 얕은 병합 대신 중단. **홈판 ≤4:1 미달(5.03:1)**, 일반 ≤3:1 은 5편 중 4편 달성(제주 3.13).
Writer 입력 순서(§7)는 `[원본 텍스트]` 마커 캐시 경계 때문에 이번엔 미이동 — 리서치 요약을 원문 앞에 두는 것까지만.

## 11. SelfCritique

16,000자 초과 본문을 통째로 건너뛰던 것 → 문단 경계 ≤12,000자·최대 3구간으로 전체 평가(B안), 부분 평가를 전체로 보고하지 않음. 검토 기준 5번의 "자료에 따르면/○월 ○일 기준 → 출처·날짜 메타 제거"가 P0 귀속 보존과 충돌 → 내부 토큰만 고치고 기관 귀속·자료 날짜·숫자·고유명사·인용은 불변. 여전히 옵트인(OFF).

## 12. JSON / truncation

정상 schema → 1.5단 맨따옴표 이스케이프 → 안전 repair → 재시도. 파싱 실패는 응답을 받은 뒤라 품질 예산 안에서 1회 재시도(구독 에이전트 포함), 불완전 JSON 에서 제목만 건지는 옛 동작 없음(`PartialResponseError`). 모든 경로가 같은 `generateStructuredContent` 를 타므로 OUTPUT_TRUNCATED/PARTIAL_JSON 은 어디서도 성공 처리되지 않는다. 5편 실측 truncated 0·json 완전 5/5.

## 13. Cache

`dateBucket` 이 UTC 날짜라 00:00~09:00 KST 가 전날 버킷 → 로컬 날짜로 교체(두 빌더 동일 표현식). 실제 키/캐시 함수를 샌드박스에서 실행하는 행동 테스트: 계정·로컬 일자·키워드·모드 4축 모두 miss, 같은 조건만 hit(`retryCacheKeyBehaviour.test`).

## 14. P0 회귀 여부 (5편 실측)

| 항목 | 결과 |
|---|---|
| 자료 절단 | 보존율 0.989 / 1.0 / 1.0 / 0.905 / 0.665(제주 — 블로그 chrome 정제, warn) — 옛 꼬리절단 재발 없음 |
| 출처 귀속 | unsupportedAttributions 5편 모두 [] (오탐 2종 추가 수정: 입장 마커·관점 명사) |
| 숫자 | 자료 유래 숫자 Draft→Final 소실 **0 / 5편**, 숫자 문장 52→98·45→81·49→92·6→7·44→85 |
| 모델 override | 전 단계 선택 엔진(claude 구독) 5/5, `source-judge(utility)` 도 기록 |
| grounding | requested/used false/false 5/5 (정직 표기) |

## 15. 5개 유형 결과 (최종 빌드, agent-claude)

| 키워드 | 유형 | 결정 | instr:source | 수집/accepted | 후처리 삭제 | 최종 자수 |
|---|---|---|---|---|---|---|
| 2026 청년도약계좌 조건 | 정책 | AUTO_PUBLISH_OK | 2.34 | 7/6 | 247자(소제목 재작성 4) | 9,918 |
| 청약통장 금리 | 금융 | AUTO_PUBLISH_OK | 2.20 | 8/7(judge 1) | 430자 | 10,489 |
| 2026 셀토스 하이브리드 모의견적 | 자동차 | AUTO_PUBLISH_OK(SEARCH_PARTIAL warn) | 1.96 | 7/7 | 161자 | 8,002 |
| 변우석 텐텐 | 연예(홈판) | AUTO_PUBLISH_OK | 5.03 | 8/3 | 55자 | 5,807 |
| 제주 10월 가볼만한곳 | 여행 | AUTO_PUBLISH_OK | 3.13 | 7/6 | 300자(소제목 10) | 9,336 |

## 16. 경로별 테스트

| 경로 | 방법 | 결과 |
|---|---|---|
| A 수동 키워드 | 하네스(collect→assemble→generate, 렌더러와 같은 필드) | 위 표 4편 |
| B 홈판 | 하네스 homefeed | 변우석 |
| C SmartScheduler | 같은 함수 체인 프로브 | §3 (앱 트리거 미검증) |
| D 다중계정 | 키워드=C 와 동일 체인, URL=§4 프로브 | §4 |
| E URL 입력 | `assembleContentSource(rssUrl)` | §4 와 동일 체인 |
| X SOURCE_EMPTY | 무의미 키워드 | Writer 미호출 |

## 17. 자동 테스트

`npx vitest run` **10,043 / 10,043** (1,030 파일), `tsc --noEmit` 0, `npm run build` OK, 지문 핀·legacy-baseline·attestation 일치, eslint 0 errors(신규 파일). 신규 테스트: generationSourceBuilder(8)·sourceRelevanceV2(21)·topicFreshness(15)·sourceName·generationRunStoreRanking·researchSummary(4)·sourcePipelineJudge(2)·retryCacheKeyBehaviour(5)·contentSelfCritique(+3) 등.

## 18. 남아 있는 문제

1. 홈판 instruction:source 5.03:1 — 제목 블록 8개·첫 화면 스펙 7개·CTA 6곳·자가점검 6개 병합 미완(§10).
2. Writer 입력 순서 재구성(CURRENT DATE → TITLE → INTENT → SUMMARY → DOCS → RULES → FORMAT)은 캐시 경계 유지 조건 때문에 미실시.
3. 관련도 경계 3건(셀토스 아반떼 비교, 제주 접근성·추석) — 허용 수준이나 임계는 A2 누적으로 조정.
4. 매체명: 도메인 폴백이 sourceName 자리에 들어감, 매체 테이블 32곳뿐.
5. SmartScheduler/다중계정의 실제 UI 트리거·발행(G 저장, MANUAL_REVIEW 표시)은 라이브 미검증.
6. OpenAI/Gemini/Perplexity 벤더 경로 미검증(크레딧 소진).
7. 제주 정제 손실 33.5%(warn) — 블로그 chrome 정제 규칙 검토.

## 19. 다음 단계 판단

**NEEDS_P1_FIX** (좁게): 홈판 프롬프트 2차 병합(§10 미완 5항목)과 입력 순서 재구성이 남았고 홈판 4:1 미달. 그 외 — 공통 파이프라인·SOURCE_EMPTY·관련도·매체명·freshness·selfCritique·JSON·캐시·P0 회귀 — 는 5편 실측으로 안정. 홈판 병합을 pinned 테스트 전수 Read 후 파일별로 끝내면 Critic → Targeted Revision → Verification → Final Judge 를 붙일 상태(READY_FOR_CRITIQUE_LOOP)가 된다.
