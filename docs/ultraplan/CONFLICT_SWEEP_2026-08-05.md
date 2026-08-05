# 하네스 충돌 제거 릴리즈 계획 (확정본)

**검증 스냅샷** — HEAD `ef6ad3e8`, 2026-08-05 16:26 실측.
`src/prompts/**` 워킹트리 clean(다른 세션 WIP 없음). `seo/base.prompt` md5 `b552d89c847dcbce040ae3c1da953b99`(666줄) — **아래 모든 라인 번호는 이 상태에서 직접 덤프해 확인했다.** 기준선 테스트 GREEN: `contentQualityV3RuntimeFingerprint` · `contentQualityLegacyBaseline` · `situationTitleContract` · `situationDepthContract` · `basePromptSelfConsistency` = **5 files / 50 tests passed**.

**한 줄 결론:** 진짜 급한 것은 프롬프트 충돌이 아니라 **발행 직전 후처리 코드가 프롬프트 금칙어를 스스로 주입하고 본문 문단을 전멸시키는 것**이다. 프롬프트 릴리즈(R7~R15)보다 코드 릴리즈(R2~R6)를 먼저 낸다.

---

## 1. 최종 충돌 목록

### 1-A. 코드 ↔ 프롬프트 (런타임이 프롬프트를 거스름) — 전부 신규

| # | 충돌 | 파일:라인(양쪽) | 승자 | 해소안 | 근거 | 영향 |
|---|---|---|---|---|---|---|
| **N1** | 본문 문단 전멸 | `src/contentOptimizer.ts:462` `return uniqueSentences.join(' ')` (`:439` 가 `\s+`로 split) · `:689` `result.replace(/\n\s+/g,'\n')` ↔ `seo/base.prompt:572` `한 단락 2~3문장 (모바일 1화면)`, `homefeed/base.prompt:125-126` | 코드 | `:462`를 줄바꿈 보존 변환으로 감싸고 `:689`를 `/\n[ \t]+/g`로 | (a) 근거 게이트 무관·순수 서식 복원 (c) 프롬프트가 축자로 요구 | 전 모드 전 글 |
| **N2** | `살펴보겠습니다` 확정 주입 | `src/aiHumanizer.ts:816-818` `return match.replace(/\.\s*$/, ', 이에 대해 구체적으로 살펴보겠습니다.')` ↔ `seo/base.prompt:126` R0-8 `"결론적으로", "정리하면", "알아보겠습니다" 등 AI 정리체 금지` | 코드 | 격식체 분기를 `return match`로 | (a) R0-8은 SECTION 0 절대룰(`:145` 위반 시 폐기) | 격식 톤 전 글 |
| **N3** | 원문 수치 삭제 + 자릿수 오염 | `src/aiHumanizer.ts:718-740` `naturalizeNumbers` (무게이트) ↔ `seo/base.prompt:11` F1, `:125` R0-7, `exposure-structure.prompt:34` ES-4 | 코드 | 파이프라인에서 분리(C1과 동형) | (a) 수치 충실도는 F1 축. `'150%'`→`'1절반 정도 '` 오염 실측 | 전 모드 |
| **N4** | 출처를 1인칭 발견담으로 치환 | `src/aiHumanizer.ts:753-770` `alternatives: ['','','알고 보니','정리하면']` / `['확인된 바로는','알려진 것처럼','']` ↔ `human-writing-anti-pattern.prompt:28`, `seo/base.prompt:126` R0-8 | 코드 | 4개 배열 전부 `['','','','']` — 삭제만 남기고 대체어 전멸 | (a) F2가 요구한 건 "출처 토큰 제거"지 "근거를 통설로 강등"이 아니다 | 전 모드 |
| **N5** | 금칙어 삽입 풀 | `src/aiHumanizer.ts:180-184` `'정리하면'` `'찾아보니까'` ↔ `base:126` R0-8 / C1 잔여(1인칭 조사 행위) | 코드 | 두 항목 삭제 | (a)(c) | 구어 톤, 긴 문단 |
| **N6** | F3 금칙어를 F3 금칙어로 치환 | `src/aiHumanizer.ts:122` `일반적으로 → '보통 '` · `:98` `'다양한' → '여러 가지'` ↔ `seo/base.prompt` F3 목록(`보통`·`여러 가지` 동시 수록) | 코드 | replacement를 `''`로, `'다양한'` 키 삭제 | (a) 순수 손해. 측정(`detectPlatitudes` @6263)이 주입(@6588)보다 먼저라 게이트가 영원히 못 봄 | 전 모드 |
| **N7** | 없는 인과 무작위 부착 | `src/aiHumanizer.ts:849-850` `casualConnectors` 에 `'알고 보니 '` ↔ `human-writing-anti-pattern.prompt` §2 | 코드 | 최소 `'알고 보니 '` 제거 | (a) 1인칭 발견 주장 | 구어 톤 |
| **N8** | 시한폭탄 — 애드포스트 전환어 | `src/contentOptimizer.ts:356` `optimizeForAdpost` 호출, `:522-540` (문단 붕괴 때문에 **현재 0회**) ↔ H6·R0-8 (`전문가들의 의견에 따르면` / `결론적으로 추천드리는 것은` / `실제로 확인해본 결과`) | 코드 | 호출 제거 | (a)(c) — **N1을 먼저 고치면 즉시 활성** | 전 모드 |
| **N9** | 시한폭탄 — enhanceEEAT authority | `src/contentOptimizer.ts:559` `split(/\n{2,}/)` 로 현재 문단 1개 → `expertise` 고정 ↔ `seo/base.prompt:202-205` H6 (`공식 발표에 따르면` 등) | 코드 | `categories`를 `['expertise']`로 축소 또는 전체 분리 | (a) — **N1 선행 시 authority 1~2건/글 발생** | 전 모드 |
| **C13/N20** | 어미 이중 계상 + 프롬프트가 요구하는 어미를 게이트가 감점 | `src/content/evaluators/humanlikeEval.ts:69` `INFORMAL_SIGNALS`(가점, `:200`)와 `:73` `CONVERSATIONAL_CRUTCHES`(감점, `:214-225`)에 `잖아요`·`거든요` 동시 수록 ↔ `human-writing-anti-pattern.prompt:8-11` `~잖아요, ~거든요, ~긴 해요, ~죠, ~네요를 자연스러운 자리에 고루 섞는다` | — | **사용자 결정 필요(D4)** | (a) 발행 게이트(`qualityEvaluator.ts:148`)에 연결. 어느 쪽을 지울지는 문체 정책 | 전 모드 채점 |
| **N14** | 소제목 첫머리 키워드 강제 | `src/contentJsonPromptFormat.ts:95` `[강제] 1번 소제목은 반드시 메인 주제(주어)로 시작` ↔ `seo/base.prompt:342` `첫 소제목을 메인 키워드로 강제 시작하지 않는다` | cjpf(후미) | `:95` 삭제, `:96`(조사 시작 금지)만 존치 | (a)(c) evidenceIntegrity가 최후미에서 무효 선언 | SEO |
| **N17** | 무조건 표 요구 | `src/content/affiliateConversionStructure.ts:32` `비교·조건은 표로 정리한다`(조건 없음) ↔ `contentJsonPromptFormat.ts:111` `입력 근거가 충분할 때만` | conversionStructure(후미) | `:32`를 `비교 행이 2개 이상 확보될 때만`으로 조건화 | (a) 같은 파일 `:35`가 이미 올바른 형태 | 쇼핑 |

### 1-B. 프롬프트 ↔ 프롬프트

| # | 충돌 | 파일:라인(양쪽) | 승자 | 해소안 | 근거 | 영향 |
|---|---|---|---|---|---|---|
| **C24** | 키워드 밀도 수치 | `src/prompts/business/base.prompt:151` `- 본문 내 키워드 밀도 1.5~3%` ↔ `seo/base.prompt:124` R0-6 · `official-exposure-rubric.prompt:40` | base:151(rubric 미주입) | 1줄 삭제 | (a) 유일하게 스터핑을 **지시**하는 수치 | 업체 모드 |
| **N10** | 작성일 못박기 | `seo/geo-overlay.prompt:19,22,118` `✅ "현재(2026년 5월) 기준"` ↔ `seo/base.prompt:16` F1 `⛔ "○월 ○일 기준" 작성일 못박기 금지` | geo(후미) | G1 블록(`:15-30`)·`:118` 삭제 | (a) F1 우선 (c) `geo:7` 자기 선언 "충돌 시 base 우선". `ef6ad3e8`이 R0-13을 지운 것과 **동일 위반이 여기 잔존** | seo·mate·제휴 |
| **N11** | 출처 없는 권위 표현 | `geo-overlay.prompt:65-70` `[허용 패턴 — 출처 명시 없이 권위 시그널만 부여]` ↔ `contentJsonPromptFormat.ts:119` `출처 없는 "공식 가이드" … 금지` | cjpf(후미) | `:65-70` + 자가점검 삭제 | (a)(c) | 동상 |
| **N12** | H2당 수치 할당량 | `geo-overlay.prompt:105-106,122` `✅ 본문 H2당 최소 1개의 검증 가능한 구체(수치/날짜/금액/조건)` ↔ `seo/base.prompt:11` F1 · `:198-200` H5 | geo(후미) | `:105-106`·`:122` 삭제 | (a) 자료에 수치가 없는 H2에서 **동시 충족 불가** | 동상 |
| **N13** | 오버레이 자기 가드 댕글링 | `geo-overlay.prompt:6,63,95` 가 `R0-1~R0-11`·`H6`·`SECTION 12` 참조 ↔ `affiliate/base.prompt` 내 해당 문자열 **각 0건**(실측) | — | `contentGenerator.ts:2281` `geoEligibleMode`에서 `'affiliate'` 제외 | (a) 제한 조항만 무효화되고 지시 조항은 작동 | 제휴 |
| **C14** | FAQ 조건부 vs 고정 섹션 | `seo/base.prompt:118` R0-3 `FAQ는 실제 반복 질문이 있을 때만 넣고 고정 위치를 만들지 않는다` ↔ `exposure-structure.prompt:20-23` `[ES-3] FAQ 섹션 (3~6개)` `★ 글 말미에 … 3~6개` | ES-3(후미) | ES-3를 조건부로 수정(개수는 유지) | (b) `official-exposure-rubric:28` `good only when they help the reader` (c) R0-3 명시 선언 | seo·mate |
| **C7** | 표 열 수 | `exposure-structure.prompt:30` `2~3열` ↔ `seo/base.prompt:369` `표는 최대 2열까지` · `homefeed/base.prompt:85` · `contentJsonPromptFormat.ts:111` `최대 2열`(최후미) | cjpf = **2열** | `exposure-structure:30`을 `2열`로 | (c) 실동작이 이미 2열. 이상치 1곳만 수정 = 동작 변화 없음 | 전 모드 |
| **C15** | 이모지 개수 | `seo/base.prompt:569` `이모지 전체 0~5개` · `:460` B20 `5개 초과` ↔ `contentBodyTransforms.ts:72` `removeEmojisFromContent`(`contentGenerator.ts:1032`에서 호출·살아있음) = **전량 삭제** · `contentQualityChecker.ts:118-120` `이모지 N개 발견` = 위반 | 코드(0개) | `:569`를 "이모지 사용 금지"로, `:460` B20 삭제 | (a) 사문 규칙 제거 — 모델에게 헛일을 시키는 지시 | seo·mate |
| **C16** | 문장 길이 산술 모순 | `seo/base.prompt:574` `40자 초과 금지` ↔ `exposure-structure.prompt:36` ES-5 `1문장 요약(55~80자)` · `:10` ES-1 `40~80자` | ES-5(후미) | `:574`에 스코프 부기 `(ES-1 직답·ES-5 요약·인용 제외)` | (a) ES-1/ES-5는 AI 발췌 계약. 삭제가 아니라 한정 — **교집합 공집합이므로 진짜 결함** | seo·mate |
| **C18** | 결론부 공식 vs 금지 | `seo/base.prompt:415-425` `[결론부 6줄 공식]` `2줄(저장 트리거): 5개 항목 체크리스트 블록` `5줄(댓글 유도)` `6줄(공유 트리거)` · `:625` ↔ `:411` `⛔ "도움이 되셨다면 공감 눌러주세요"` · `:642` `내용상 필요할 때만 하나를` · `rubric:28` | rubric/`:642`(후미) | `:415-425`·`:625` 삭제 | (c) 이미 무효화 중 → **동작 변화 없음** | seo·mate |
| **C21** | `좋아요` 금지 ↔ 어미 풀 | `seo/base.prompt:100` 금지 목록 · `promptLoader.ts:474` `~좋아요 평가어 어미` 금지 ↔ `promptLoader.ts:529` mom_cafe 어미 풀에 `~좋아요` | 3곳 중 2곳이 금지 | `:529`에서 `~좋아요` 1개 삭제 | (c) 같은 페르소나가 자기모순 | mom_cafe 톤 |
| **N15** | 소제목 5역할 = 개수 강제 | `human-writing-anti-pattern.prompt:23` (첫/다음/다음/다음/마지막 = 5) ↔ `seo/base.prompt:118` R0-3 · `homefeed/base.prompt:66` `정확한 개수를 맞추지 않는다` · `homefeed/issue-story.prompt:35` `0~3개만` | human-writing(최후미) | `:23`을 "소제목이 여러 개면 각각 다른 역할"로 | (c) issue-story `:6`이 자기 우선 선언했는데 뒤 오버레이가 무명시로 덮음 | 전 모드 |
| **N16** | 체류용 루프 vs 답 지연 금지 | `situation-depth.prompt:27-28` `깊은 루프를 열어 끝까지 읽게` ↔ `seo/base.prompt:377` `답을 미루거나 매번 갈고리 문장을 붙이지 않는다` · `official-exposure-rubric:14` `Do not delay the answer just to increase dwell time` | rubric(후미+선언) | `:27-28` 삭제, `:26`(표면 답 먼저) 존치 | (c) rubric `:3-4` 자기 상위 선언 | 전 모드 |
| **N21** | `F1` 댕글링 | `situation-depth.prompt:15` `(F1 우선)` ↔ `homefeed/base.prompt`·`business/base.prompt`·`affiliate/base.prompt` 에 F 계열 정의 **0건** | — | `(F1 우선)`을 `자료에 없는 상황·트리거는 만들지 않는다`로 내장 | (a) 근거 게이트 인용이 3개 모드에서 무력 | 홈판·업체·제휴 |
| **N19** | 오버라이드가 수치층에 도달 못함 | `official-exposure-rubric.prompt` 51줄 전체에 수치 **0개**. `:3-4`가 `keyword-density, title-formula, fixed-heading-count보다 상위`를 선언하지만 대체 수치 없음 | — | **구조적 사실 — 수정 대상 아님.** 수치 축 승자는 항상 앞선 base다. 계획 전반의 전제 | — | 전 모드 |
| **N18** | 홈판 수치 공백 | `homefeed` 조립본에 문장 길이 0값·본문 목표 글자수 0값·FAQ 개수 0값 (seo/mate는 6·1·3값) | — | **사용자 결정 필요(D5)** — 채울지 비울지는 설계 의도 | — | 홈판 |
| **C17** | 제목 글자수 4값 | `seo/base.prompt:127` `22~42자` / `:519` `28~40자` / `homefeed/base.prompt:52` `28~42자` / `mate/base.prompt:62` `28~45자` | 모드별로 다름 | **사용자 결정 필요(D1)** — 교집합 28~40이 있어 동시 만족은 가능. 테스트 `situationTitleContract.test.ts:124`가 `:519`를 못박음 | (a)(b)(c) 모두 판정 불가 | 전 모드 |
| **C5** | 제목 첫 3자 | `seo/base.prompt:115` R0-1 `첫 3글자나 고정 위치로 옮기지 않는다` ↔ `:520` `[메인 키워드(앞 3자 이내)]` · `contentJsonPromptFormat.ts:100` · `situationTitleContract.ts:56` · `business/base.prompt:150` · `title/seo*` 3곳 | evidenceIntegrity(최후미 금지) | **사용자 결정 필요(D1)** — 테스트 `:126`이 `[메인 키워드(앞 3자 이내)]` 존재를 강제 | SPEC-KEYWORD-ENDGAME와 정면 충돌 | 전 모드 |
| **C22** | 상황 계약 ↔ 이슈픽 골격 | `contentGenerator.ts:2431` `situationDepth` 무조건 조립(가드 없음) ↔ `homefeed/issue-story.prompt:35` `소제목 없이 흐름으로` | situationDepth(후미) | **사용자 결정 필요(D2)** — 단순 배타는 `situationDepthContract.ts`의 ⛔ 날조금지 3줄까지 끄고 `situationDepthContract.test.ts:66`을 깬다 | SPEC-DEFAMATION 관할 구역 | 홈판 연예·사회 |
| **N22** | 이미지 배치 자기모순 | `seo/base.prompt:591` `이미지 400~600자마다 1장 (소제목 1개당 1장 + 도입부 1장)` — 본문 2,500~3,300자(`:121`)면 전자는 4~8장, 후자는 소제목 개수 의존(R0-3이 개수 미지정 → 미정) | — | 한 줄 안 두 산식 중 하나 삭제 — 후순위 | — | seo·mate |

### 1-C. 오탐으로 판정 — 재조사 금지

| 항목 | 왜 오탐인가 |
|---|---|
| **C1** | 완료(`420df2ec`). `authgrDefense.ts:405-419`가 `injectedCount: 0` 고정. |
| **C6·C19·C20** | `ef6ad3e8`에서 이미 처리. 문체 계열은 `HF`가 아니라 **`HW1~HW15`**로 리네임(`base:462-479,635`). R0-13/R0-14는 `:147-150` 묘비 주석만 잔존. C20은 애초에 B1 인용이 과장(`"정리해드릴게요"` ≠ `"살펴보겠습니다"`). |
| **C3** | **짝이 틀렸다.** `human-writing:28`이 금지하는 `"자료를 보면"·"확인해보면"·"제가 확인한 바로는"`과 실제 삽입 풀(`aiHumanizer.ts:180-184`)의 교집합 = ∅. 200회 실행 시 금지 리터럴 0/200. 게다가 `insertInterjections`는 **문단당 34문장 이상**이어야 발화(n=20 → 0/300) — 프롬프트가 "문단 1~2문장"을 강제하는 한 사실상 죽음. → 진짜 결함은 N5로 대체 지목. |
| **C23** | `[SITUATION DEPTH]` 리터럴은 `situationDepthContract.ts:53` **한 곳뿐**. 충돌 상대는 파일명(`situation-depth.prompt`)이고 모델은 파일명을 보지 않는다. 개명 근거 소멸 — 오히려 유일 마커라 T5 탐지의 기반. |
| **C12의 "2 vs 3"** | `3회 이상 연속`(B14) / `3연속 금지`는 **임계값**이지 허용치가 아니다 — `2회 연속까지만 허용`과 **동일 규칙**. 진짜 대립은 **허용 1 vs 2**. |
| **C15의 "5 vs 3"** | 조립본에 "이모지 3개" 총량 규칙은 없다. `contentOptimizer.ts:65`의 3은 **연속** 하위축. 진짜 대립은 **0~5 vs 0(런타임 전량 삭제)**. |
| **C16의 "4종"** | 실측 6종이고, `짧은(5~12자)`(`base:483`)은 "섞어라" 한 줄의 토큰, `25자 이내`(`:301`)는 도입 1줄 전용 스코프라 둘 다 충돌항이 아니다. |
| 홈판 소제목 `3~7` vs `0~3` | `issue-story.prompt:6`이 **명시적으로 우선을 선언**한 설계된 오버라이드. |
| 홈판 도입부 3종 | `첫 3문장` ⊂ `첫 3~5문장` — 포함관계, 양립. |
| `B15 3~5문장 균일` | 금지문(`균일하면 AI`)이지 "3~5문장을 쓰라"가 아니다. |
| 키워드 밀도 R0-6 ↔ rubric ↔ seo-90-quality | 셋 다 **같은 방향**("밀도를 목표로 삼지 마라"). |
| `C41` viral splice / `C42` celebrity sanitizer / `C43` claimSanitizer | 각각 사문(빈 문자열, 발행 무해) / 검출 전용(본문 replace 없음) / F2·H6 **부합**. |
| `ensureFront3` | 프로덕션 호출 0건(`contentGenerator.ts:1396-1398` 주석이 명시 거부). |
| `seo/base.prompt:198-200` H5 ↔ `seo/health.prompt:16` | 카테고리가 대상을 명시 지목한 **정상 오버라이드**. 규격에 맞는 유일 사례 — 손대지 말 것. |

---

## 2. base.prompt 자기모순 (별도 절)

카테고리 파일이나 오버레이로 덮을 수 없다. base가 어긋나면 뒤에 오는 어떤 파일도 그 모호성을 해소하지 못한다. `ef6ad3e8`이 3건을 처리했고, **남은 것은 다음 6건뿐**이다(전부 `md5 b552d89c` 기준 재확인).

| 지점 | 축자 | 상대 | 판정 |
|---|---|---|---|
| `:415-425` + `:625` | `[결론부 6줄 공식 — v2.10.1 정밀화]` / `2줄 (저장 트리거): 5개 항목 체크리스트 블록` / `:625 □ 결론부 5개 체크리스트 … 있는가?` | `:411 ⛔ "도움이 되셨다면 공감 눌러주세요"` · `:642 □ … 내용상 필요할 때만 하나를 사용했는가?` (같은 체크리스트 안 17줄 뒤) | **삭제.** rubric·finalContract가 뒤에서 이미 무효화 중 → 동작 변화 없음 (R11) |
| `:569` + `:460` | `- 이모지 전체 0~5개, 소제목 금지` / `B20. 이모지/특수기호 5개 초과` | 런타임이 전량 삭제(`contentGenerator.ts:1032`), 품질검사가 1개도 위반 판정 | **"이모지 사용 금지"로 통일** (R12) |
| `:574` | `- 한 문장 20~35자 권장, 40자 초과 금지` | `exposure-structure.prompt:36` ES-5 `55~80자` — **교집합 공집합** | **스코프 부기**(삭제 아님) (R13) |
| `:454` `:502` `:627` | `B14. 동일 어미 3회 이상 연속` / `[어미 로테이션 — 같은 어미 2회 연속까지만 허용]` / `□ 같은 어미 2회 연속까지만인가?` = 허용 2 | `promptLoader.ts:617,634`(자기 최우선 선언) · `mate/base.prompt:136` = 허용 1 | **허용 1로 통일** (R14) — 선언한 쪽이 이긴다는 원칙 + 조이는 방향 |
| `:591` | `이미지 400~600자마다 1장 (소제목 1개당 1장 + 도입부 1장)` | 한 줄 안에서 두 산식이 다른 답 | 후순위 (R15와 함께 또는 보류) |
| `:115` ↔ `:520`, `:127` ↔ `:519` | R0-1 `첫 3글자로 옮기지 않는다` ↔ `[메인 키워드(앞 3자 이내)]` / `22~42자` ↔ `28~40자` | `situationTitleContract.test.ts:124·126`이 **양쪽 다 못박음** | **D1 결정 후 R16** |

**주의:** `:7`은 `★ 본 섹션 5개 룰은 다른 모든 룰보다 우선`이라 쓰지만 F 계열은 F1~F6 = **6개**다. 그리고 `H1~H9`는 `[SECTION -2]`가 아니라 `[SECTION 1]`(H5=`:198`, H6=`:202`) 소속이라 `:7`의 최우선 선언이 **걸려 있지 않다**. 등급 체계를 새로 세울 때 이 사실을 전제로 삼아야 한다 — 지금 문서의 "L0 = F+H 전체"는 사실 오류다.

---

## 3. 릴리즈 분할

### 매 릴리즈 공통 — 지문 핀 절차 (실측 확인됨)

핀은 문서가 말한 1종이 아니라 **최대 3종**이다. 직전 두 커밋으로 검증:

| 릴리즈 종류 | 갱신 대상 | 근거 |
|---|---|---|
| 코드만 (`src/**.ts`) | `src/contentQualityV3/candidateRuntimeFingerprintPin.ts` 1줄 | `420df2ec`가 정확히 이것만 갱신. 이 계획이 건드리는 `aiHumanizer.ts`·`contentOptimizer.ts`·`contentGenerator.ts`·`affiliateConversionStructure.ts`는 **전부 666개 해시 대상에 포함**(`candidateRuntimeFingerprint.ts:45,198,184,121`) — "코드 수정은 핀 비용 0"은 틀렸다 |
| 프롬프트 (`.prompt` 또는 pin된 `.ts`) | 위 + `docs/content-quality-v3/legacy-baseline.json`(98 prompt + 10 ts) + `src/__tests__/contentQualityV3EvidenceAttestation.test.ts` 리터럴 | `ef6ad3e8`가 정확히 3종 갱신 |

**절차 (역순 금지):**
1. 수정 후 `npx vitest run src/__tests__/contentQualityLegacyBaseline.test.ts src/__tests__/contentQualityV3RuntimeFingerprint.test.ts src/__tests__/contentQualityV3EvidenceAttestation.test.ts` → RED 확인.
2. **실패 메시지의 `changed` 목록이 내가 고친 파일뿐인지 눈으로 확인.** 다른 파일이 섞였으면 다른 세션 WIP이므로 **중단하고 대기**(공유 워킹트리 원칙).
3. `createBaselineManifest`로 `legacy-baseline.json` 재생성, `computeContentQualityV3CandidateRuntimeSha256()` 값으로 핀 갱신. 현재 값은 `41bb313d19adc5f297723c18ced1336798cdac1d8c08a7bdd295ebf157206348`이다 — 문서에 적힌 `e3c8aabe…`는 **저장소에 존재하지 않는 값**이니 그걸 기준으로 삼지 말 것.
4. 3종 재실행 GREEN → `npx vitest run` 전체(6,319) → `npm run build`.

**릴리즈는 반드시 메인 트리에서.** 격리 워크트리는 CRLF라 지문·소스단언 테스트가 깨진다.

---

### Phase A — 코드 (주입기 봉인). 순서 역전 금지

#### R2 — 시한폭탄 2종 봉인 (fix 2)
- `src/contentOptimizer.ts:356` `result = optimizeForAdpost(result);` **삭제**. 사용하지 않게 된 `ADPOST_OPTIMIZED_TRANSITIONS`(`:105-114`)는 함께 제거.
- `src/contentOptimizer.ts:588` 부근 `categories` 배열을 `['expertise']`로 축소(`authority`·`trust` 제거).
- **red-green:** 문단 40개 본문으로 `optimizeContentForNaver` 호출 → 수정 전 `optimizeForAdpost`를 직접 호출한 단위 테스트에서 `'전문가들의 의견에 따르면'` 주입 RED, 수정 후 함수 부재로 GREEN. `enhanceEEAT`는 문단 30개 입력에서 `'공식 발표에 따르면'` 검출 RED → GREEN.
- **검증:** vitest 전체 + 핀 1종. **이 릴리즈 전에 R6(문단 복원)을 절대 먼저 내지 말 것** — 문단이 복원되는 순간 두 주입기가 동시에 켜진다.

#### R3 — 근거 축 훼손 2종 (fix 2)
- `src/aiHumanizer.ts:718-740` `naturalizeNumbers` 파이프라인 분리(호출 제거, C1과 동형).
- `src/aiHumanizer.ts:753-770` 4개 `alternatives` 배열을 전부 `['','','','']`로.
- **red-green:** `'급속 충전 비중이 70%를 넘으면'` → 수정 전 `'상당수를 넘으면'` 변환 발생(RED), 후 원문 유지. `'150%'` → 수정 전 `'1절반 정도 '` 오염(RED), 후 유지. `'자료에 따르면'` 2회 입력 → 2번째 삭제되되 `'알고 보니'` 미출현.

#### R4 — 프롬프트 금칙어 자가주입 3종 (fix 3)
- `src/aiHumanizer.ts:816-818` 격식체 분기를 `return match;`로.
- `src/aiHumanizer.ts:180-184`에서 `'정리하면'`·`'찾아보니까'` 제거.
- `src/aiHumanizer.ts:122` replacement `'보통 '` → `''`, `:98` `'다양한'` 키 삭제.
- **red-green:** `'이 부분이 중요합니다.'` 300회 → 수정 전 `살펴보겠습니다` 300/300(RED), 후 0/300. `'일반적으로 대기 기간'` → `'보통 '` 200/200 → 0/200.

#### R5 — connectIsolatedSentences (fix 1)
- `src/aiHumanizer.ts:850` `casualConnectors`에서 `'알고 보니 '` 제거.
- **red-green:** 연결어 없는 4문장 입력 300회 → `'알고 보니'` 출현 RED → 0.

#### R6 — 문단 복원 (fix 2) · **R2 완료 후에만**
- `src/contentOptimizer.ts:462` `return uniqueSentences.join(' ')` → 원본 구분자를 보존하는 형태로(`aiHumanizer.ts:551` `transformPreservingNewlines`와 동형).
- `src/contentOptimizer.ts:689` `/\n\s+/g` → `/\n[ \t]+/g`.
- **red-green:** 30문단 본문 → 수정 전 1문단(RED), 후 30문단. `finalCleanup("x\n\n\ny")` → 수정 전 `"x\ny"`, 후 `"x\n\ny"`.
- **검증 + 라이브 확인 필수:** `analyzeNaverScore`(`:785-788`)의 `paragraphs >= 3` +5점이 도달 가능해지는지 확인. 그리고 `editorHelpers.ts:1748`이 `!bodyTextHasHeadingMarkers`일 때 미변형 `heading.content`를 쓰므로, **발행 경로 어느 쪽이 실제로 쓰이는지는 라이브 1건 발행으로 확인해야 한다.** 이 릴리즈만은 사용자 라이브 확인 전까지 "완료"로 표기하지 않는다.

#### R7 — geo-overlay 적용 범위 (fix 1)
- `src/contentGenerator.ts:2281` `const geoEligibleMode = contentMode === 'seo' || contentMode === 'affiliate' || contentMode === 'mate';` → `'affiliate'` 제거.
- **red-green:** `affiliate` 조립본에서 `[GEO/AEO OVERLAY]` 마커 존재 RED → 부재 GREEN. `seo`/`mate`에는 계속 존재(양방향 단언).
- **근거 실측:** `grep -c` 결과 `affiliate/base.prompt`의 `R0-`·`H6`·`SECTION 12` = **각 0**. 오버레이의 자기 제한 조항 3개가 전부 참조 불능인데 지시 조항만 작동한다.

#### R8 — 소제목 첫머리 키워드 + 쇼핑 표 (fix 2)
- `src/contentJsonPromptFormat.ts:95` `[강제] 1번 소제목은 반드시…` 줄 삭제(`:96` 존치).
- `src/content/affiliateConversionStructure.ts:32` → `비교·조건은 입력 근거로 대조 행이 2개 이상 확보될 때만 표로 정리한다.`
- **핀 주의:** `contentJsonPromptFormat.ts`는 legacy-baseline의 10개 `.ts`에 포함 → **핀 3종 전부 갱신.**
- **red-green:** SEO 조립본에서 `[강제] 1번 소제목` 부재 단언, `contentModePromptContracts.test.ts` 기존 4단언 GREEN 유지.

---

### Phase B — 프롬프트 · 카테고리/오버레이 파일 (base 미변경)

#### R9 — business 키워드 밀도 (fix 1) — 가장 깨끗한 단독 릴리즈
- `src/prompts/business/base.prompt:151` `- 본문 내 키워드 밀도 1.5~3%` **삭제**.
- **red-green:** business 조립본에 `밀도 1.5~3%` 존재 RED → 부재. 대조군으로 seo 조립본에는 원래 0건임을 함께 단언.
- **근거:** `official-exposure-rubric`은 `promptLoader.ts:236`에서 seo/homefeed/mate로만 한정 주입 → business는 이 수치를 반박할 문장이 **없다**. 수치 축 전체에서 유일하게 스터핑을 **지시**하는 줄이다.

#### R10 — geo-overlay 3블록 삭제 (fix 3)
- `src/prompts/seo/geo-overlay.prompt:15-30` G1 시점 시그널 블록 + `:118` 자가점검 삭제.
- `:65-70` G3 허용 패턴 + `:120` 자가점검 삭제.
- `:105-106` G5 수치 할당량 + `:122` 자가점검 삭제.
- **red-green:** seo 조립본에 `"현재(2026년 5월) 기준"`·`"공식적으로는 ~"`·`H2당 최소 1개의 검증 가능한 구체` 존재 RED → 3건 모두 부재. `[GEO/AEO OVERLAY]` 헤더 자체는 유지(G2/G4 존치).
- **부수 사실:** `:22`의 `"2026년 5월"`은 오늘(2026-08-05) 기준 하드코딩된 과거 날짜다.

#### R11 — shared 오버레이 FAQ·표 (fix 2)
- `src/prompts/shared/exposure-structure.prompt:20-23` ES-3를 `★ 자료에 반복 질문이 실재할 때만 질문-답변 페어 3~6개. 위치를 고정하지 않는다.`로.
- `:30` `2~3열` → `2열`.
- **red-green:** 조립본에서 `2~3열` 부재 + `contentModePromptContracts.test.ts:98,103`(cjpf 2열 핀) GREEN 유지 = 양방향 확인.

#### R12 — 항상켜짐 오버레이 2줄 (fix 2)
- `src/prompts/shared/human-writing-anti-pattern.prompt:23` → `- 소제목이 여러 개면 각 소제목이 서로 다른 역할을 맡는다(상황 정리 / 반응이 갈린 이유 / 오해·한계 / 판단 기준 / 남는 질문 중에서).`
- `src/prompts/shared/situation-depth.prompt:27-28` 삭제(`:26` 존치).
- **red-green:** homefeed 이슈픽 조립본에서 `마지막은 독자가 가져갈 질문` 부재 + `끝까지 읽게 만든다` 부재. `issue-story.prompt:35`의 `0~3개만`은 그대로 남아 있는지 확인.

#### R13 — `~좋아요` 어미 풀 + F1 댕글링 (fix 2)
- `src/promptLoader.ts:529` mom_cafe 어미 풀에서 `~좋아요` 삭제.
- `src/prompts/shared/situation-depth.prompt:15` `(F1 우선)` → `— 자료에 없는 상황·트리거는 만들지 않는다.`
- **핀 주의:** `promptLoader.ts`도 legacy-baseline 대상 → 3종 갱신.
- **red-green:** mom_cafe 조립본에 `~좋아요` 부재(금지 목록 `base:100`의 것은 남아 있어야 하므로 어미 풀 줄만 단언). homefeed 조립본에 `F1` 참조 부재.

---

### Phase C — base.prompt 단독 (회귀 표면 최대, 한 번에 한 종류)

#### R14 — 결론부 공식 (fix 1)
- `src/prompts/seo/base.prompt:415-425` `[결론부 6줄 공식 — v2.10.1 정밀화]` 블록 삭제, `:625` `□ 결론부 5개 체크리스트…` 항목 삭제.
- **red-green:** 조립본에 `저장 트리거`·`공유 트리거`·`결론부 5개 체크리스트` 부재. `:411`·`:642`·`rubric:28`은 그대로.
- **동작 변화:** 없음(뒤에서 이미 무효화 중). 이 릴리즈는 "모델이 받는 모순 지시를 줄이는" 것이 전부다.

#### R15 — 수치 축 2종 (fix 2)
- `:569` `- 이모지 전체 0~5개, 소제목 금지` → `- 이모지는 쓰지 않는다. 소제목에도 넣지 않는다.`
- `:460` `B20. 이모지/특수기호 5개 초과` 삭제.
- **red-green:** 조립본에서 `이모지 전체 0~5개` 부재. `contentQualityChecker` 이모지 위반 판정 로직 무변경 확인.

#### R16 — 문장 길이 스코프 (fix 1)
- `:574` → `- 한 문장 20~35자 권장, 일반 서술 문장은 40자 초과 금지 (ES-1 직답·ES-5 요약·인용문은 예외).`
- **red-green:** `40자 초과 금지`가 남아 있으면서 `ES-1`·`ES-5` 예외 문자열이 존재. ES-5 `55~80자`는 **깎지 않는다**(AI 발췌 계약).

#### R17 — 어미 임계 단일화 (fix 1, 4지점)
- `:454` `B14. 동일 어미 3회 이상 연속` → `B14. 동일 어미 2회 이상 연속`
- `:502` `같은 어미 2회 연속까지만 허용 (이전 3회 → 2회로 강화)` → `같은 어미를 2문장 연속으로 쓰지 않는다`
- `:627` `□ 같은 어미 2회 연속까지만인가? (3회 연속 금지)` → `□ 같은 어미가 2문장 연속으로 반복되지 않는가?`
- `src/content/contentVoiceProfile.ts:70` `같은 어미 3연속 금지` → `같은 어미 2연속 금지`
- **근거:** 판정 기준 (c). `promptLoader.ts:617`이 `이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선 적용`을 **자기 선언**했고 그 값이 허용 1이다. `mate/base.prompt:136`도 이미 1. 느슨한 쪽으로의 통일은 가드 완화라 채택하지 않는다.
- **red-green:** 조립본 어미 축 추출 값이 `{1}` 단일. 수정 전 `{1,2}` RED.

---

### Phase D — 사용자 결정 이후

#### R18 — 제목·소제목 키워드 위치 (D1 결정 후, fix 최대 3)
착수 전 **반드시** `src/__tests__/situationTitleContract.test.ts:124,126`의 `.toContain` 두 줄을 결정 방향에 맞춰 전환해야 한다. 지금 이 테스트는 C17·C5의 **진 쪽 문장을 소스텍스트로 박제**하고 있다(적용 시 1 failed / 10 passed 실증됨). 전환 방향은 `.not.toMatch`로 잠그는 형태를 권장한다 — "틀린 테스트가 회귀를 강제"하는 패턴이 재발하지 않게.

#### R19 — 상황 계약 배타 (D2 결정 후, fix 1)
단순 배타(`usesIssueStoryTitle ? '' : …`)는 **금지**. 그 블록이 싣고 있는 ⛔ 3줄(`메모에 없는 시간·인원·금액·대기시간을 새로 만들지 마라` 외 2건)까지 함께 꺼지고, 대상이 하필 SPEC-DEFAMATION 관할인 연예·실존인물 이슈픽이다. 외과적 분기(날조금지 3줄은 남기고 상황분기·결정지원만 배타)로만 진행. `situationDepthContract.test.ts:66`의 소스텍스트 핀도 함께 갱신 필요(적용 시 1 failed / 5 passed 실증됨).

---

## 4. 자동 탐지 테스트 — 채택안

### 채택 3종

**T-A. 배타 계약 검사 (기존 T5)** — 채택
- 홈판 이슈픽 조립본에 `[SITUATION DEPTH]`와 이슈픽 골격이 동시에 실리지 않는지. 양방향(일반 홈판에는 존재)까지 단언.
- **전제 조건 2개(둘 다 빠지면 영구 GREEN 오탐):** ① 조립본을 `source.contentMode='homefeed'`로 지어야 한다 — `buildModeBasedPrompt`의 `mode` 인자는 계약층(`contentGenerator.ts:2169`)이 안 읽고 `source.contentMode`만 읽는다. ② 조립본 하한 단언(길이 + `[SECTION -2]` 마커 존재)을 반드시 포함 — electron `app` 부재 시 로더가 무음 실패해 모든 `.prompt`가 빈 문자열이 되어도 조립본은 그럴듯하게 나온다.
- 실패 메시지: `[T-A] homefeed/entertainment 조립본에 [SITUATION DEPTH]와 issue-story 골격이 동시에 실렸습니다. contentGenerator.ts:2431에 배타 가드가 없습니다.`

**T-B. 죽은 프롬프트 파일 검사 (기존 T6)** — 채택
- `src/prompts/**/*.prompt` 중 `promptLoader.ts`의 `PromptCategory`·조립 경로 어디에서도 도달하지 않는 파일 목록이 예외 목록과 정확히 일치하는가.
- 현재 잡히는 것: `seo/sports.prompt`, `homefeed/sports.prompt`(`promptLoader.ts:69`가 `'스포츠'→'entertainment'`로 매핑), `shared/strong-headings.prompt`.
- **선행 정리:** `seoHomefeedPromptConflict.test.ts:20`이 `'sports'`를 목록에 넣어 죽은 파일의 **존재를 보증**하고 있다. 파일을 지우려면 이 테스트를 먼저 고쳐야 하고, 파일을 남기려면 T-B 예외 목록에 넣어야 한다. 둘 중 하나를 고르고 **한 릴리즈 안에서** 처리한다.
- 실패 메시지: `[T-B] src/prompts/seo/sports.prompt 는 어떤 조립 경로에서도 로드되지 않습니다. 삭제하거나 DEAD_PROMPT_ALLOWLIST에 사유와 함께 추가하세요.`

**T-C. 수치 축 단일값 — 4축 한정 (기존 T3 축소판)** — 채택
- 축: **제목 글자수 / 표 열 수 / 어미 연속 허용 / 이모지 개수**. FAQ 축은 제외(seo 3~6·mate 4~6은 같은 조립본 충돌이 아니라 모드 간 차이 — 오탐).
- 필수 설계 4가지, 하나라도 빠지면 도입 금지:
  1. **대상은 `buildFullPrompt` + `contentJsonPromptFormat` 조립본.** system-only 덤프로는 `promptLoader.ts`의 톤/아이덴티티 블록이 빠져 이모지 축이 GREEN으로 나온다(실측 확인됨).
  2. **극성 정규화가 본체.** `N회 연속까지만 허용`→N, `N연속 금지`/`N회 이상 연속`→N−1, `N개 이하`→N, 금지 목록 안의 명사→0. 원시 숫자만 세면 `2회까지만 허용`과 `3연속 금지`(같은 규칙)를 충돌로 오탐한다.
  3. **축 앵커 + 배제어.** 제목 축은 같은 줄에 `문장|단락|소제목|캡션|답변블록|요약`이 있으면 배제(없으면 문장 길이 값이 전부 제목 축으로 빨려 들어간다). 앵커와 숫자 사이 절 경계(`, ` `지만`)를 넘지 않게 — mate `소제목은 5~7개로 조정할 수 있지만 … FAQ는 빠지면 안 됩니다` 한 줄에서 5~7이 FAQ 축으로 오분류된 실측 사례가 있다.
  4. **축별 값이 0개면 실패.** 프롬프트 문장을 자연스럽게 다듬다 극성 표현이 바뀌면 파서가 눈이 멀어 조용히 통과한다 — 이게 이 테스트의 진짜 부채다.
- **현재 4축 전부 RED**이므로 `KNOWN_RED` 상수로 baseline 관리하고 축이 늘거나 값이 늘면 실패시킨다. R11(표)·R15(이모지)·R17(어미)·R18(제목)이 각각 한 축씩 GREEN으로 만든다.
- 실패 메시지: `[T-C emoji-count] seo 조립본에 3개 값이 있습니다: 0(promptLoader.ts:87 금지목록) / 3(promptLoader.ts:649) / 5(seo/base.prompt:569, :460). 정의를 1곳으로 모으고 나머지를 삭제하세요.`

### 보조 2종 — 3줄짜리 회귀 핀 (기계 대신)

```ts
it('mom_cafe 어미 풀에 base 금지 어휘가 없다', () => {
  expect(read('promptLoader.ts')).not.toMatch(/~좋아요/);
});
it('후처리 사전이 프롬프트 금칙어를 담지 않는다', () => {
  const h = read('aiHumanizer.ts');
  expect(h).not.toMatch(/정리하면|찾아보니까|살펴보겠습니다|알고 보니/);
});
```
- 실패 메시지: `expected 'aiHumanizer.ts' not to match /정리하면|.../` — 어느 문자열이 되살아났는지 즉시 보인다.

### 기각 — 이유 포함

| 안 | 기각 근거 |
|---|---|
| **T4 (금지↔권장 리터럴 교집합)** | **폐기.** 문서 명세 그대로 구현해 조립본 28~36개에 돌린 결과 **379~767쌍**, 그중 90% 이상이 `❌ "최고의 방법" → ✅ "가장 효과가 검증된 방법"` 같은 **정상 교정 예시**다. 그리고 그 형식은 R14·R16이 직접 고치라고 지시하는 대상 — **프롬프트를 올바르게 고칠 때마다 깨진다.** 억제기를 3개 쌓으면 4건까지 줄지만 그중 진짜는 C21 1건뿐이고, 그 1건은 위 3줄 핀으로 영구 봉인된다. 문서의 "오탐 위험 구조적으로 0에 가까움"은 사실이 아니다. |
| **T2 (댕글링 참조 + ID 유일성) — 현 스펙** | **폐기, 재설계 후 재검토.** ① `H2`가 룰 ID이자 HTML 소제목 어휘라 참조 50건 중 90%가 마크업 오탐(`각 H2가`, `첫 H2 안에`) ② `imageNarrative/food.prompt`가 자기 `F1~F6`·`H1~H4` 네임스페이스를 별도 보유 → 교차 오염 ③ **결정적 결함: `R0-13`/`R0-14`가 이제 `base:147-150` 묘비 주석에만 존재하므로, 이 테스트는 정확히 잘 고쳐진 파일을 실패로 표시한다.** ④ 스펙의 `HF\d+`는 실재하지 않는 토큰(실제는 `HW`). 살리려면 정의 앵커(`^\s*ID\.`) + 대괄호 참조 한정 + 파일별 네임스페이스 분리 + `※` 묘비 제외 4가지가 선행돼야 한다. |
| **T1 (우선순위 선언 전수 강제)** | **기각(경고로만).** 오탐은 실제로 0이지만 ① 초기 비용이 신규 헤더 30줄 이상이고 사람 판단이 필요해 기계가 못 채운다 ② `.prompt` 헤더 1줄만 넣어도 **핀 2종이 즉시 RED**가 되는 것을 red-green으로 실증했다(`seo/life.prompt`에 2줄 주입 → fingerprint + legacy-baseline 동시 FAIL, revert 후 GREEN). "1순위·저비용"은 철회한다. §5의 규격은 **새 파일을 만들 때의 작성 규칙**으로만 채택하고, 기존 파일 소급은 강제하지 않는다. |
| **T5 (SEO↔홈판 중복률 임계)** | **기각.** 같은 두 문자열이 지표에 따라 0.24~0.46을 오간다 — 임계에 원리가 없다. 그리고 중복원이 저작 중복이 아니라 **설계된 공유 오버레이**다(`seo/base` ↔ `homefeed/base` 줄 단위 자카드 **0.002**, `mate/base`와는 0.000). 오버레이를 하나 추가하는 정상 작업마다 실패한다. |
| **의미 매칭 계열** | 기각. `"몇 분이면 끝"` ↔ `"(3분 끝)"`처럼 리터럴이 다르면 못 잡고, 잡게 만들려고 의미 매칭을 넣으면 정밀도 0% 실측 결과가 재현된다. |

---

## 5. 우선순위 선언 규격

### 표기 형식 — 신규 어휘를 만들지 않는다

문서의 `L0-SAFETY` · `관할 8축` 표기는 **채택하지 않는다.** 현재 100개 프롬프트 파일 중 그 어휘를 쓰는 파일이 **0개**다. 규격화가 아니라 신설이고, 신설한 어휘는 아무도 유지하지 않는다.

이미 6개 파일이 쓰고 있는 문법만 규격으로 굳힌다. 첫 10줄 안, `★`로 시작, 세 형태 중 하나:

```
형태 1 (양보) : ★ 충돌 시 <파일명 또는 룰 ID>가 우선한다.
                예) seo/geo-overlay.prompt:7  "★ 충돌 시 base.prompt가 우선."
                예) seo/health.prompt:3       "★ base.prompt [SECTION -2] 자료 외 사실 금지가 이 파일보다 항상 우선한다."

형태 2 (상위) : ★ <조건>일 때 <대상>보다 이 블록이 우선한다.
                예) shared/exposure-structure.prompt:6
                    "★ aiTabFriendlyMode = true 일 때는 ai-tab-friendly.prompt 룰이 본 섹션보다 우선(상위호환)."

형태 3 (한정) : ★ <대상>을 "보강"만 한다. <축>은 기존 룰이 우선.
                예) shared/situation-depth.prompt:5
```

규칙 3가지:
1. 지목 대상은 **실재해야** 한다 — 파일명이면 파일이, 룰 ID면 정의가 그 모드 조립본에 있어야 한다(`situation-depth:15`의 `F1`이 홈판·업체·제휴에서 댕글링인 것이 반례).
2. 모드 조건부 인용(`seo R0-4 / homefeed GAMMA-7`)은 허용하되 **모드를 명시**한다.
3. 우선권을 선언하면서 대체 값을 주지 않는 것은 금지 — `official-exposure-rubric.prompt`가 "keyword-density·title-formula·fixed-heading-count보다 상위"라 선언해 놓고 수치를 하나도 안 갖고 있어서 **수치 축에서는 영원히 승자가 될 수 없는 상태**(N19)가 그 반례다.

### 적용 순서

문서가 말한 "26개"는 카테고리 파일만 센 수치다. 조립 도달 실측은 **36개**다(shared 7 + 모드 base 5 + seo 카테고리 12 + homefeed 카테고리 12; `strong-headings`·`sports` 3개는 죽은 파일이라 제외).

| 차수 | 대상 | 개수 | 현황 |
|---|---|---|---|
| 1차 | `shared/` — `official-exposure-rubric`, `homefeed-90-quality`, `seo-90-quality`, `mate-90-quality`, `human-writing-anti-pattern` | 5 | `exposure-structure`·`situation-depth` 2개는 이미 보유. `official-exposure-rubric:1-3`과 `issue-story:6`은 **★ 없는 다른 문법**이므로 형식만 통일(2줄 편집) |
| 2차 | 모드 base — `homefeed`, `mate`, `affiliate`, `business` | 4 | `seo/base:7` 보유(단 "5개 룰" → F1~F6 6개 불일치 동시 수정) |
| 3차 | `seo/` 카테고리 12 | 12 | `health:3`·`pet:3` 2개 완료. 나머지 10개는 그 문장을 복제하는 기계적 작업 |
| 4차 | `homefeed/` 카테고리 12 | 12 | `issue-story` 형식 통일 포함. **홈판 health·pet은 구규격 6줄 그대로**(seo 쪽만 `8289a025`에서 교체됨) |

**차수마다 별도 릴리즈**로 낸다. 프롬프트 바이트가 움직이므로 매번 핀 3종 갱신이 붙는다. 1차·2차만 강제하고 3차·4차는 경고로 시작할 것을 권한다.

---

## 6. 사용자 결정 필요

| # | 결정 사항 | 선택지 | 왜 내가 못 정하는가 |
|---|---|---|---|
| **D1** | 제목에서 메인 키워드를 앞 3자에 고정할 것인가 (C5·C17) | (A) 고정 유지 — `base:115` R0-1을 삭제하고 SPEC-KEYWORD-ENDGAME 노선 확정 / (B) 고정 폐기 — `base:520`·`:519`·`cjpf:100`·`situationTitleContract.ts:56`·`business:150`·`title/seo*` 3곳을 정리 | 판정 기준 (a)근거게이트 (b)네이버공식 (c)자기선언 **셋 다 판정 불가**. 게다가 `situationTitleContract.test.ts:124·126`이 두 줄로 **양쪽을 동시에 못박고** 있고, `:519`는 커밋 `60021a64`("제목 공식 전면 폐기")가 이번 주에 새로 넣은 것이라 삭제 = 되돌리기다. 제품 노선 결정 |
| **D2** | 홈판 이슈픽에서 상황 깊이 계약을 뺄 것인가 (C22) | (A) 유지(현행 — 이슈픽 골격이 매번 덮임) / (B) 외과적 배타(날조금지 3줄은 남기고 상황분기·결정지원만 제외) | 연예·실존인물 글의 안전 계약이 걸려 있다. 통째 배타는 SPEC-DEFAMATION 관할 가드를 끈다 |
| **D3** | 어미 연속 허용을 1로 조일 것인가 (R17) | (A) 허용 1로 통일(권장 — 선언한 쪽·조이는 쪽) / (B) 허용 2로 통일(base 다수에 맞춤, `promptLoader`·`mate` 수정) | 판정 기준 (c)로는 A가 맞지만, 같은 어미 2연속조차 금지하면 문장 리듬이 실제로 어떻게 변하는지는 라이브에서만 보인다 |
| **D4** | `잖아요`·`거든요`를 가점으로 볼 것인가 감점으로 볼 것인가 (C13/N20) | (A) `humanlikeEval.ts:73` CRUTCHES에서 두 개 제외 / (B) `human-writing-anti-pattern.prompt:8-11` 어미 팔레트에서 두 개 제외 | 발행 게이트(`qualityEvaluator.ts:148`) 점수에 직결. **지금은 프롬프트가 쓰라고 지시한 어미를 게이트가 감점한다.** 어느 쪽이 옳은지는 문체 정책이고, 발행 차단 임계에 영향이 가므로 임의로 못 정한다 |
| **D5** | 홈판에 문장 길이·본문 목표 글자수·FAQ 개수를 넣을 것인가 (N18) | (A) 현행 유지(비워 둠 — 자유도) / (B) seo 수준으로 채움 | 홈판 글의 길이·깊이 흔들림이 이 공백에서 오는지 다른 데서 오는지는 계측 없이 못 가른다 |
| **D6** | 릴리즈 묶음 크기 | 위 계획은 코드 8 + 프롬프트 9 = **17릴리즈**. 회귀 추적을 위해 쪼갠 결과다 | 사업 일정상 몇 개를 묶을지는 사용자 판단. 단 R2→R6 순서와 "코드·프롬프트 비혼합"만은 지켜야 한다 |

---

## 7. 이 계획으로 달성되지 않는 것

1. **노출·품질이 좋아진다는 보장이 없다.** 노출 계측기가 고장나 있어 위 17개 릴리즈 중 어느 것도 효과를 측정할 수 없다. 이 계획이 증명하는 것은 단 하나 — **조립본이 자기모순을 덜 말하게 된다**는 것이다. 모델이 그 결과 무엇을 쓰는지는 측정 범위 밖이다.

2. **"충돌 전수"가 아니다.** 이번에 조립본을 실제로 덤프해 수치 축은 전수에 가깝게 세었지만(444개 수치 줄 귀속, 실패 0건), 지시 축(금지↔권장)은 **자동 탐지가 실패했다** — T4는 명세대로면 767쌍 중 진짜가 1건이다. 지시 축은 여전히 사람 육안이고, 육안은 전수를 보증하지 못한다.

3. **덤프하지 않은 경로가 남아 있다.** 커스텀 프롬프트, GEO OFF, `aiTabFriendlyMode` ON, 쇼핑 `articleType` 분기, `hasFactCheckSource` 경로는 조립본을 뜨지 않았다. 그 안에 충돌이 더 있을 수 있다.

4. **N1(문단 복원)의 실제 발행 도달 여부가 미확정이다.** `optimizeContentForNaver`는 `bodyPlain`만 변형하고 `headings[].content`는 건드리지 않으며, `editorHelpers.ts:1748`이 `!bodyTextHasHeadingMarkers`일 때 미변형 쪽을 쓴다. 어느 경로가 다수인지는 **라이브 발행 1건 없이는 판정 불가**다. R6은 이 확인 전까지 완료로 표기하지 않는다.

5. **`official-exposure-rubric.prompt`의 외부 출처를 확인하지 못했다.** 파일 안에도 저장소 어디에도 URL·게시일이 없다. 위 판정에서 (b)"네이버 공식 부합"을 근거로 쓴 항목(C14·N15·N16)은 **"저장소가 공식이라고 선언한 파일"**에 기댄 것이지 외부 [A] 등급 근거가 아니다. 이 계획에는 등급 [A]를 붙일 수 있는 외부 출처가 **하나도 없다** — 붙이지 않은 이유다.

6. **모델이 실제로 어느 쪽 지시를 따르는지 모른다.** 조립 순서·자기 선언·반복 빈도는 전부 문면 사실이다. "뒤에 온 것이 이긴다"도 "많이 반복된 것이 이긴다"도 이 저장소에서 측정된 적이 없다. 승자 판정은 **어느 쪽을 지워도 안전한가**를 고르는 데만 쓰였고, 그 이상을 주장하지 않는다.

7. **T-A/T-B/T-C 3종을 도입해도 새 충돌이 자동으로 잡히지 않는다.** 잡히는 것은 배타 계약 1건, 죽은 파일 3건, 수치 4축뿐이다. 지시 축·형식 계약·코드↔프롬프트 충돌은 여전히 사람이 조립본을 떠서 읽어야 한다.
