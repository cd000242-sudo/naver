# 자동화 품질 감사 결과

- 감사일: 2026-09-22 · 기준 코드: v2.11.294 (`d9e8dd32`) · 코드 변경 없음(READ-ONLY)
- 방법: 8개 병렬 조사(모델 인벤토리 / 검색·크롤링 실행 / 연관어 출처 / 정제·절단 / 프롬프트 조립·구조 / 캐시·동시성·재시도·JSON / 런타임 로그·원장 / 후처리 체인) + 핵심 발견은 본 감사자가 소스와 실제 로그로 재검증
- 표기: **CONFIRMED** = 코드·로그·실행으로 확인 / **SUSPECTED** = 정황 추정
- 런타임 증거: `%APPDATA%\better-life-naver\logs\main-2026-09-20/21.log`, `content-quality-ledger.jsonl`, `content-policy-audit.jsonl` (최근 3편: "타짱 암 투병 사망", "줴줴이야 뜻", "피차몬 도핑 양성")

---

## 0. 한 줄 결론

**모델이 나쁜 게 아니라, 모델에게 도달하기 전에 자료의 최대 73%가 버려지고(절단), 도달한 자료는 출처를 알 수 없는 한 덩어리이며(정제), 10만 자 지시문이 "숫자를 쓰지 않는 쪽이 안전"하다고 가르치고(프롬프트), 나온 글은 정규식·소형 저온도 모델 21단계가 근거 표현을 깎아내고(후처리), 발행 직전 정책 스크러버가 숫자 문장을 통삭제(정책)한다.** 최근 3편 모두 프리미엄 모델(`gpt-5.6-terra`)이 성공 응답했고 폴백·429·MAX_TOKENS는 0건이었다 — 품질 손실은 API 장애가 아니라 파이프라인 구조에서 발생한다.

---

## 1. 현재 실제 생성 파이프라인 (코드 기준)

```
[렌더러] contentGeneration.ts:1188 useRealtimeCrawl(기본 ON)
   │  window.api.collectContentFromPlatforms(query, {maxPerSource:10})  ← 30초 타임아웃
   ▼
[S1 SEARCH+CRAWL] sourceAssembler.collectContentFromPlatforms :7894
   ├ collectNaverSearchContent :1550   네이버 API blog30/news20/webkr10 스니펫(desc ≈ 60~230자)
   │    └ naverSearchResponse :57 → naver/apiClient  (HUB 키 미입력 → 전량 레거시 키)
   ├ collectTopArticleFullTexts :1708   news sim4+date6 · blog sim8+date8 → fetchArticleContent
   │    · 편당 2,500자 컷(:1819) · 총 18,000자(:1772) · 8편 · 20초 예산
   │    · cheerio 셀렉터 → cleanText(:2029) → \s+→' ' 로 줄바꿈 전부 소실(:2069)
   ├ [1.5순위] m.search.naver.com HTML (API 키 없을 때만) :8008
   ├ [1.7순위] Gemini Grounding (옵트인) :8072  /  [2순위] rssSearcher 9소스 :8096
   └ 0건·429·차단이어도 { success:true, collectedText:'' } :8104~8117, :8216~8222
   ▼
[렌더러] baseText = crawledText (무절단) / draftText = 10,000자 컷 :1360~1363 (draft는 본문 프롬프트에 안 들어감)
   ▼
[S2] main.ts:6069 automation:generateStructuredContent → assembleContentSource :6867
   → source.rawText = "[자료 등급] + === 사실 자료 === + [자료 1~8] + === 검색 결과 스니펫 ===" 단일 문자열
   ▼
[S2.5 NOISE CUT] contentGenerator.ts:8771 stripSourceNoise(rawText)
   → sourceNoiseFilter.cutTrailingChrome :209  ★ 경계 정규식이 존재하지 않는 옛 머리글만 인식
   → 첫 "무단 전재/관련 기사" 마커에서 자료 2~8 + 스니펫 전체 절단  (실측: 29,099 → 7,992자)
   ▼
[S3 BLUEPRINT] generateBlueprint (기본 ON, affiliate 제외)  — LLM 1콜, 저가 모델 고정
   paraphraseAnalysisHandlers.ts:16~18  gpt-4.1-mini / claude-haiku-4-5 / gemini-3.1-flash-lite
   · 재료 30,000자 컷 · 4096 토큰 · 45초 · 실패 시 무음 생략(generateBlueprint.ts:68~73)
   · 산출: angle/readerSituation/quotes≤5/facts≤10/skeleton/offTopic/centralEvent → 산문으로 재직렬화
   ▼
[S4] trendAnalyzer 검색량/문서량 :6457
   ▼
[S5 PROMPT] buildModeBasedPrompt :2763~3201  — {{var}} 치환 아님, 조건부 블록 concat 20여 단계
   system ≈ 23,000자(base 35KB + 오버레이 9종) + user ≈ 7,000자(JSON 스키마·계약) + 설계도 + rawText
   지시문 총 95,000~105,000자 vs 자료 ~10,000자  (지시:자료 ≈ 9:1)
   ▼
[S6 WRITE] 단일 콜 :6616~6647  — 제목·후보3·preWritingAnalysis·소제목·본문·표·마무리·해시태그가 한 JSON
   본문 모델 = 사용자 선택 1:1 (폴백 없음) · Gemini grounding 하드코딩 false(:3776)
   · finishReason/finish_reason 은 응답이 "비어 있을 때만" 검사(:3937, :4678)
   ▼
[S7 PARSE] jsonParser 8단 복구 — 8차는 {"selectedTitle":…} 한 필드만 돌려도 "성공"(jsonParser.ts:463~482)
   ▼
[S8 POST-PROCESS ×21, legacy 전부 ON]
   A2/A3 중복 소제목·문단 통삭제 → A6 소제목 앞 인명 제거 → A7 소제목 어미 삭제
   → A10 sanitizeContentFakeSources (모든 모드 무조건: "…에 따르면/보도/기사/원문" 귀속 삭제) :7100
   → C PlatitudeDetector("~할 수 있습니다" 4회 → 유료 전체 재생성) :7472
   → D5 humanizeContent(strong 고정, Math.random 30% 동의어 치환, 강조어 삭제) :7817
   → D6 applyPostDraftFactCheck (auto ON, 저가 모델, "그 문장을 삭제하라" 지시) :7834
   → D7 applyIssueDisciplineAudit (ON, 단정→"주장했다") :7845
   → D8 optimizeContentForNaver (LOW_QUALITY_2025: /[A-Z]{5,}/·"N% 할인" 무로그 삭제) :7882
   → E QualityGate → regenerate(1회 유료) / patch(selfCritique 강제, 0.2온도, 4,500자 컷) :8124~8190
   → F0 headingStyleRepair (플래그 없음=항상, 저가 모델이 소제목을 명사구로 재작성) :1411
   → F1 stripAiConclusionOpeners · stripMaterialNarration(문장 통삭제) :1459~1467
   → F6 sanitizeStructuredContentClaims("공식 가이드에 따르면" 삭제) :1820/:1930
   ▼
[S9 PUBLISH] BlogExecutor.ts:815 prepareContentPolicyForPublish
   → qualityGate.unsupportedClaims: 근거(business_facts+source_materials)와 대조해 숫자 문장 삭제
   → 면제는 semi_auto_manual 뿐. SmartScheduler(main.ts:1847~1853)·다중계정 URL모드(:5527~5540)는 source_materials=[]
   → 빈 제목/소제목엔 "… 확인 가이드" / "핵심 내용부터 살펴보기" 주입 (claimRepair.ts:46~107)
```

**구조 판정**: 설계도 1콜 + 본문 **단일 콜(Single-shot)** + 정규식/소형모델 후처리. `chainedGeneration`(stage 3~5 placeholder, 기본 OFF), `editorLayer`(호출자 0), `selfCritique`(기본 OFF, 단 QualityGate patch 시 토글 무시 강제), `faqBuilder`(호출자 0). "다단 파이프라인"은 스캐폴드만 존재한다. — CONFIRMED (`content/chainedGeneration.ts:7~9,66,146`, `promptLoader.ts:1263~1275`)

---

## 2. 사용 중인 실제 모델 (단계별)

| 단계 | provider/모델 (실제 문자열) | 선택 방식 | temp | maxOut | tools/검색 | 재시도 시 변화 | 폴백 |
|---|---|---|---|---|---|---|---|
| **본문** | 사용자 선택 1:1 — `gemini-3.6-flash`(기본)/`gpt-5.6-luna·terra·sol`/`claude-fable-5·sonnet-5·haiku-4-5`/`sonar`/구독 CLI | `primaryGeminiTextModel` → `defaultAiProvider` | seo 0.5 · homefeed 0.7 · custom 0.7 · mate 0.45 (`contentTemperaturePolicy.ts:2~8`) | Gemini 16384/12288/8192 · OpenAI `min(8192, max(2048, minChars×1.7))`(+reasoning 12k) · Claude 16384/8192 · Perplexity 8192 고정 | **Gemini grounding 하드코딩 OFF**(:3776) · OpenAI web_search는 `openai-gpt4o-search` 셀렉터일 때만(JSON 모드 불가) · Claude 검색 없음 · Perplexity 내장 | 모델·재료 불변, **지시문 누적 증가**, 빈 응답 시 "핵심만 간결하게" 축소 지시 +temp 0.1 | **없음** (single-submission 기본) |
| **설계도(Blueprint)** | **`gpt-4.1-mini` / `claude-haiku-4-5-20251001` / `gemini-3.1-flash-lite`** 고정 | `resolveSelectedEngineRoute` (`paraphraseAnalysisHandlers.ts:16~18,155~181`) | Gemini 0.2, OpenAI/Claude 미지정(=벤더 기본 1.0) | 4096 | 없음 | 없음 | 실패 시 **단계 생략** |
| 관통 판정 / 인용 삽입 패치(본문 직접 수정) / 페러프레이즈 분석 / 소제목 재작성(headingStyleRepair) / 이슈 규율 감사 | 위와 동일 저가 모델 | 동일 | 동일 | — | 없음 | — | fail-open |
| 팩트체크(auto) | **키 존재 순서 openai→gemini→claude** — 사용자 선택 무시 (`factCheckRouter.ts:203~218`) | 하드코딩 | gemini 0 | 2048 | `gemini-grounding` 명시 선택 시만 googleSearch | — | 벤더 교차 |
| 제목 | 본문과 동일 (`subWorkProvider='same'` 기본). 별도 제목 콜(`generateTitleOnlyPatch`)은 `CONTENT_ALLOW_PAID_POST_GENERATION_REPAIR` 플래그 — 코드 주석상 "프로덕션 미설정" | — | 0.7+attempt×0.05 | ~1200 | — | 공식·피드백 추가 | — |
| 홈판 도입부 패치 | 본문과 동일 | 기본 OFF(비용절감) | **0.9** | 450 | — | — | — |
| selfCritique / QualityGate patch / 루브릭 | 본문과 동일 (`callSelectedProviderForQualityRepair`) | patch 시 강제 | **0.2** | body 1500~4500 | — | — | — |
| 리서치(옵트인) | perplexity `sonar` / gemini `gemini-3.6-flash`+googleSearch | 옵트인 | 0.3 | 4096/8000 | ON | — | — |
| Content Quality V3 | `gemini-3.1-flash-lite` 핀 고정 (`providerPolicy.ts:3,19~23`) | 활성화 매니페스트 비어 있음 → **프로덕션 미사용** | — | — | — | — | — |

**실측 (main-2026-09-21.log)**: `[ContentGenerator] 사용 엔진: openai` → `[OpenAI] GPT-5.6 Terra (balanced) — 폴백 없음` → `CHAT_RESPONSE_OK model=gpt-5.6-terra promptTokens=65576 cachedTokens=0 completionTokens=5961` / `[Blueprint] 📐 엔진 gpt-4.1-mini · 재료 2255자`. 3편 모두 폴백·429·403·MAX_TOKENS·JSON 파싱 실패 **0건**. `cachedTokens=0` (프롬프트 캐시 미적중).

질문별 답:
1. UI 선택 ↔ 실제 모델: **본문은 1:1**. 보조 단계 4건 드리프트 — `gpt-4.1-mini`는 레지스트리(`OPENAI_TEXT_MODELS.GPT_41_MINI = gpt-5.6-luna`) 밖 하드코딩(로그상 아직 응답은 됨); 설계도/팩트체크는 `config.geminiModel`, 본문은 `primaryGeminiTextModel` — 설정 모달이 두 키를 따로 저장(`settingsModal.ts:464~466`); `-pro` 포함 모델명은 `gemini-3.1-flash-lite`로 강등(`geminiTextModelNormalization.ts:60~65`); `AVAILABLE_MODELS` 표시명 "3.5 Flash" ↔ 실제 `gemini-3.6-flash`(`gemini.ts:75`).
2. 저가 모델 강제 단계: **설계도·관통판정·인용패치·소제목 재작성·이슈규율감사·팩트체크·페러프레이즈 분석·이미지 검색어** — 사용자가 Sol/Fable을 골라도 전부 mini/haiku/flash-lite. 이 중 **설계도(본문 재료)·인용패치·소제목 재작성·팩트체크는 본문 텍스트에 직접 영향**.
3. 조용한 다운그레이드: 모델 전환은 없음. 대신 ① 팩트체크 벤더 교차 ② 빈 응답 시 분량 축소 지시 ③ 설계도/판정/팩트체크 실패 시 무음 생략.
4. 그라운딩/웹검색: 기본 설정 본문 생성에서는 **없음**. 검색은 앱 크롤러/네이버 API 뿐.
5. 스트리밍: Gemini 본문만. **MAX_TOKENS 잘림은 텍스트가 조금이라도 있으면 미감지** → jsonParser 8단 복구로 위장.

---

## 3. 치명적인 문제 (품질에 직접, 런타임 증거 있음)

### P0-1. 자료 묶음이 "사이트 껍데기"로 오인되어 통째로 절단된다 — CONFIRMED (코드+로그)
- `src/content/sourceNoiseFilter.ts:207` `SUPPLEMENT_BOUNDARY = /---\s*참고 자료|===\s*상위 노출 글 본문 발췌/` — 두 번째 머리글은 코드베이스에 더 이상 존재하지 않는다. 실제 머리글은 `sourceAssembler.ts:1892` `=== 사실 자료 (수치·조건·절차는 이 범위에서만 사용) ===`.
- 경계를 못 찾으면 `cutTrailingChrome`(:209~226)이 [자료 1] 안의 "무단 전재/관련 기사/최신 뉴스" 한 줄에서 **뒤를 전부 자른다** (조건: 400자↑ & 전체의 25%↑).
- **로그 실측** `main-2026-09-20.log:10318~10428` ("타짱"): `baseBody=29099자` → `[SourceNoise] 본문 뒤 사이트 껍데기 21106자 절단` → `rawText=7992자`. 자료 **73% 손실**. 이어 `[Fidelity] 누락 샘플: 2025년 / 2023년 / 400만원 / 700억 / 5만명의`.
- URL 모드는 `--- 참고 자료`가 붙어 보호됨. **키워드 모드(SEO·홈판 대부분)만 뚫려 있다.** 로그 문구가 "껍데기"라 손실로 보이지 않는다.

### P0-2. 검색 0건·429·차단이 성공으로 통과되어 키워드만으로 생성된다 — CONFIRMED (코드+실행)
- `sourceAssembler.ts:8104~8117` URL 0건 → `success:true, collectedText:''`; `:8216~8222` 크롤 전부 실패 → `success:true // ✅ 성공으로 처리하여 AI 생성 진행`; `:801~804` HTTP 4xx/5xx → `return results`(빈 배열, throw 없음). 렌더러 `contentGeneration.ts:1274~1277`는 300자 미만이면 경고 토스트만 띄우고 진행.
- 실행 실측: `"2026 셀토스 하이브리드 모의견적"` news **0건**, blog 8건 중 2/3 주제 이탈("거래대금 상위주 TOP30", "아반떼"). 그대로 진행된다.
- 429는 `apiClient.ts:172~178`에서 같은 모드 다른 키로만 로테이션 → 키 1개면 `ok:false` → 호출부가 status를 버려 **"0건"과 구분 불가**.

### P0-3. 발행 직전 정책 스크러버가 자동 생성 글의 숫자 문장을 통삭제하고 상투구를 주입한다 — CONFIRMED
- `contentPolicy/qualityGate.ts:186~201` — 면제는 `semi_auto_manual` 하나(9/21 수정). **풀오토·예약·다중계정은 그대로 대상.** `RISKY_CLAIM`(:25) = 숫자+원/만원/%/명/건/회, `FIRSTHAND_CLAIM`(:26) = 지난달/현장에서/실제 사례.
- 근거(`evidenceTexts` = business_facts + source_materials)가 비는 플로우: **SmartScheduler** `main.ts:1847~1853` `source_materials: []`, business_facts 1문장 / **다중계정 URL 모드** `main.ts:5527~5540` `[]` / `publishInputReconciler.ts:109~127` 커버리지 0.2 미만이면 전부 탈락 → 근거 0.
- 삭제 후 `claimRepair.ts:46~107`: `${keyword} 확인 가이드`, `핵심 내용부터 살펴보기`, `세부 조건은 제공된 자료와 공식 판매 페이지에서 다시 확인해 주세요`, `공식 안내에서 최신 조건을 확인해 주세요` 주입. `generatedContentGuard.ts:101~110` / `policyService.ts:260~271`이 본문을 전면 교체.

### P0-4. 출처 귀속 표현이 3중으로 전삭제되어 근거가 "단정"으로 보인다 — CONFIRMED
- `contentGenerator.ts:7100` `sanitizeContentFakeSources` — **모든 모드 무조건**. `contentSanitizers.ts:24~116`: `원문|원본|기사|보도|외신|영상|논문|취재` + `에 따르면/에서는/을 보면`, `관계자에 따르면`, `공식 발표에 따르면`, `보고서에 따르면` 삭제. 로그는 개수만.
- `contentClaimSanitizer.ts:5~16` "공식 가이드/매뉴얼/지침에 따르면" 삭제(로그 0). `materialNarrationStrip.ts:9` "자료에는/검색 결과에는"으로 시작하는 **문장 전체** 삭제. selfCritique 프롬프트 5번(`contentSelfCritique.ts:56~77`)이 LLM에게도 "출처·날짜 메타 제거"를 지시.
- 동시에 프롬프트는 모델에게 **출처를 식별할 수단을 주지 않는다**: `[자료 N — 제목]` 번호표만 붙고(`sourceAssembler.ts:1832`) "이 번호표는 내부 표기니 옮기지 마라"(:1889)면서 `factDisciplineGuard`·`data_verified` 톤은 "기관명을 밝혀라"를 요구. 물리적으로 불가 → 날조 유인 또는 무출처 단정.
- 결과: "보건복지부 발표에 따르면 월 30만원" → "월 30만원". 웹 UI에는 이 단계가 없다.

### P0-5. 항상 켜진 소형·저온도 모델 3종이 본문을 삭제·헤지·명사화한다 — CONFIRMED
- `applyPostDraftFactCheck` (`contentGenerator.ts:7834`, auto=ON, `factCheckRouter.ts:67~96`): 프롬프트가 `replacement: ""`로 **문장 삭제**를 지시 — 미검증 중계·시점 혼입·전망("~할 전망이다")·상대 날짜·월 없는 날짜.
- `applyIssueDisciplineAudit` (:7845, ON, `issueDisciplineRules.ts:37~48`): "횡령했다"→"횡령이라고 주장했다", 해석 문장 삭제.
- `repairHeadingsBeforeFinalize` (:1411 → `headingStyleRepair.ts:86~102`, **플래그 없음=항상**): 문장형 소제목을 저가 모델이 명사구 12~26자로 재작성 (SEO는 문장형 허용 0개).
- 세 단계 모두 사용자가 켠 적 없고, 온도 0.2(Gemini) 또는 벤더 기본, 모델은 mini/haiku/flash-lite.

---

## 4. 높은 확률의 문제

| # | 문제 | 위치 | 판정 |
|---|---|---|---|
| H1 | **PlatitudeDetector 임계가 평범한 한국어에 걸려 유료 전체 재생성**을 일상화하고, 재생성 프롬프트가 `보통/일반적으로/~할 수 있습니다` 를 금지어로 나열 + "(자료 부족) 표기" 지시 | `contentPlatitudeDetector.ts:62~90,129` (`MAX=3`), `contentRetryPromptPolicy.ts:24~42` | CONFIRMED |
| H2 | **지시문 과포화 + 금지 비대칭**: SEO 스택 70,844자에 ⛔73 ❌28 금지81 마라26 0점8 = **216 vs ✅50 (4.32:1)**. "0점" 위협 8건 전부 문체 쪽, 구체성 결여 페널티 0건. "숫자 없는 문장이 낫다" 4개 소스 중복(`seo/geo-overlay.prompt:107`, `contentJsonPromptFormat.ts:515~516`, `promptLoader.ts:686`) | `src/prompts/seo/*`, `contentJsonPromptFormat.ts` | CONFIRMED |
| H3 | **HW 감정·정정 의무 8개+**(`seo/base.prompt:379`) vs `evidenceIntegrity.ts:231`("감탄사 아닌 맥락으로") 정면 충돌; 소제목 개수 계약 4중 충돌(`promptLoader.ts:1263~1275` 주석 자백) | 프롬프트 | CONFIRMED |
| H4 | **휴머나이저 strong 고정**(`contentHumanizationPolicy.ts:11~13`) — `Math.random()` 30% 동의어 치환·어미 변경·"확실히/분명히/일반적으로" 삭제 → 그 결과를 `humanlikeEval`이 채점해 되먹임 | `aiHumanizer.ts:85~125,276~375` | CONFIRMED |
| H5 | **selfCritique 4,500자 컷**: 모델에 4,500자만 보여주고 "전체 본문" 반환 요구, 길이비 0.7 이상이면 승인 → 6,000자 본문의 뒤 25% 소실 | `contentSelfCritique.ts:22,32~34,128~133` | CONFIRMED(코드) |
| H6 | **연관어 출처 병합**: 실스크랩·LLM 발명·정적 사전이 `metadata.keywords` 한 배열로 붕괴. 실데이터 공급원 `fetchRelatedKeywords`는 구형 셀렉터(`.lst_related_srch`)라 비어 있고, LLM이 "연관 검색어"라는 라벨로 발명(`paraphraseSourceAnalysis.ts:71`, `urlModeKeywordResolve.ts:24`, `main.ts:6208`, `contentGenerator.ts:5899`). 발명 키워드가 제목 채점 ±25점·해시태그 우선·서론 콤마 prepend로 강제 | `keywordAnalyzer.ts:608`, `keywordPlacementEnforcer.ts:40~50`, `contentStructuredValidator.ts:346~355` | CONFIRMED |
| H7 | **뉴스 풀텍스트에 날짜 라벨 미부착**: `parseNaverPostDate(candidate.postdate)`는 블로그 postdate만 읽음. 뉴스 pubDate는 `resolveSourceDate`로만 읽히는데 풀텍스트 경로만 잘못된 함수 사용 → 1순위 자료(뉴스)가 시점 없이 투입, "오는 29일" 상대날짜 복원 불가, 12개월 초과 경고 0 | `sourceAssembler.ts:1827~1828` vs `:1620` | CONFIRMED |
| H8 | **날짜 필터 무효**: 네이버 검색 API는 `datefrom/dateto`를 지원하지 않음(실행 실측: 필터 유무 total 19,351 동일). 로그 "최근 30일 이내 자료만 수집"(`contentGeneration.ts:1198`)은 거짓. 최신성 컷오프 없이 12개월 초과도 라벨만 붙여 투입(`sourceFreshness.ts:25`) | `rssSearcher.ts:203~217,516~530` | CONFIRMED |
| H9 | **MAX_TOKENS 미감지**: OpenAI `minChars=2000` → maxTokens `min(8192, 3400)`=3,400. 한국어 2,000자+JSON 메타가 3,400 토큰을 넘기 쉬움. `finish_reason==='length'`는 빈 응답일 때만 검사 | `contentGenerator.ts:3937,4678`, `utils/openaiRpmThrottler.ts:182` | CONFIRMED |
| H10 | **jsonParser 8차 폴백**이 `{"selectedTitle":"…"}` 한 필드를 "성공"으로 반환 → 상류 try가 성공 처리, 재시도 안 걸리고 분량 미달 경로로 흘러 엉뚱한 실패 메시지 | `jsonParser.ts:39~80,412~482` | CONFIRMED |
| H11 | **n.news.naver.com 본문 셀렉터 누락**: `.news_end_body`(구형)만 있고 `#dic_area`/`#newsct_article` 없음(실행 실측 dic_area 존재) → 범용 `article/body` 폴백에서 연관기사·랭킹 위젯 혼입 | `sourceAssembler.ts:5799` | CONFIRMED |
| H12 | **`cleanText`가 줄바꿈을 전부 공백화** → 이후 `\n{3,}`·짧은 줄 필터·`sourceNoiseFilter` 줄 규칙 전부 사문화, 기사가 문단 없는 한 덩어리로 투입 | `sourceAssembler.ts:2067~2087` | CONFIRMED |
| H13 | **`[class*="ad"]`, `[id*="ad"]` 부분일치 삭제** → `article-head`, `read-body`, `readerArea`, `breadcrumb`, `download` 컨테이너 통삭제 가능 | `sourceAssembler.ts:2110~2111` | SUSPECTED(높음) |
| H14 | **제목 엔진 입력 1,000자**(홈판 2,500) — 앞 300자가 안내문이라 실질 600자 | `contentGenerator.ts:849~851` | CONFIRMED |
| H15 | **LOW_QUALITY_2025**가 `/[A-Z]{5,}/`, `/\d+%\s*할인/`, `/무료\s*배송/`를 **로그 0줄**로 삭제 (NVIDIA·KOSPI·모델명 증발) | `contentOptimizer.ts:257~280,573~581` | CONFIRMED |

---

## 5. 잠재적인 문제

| # | 문제 | 위치 |
|---|---|---|
| M1 | 렌더러 6시간 결과 재사용 캐시 키에 **accountId·날짜 없음** (`urls, keywords, generator, tone, mode, …`) → 다른 계정 6시간 내 같은 키워드 재시도 시 어제 본문 재사용. 주석이 과거 동일 사고 기록 | `fullAutoFlow.ts:327~386`, `publishingHandlers.ts:262~321` |
| M2 | `serpHistory.buildAdaptiveLearningDirective` — 전 계정·전 키워드 누적 약점을 시스템 프롬프트 앞에 주입 | `analytics/serpHistory.ts:316~362` |
| M3 | Gemini 프롬프트 캐시 키에 API 키 지문 없음 (기본 OFF라 현재 무해) | `contentGeminiCachePolicy.ts:14~18` |
| M4 | `gemini.ts:91 runtimeModel` 전역 + `applyConfigToEnv` 반복 호출 — 다계정 큐에서 마지막 setter 승리 | `BlogExecutor.ts:785`, `configManager.ts:1175~1348` |
| M5 | `window._keywordTitleOptions` 해제가 6곳 분산, `_toneOverride`는 설정처 불명 | `continuousPublishing.ts:680,4565,4682` 등 |
| M6 | 재시도마다 `extraInstruction` 누적(prepend only) → N차 프롬프트는 항상 (N-1)차보다 큼 | `contentGenerator.ts:6263,6499` + 14개 누적 지점 |
| M7 | `flowGenerator._networkImageQueue` 전역 FIFO — 동시 생성 시 이미지 교차 | `image/flowGenerator.ts:185~238` |
| M8 | `optimizeForViral` 트리거 생성기가 전부 `''` 반환인데 splice 계속 → 빈 문단 3개 삽입 | `contentViralOptimizer.ts:23~76`, `contentEngagementStrategy.ts:30~68` |
| M9 | 날짜는 `new Date()` 시스템 로컬, Asia/Seoul 미명시 (UTC 환경이면 하루 오차). 제목 프롬프트는 연도만 | `contentJsonPromptFormat.ts:481~482`, `contentGenerator.ts:961` |
| M10 | 쇼핑 제목: `autocompleteKeywords`가 구조적으로 항상 빈 배열, 정적 4단어를 "실제 검색어 기반"이라 주석 | `naverSearchApi.ts:625~642` |
| M11 | DataLab `getRelatedKeywords`가 검색광고 API(`keywordstool`, HMAC)를 오픈API 헤더로 호출 → 항상 실패 | `naverDatalab.ts:170~178` |
| M12 | `MATERIAL_BUDGET.bodyMaxChars(10,000)`는 어디서도 미사용 — 설계도/본문 분리 예산이 실제로 동작 안 함 | `content/materialBudget.ts:19` |

---

## 6. 검색/크롤링 문제

1. **호출 여부**: 키워드 모드는 네이버 API(blog/news/webkr) + 풀텍스트 크롤 실제 호출됨. URL 모드는 검색 안 함. `shop`은 2026-07-31 종료(410). 홈판/이슈 모드도 SEO와 **동일 경로**(모드 분기 없음).
2. **실패 처리**: P0-2 참조. 4개 엔드포인트 전부 실패해도 `Promise.allSettled`가 삼킴.
3. **정렬/최신성**: news `sim4+date6`, blog `sim8+date8`. 컷오프 없음. 실측 `변우석 텐텐` news date 1위 = 2025-10-22, sim 1위 = 2024-06-19(정답), date 1·2위는 무관 기사("[브리프]아모레퍼시픽…"). `청약통장 금리` blog sim 상위 3 = 2022-01/2022-10/2020-10.
4. **본문 길이**: 스니펫 59~226자(중앙값 ~120). 풀텍스트 편당 2,500자·총 18,000자·8편·20초.
5. **차단/JS**: Puppeteer는 blog.naver/쇼핑몰만. 뉴스는 plain fetch + cheerio(H11). 쿠키 동의 페이지 감지 없음. 리다이렉트 에러 판정만 있음(:352~353).
6. **중복**: URL 문자열 완전일치(`fullTextCandidateOrder.ts:56~61`) + description 앞 100자 Set. **canonical 정규화 0, 본문 해시 0** → 실측 `청약통장 금리` news date 상위 3건이 동일 사안 전재(119만가구 공급) 3중 적재.
7. **NAVER API HUB**: 설정 4개 파일 모두 `naverHubClientId` 없음 → 전량 레거시. 경고는 프로세스당 1회 console. `sourceAssembler.naverSearchResponse`(:57~70)·`rssSearcher`(:23~42)·`miscHandlers.ts:57~58`는 HUB 키를 **읽지도 않음**(env만).

**Raw Search 실행 결과 (레거시 키, 앱과 동일 요청)**

| 키워드 | news date | news sim | blog sim | webkr | 비고 |
|---|---|---|---|---|---|
| 2026 셀토스 하이브리드 모의견적 | **0** | **0** | 8/508 (2/3 주제 이탈) | 10/3,325 | 뉴스 0건인데 진행 |
| 청약통장 금리 | 6/19,351 (상위 3 = 동일 사안 전재) | 4 | 8/206,180 (상위 3 = 2020~2022년) | 10/453,612 | 4~6년 전 블로그 투입 |
| 변우석 텐텐 | 6/11 (1·2위 무관) | 4/11 (1위만 정답, 2024-06) | 8/211 (tenten10.tistory 성형 글) | 10/844 | 이슈글에 1~2년 전 기사 |

---

## 7. 컨텍스트 전달 문제

| 절단 지점 | 한도 | 먼저 버려지는 것 | 로그 |
|---|---|---|---|
| `sourceNoiseFilter.ts:225` (P0-1) | 첫 마커 | **자료 2~8 + 스니펫 전체** | "껍데기" 오도 |
| `sourceAssembler.ts:1819` | 편당 2,500자 | 기사 후반(수치·조건) | ❌ |
| `:1772` | 총 18,000자 / 8편 | 순위 하위 기사 | ❌ (총계만) |
| `:1791` | <300자 폐기 | 단신 기사 | ❌ |
| `:2069` | 줄바꿈 전부 | 문단 구조 | ❌ |
| `contentGenerator.ts:849~851` | 제목 1,000/2,500자 | 자료 전부(앞 ~600자만) | ❌ |
| `materialBudget.ts:40`, `buildBlueprintPrompt.ts:57` | 설계도 30,000자 | 자료 뒷부분 | ❌ |
| `factCheckRouter.ts:100` | 8,000자 | 검증 못 하는 문장 발생 | ❌ |
| `contentSelfCritique.ts:22` | 4,500자 | **본문 뒤 25%** | ❌ |
| `jsonParser.ts:461~484` | — | **본문 전체 → 제목만** | warn 1줄 |
| `renderer/contentGeneration.ts:1363` | draft 10,000자 | (본문 프롬프트 미사용) | ❌ |

**토큰 견적(SEO, 자료 10,000자)**: system ≈ 23,000자 + JSON 계약 ≈ 7,000자 + 오버레이/최종계약 ≈ 65,000자 → 지시문 95,000~105,000자 + 자료 → 총 ≈ 55,000~75,000 토큰. **입력 한도는 병목 아님**(실측 promptTokens 54,391 / 65,576 / 73,625). 병목은 ① 자료가 지시문의 1/9 ② 출력 예산(OpenAI 3,400~8,192, Perplexity 8,192 고정, flash-lite 8,192) ③ 잘림 미감지.

**실측 압축률**: 재료 19,293 → 본문 2,278자(13%, fact 보존 43%), 39,213 → 2,105자(6%), 7,992(절단 후) → 1,604자(24%). 원장 최근 10건 중 9건에 `⚠️ Source Fideli…` 경고. 09-21 건은 safety 58점인데 `decision=pass` 발행.

---

## 8. 프롬프트 문제

- **`{{placeholder}}` 엔진 부재**: 본문 경로는 조건부 블록 concat. `'undefined'` 누출은 없음(전부 삼항 가드) — 대신 **"조용한 빈 섹션"**: recentWinners·blueprint·metrics·subKeywords가 비어도 경고 없이 진행. 재수집 루프는 rawText 공백 단 1경우(throw)뿐.
- **리서치 패킷**: Blueprint(quotes≤5/facts≤10/skeleton/offTopic/centralEvent)가 부분 구조화 — 원문 verbatim 검증은 우수. 그러나 `sourceUrls`·`conflictingClaims`·`readerQuestions`·`numbers/dates` 독립 필드 없음, 다시 산문으로 평탄화되어 writer에 전달, 실패 시 raw concat으로 무음 퇴행.
- **제목↔본문**: 같은 콜 안에서 순차 생성(`preWritingAnalysis → selectedTitle → headings → introduction`). 별도 제목 콜은 프로덕션 미실행. 확정 제목(locked) 경로만 설계도·본문에 선행 주입(`contentGenerator.ts:6283, 6533`). 도입부 상환 계약은 3중(`contentJsonPromptFormat.ts:186`, `evidenceIntegrity.ts:201`, `throughlineJudge`).
- **창작 면허 vs 금지**: HW1~15 "의무 8개+"(감정 흔들림·사후 정정·화제 전환 하한) ↔ F1/R0-7/homefeed:9 "자료 외 사실 금지". 숫자 하한이 있는 쪽(HW)이 이긴다. `storyteller` 페르소나(`promptLoader.ts:666`)는 회상·서사를 요구.
- **밋밋함 유도**: "수치가 없는 H2가 낫다"(4곳), F3 일반론 금칙어(평범한 서술어), B15/B16 "문단 길이 균일·장단점 대칭 = AI", 0점 위협 8건 전부 문체. 홈판 issue-story만 "장치 3개 이상(0개→0.31배)" 정량 압력 — SEO는 반대 방향 압력 없음.
- **날짜**: `new Date()` 로컬, Asia/Seoul 미명시. 자료 라벨 `[YYYY-MM-DD 작성]`은 게시일이지 사건일이 아님(뉴스는 라벨 자체가 안 붙음, H7).
- **출처 우선순위**: `factSourceTierPolicy`는 수집 비율(일반 blog30/news20, 공공 news50) + `fullTextCandidateOrder` 뉴스 우선 순서. **자료별 티어 라벨 없음** → "뉴스 > 블로그 > 지식인 우선" 산문 지시(`contentFactCheckConstraint.ts:31`)는 모델이 수행 불가(dead instruction). "official" 티어는 수집 대상 아님.
- **온도**: 본문 0.5~0.7 / 고쳐쓰기·판정 전부 0.2 / OpenAI·Claude 보조 호출은 미지정(1.0) — "검색어를 골라라"(사실 과제)를 1.0으로 돌리는 불일치.

---

## 9. concurrency / cache / retry 문제

- **동시성**: 텍스트 생성은 `apiClient.ts:176~182` + `pipelineRunCoordinator.ts:9~32` 단일 리스로 직렬화. `contentGenerator.ts` 모듈 전역 `let` 0개 — 재료 교차 오염 경로는 **확인되지 않음**. 잔여: M4(전역 모델명/env), M5(window 슬롯), M7(이미지 큐), 크롤러 브라우저 컨텍스트 싱글톤(`crawlerBrowser.ts:55~64`).
- **캐시**: 검색/뉴스 계층 캐시 없음(매번 신선). 본문 결과 캐시는 `minChars<1000`(제목·보조)만. 실질 위험은 M1(렌더러 6시간 재사용, 계정·날짜 무시)과 M2(전 계정 학습 지시 주입). Redis/Mongo는 env 플래그로만 활성(기본 OFF).
- **재시도**: 모델·재료·분량 불변(축소 없음). 대신 지시문 누적 증가(M6) + Faithfulness 재생성 시 금지어·"(자료 부족)" 지시(H1). 빈 응답 시 "핵심만 간결하게" + temp 0.1↑(`:3972~3997`).
- **JSON 무음 실패**: jsonParser 2~8차(본문 텍스트 정규식 재작성, 7차 중첩 소실, 8차 제목만), `contentStructuredRecovery.ts:371~411`(없는 필드 합성, `본문 N` 가짜 제목), `parseBlueprint.ts:49~62`(잘린 JSON 8회 뒤에서 잘라 파싱 → 소실분 무통보), `generateBlueprint.ts:56~73`(Never throws), `throughlineJudge.ts:164`(fail-open), `issueDisciplineAudit.ts:97~101`(빈 Map).

---

## 10. 실제 런타임에서 확인해야 하는 로그

**현재 존재하는 것** (userData): `logs/main-*.log`(5MB/일), `content-quality-ledger.jsonl`(20줄, keyword/title 대부분 빈 문자열, model/sourceCount 필드 없음, warningKinds 16자 절단), `content-policy-audit.jsonl`(`source_ids` 대부분 `[]`, `model_version:"existing-draft-adapter"` 고정), `serp-benchmark-history.json`, `content-generation-stats.json`. `debug-dumps/`, `title-metrics/` 비어 있음. `contentGenerationSnapshot.ts`는 이름과 달리 **in-memory structuredClone**이며 디스크 기록 없음.

**존재하지 않는 것**: A. SEARCH RAW(쿼리·응답·URL 목록) / B. RESEARCH INPUT(소스별 길이·절단 위치·설계도 인용/사실) / C. WRITER INPUT(프롬프트 전문) / D. WRITER OUTPUT(모델 원본 JSON) — **넷 다 어디에도 저장되지 않는다.** 진단리포트는 "마지막 500줄"이라 생성 증거가 구조적으로 포함 안 됨(3개 리포트 모두 `ContentGenerator|검색 API|Blueprint` 매치 0건).

**한 편 생성 시 순서대로 확인할 로그 줄**:
`[네이버 검색 API] ✅ N개` → `📚 상위글 풀텍스트 N건 확보 (N자)` → `[assembleContentSource] baseBody=N자` → **`[SourceNoise] 본문 뒤 사이트 껍데기 N자 절단`** → `[Blueprint] 📐 엔진 … 재료 N자` → `[promptSplitter] system=N user=N` → `CHAT_RESPONSE_OK … completionTokens=` → `[Headings] 모델 원출력 소제목:` → `[Sanitizer] 출처 날조 표현 N개` → `[PlatitudeDetector]` → `[Humanizer] 동의어 치환 N개` → `🔎 팩트체크(…): N개 교정` → `[HeadingRepair] ✏️` → `[Fidelity] 압축률 N%` → `[QualityGate] decision=` → `[ContentPolicy] …`. **무로그 3곳**(`removeLowQuality2025`, `sanitizeStructuredContentClaims`, `optimizeHeadingsForMode`)은 before/after 길이 로그부터 필요.

---

## 11. 자동화가 웹 UI LLM보다 나쁜 핵심 이유 (5개)

1. **자료가 모델에 닿기 전에 잘린다.** 키워드 모드에서 `SUPPLEMENT_BOUNDARY` 불일치로 자료 묶음이 첫 "무단 전재" 줄에서 절단(실측 73% 손실) + 편당 2,500자 + 제목 엔진 600자 + 뉴스 날짜 미부착 + 줄바꿈 전멸. 웹 UI에서 사용자는 기사 전문을 그대로 붙여넣는다.
2. **모델이 출처를 알 수 없는 상태에서 출처를 요구받고, 써낸 출처 표현은 3중 정규식이 전부 지운다.** 결과는 "근거 없는 단정" 아니면 "숫자 없는 일반론" — 둘 다 "부정확/밋밋"으로 읽힌다.
3. **10만 자 지시문이 "주장하지 않는 글"을 최적해로 만든다.** 금지:장려 4.3:1, 0점 위협은 전부 문체, "숫자 없는 편이 낫다" 4회, HW 감정 의무 vs 근거 계약 충돌. 웹 UI 프롬프트는 수백 자다.
4. **나온 글을 사용자가 고른 적 없는 소형·저온도 모델과 무작위 정규식이 다시 쓴다.** 팩트체크(문장 삭제 지시)·이슈규율(헤지)·소제목 명사화·휴머나이저 strong(30% 동의어 무작위)·Platitude 재생성(금지어+자료부족 표기)·selfCritique 4,500자 컷. 프리미엄 모델 출력의 "결"이 여기서 사라진다.
5. **실패가 성공으로 보고된다.** 검색 0건·429·차단 → success:true, 설계도 실패 → 무음 생략, JSON 잘림 → 제목만 성공, fact 보존 43%·safety 58 → pass 발행, 발행 직전 숫자 문장 삭제. 웹 UI에서는 사용자가 매 단계를 눈으로 본다.

---

## 12. 우선 수정 순서

### P0 (반드시)
| # | 수정 | 파일 / 함수 / 위치 |
|---|---|---|
| P0-1 | `SUPPLEMENT_BOUNDARY`에 `=== 사실 자료`, `=== 검색 결과 스니펫`, `\[자료 \d+` 추가 — 더 안전하게 `cutTrailingChrome`을 **[자료 N] 블록 단위**로 적용. 절단 로그를 "자료 손실"로 명시 | `src/content/sourceNoiseFilter.ts:207,209~226` `cutTrailingChrome` / `contentGenerator.ts:8771` |
| P0-2 | 검색 0건·429·HTTP 오류·크롤 전멸을 `success:false` + 사유 코드로 반환하고, 렌더러는 이슈/SEO 모드에서 **재수집 또는 중단**(키워드 단독 생성은 명시 옵트인). `apiClient`는 429를 별도 코드로 상류 전달 | `src/sourceAssembler.ts:801~804, 8104~8117, 8216~8222` / `src/renderer/modules/contentGeneration.ts:1223~1277` / `src/naver/apiClient.ts:172~178` |
| P0-3 | 발행 경계 스크러버: 근거가 비는 플로우(SmartScheduler·다중계정 URL·reconciler 탈락)에 `source_materials`로 rawText 전달 또는 `input_origin`별 면제. 문장 삭제·상투구 주입을 **경고 전용**으로 강등(사용자 원칙 "게이트 경고-only") | `src/main.ts:1847~1853, 5527~5540` / `src/contentPolicy/publishInputReconciler.ts:109~127` / `src/contentPolicy/qualityGate.ts:186~201` / `src/contentPolicy/claimRepair.ts:46~107` |
| P0-4 | 자료에 **출처 라벨**(매체명·기관·게시일·URL id)을 자료별로 부착하고, 출처 귀속 삭제 3종을 "자료에 없는 출처만 삭제"로 좁힘(자료 매체명 화이트리스트 대조). selfCritique 5번 지시 삭제 | `src/sourceAssembler.ts:1832,1889` / `src/contentSanitizers.ts:24~116` / `src/contentClaimSanitizer.ts:5~16` / `src/content/materialNarrationStrip.ts:9` / `src/contentSelfCritique.ts:56~77` |
| P0-5 | 본문을 고치는 소형 모델 3종을 **선택 엔진**으로 돌리고(`selectedEngineTextCaller`), `applyPostDraftFactCheck`·`applyIssueDisciplineAudit`·`repairHeadingsBeforeFinalize`를 기본 OFF 또는 "제안만"으로. 팩트체크 프롬프트의 `replacement:""` 삭제 지시 제거 | `src/contentGenerator.ts:7834,7845,1411` / `src/factCheckRouter.ts:67~96,203~218` / `src/content/issueDisciplineRules.ts:37~48` / `src/content/headingStyleRepair.ts:43~46,86~102` / `src/main/ipc/paraphraseAnalysisHandlers.ts:16~18` |
| P0-6 | **A~D 런타임 스냅샷** 저장(`userData/generation-runs/<runId>/a~d`) + runId를 로그·원장·audit에 공통 부여. 원장에 model/sourceCount/rawTextChars/compressionRatio 필드. 진단리포트에 "최근 생성 1건" 섹션 | `src/content/qualityLedger.ts:18~37,57` / `src/contentPipeline/contentGenerationSnapshot.ts` / `src/contentGenerator.ts:6616`(호출 직전) / 진단리포트 생성기 |

### P1 (중요)
| # | 수정 | 위치 |
|---|---|---|
| P1-1 | 뉴스 풀텍스트 날짜: `parseNaverPostDate(candidate.postdate)` → `resolveSourceDate(candidate)` | `src/sourceAssembler.ts:1827~1828` |
| P1-2 | `finish_reason==='length'` / `MAX_TOKENS` / `stop_reason==='max_tokens'`를 비어 있지 않은 응답에도 검사 → maxOutputTokens 상향 재시도 + 로그. OpenAI 출력 예산 `minChars×1.7` 상향 | `src/contentGenerator.ts:3928~3952, 4658~4694, 5099~5116` / `src/utils/openaiRpmThrottler.ts:182` |
| P1-3 | jsonParser 8차 폴백 제거(또는 sentinel로 실패 표시), `cleanJsonOutput` 최상위 배열 처리 | `src/jsonParser.ts:39~80, 461~484` |
| P1-4 | PlatitudeDetector 트리거를 "일반론 문장" 수준으로 좁히고 `MAX_PLATITUDE_HITS` 상향; Faithfulness 재생성 지시에서 금지어 나열·`(자료 부족)`·`[자료]` 토큰 지시 제거 | `src/contentPlatitudeDetector.ts:62~90,129` / `src/contentRetryPromptPolicy.ts:24~42` |
| P1-5 | 휴머나이저: `resolveHumanizeIntensity`를 모드별/기본 `light`로, `Math.random` 동의어 치환·강조어 삭제 제거; humanlikeEval 채점을 휴머나이저 **이전** 텍스트로 | `src/contentHumanizationPolicy.ts:11~13` / `src/aiHumanizer.ts:85~125,276~375` / `contentGenerator.ts:7817 vs 7971` 순서 |
| P1-6 | selfCritique 4,500자 컷: 전문 전달 또는 절단 시 patch 거부 | `src/contentSelfCritique.ts:22,32~34,128~133` / `contentGenerator.ts:6370` |
| P1-7 | 연관어 출처 분리: `keywords`를 `{actualRelatedQueries, newsExtracted, semantic, seo, longTail}` 구조로, 프롬프트 라벨 구분, 발명 키워드는 제목 채점·해시태그·서론 prepend 대상에서 제외. `fetchRelatedKeywords` 셀렉터를 `fds-comps-keyword-chip`으로 갱신 | `src/analytics/keywordAnalyzer.ts:608` / `src/content/paraphraseSourceAnalysis.ts:71` / `src/main.ts:6208` / `src/contentGenerator.ts:5899,996,3114~3120,1248~1252` / `src/content/keywordPlacementEnforcer.ts:40~50` / `src/contentStructuredValidator.ts:346~355` |
| P1-8 | `cleanText` 줄바꿈 보존(`[ \t]+`), `[class*="ad"]` 부분일치 셀렉터 교체, `n.news.naver.com` `#dic_area/#newsct_article` 추가, 본문 해시+canonical 중복 제거 | `src/sourceAssembler.ts:2069, 2110~2111, 5799, 1771~1839` |
| P1-9 | 제목 엔진 입력을 설계도 facts/quotes 또는 4,000자로; 편당 2,500자 컷·<300자 폐기·factCheck 8,000자 컷에 로그 | `src/contentGenerator.ts:849~851` / `src/sourceAssembler.ts:1819,1791` / `src/factCheckRouter.ts:100` |
| P1-10 | 설계도·판정·팩트체크 모델을 사용자 선택 엔진(또는 명시 설정 키)으로; `gpt-4.1-mini` 하드코딩을 레지스트리 상수로 | `src/main/ipc/paraphraseAnalysisHandlers.ts:16~18,160~173` / `src/factCheckRouter.ts:151,203~218` |
| P1-11 | 렌더러 6시간 재사용 캐시 키에 `accountId`+`YYYY-MM-DD` (두 파일 동시) | `src/renderer/modules/fullAutoFlow.ts:327~344` / `publishingHandlers.ts:263~282` |
| P1-12 | HUB 키를 `sourceAssembler`·`rssSearcher`·`miscHandlers` 경로에서도 읽도록 `appConfig` 전체 전달; 날짜 필터 로그 문구 삭제(API 미지원) | `src/sourceAssembler.ts:57~70` / `src/rssSearcher.ts:23~42` / `src/main/ipc/miscHandlers.ts:57~58` / `src/renderer/modules/contentGeneration.ts:1198` |

### P2 (개선)
- 프롬프트 다이어트: SEO 스택 70KB → 오버레이 중복 제거, "숫자 없는 편이 낫다" 1곳으로, HW 의무 하한 삭제, 소제목 개수 계약 단일화 (`src/prompts/seo/base.prompt`, `geo-overlay.prompt`, `contentJsonPromptFormat.ts:515~516`, `promptLoader.ts:1263~1275`)
- `LOW_QUALITY_2025` `/[A-Z]{5,}/`·할인·배송 삭제 제거 + 로그 (`src/contentOptimizer.ts:257~280`)
- `optimizeForViral` 죽은 splice 제거 (`src/contentViralOptimizer.ts:23~76`)
- 날짜 Asia/Seoul 명시 (`contentJsonPromptFormat.ts:481`), 제목 프롬프트에 월·일
- `serpHistory` 학습 지시에 account/mode 필터 (`src/analytics/serpHistory.ts:316~362`)
- 재시도 `extraInstruction` 길이 캡 (`contentGenerator.ts:6499`)
- Gemini 프롬프트 캐시 키에 apiKeyFingerprint (`contentGeminiCachePolicy.ts:14`)
- `naverDatalab.getRelatedKeywords` 엔드포인트 교정 / 쇼핑 제목 정적 4단어 라벨 정정 (`naverDatalab.ts:170~178`, `naverSearchApi.ts:625~642`)
- `MATERIAL_BUDGET.bodyMaxChars` 실제 적용 또는 삭제 (`materialBudget.ts:19`)

---

## 13. 권장 신규 파이프라인

```
SEARCH   sourceAssembler.collectContentFromPlatforms
         → 결과 객체 { query, endpoint, sort, status(200/429/403/0건), items[{url, canonical, title, pubDate, source, tier}] }
         → 0건/429는 실패로 상류 전달, 이슈 모드는 최신순 하드 컷오프(예: 30일) 적용
CLEAN    fetchArticleContent + cleanText(줄바꿈 보존) + 본문 해시 dedup + 자료별 헤더
         [자료 N | 매체 | 게시일 | tier=news/blog/official | url-id]   ← P0-4
         sourceNoiseFilter는 자료 블록 단위로만              ← P0-1
RESEARCH generateBlueprint를 Research Packet으로 확장 (선택 엔진으로)  ← P1-10
         { topic, mainKeyword, searchIntent, facts[{claim, snippet, sourceId, date}],
           numbers[], dates[], people[], officialStatements[], conflictingClaims[],
           sourceUrls[], actualRelatedQueries[], semanticKeywords[], readerQuestions[], hookPoints[] }
         → 파싱 실패는 실패로 표면화(무음 생략 금지)
KEYWORD  keywords를 출처별 구조로 분리, 발명 키워드는 강제 대상 제외        ← P1-7
TITLE    (확정 제목 경로처럼) 제목을 먼저 확정해 설계도·본문에 선행 주입 — 이미 있는 배선(:6283,6533) 일반화
OUTLINE  Research Packet의 skeleton + facts 배정 (현재 설계도 산출물 재사용)
WRITE    단일 콜 유지하되 지시문 다이어트(≤30KB) + Packet을 구조(JSON)로 전달, 출처 id 인용 허용
QA       삭제·치환 대신 "표시": 팩트체크/이슈규율/소제목 스타일은 제안 목록으로 UI에 표출, 적용은 사용자 승인 또는 선택 엔진 1회
         humanizer light, selfCritique 전문, Platitude는 문장 단위 일반론만
         발행 경계 정책은 경고-only(반자동과 동일 원칙)                    ← P0-3
PUBLISH  runId 기반 A~D 스냅샷 + 원장 확장                                ← P0-6
```

전환 순서 제안: **P0-1·P0-2·P0-6(측정)** 먼저 → 같은 키워드 5개로 A/B 하네스 실행 → P0-3·P0-4·P0-5 → P1. 현 코드에서 새 파이프라인은 "신규 작성"이 아니라 이미 있는 부품(Blueprint, locked-title 배선, selectedEngineTextCaller, materialTierNotice, factSourceTierPolicy)의 **배선 수정**으로 대부분 도달 가능하다.

### A/B 재현 테스트 하네스 설계 (코드 미변경, 설계만)
- 입력: 키워드 5개(예: 위 3개 + 정책형 1 + 쇼핑형 1). 각 키워드에 대해 저장:
  - A 현재 자동화 최종 결과(bodyPlain, headings, title) — 기존 경로
  - B SEARCH RAW — `collectContentFromPlatforms` 반환 전 `{queries, statuses, items}`
  - C Research Packet — 설계도 파싱 결과 + 절단 전/후 rawText 길이
  - D WRITER INPUT — `systemPrompt`/`userPrompt` 전문(마스킹)
  - E WRITER OUTPUT — 모델 원본 JSON + finishReason + 토큰
- 평가표(1~5점): 검색 최신성(최신 자료 게시일 중앙값) / 팩트 정확성(E의 숫자·날짜가 B·C에 존재하는 비율) / 키워드 관련성(연관어 중 실검색 유래 비율) / 제목 클릭 유도 / 도입부 흡입 / 정보 밀도(숫자·고유명사 per 100자) / 반복 문장(ROUGE 중복) / 추측·환각(자료 부재 수치 건수) / 검색 의도 충족 / 출처 사용률(자료 8건 중 본문에 반영된 건수)
- 비교: (A 현재) vs (E 원본 출력) 차이 = 후처리 손실 / (C) vs (B) 차이 = 절단 손실 / (E) vs 웹 UI 동일 자료 붙여넣기 = 프롬프트 손실. 구현 위치: `scripts/quality-ab-harness.ts` + `userData/generation-runs/` (P0-6와 동일 저장소).

---

## 14. 예상 효과 (수정 → 개선 축)

| 수정 | 검색 연관어 | 최신성 | 팩트 정확도 | 제목 | 본문 품질 | 환각 감소 |
|---|---|---|---|---|---|---|
| P0-1 절단 수정 | | ● | ●●● | ● | ●●● | ●● |
| P0-2 검색 실패 표면화 | ● | ●●● | ●● | | ● | ●●● |
| P0-3 발행 스크러버 경고화 | | | ●●● | ●● | ●● | (오탐 제거) |
| P0-4 출처 라벨 + 삭제 축소 | | ● | ●●● | | ●● | ●●● |
| P0-5 소형모델 재작성 OFF/선택엔진 | | | ●● | ● | ●●● | ● |
| P0-6 A~D 스냅샷 | (측정 기반) | | | | | |
| P1-1 뉴스 날짜 라벨 | | ●●● | ●● | | | ●● |
| P1-2 MAX_TOKENS 감지 | | | ● | | ●● | |
| P1-3 JSON 8차 폴백 제거 | | | | ● | ●● | |
| P1-4 Platitude 완화 | | | | | ●●● | |
| P1-5 휴머나이저 light | | | ● | | ●●● | |
| P1-7 연관어 출처 분리 | ●●● | | ● | ●● | ● | ●● |
| P1-8 정제(줄바꿈·셀렉터·dedup) | | ● | ●● | | ●● | ● |
| P1-10 보조 단계 선택 엔진 | | | ●● | ● | ●● | ● |
| P2 프롬프트 다이어트 | | | ● | ● | ●●● | ● |

(● 표시는 코드 구조상 직접 영향 축이며, 수치 효과는 P0-6 측정 후에만 말할 수 있다 — 추정치는 적지 않는다.)

---

### 부록 — 조사에서 정정된 통념
- "설계도/본문 분리로 본문은 10,000자만 받는다" → **거짓**. `bodyMaxChars`는 미사용 상수, 본문도 전체 rawText를 받는다(절단이 없다면).
- "보조 호출도 선택 엔진으로" 규칙 → 이미지 매칭·검색어 최적화·(9/22) 붙여넣기 분류에는 적용됐으나 **설계도·팩트체크·판정·소제목 재작성·이슈규율은 여전히 저가 모델 고정**.
- "Gemini grounding ON (강제)" 로그 문구 → `callGemini` 내부 `useGrounding=false` 하드코딩이라 **실제로는 OFF**.
- "최근 30일 이내 자료만 수집" 로그 → 네이버 API가 날짜 파라미터를 무시하므로 **거짓**.
- `gpt-4.1-mini` 404 우려(조사 에이전트 SUSPECTED) → 09-21 로그에서 정상 응답 확인, **모델은 살아 있음**(레지스트리 밖 하드코딩인 점만 문제).
