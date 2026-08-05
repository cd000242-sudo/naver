# 네이버 주제 32개 — 통합 실행 플랜

> 본 플랜의 코드 사실은 4개 그룹 보고와 별개로 이 세션에서 원문 재확인했다(`src/promptLoader.ts:50-128/156-171/200-208/265-277`, `src/renderer/modules/contentGeneration.ts:570-585`·`1135-1150`, `src/contentGenerator.ts:552-563`, `src/content/ctrCombat.ts:249-262`, `src/renderer/modules/fullAutoFlow.ts:2468` 및 `collectFullAutoFormData`, `src/renderer/modules/formAndAutomation.ts:363-368`, `src/sourceAssembler.ts:7431`, `public/index.html:705-742`·`7530`, `src/renderer/modules/continuousPublishing.ts:1984`·`2828`, `src/contentTonePolicy.ts:18-45`, `src/prompts/{seo,homefeed,title/seo,title/homefeed}/` 파일 목록).
> 4개 그룹 보고에 있던 재현 불가 수치(데이터랩 절대값, 블로그 total 비율, "방송 = 영화의 3.5~5.9배")는 **본 플랜의 판정 근거에서 전부 제외**했다. 우선순위는 코드 결함의 blast radius와 법적 노출로만 정렬한다.

---

## 0. 확정된 사실 (플랜 전체의 전제)

1. UI 주제 슬러그는 35종(`public/index.html:707-741`) = 네이버 32주제 + `tips`/`realestate`/`self_dev`.
2. 슬러그 → 힌트 사전 `categoryHintMap`은 **13키뿐**이고 `contentGeneration.ts:570`·`1135`에 **사본 2개**로 존재하며 값이 이미 갈라졌다(`:583 'general':'general'` vs `:1148 'general':''`).
3. 35종 중 사전에 걸리는 슬러그는 **`general`·`tips`·`parenting`·`sports`·`health`·`shopping_review` 6개**. 나머지 29종은 `|| ''` → `resolveCategory('')` → **`general`**.
4. 힌트가 `''`이면 `sourceAssembler.ts:7431`의 `categoryHint: keywords[0]` 폴백이 살아나 **같은 주제라도 키워드에 따라 프롬프트가 바뀌는 비결정적 로딩**이 된다(단절보다 나쁜 실패 양식 — 재현 불가·회귀 추적 불가).
5. 풀오토 경로에는 카테고리가 **아예 없다**. `collectFullAutoFormData()`(`fullAutoFlow.ts:2016-2095`) 반환 객체에 `category`/`categoryName`/`categoryHint`/`articleType`/`contentMode` **전부 부재** → `fullAutoFlow.ts:2468`의 3단 `||` 체인이 `undefined`. 다른 진입점에서는 `formAndAutomation.ts:366`이 넣는 **네이버 블로그 폴더명**이 표시명보다 우선한다.
6. 연속발행은 카테고리 미지정 항목을 **`'entertainment'`로 기본 확정**한다(`public/index.html:7530` hidden input value, `continuousPublishing.ts:2828`·`1984`). 요리·여행·재테크 항목까지 연예 가드 + 홈판 `issue-story` 골격을 받는다.
7. `src/prompts/seo/sports.prompt`·`homefeed/sports.prompt`는 **실재하나 `PromptCategory` union에 `sports`가 없어 `buildSystemPrompt`에서 영구 미도달**. "파일을 만들고 배선을 빠뜨려 죽는" 사고가 이 저장소에 **이미 실증**돼 있다.
8. `contentTonePolicy.ts:32-45`의 자동 톤 정규식은 `컴퓨터`·`비즈니스`·`학문`·`스타`·`만화` 같은 **한국어 표시명 리터럴**을 직접 담는다 → 힌트를 표시명으로 통일하는 방향이 톤 정책과 정합한다.
9. `resolveCategory`(`:156-171`)는 정확매칭 → **부분매칭(첫 일치 반환)** → general 3단. 부분매칭은 삽입순서 의존이라 조용한 오분류원이다.

---

## 1. 최종 매핑표 (32행)

표기: `현재 매핑` = `UI 슬러그 → categoryHintMap 힌트 → resolveCategory 결과`.
`최종 판정`의 **유지**는 "이번 플랜에서 매핑 값을 바꾸지 않음"이며, 배선 수리(§3 R2~R3)는 32행 전부에 공통 적용된다.

### 엔터테인먼트·예술 (9)

| 네이버 주제 | 현재 매핑 | 문제 | 최종 판정 | 근거 |
|---|---|---|---|---|
| 문학·책 | `literature` → `''` → **general** | 사전 미등록. 힌트 공백 → 키워드 폴백 비결정 | **분기** → `entertainment` | `seo/entertainment.prompt`가 "작품·인물의 이름·발언·일정", "인용은 입력에 있는 실제 문장만 짧게", "실제 시청·관람 메모가 있을 때만 1인칭"을 이미 담는다. 신규 파일 0 |
| 영화 | `movie` → `''` → **general** | 동일 | **분기** → `entertainment` | 동일. `CATEGORY_MAP:73 '영화'`가 이미 entertainment |
| 미술·디자인 | `art_design` → `''` → **general** | 동일 | **분기** → `tips` | `seo/tips.prompt`의 "준비 조건, 순서, 확인 방법, 실패 방지 포인트" = 요구되는 절차형 골격 그 자체. 오유도 문장 없음 |
| 공연·전시 | `performance` → `''` → **general** | 동일 | **분기** → `travel` | `homefeed/travel.prompt`의 "운영시간·요금·교통·예약·휴무" = 요구되는 방문 실용 골격 그 자체 |
| 음악 | `music` → `''` → **general** | 동일. 폴더명 `'음악'` 경로에서만 CTR `entertainment` / 프롬프트 `general` 불일치 발생 | **분기** → `entertainment` | 가사 인용 가드는 프롬프트 3줄로 처리(§3 R12) |
| 드라마 | `drama` → `''` → **general** | 동일 | **분기** → `entertainment` | `CATEGORY_MAP:72 '드라마'` 기존 키 |
| 스타·연예인 | `celebrity` → `''` → **general** | 매핑 의도는 맞으나 배선이 끊겨 미도달 | **유지(entertainment) + 배선 수리** | 설계 의도대로. `isCelebrityContext`는 homefeed 모드 전체를 celebrity로 취급(`src/content/celebrityAssertionSanitizer.ts:29-31`)하므로 카테고리와 무관 |
| 만화·애니 | `cartoon` → `''` → **general** | 동일 | **분기** → `entertainment` | 연재상태 가드는 프롬프트 3줄로 처리 |
| 방송 | `broadcast` → `''` → **general** | 동일 | **분기** → `entertainment` | 단 홈판 `issue-story` 서사 골격이 편성정보형에 붙으면 안 됨 → **R4(발동축 이동) 선행 필수** |

### 생활·노하우·쇼핑 (9)

| 네이버 주제 | 현재 매핑 | 문제 | 최종 판정 | 근거 |
|---|---|---|---|---|
| 일상·생각 | `general` → `'general'`/`''` → **general** | 사본 2개 값 불일치(`:583` vs `:1148`) | **분기** → `life` | `seo/life.prompt` 1행이 생활·쇼핑·문화 스코프를 명시 |
| 육아·결혼 | `parenting` → `'육아'` → **parenting** ✅ | 매핑은 정상. `parenting.prompt` 6줄 전부 아이·양육이고 결혼/예식 매칭 0 | **유지 + 프롬프트 2줄** | 결손 원문 확인 |
| 반려동물 | `pet` → `''` → **general** | `pet.prompt` 존재하나 미도달. 키워드 폴백도 안 걸림('강아지 사료 추천' → general) | **분기** → `pet` | 배선 수리 효과가 가장 직접적인 행 |
| 좋은글·이미지 | `good_writing` → `''` → **general** | 힌트 공백 → 폴백 비결정 | **유지(general 명시)** | 목록형 허용은 `promptLoader.ts:212` 오버레이 게이팅 문제이지 카테고리 문제가 아니다(§5 결정 항목). `general` 문자열을 명시하면 truthy라 키워드 폴백이 차단돼 결정성만 확보 |
| 패션·미용 | `fashion` → `''` → **general** | `fashion.prompt` 미도달 | **분기** → `fashion` + 프롬프트 2줄 | 기능성화장품 표시 규제 언급 0 확인 |
| 인테리어·DIY | `interior` → `''` → **general** | 미도달. 단 키워드 '인테리어' 포함 시 폴백으로 living 적중 → 비결정 | **분기** → `living` | 결정성 확보 |
| 요리·레시피 | `food_recipe` → `''` → **general** | 미도달. `food.prompt`는 레시피/맛집 필드가 섞여 있음 | **분기** → `food` + 프롬프트 2줄 | 파일 신설 시 환각가드 5줄이 중복 부채가 된다 |
| 상품리뷰 | `shopping_review` → `'쇼핑'` → **life** ✅ | 매핑은 적합. 실제 결함은 (a) 풀오토/연속발행에서 폴더명이 이겨 도달 실패, (b) 공정위 표기 **서식**(글자 크기·색) 미구현 | **유지 + 배선 + 서식 수리** | `seo/life.prompt` 4행이 "맞는 대상, 맞지 않는 조건, 확인할 항목"으로 구매판단 분기를 이미 커버 → SEO 프롬프트 신설 불필요 |
| 원예·재배 | `gardening` → `''` → **general** | 미도달 | **분기** → `tips` + 프롬프트 2줄 | `tips.prompt` 절차형 골격과 정합 |

### 취미·여가·여행 (8)

| 네이버 주제 | 현재 매핑 | 문제 | 최종 판정 | 근거 |
|---|---|---|---|---|
| 게임 | `game` → `''` → **general** | 폴더명 `'게임'` 경로에서만 `CATEGORY_MAP:96` → `it`. `seo/it.prompt`는 발열·배터리·사용 기간 등 **적극적 오유도** 포함 | **분기** → `tips` | `tips.prompt`는 공략형 절차 골격과 정합하고 오유도 문장이 없다. 전용 파일은 발행량 실측 후 재심 |
| 스포츠 | `sports` → `'스포츠'` → **entertainment** | `seo/sports.prompt`·`homefeed/sports.prompt`가 존재하는데 union 미등록으로 영구 미도달 | **분리(배선)** → `sports` | 신규 파일 0. entertainment(작품·인물·루머)와 sports(선수·팀·기록·부상)는 명사 집합이 배타적이라 한 줄 병합이 불가. `HOMEFEED_ISSUE_STORY_CATEGORIES`에 **동시 추가** 필수(누락 시 홈판 골격·`promptLoader.ts:1221 neoHookExcluded` 판정이 조용히 뒤집힘) |
| 사진 | `photo` → `''` → **general** | 미도달 + `promptLoader.ts:200`에서 general은 카테고리 보정 0 | **분기** → `tips` | 절차형 정합 |
| 자동차 | `car` → `''` → **general** | 폴더명 경로에선 `CATEGORY_MAP:119` → `life`, `ctrCombat.ts:257`은 `tech` → 두 축 분열 | **분기** → `it` (+`CATEGORY_MAP:119`를 `'it'`로) | 네이버 피드메이커가 "자동차/테크"를 **한 카테고리**로 운영([A] 원문 확인) → 통합 근거. CTR `tech`와도 자동 정렬. **단 `it.prompt` 자동차 분기 2줄이 선행돼야 함**(발열·배터리 오유도) |
| 취미 | `hobby` → `''` → **general** | 미도달 | **분기** → `tips` | 동일 |
| 국내여행 | `travel_domestic` → `''` → **general** | 미도달 | **분기** → `travel` (프롬프트 무변경) | `seo/travel.prompt` 국내 전제와 정확히 일치. 본문 손대지 말 것 |
| 세계여행 | `travel_world` → `''` → **general** | 미도달 + 비자/여권/환율/시차 필드 부재(grep 2건, `travel.prompt` 미포함) | **분기** → `travel` + 프롬프트 3~4줄 | 여권법 §17/§26(1년 이하 징역 또는 1천만원 이하 벌금) [A] 확인. **국가명 목록 하드코딩 금지** — 여행금지국 고시는 2027-01-31 갱신 |
| 맛집 | `tasty_restaurant` → `''` → **general** | 미도달 + "지역명+업종" 규칙이 `business/base.prompt:149`에만 있어 맛집 경로 미적용 | **분기** → `food` + 프롬프트 2줄 | 공정위 2024-12-01 시행 [A] 확인. **"네이버 랭킹 불이익" 문장은 [C] 출처라 인용 금지** |

### 지식·동향 (6)

| 네이버 주제 | 현재 매핑 | 문제 | 최종 판정 | 근거 |
|---|---|---|---|---|
| IT·컴퓨터 | `it_computer` → `''` → **general** | 미도달 | **분기** → `it` | `it.prompt` 내용은 적합, 도달만 고장 |
| 사회·정치 | `society_politics` → `''` → **general** | 미도달. YMYL·명예훼손 노출 주제인데 카테고리 규율 0 | **분기** → `society` | `society.prompt`가 정책·기준일·공식 확인처를 이미 담음. **분리 기각** — 실체는 `HOMEFEED_ISSUE_STORY_CATEGORIES` 멤버십 1건이며 R4가 닫는다 |
| 건강·의학 | `health` → `'건강'` → **health** ✅ | 매핑 정상. 그러나 `prePublishGate`(`contentGenerator.ts:1136-1139`)는 영문 배열과 한국어 힌트 `'건강'`을 대조 → 게이트에서 general로 낙하. `contentQualityV3`는 `isV3Prompt` 분기 밖이라 호출 체인 자체가 끊김 | **유지 + 게이트 수리(별건)** | 카테고리 재편 불필요 |
| 비즈니스·경제 | `business_economy` → `''` → **general** | 미도달 | **분기** → `society` | `society.prompt`에 금리·세금 규율 존재 |
| 어학·외국어 | `language` → `''` → **general** | 힌트 공백 → 폴백 비결정 | **유지(general 명시)** | 실질 충돌 근거 없음. `base.prompt` 정보형 골격이 적합 |
| 교육·학문 | `education_scholarship` → `''` → **general** | 미도달. 폴더명 `'교육'` 경로에선 `CATEGORY_MAP:116` → `parenting`(월령·발달 축, 부적합) | **분기** → `society` (+`CATEGORY_MAP:116` `'교육'`을 `'society'`로) | 필요 규율(기준일·신청 기간·공식 확인처)이 `society.prompt`에 있다. `education.prompt` 신설은 배선 8지점이 필요하고 하나만 빠지면 죽는다(sports 실증) |

**요약**: 32행 중 매핑 값 변경 **26행**, 유지 **6행**(육아·결혼 / 좋은글·이미지 / 상품리뷰 / 스타·연예인 / 건강·의학 / 어학·외국어). 신규 프롬프트 파일 **0건**. 신규 `PromptCategory` **1건(`sports`, 파일은 이미 존재)**.

---

## 2. 우선순위 근거

정렬 기준은 **① 결함의 blast radius(몇 개 주제·몇 개 경로에 동시에 걸리는가) → ② 법적 노출 → ③ 매출 경로 근접성 → ④ 수정 비용** 순이다. 검색량·노출률 추정치는 재현 실패했으므로 순위 근거에서 배제했다.

**1위 — 연속발행 기본값 `'entertainment'` (R1).**
32주제 **전부**에 걸린다. 카테고리를 건드리지 않은 모든 연속발행 항목이 연예 가드 + 홈판 이슈픽 서사 골격을 받는다. 요리 글에 "정체 숨김형" 훅이 붙는 종류의 오염이며, 주제별 매핑을 아무리 정확히 고쳐도 이 한 줄이 살아 있으면 연속발행 경로에서 전부 무효화된다. 수정 비용은 3개 지점, 논리 변경 없음.

**2위 — 힌트 사전 SSOT + 풀오토 배선 (R2~R3).**
26행의 매핑 수정이 **모두 이 두 릴리즈에 종속**된다. SSOT 없이 개별 매핑을 고치면 사본 2개 중 하나만 고쳐 드리프트가 커지고(이미 `'general'` vs `''`로 갈라져 있다), 풀오토 배선 없이 매핑을 고치면 풀오토 사용자에게는 한 줄도 도달하지 않는다. 순서를 뒤집으면 이후 모든 릴리즈의 검증이 무의미해진다.

**3위 — 상품리뷰 공정위 표기 서식 (R11).**
쇼핑 매출 직결 + 법적 노출. 매핑은 이미 `life`로 적합하므로 이 행의 실제 결함은 매핑이 아니라 (a) 배선(2위가 해결), (b) 표시 **서식**이다. 위치 요건("제목 또는 첫 부분")은 `editorHelpers.ts:1013-1024`/`1202-1213`로 충족되나 글자 크기·색 구분이 미구현이고, 같은 파일에 `setFontSize()`가 `:383/502/573/595`에 이미 있어 구현 난이도가 낮다. 이 요건은 2024 개정 신설이 아니라 그 이전부터 존재했다(신·구조문 대비표 '현행'란) — 미준수 기간이 길다는 뜻이므로 후순위로 미룰 근거가 없다.

**4위 — `issue-story` 발동축 이동 (R4).**
현재 카테고리 멤버십으로 발동하므로 엔터 7행 매핑 복원(R9)의 **선행 조건**이다. R4 없이 방송·문학·음악을 entertainment로 옮기면 편성정보·서평에 서사 골격이 얹힌다. 동시에 사회·정치 "분리" 요구와 비즈니스·경제 "글 유형 축" 요구를 **한 수정으로 동시에 닫는다**.

**5~8위 — 매핑 복원 4묶음 (R5~R9).**
전부 사전 값 변경이라 비용은 동일하다. 순서는 "이미 완성된 프롬프트 파일이 있고 프롬프트 선행 조건이 없는 것" 우선: 생활군(pet/fashion/living/food) → 여행·맛집·일상 → 지식군 → 취미군 → 엔터군(R4 종속). 자동차만 `it.prompt` 분기 선행이 필요해 R13 뒤로 뺐다.

**최하위 — `sports` 분리(R10)와 프롬프트 보강(R12~R14).**
sports는 union 확장 + 홈판 집합 + 기존 테스트 갱신이 얽혀 회귀면이 가장 넓은데, 얻는 것은 1개 주제다. 프롬프트 보강은 매핑이 도달하기 전에는 효과를 관측할 방법 자체가 없으므로 매핑 릴리즈 뒤여야 한다.

---

## 3. 릴리즈 분할

각 릴리즈는 **매핑/배선**과 **프롬프트 텍스트**를 섞지 않는다. 공통 검증 절차는 아래를 매 릴리즈 반복한다.

```
[공통 검증]
1. npx vitest run                      → 전체 GREEN (0 failed) 출력 확인
2. npm run build                       → exit 0, 0 errors
3. git diff --stat / git diff <파일>   → 변경 라인이 계획과 1:1 대응하는지 독립 확인
4. node -e "require('./dist/promptLoader.js')…" 프로브로 실제 반환값 출력
5. red-green: 수정 revert → 해당 테스트 FAIL 확인 → 복구 → PASS 확인
※ 릴리즈는 메인 워킹트리에서만 (격리 워크트리는 CRLF로 지문·소스단언 테스트가 깨진다)
```

---

### R1: 연속발행 카테고리 기본값 제거 — **1 fix**

**파일:라인**
- `public/index.html:7530` — `<input type="hidden" id="continuous-modal-category-select" value="entertainment">` → `value=""`
- `src/renderer/modules/continuousPublishing.ts:2828` — `|| 'entertainment'` → `|| ''`
- `src/renderer/modules/continuousPublishing.ts:1984` — `categorySelect?.value || 'entertainment'` → `categorySelect?.value || ''`

3개 지점이지만 결함은 1개(동일 기본값)이므로 1 fix로 센다.

**정확한 변경**: 미선택 시 빈 문자열을 전달한다. `resolveCategory('')`는 `general`을 반환하므로 카테고리 보정 없이 base 골격만 적용된다. 선택 강제 UI는 이 릴리즈에서 추가하지 않는다(기능 추가 금지).

**검증**
- 신규 테스트 `src/__tests__/continuousPublishingCategoryDefault.test.ts`: 세 지점의 소스 텍스트에 대해 `.not.toMatch(/\|\|\s*['"]entertainment['"]/)` 와 `index.html`의 hidden input `value=""` 를 단언. (프로젝트 관례에 따라 `.not.toMatch`로 버그 동작 재도입을 잠근다.)
- 공통 검증 1~3.

**red-green**
1. 테스트 작성 → 현행 코드에서 **RED**(3개 전부 매치되므로 실패) 확인.
2. 3개 지점 수정 → **GREEN**.
3. `git stash` 로 수정만 되돌림 → **RED 재확인** → `git stash pop` → **GREEN**.

**회귀 관찰 포인트**: 홈판 연속발행에서 `issue-story` 오버레이가 더 이상 무조건 붙지 않는다. 기존 `homefeedIssueStorySkeleton.test.ts`는 `buildSystemPrompt` 직접 호출이라 영향 없어야 하며, 영향이 있으면 그 자체가 결함 신호다.

---

### R2: 슬러그→힌트 사전 SSOT 추출 (동작 무변경 리팩터) — **1 fix**

**파일:라인**
- 신설 `src/shared/categoryTaxonomy.ts` (신규, 100줄 미만)
- `src/renderer/modules/contentGeneration.ts:570-585` → import 치환
- `src/renderer/modules/contentGeneration.ts:1135-1150` → import 치환

**정확한 변경**
```ts
// src/shared/categoryTaxonomy.ts
// Single source of truth: UI article-type slug -> Korean category hint.
// Values MUST be Korean display tokens: resolveCategory() keys on Korean,
// and contentTonePolicy regexes match Korean display literals directly.
export const ARTICLE_TYPE_TO_HINT: Readonly<Record<string, string>> = { ... };
export function resolveArticleTypeHint(articleType?: string): string { ... }
```
이 릴리즈에서는 **현행 13키의 값을 그대로 옮긴다**. 유일한 정규화는 `'general'` 사본 불일치(`:583 'general'` vs `:1148 ''`)를 `'general'`로 통일하는 것 — `resolveCategory('general')`과 `resolveCategory('')`가 모두 `general`을 반환하므로 관측 가능한 동작 변화가 없다(프로브로 증명).

**검증**
- 신규 캐릭터라이제이션 테스트 `src/__tests__/categoryTaxonomyBaseline.test.ts`: **UI 슬러그 35종 전부**에 대해 `resolveCategory(resolveArticleTypeHint(slug))` 결과를 **현행 값 그대로** 스냅샷 단언(29종 `general`, 5종 매핑, `tips`). 리팩터 전 작성 시 GREEN이어야 한다.
- 프로브: `node -e` 로 `dist/promptLoader.js`의 `resolveCategory`에 35종 힌트를 투입해 표 출력 → 리팩터 전/후 diff 0 확인.
- 공통 검증 1~3.

**red-green**
1. 베이스라인 테스트 작성 → 리팩터 **전** GREEN(현행 동작 기록).
2. SSOT 추출 + import 치환 → **GREEN 유지**(무동작변경 증명).
3. SSOT 사전에서 임의 키 1개(`'health'`) 삭제 → **RED** 확인 → 복구 → GREEN. (테스트가 실제로 사전을 감시하는지 증명)

---

### R3: 풀오토·통합 경로 categoryHint 배선 복구 — **2 fix**

**파일:라인**
- fix1: `src/renderer/modules/fullAutoFlow.ts` `collectFullAutoFormData()` 반환 객체(`:2016-2095` 범위)에 `articleType`, `categoryName` 2필드 추가 — `#unified-article-type`의 값과 표시 텍스트를 읽어 넣는다.
- fix2: `src/renderer/modules/fullAutoFlow.ts:2468` — `categoryHint: formData.category || formData.categoryName || formData.categoryHint` 의 우선순위를 **주제 슬러그 우선**으로 역전:
  `categoryHint: resolveArticleTypeHint(formData.articleType) || formData.categoryName || formData.category || formData.categoryHint`

**근거**: `formData.category`는 `formAndAutomation.ts:366`에서 `UnifiedDOMCache.getRealCategory()`(= 네이버 블로그 **폴더명**)로 채워지며, 폴더명은 사용자가 자유 작명하므로 프롬프트 라우팅 입력으로 부적합하다. 주제 슬러그가 존재하면 그것이 이겨야 한다.

**이 릴리즈에서 하지 않는 것**: `contentMode`·`articleType`의 **소비 측** 배선 변경. `contentMode`는 현재 `'seo'`로 고정 낙하 중인데(같은 결함), 이를 켜면 발행 결과가 전면 변화하므로 §5 사용자 결정 항목으로 분리한다.

**검증**
- 신규 테스트: `collectFullAutoFormData` 반환 키 집합에 `articleType`/`categoryName` 포함 단언 + `:2468` 우선순위 순서를 소스 단언이 아닌 **순수 함수 추출 후 단위 테스트**로 검증(폴더명 `'내 블로그 폴더'` + 슬러그 `food_recipe` 동시 투입 시 `'요리·레시피'`가 나오는지).
- 공통 검증 1~3, 5.

**red-green**
1. 우선순위 테스트 작성 → **RED**(현재 폴더명이 이김).
2. fix1+fix2 → **GREEN**.
3. fix2만 revert → **RED** 재확인.

---

### R4: `issue-story` 발동축을 카테고리 → 소스 성격으로 이동 — **1 fix**

**파일:라인**
- `src/promptLoader.ts:269` — `if (mode === 'homefeed' && HOMEFEED_ISSUE_STORY_CATEGORIES.has(category))` 에 **소스 조건 AND** 추가
- `src/promptLoader.ts:1221` — `neoHookExcluded` 동일 기준 적용
- `src/contentGenerator.ts:2420-2421` — 호출부에 소스 성격 플래그 전달

**정확한 변경**: `buildSystemPrompt`에 선택적 인자 `isIssueShaped?: boolean`을 추가하고, 조건을 `mode==='homefeed' && HOMEFEED_ISSUE_STORY_CATEGORIES.has(category) && isIssueShaped !== false` 로 바꾼다. 호출부는 "뉴스 URL 또는 이슈형 rawText 존재"를 플래그로 넘긴다. **기본값은 `true`** — 인자를 넘기지 않는 기존 호출부(테스트 포함)의 동작을 보존해 회귀면을 최소화한다.

**계약 준수**: `issue-story.prompt` **본문은 한 줄도 건드리지 않는다**. 골격(인용 훅·타임라인·초단문)은 실측 승자 패턴으로 커밋 `60021a64`에 문서화돼 있다. 바꾸는 것은 *언제 붙이는가*뿐이다.

**검증**
- `src/__tests__/homefeedIssueStorySkeleton.test.ts` 확장: (a) 인자 미전달 시 기존 3개 테스트 전부 GREEN 유지(기본값 보존 증명), (b) `isIssueShaped=false` 전달 시 `[ISSUE-STORY]` 미포함, (c) 오버레이 순서 단언(`base` → `90+` → `ISSUE-STORY`) 유지.
- 공통 검증 1~3, 5.

**red-green**
1. (b) 테스트 작성 → **RED**(현재는 항상 붙음).
2. 수정 → **GREEN**, 동시에 (a)(c) 기존 단언도 GREEN.
3. `promptLoader.ts:269` 조건만 revert → **(b) RED** 재확인.

---

### R5: 매핑 복원 — 생활군 4행 — **1 fix**

**파일:라인**
- `src/shared/categoryTaxonomy.ts` — `pet`→`'반려동물'`, `fashion`→`'패션·미용'`, `interior`→`'인테리어·DIY'`, `food_recipe`→`'요리·레시피'`
- `src/promptLoader.ts` CATEGORY_MAP — 표시명 **정확매칭 키** 4개 추가: `'패션·미용':'fashion'`(`:111` 인근), `'인테리어·DIY':'living'`(`:113` 인근), `'요리·레시피':'food'`(`:109` 인근). `'반려동물'`은 `:117`에 이미 존재.

**설계 결정 근거**: 힌트 값을 축약 토큰(`'패션'`)이 아니라 **표시명 전체**로 두고 CATEGORY_MAP에 표시명 키를 추가한다. 이유 3가지 — (a) `resolveCategory`의 부분매칭 루프(`:163-168`, 첫 일치 반환·삽입순서 의존)를 타지 않고 1단계 정확매칭에서 끝나 결정적이다, (b) `contentTonePolicy.ts:32-45`가 `컴퓨터`·`비즈니스`·`학문`·`스타`·`만화` 같은 표시명 리터럴을 직접 매칭하므로 축약하면 톤 정책이 조용히 어긋난다, (c) 힌트가 truthy가 되면 `sourceAssembler.ts:7431`의 `keywords[0]` 폴백이 차단돼 비결정적 로딩이 사라진다.

**검증**
- `categoryTaxonomyBaseline.test.ts`의 해당 4행 기대값을 `general` → `pet`/`fashion`/`living`/`food`로 갱신, 나머지 31행은 **변경 없음**을 단언(범위 누출 감시).
- 프로브: 35종 표 재출력 → 의도한 4행만 바뀌었는지 diff 확인.
- 공통 검증 1~3.

**red-green**
1. 기대값 4행 갱신 → **RED**(현행 general).
2. 사전 4줄 + CATEGORY_MAP 3줄 → **GREEN**.
3. `'요리·레시피'` 키 1줄만 제거 → 해당 행 **RED** 확인 → 복구.

---

### R6: 매핑 복원 — 여행·맛집·일상 4행 — **1 fix**

- `categoryTaxonomy.ts`: `travel_domestic`→`'국내여행'`, `travel_world`→`'세계여행'`, `tasty_restaurant`→`'맛집'`, `general`→`'일상·생각'`
- `CATEGORY_MAP`: `'국내여행':'travel'`, `'세계여행':'travel'`, `'일상·생각':'life'` 추가(`'맛집'`은 `:108`에 존재)

검증·red-green은 R5와 동형(기대값 4행 갱신 → RED → 수정 → GREEN → 1줄 제거로 RED 재확인).
**주의**: `general` 슬러그의 힌트가 `'일상·생각'`으로 바뀌면 `resolveCategory`가 `general`→`life`로 이동한다. `seo/life.prompt`가 추가로 합성되므로 base-only를 기대하는 스냅샷 테스트가 있는지 `npx vitest run` 전체로 확인할 것.

---

### R7: 매핑 복원 — 지식군 4행 — **1 fix**

- `categoryTaxonomy.ts`: `it_computer`→`'IT·컴퓨터'`, `society_politics`→`'사회·정치'`, `business_economy`→`'비즈니스·경제'`, `education_scholarship`→`'교육·학문'`
- `CATEGORY_MAP`: `'IT·컴퓨터':'it'`, `'사회·정치':'society'`, `'비즈니스·경제':'society'`, `'교육·학문':'society'` 추가 + **`:116 '교육': 'parenting'` → `'society'`** 변경(폴더명 경로 정합)

**`:116` 변경 근거**: 교육 글에 필요한 규율(기준일·신청 기간·공식 확인처)은 `society.prompt`에 있고 `parenting.prompt`는 월령·발달 축이다. 이 한 줄이 `education.prompt` 신설(배선 8지점)을 대체한다.

**추가 회귀 관찰**: `'교육'`은 부분매칭 루프에서 `'교육·학문'`보다 **앞선 삽입순서**(`:116`)에 있으므로, 표시명 정확매칭 키를 함께 넣지 않으면 `'교육·학문'`이 `:116`에 먼저 잡힌다. 두 줄을 반드시 같은 릴리즈에서 처리한다.

red-green은 R5와 동형. 추가로 `resolveCategory('교육')` 기대값을 `parenting`→`society`로 바꾸는 테스트를 넣고, 기존 테스트 중 이 값을 잠근 것이 있는지 `grep -rn "'교육'" src/__tests__` 로 선확인.

---

### R8: 매핑 복원 — 취미·문화 6행 — **1 fix**

- `categoryTaxonomy.ts`: `photo`→`'사진'`, `hobby`→`'취미'`, `game`→`'게임'`, `gardening`→`'원예·재배'`, `art_design`→`'미술·디자인'`, `performance`→`'공연·전시'`
- `CATEGORY_MAP` 추가: `'사진':'tips'`, `'취미':'tips'`, `'원예·재배':'tips'`, `'미술·디자인':'tips'`, `'공연·전시':'travel'`
- `CATEGORY_MAP:96` **`'게임': 'it'` → `'tips'`** 변경

**`:96` 변경 근거**: `seo/it.prompt`의 발열·배터리·1인칭 사용 기간 축은 게임 글에 **적극적 오유도**다. `tips.prompt`("준비 조건, 순서, 확인 방법, 실패 방지 포인트")는 공략형과 정합하고 오유도 문장이 없다. 전용 `game` 카테고리는 발행량 근거가 0이므로 승인하지 않는다.

red-green은 R5와 동형. `'게임'` 변경은 폴더명 경로에도 영향하므로 `resolveCategory('게임')` 기대값 갱신 테스트를 명시적으로 추가.

---

### R9: 매핑 복원 — 엔터군 7행 (**R4 종속**) — **1 fix**

- `categoryTaxonomy.ts`: `literature`→`'문학·책'`, `movie`→`'영화'`, `music`→`'음악'`, `drama`→`'드라마'`, `celebrity`→`'스타·연예인'`, `cartoon`→`'만화·애니'`, `broadcast`→`'방송'`
- `CATEGORY_MAP` 추가: `'문학·책'`, `'음악'`, `'스타·연예인'`, `'만화·애니'` → `'entertainment'` (`'영화':73`, `'드라마':72`, `'방송':70`은 존재)

**선행 조건 (하드 게이트)**: R4가 릴리즈돼 있지 않으면 이 릴리즈를 진행하지 않는다. R4 없이 진행하면 홈판 편성정보·서평에 `issue-story` 서사 골격이 얹힌다.

**검증 추가**: `buildSystemPrompt('homefeed','entertainment', /*isIssueShaped*/ false)` 결과에 `[ISSUE-STORY]`가 없고 base 실용 골격이 남는지 단언.

red-green은 R5와 동형 + 위 홈판 단언의 RED→GREEN 확인.

---

### R10: `sports` 카테고리 배선 (죽은 파일 4개 부활) — **1 fix**

**파일:라인**
- `src/promptLoader.ts:50-63` — `PromptCategory` union에 `| 'sports'` 추가
- `src/promptLoader.ts:69` — `'스포츠': 'entertainment'` → `'sports'`
- `src/promptLoader.ts:125-128` — `HOMEFEED_ISSUE_STORY_CATEGORIES`에 `'sports'` **동시 추가**
- `src/__tests__/homefeedIssueStorySkeleton.test.ts:66-70` — `expect(resolveCategory('스포츠')).toBe('entertainment')` → `'sports'`

**`HOMEFEED_ISSUE_STORY_CATEGORIES` 동시 추가가 필수인 이유**: 커밋 `60021a64`가 홈판 이슈픽을 "연예·스포츠·경제"로 명시했고, 이 집합은 `promptLoader.ts:269`(골격 부착)와 `:1221`(`neoHookExcluded`) 두 곳이 참조한다. 빠뜨리면 스포츠 홈판 골격과 훅 배제 판정이 **조용히** 뒤집힌다.

**남은 공백 명시**: `seo/sports.prompt`는 선수·팀·경기 결과·기록·일정·부상·인터뷰 축만 다룬다. 참여형(러닝·골프·등산) 축은 배선 후에도 비어 있다 — "배선만 하면 끝"이 아니다. 참여형 보강은 §5 사용자 결정 항목.

**검증**
- 신규 단언: `buildSystemPrompt('seo','sports')`에 `sports.prompt` 고유 문자열 포함, `buildSystemPrompt('homefeed','sports')`에 `[ISSUE-STORY]` 포함.
- 공통 검증 1~3. **union 확장이므로 `npm run build` 타입 에러 0을 특히 확인**(`Record<string, PromptCategory>` 소비처 전수).

**red-green**
1. 위 2개 단언 작성 → **RED**(현재 entertainment 프롬프트가 실림).
2. 4개 지점 수정 → **GREEN**.
3. `HOMEFEED_ISSUE_STORY_CATEGORIES`의 `'sports'`만 제거 → 홈판 단언 **RED** 확인 → 복구.

---

### R11: 상품리뷰 공정위 표기 서식 수리 — **2 fix**

**파일:라인**
- `src/automation/editorHelpers.ts:1013-1024` (분기 A), `:1202-1213` (분기 B) — 고지 줄 입력 직후 `setFontSize()`(`:383/502/573/595`에 기존 구현) 및 색 지정 호출 추가
- `src/content/ftcDisclosurePresets.ts:12-13` — 기본 문구 교체

**fix1 (서식)**: 고지 문장을 입력한 뒤 본문보다 큰 글자 크기 또는 본문과 다른 글자색을 적용한다. 두 분기 모두 `Home` → `safeKeyboardType` → `Enter`×2 순서이므로, 타이핑 직전에 서식을 걸고 `Enter` 후 원복하는 방식으로 본문 서식 오염을 막는다.
**fix2 (문구)**: `'[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.'` → 수수료 수취라는 경제적 이해관계를 진술하는 확정형 문구. 현행 문구는 "링크 포함 **가능성**"만 말하고 이해관계 자체를 진술하지 않는다.

**검증**
- 라이브 발행은 사용자 큐레이션 신뢰 원칙상 차단하지 않는다. 검증은 (a) 단위 테스트로 서식 호출이 고지 줄 범위에서만 발생하는지, (b) 패키징 후 실제 네이버 에디터 1회 육안 확인(사용자 대기 항목).
- 공통 검증 1~3.

**red-green**
1. "고지 줄 입력 시퀀스에 서식 호출이 포함된다" 테스트 → **RED**.
2. 수정 → **GREEN**.
3. `:1013` 분기만 revert → **RED** 재확인(두 분기 모두 감시되는지 증명).

**계약 준수**: 품질 게이트는 경고-only. 이 릴리즈는 발행 차단을 추가하지 않는다.

---

### R12: 프롬프트 보강 A — 엔터·육아·패션 — **3 fix**

| 파일 | 변경 |
|---|---|
| `src/prompts/seo/entertainment.prompt`, `src/prompts/homefeed/entertainment.prompt` | 3줄 추가: ① 스포일러 경계(결말·반전은 입력 자료에 명시된 범위만), ② 가사·대사 전문 인용 금지(짧은 부분 인용 + 출처), ③ 연재·방영 상태는 입력 자료에 있는 시점만 |
| `src/prompts/seo/parenting.prompt`, `src/prompts/homefeed/parenting.prompt` | 2줄 추가: 결혼·예식 글이면 준비 순서·비용 항목·계약 확인 사항을 우선하고 월령·발달 표현을 쓰지 않는다 |
| `src/prompts/seo/fashion.prompt`, `src/prompts/homefeed/fashion.prompt` | 2줄 추가: 기능성 화장품 효능(미백·주름개선·자외선차단 등)은 제품 표시사항에 있는 문구만 그대로 인용하고 확대 표현을 만들지 않는다 |

**계약 준수**: 세 건 모두 **가드**(금지·한정)이며 골격을 바꾸지 않는다. 이 저장소에서 카테고리 오버레이(합성 2단계)는 뒤따르는 4개 오버레이에 덮이므로 골격 변경 용도로 쓸 수 없다 — 가드 슬롯으로만 쓴다. "근거 없는 경험 날조 금지" 계약과 정합(입력 자료 범위 한정).

**검증**
- `buildSystemPrompt('seo','entertainment')` 등 6개 조합에 추가 문구가 포함되는지 단언.
- `npm run build` 후 `dist/prompts/**` 에 반영됐는지 파일 존재·내용 확인(패키징 경로는 `asarUnpack`).
- 공통 검증 1~3.

**red-green**: 문구 포함 단언 → RED → 3파일쌍 편집 → GREEN → `entertainment.prompt`만 revert → RED 재확인.

---

### R13: 프롬프트 보강 B — 요리·여행·IT(자동차) — **3 fix**

| 파일 | 변경 |
|---|---|
| `seo/food.prompt`, `homefeed/food.prompt` | 2줄: 레시피 글이면 재료·계량·순서·실패 포인트·대체재를 우선하고 영업시간·주차·웨이팅·별점 항목은 쓰지 않는다 / 방문형이면 메인 키워드를 지역명+업종으로 두고, 대가를 받았으면 제목 또는 첫 문단에 표기한다 |
| `seo/travel.prompt`, `homefeed/travel.prompt` | 3~4줄: 해외 글이면 비자 형태·여권 유효기간·환율 기준일·시차·여행경보를 **입력 자료에 확인된 값만** 쓰고 확인 안 된 값은 만들지 않는다. **국가명 목록 하드코딩 금지** |
| `seo/it.prompt`, `homefeed/it.prompt` | 2줄: 자동차 글이면 트림·연식·주행거리·정비 이력·보증 조건을 축으로 삼고 발열·배터리 사용 기간 표현을 쓰지 않는다 |

**`it.prompt` 편집이 R14(자동차 매핑)의 선행 조건**이다. 순서를 뒤집으면 자동차 글에 발열·배터리 오유도가 붙는다.
**국가명 하드코딩 금지 근거**: 여행금지국 고시는 2027-01-31 갱신 예정이라 프롬프트에 박으면 stale해진다.

검증·red-green은 R12와 동형.

---

### R14: 매핑 복원 — 자동차 (**R13 종속**) — **1 fix**

- `categoryTaxonomy.ts`: `car`→`'자동차'`
- `src/promptLoader.ts:119` — `'자동차': 'life'` → `'it'`

**근거**: 네이버 피드메이커가 "자동차/테크"를 한 카테고리로 운영한다([A] 원문 확인) — 이는 `car` 신설이 아니라 `it` 통합의 근거다. `ctrCombat.ts:257`이 이미 자동차를 `tech`로 보내므로 본문/CTR 두 축의 분열이 동시에 해소된다. `resolveCTRCategory`는 독립 함수이므로 `car`를 신설해도 여전히 `tech`를 반환한다 — 분리는 이 문제를 풀지 못한다.

**선행 조건 (하드 게이트)**: R13 미완이면 진행 금지.

검증·red-green은 R5와 동형 + `resolveCategory('자동차')` 기대값 `life`→`it` 갱신, `resolveCTRCategory('자동차')`가 여전히 `tech`임을 함께 단언(두 축 정렬 증명).

---

### R15: 프롬프트 보강 C — 원예·교육 — **2 fix**

| 파일 | 변경 |
|---|---|
| `seo/tips.prompt`, `homefeed/tips.prompt` | 2줄: 재배·관리 글이면 광량·물주기 주기·온도 범위·분갈이 시점을 조건으로 제시하고, 지역·계절에 따라 달라지는 값은 범위로 쓴다 |
| `seo/society.prompt`, `homefeed/society.prompt` | 2~3줄: 개념·학문 해설이면 정의 → 성립 조건 → 반례 → 흔한 오해 순으로 쓰고, 정책 기준일·신청 기간 항목은 해당할 때만 쓴다 |

검증·red-green은 R12와 동형.

---

### R16: YMYL 게이트 수리 (매핑·프롬프트와 분리) — **2 fix**

- fix1 `src/contentGenerator.ts:1136-1139` — `prePublishGate`의 `valid` 배열이 영문 카테고리인데 한국어 힌트 `'건강'`이 들어와 general로 낙하한다. `resolveCategory()` 결과를 대조 대상으로 교체.
- fix2 `src/content/celebrityAssertionSanitizer.ts:30-38` — `isCelebrityContext` 정규식에 정치·사회 인물 컨텍스트 누락. 정규식 1줄 보강.

**룰 문안 한정 (필수)**: 건강 관련 경고는 반드시 **"치료경험담 + 특정 병원·시술 안내 조합"**으로 한정한다. 의료법 §56②는 "의료인등"이 주어라 비의료인에게 직접 적용되지 않고, 비의료인에게는 §56①(의료광고에 해당할 때)이 적용된다. 순수 정보성 건강 글까지 막으면 오탐이다.
**명분 재작성 (필수)**: 사회·정치 리스크의 근거를 2026-07-07 시행 가중손배(허위조작정보)에만 걸지 말 것 — 구독자/월평균 조회수 10만 문턱 때문에 이 앱의 주 사용자층(부업 블로거)은 대상 밖이다. 일반 명예훼손(형법 §307, 정보통신망법 §70)을 근거로 재작성한다.
**계약 준수**: 두 fix 모두 **경고-only**. 발행 차단 권한은 PrePublish 게이트에만 있고, 이 릴리즈는 새 차단을 추가하지 않는다.

**검증**: 게이트 진입 여부 단위 테스트(한국어 힌트 `'건강·의학'` 투입 시 health 경로 진입), 정치 인물 문자열 투입 시 `isCelebrityContext` true. red-green은 각 fix를 개별 revert해 RED 확인.

---

### 릴리즈 순서 요약 및 종속 그래프

```
R1 (독립, 최우선)
R2 → R3 → ┬ R5 ─ R6 ─ R7 ─ R8          (매핑, 병렬 불가·순차)
          ├ R4 → R9                      (게이팅 → 엔터 매핑)
          └ R10 (sports 배선)
R11 (독립, 법무·매출)
R12 → (독립)
R13 → R14                                (프롬프트 → 자동차 매핑)
R15, R16 (독립)
```

---

## 4. 매핑만 고치면 되는 것 vs 프롬프트가 필요한 것

### (가) 매핑 수정만 — 20행 (사전 1줄 + CATEGORY_MAP 1줄)

프롬프트 파일이 이미 완성돼 있고 도달만 고장난 경우다. 릴리즈당 회귀면이 사전 한 줄이라 red-green이 기계적이다.

| 주제 | 목표 카테고리 | 릴리즈 |
|---|---|---|
| 반려동물 · 패션·미용* · 인테리어·DIY | `pet` / `fashion` / `living` | R5 |
| 일상·생각 · 국내여행 | `life` / `travel` | R6 |
| IT·컴퓨터 · 사회·정치 · 비즈니스·경제 · 교육·학문* | `it` / `society` / `society` / `society` | R7 |
| 사진 · 취미 · 게임 · 미술·디자인 · 공연·전시 | `tips`×4 / `travel` | R8 |
| 문학·책 · 영화 · 음악* · 드라마 · 스타·연예인 · 만화·애니* · 방송 | `entertainment` | R9 |

\* 표시는 가드 문구 보강이 뒤따르면 더 좋으나, 매핑만으로도 현행(general)보다 명백히 낫고 독립 릴리즈 가능한 행.

### (나) 매핑 + 프롬프트 둘 다 — 4행

프롬프트 편집이 **선행**되지 않으면 매핑 수정이 오히려 해로운 경우다.

| 주제 | 이유 | 순서 |
|---|---|---|
| 자동차 | `it.prompt`의 발열·배터리·사용 기간이 적극적 오유도 | **R13 → R14** (프롬프트 먼저) |
| 방송 · 문학·책 등 엔터 7행 | 홈판 `issue-story` 서사 골격이 편성정보·서평에 부적합 | **R4 → R9** (게이팅 먼저) |
| 세계여행 | `travel.prompt`에 비자·여권·환율 필드 부재 | R6(매핑) → R13(보강). 매핑 선행 허용 — 국내 골격이 general보다 낫다 |
| 요리·레시피 / 맛집 | `food.prompt` 필드 혼재 | R5·R6(매핑) → R13(갈래 분기). 매핑 선행 허용 |
| 원예·재배 | `tips.prompt`에 환경 조건 축 없음 | R8(매핑) → R15(보강). 매핑 선행 허용 |

### (다) 프롬프트·코드만 — 매핑은 이미 정상 — 3행

| 주제 | 현재 매핑 | 필요한 것 |
|---|---|---|
| 육아·결혼 | `parenting` ✅ | `parenting.prompt` 결혼·예식 2줄 (R12) |
| 상품리뷰 | `life` ✅ | 공정위 표기 **서식** + 문구 (R11). SEO 구매판단 분기는 `seo/life.prompt` 4행이 이미 커버 — 추가 불필요 |
| 건강·의학 | `health` ✅ | `prePublishGate` 카테고리 대조 수리 (R16) |

### (라) 배선(union 확장) — 1행

| 주제 | 필요한 것 |
|---|---|
| 스포츠 | `PromptCategory` union + `CATEGORY_MAP:69` + `HOMEFEED_ISSUE_STORY_CATEGORIES` + 기존 테스트 갱신 (R10). **파일 신설 0** — `seo/sports.prompt`·`homefeed/sports.prompt`가 이미 존재 |

### (마) 현행 유지 — 2행

좋은글·이미지, 어학·외국어. 단 SSOT에서 `'general'`을 **명시적으로** 부여해 힌트가 truthy가 되게 한다 — 그래야 `sourceAssembler.ts:7431` 키워드 폴백이 차단되고 로딩이 결정적이 된다.

### 비용 비교

- 매핑 수정 1행 = 사전 1줄 + CATEGORY_MAP 1줄 + 테스트 기대값 1줄. 회귀면 = 해당 행 1개.
- 프롬프트 파일 **신설** 1건 = `PromptCategory` union → `CATEGORY_MAP` → SSOT 사전 → `seo/*.prompt` → `homefeed/*.prompt` → `title/seo/*.prompt` → `title/homefeed/*.prompt` → `contentGenerator.ts:552 categoryToFile` = **8지점**. 하나만 빠지면 조용히 죽는다 — 가설이 아니라 `sports.prompt` 2개가 지금 정확히 그 상태다.
- 이 플랜의 신규 프롬프트 파일 = **0건**. 32주제 전부를 기존 자산 재배선 + 기존 파일 문구 보강으로 처리한다.

---

## 5. 사용자 결정 필요

| # | 결정 사항 | 배경 | 결정 없이 진행 시 |
|---|---|---|---|
| **D1** | **`contentMode` 배선 복구 여부** | `collectFullAutoFormData()`에 `contentMode`가 없어 `fullAutoFlow.ts:2468`이 항상 `'seo'`로 낙하한다. 즉 풀오토에서 사용자가 고른 홈판/제휴 모드가 **현재 무시되고 있다**. 켜면 발행 결과가 전면 변화한다 | R3에서 의도적으로 제외. 미결정 시 SEO 고정 유지 |
| **D2** | **`issue-story` 발동축 이동 승인 (R4)** | 골격 본문은 손대지 않으나 *언제 붙는지*가 바뀐다. 홈판 엔터·사회 글의 형태가 소스 성격에 따라 갈린다 | R9(엔터 7행 매핑)이 **차단**된다. 엔터군은 general에 머문다 |
| **D3** | **`sports` union 확장 승인 (R10)** | 5번째 분류 축을 추가하는 셈. 대안은 죽은 `sports.prompt` 2개를 **삭제**하고 스포츠를 entertainment로 유지 | 죽은 파일 2개가 저장소에 계속 방치된다 |
| **D4** | **스포츠 참여형 축 보강 여부** | `seo/sports.prompt`는 프로 경기(선수·팀·기록·부상)만 다룬다. 러닝·골프·등산은 배선 후에도 공백 | 배선만 하고 참여형은 공백 유지 |
| **D5** | **좋은글·이미지 목록형 허용 여부** | 필요한 것은 새 파일이 아니라 `promptLoader.ts:212`의 `exposure-structure` 오버레이 게이팅 조건 1줄. 다만 정보형 골격을 카테고리별로 끄기 시작하면 계약 표면이 넓어진다 | 현행 유지(정보형 골격 적용) |
| **D6** | **공정위 고지 문구 확정형 교체 (R11 fix2)** | 현행 `'[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.'`는 수수료 수취를 진술하지 않는다. 교체는 사용자의 표기 정책 결정 사항 | 서식(fix1)만 적용하고 문구는 유지 |
| **D7** | **비네이버 슬러그 3종 처리** (`tips`/`realestate`/`self_dev`) | 네이버 32주제 외. `realestate`·`self_dev`는 현재 사전 미등록 → general | SSOT에 `'부동산'→society`, `'자기계발'→tips` 후보. 미결정 시 general 유지 |
| **D8** | **`categoryToFile`(제목 축) 정렬 여부** | `contentGenerator.ts:552-563`은 별도 사전이라 표시명 키가 없어 전부 `title/{mode}/base.prompt`로 폴백한다. 단 이 경로는 제목 검증 실패 시 **리페어 경로**뿐(`:6021/:6072/:6405`, `allowLlmTitlePatch` 게이트)이라 상시 경로가 아니다 | 리페어 시 base 폴백 유지 |
| **D9** | **라이브 검증 창구** | 매핑 릴리즈는 vitest로 완결 검증되나, R11(에디터 서식)은 실제 네이버 에디터 육안 확인이 필요 | R11만 미검증 상태로 릴리즈 |

---

## 6. 기각된 권고 (재조사 방지)

| 기각 항목 | 출처 | 기각 사유 |
|---|---|---|
| **신규 `culture` 카테고리** (문학·미술·공연·음악용) | 엔터 그룹 | ① 카테고리 파일은 합성 **2단계**라 뒤따르는 situation-depth·rubric·90+·issue-story 4개 오버레이에 덮인다 — "base 골격 무력화"라는 목적 자체가 달성 불가. ② 실비용은 2파일이 아니라 **4파일 + 사전 4벌**. "사전이 4벌이라 문제"라고 진단하고 그 4벌을 늘리는 자기모순. ③ 요구된 절차형 골격은 `seo/tips.prompt`에, 방문 실용 골격은 `homefeed/travel.prompt`에 **이미 존재** |
| **`quote.prompt` 신설** (좋은글·이미지) | 생활 그룹 | 분리 논거가 "base가 목록형을 억제하므로 분기로는 못 덮는다"인데, 새 파일도 **똑같이 슬롯 2**에 들어간다. override 권능 증가 0. 필요한 것은 `promptLoader.ts:212` 조건 1줄 |
| **`recipe.prompt` 신설** (요리·레시피) | 생활 그룹 | 8줄 중 환각가드 5줄이 `food.prompt`와 중복 → 향후 가드 수정 시 2곳 동기화 부채. override 권능 증가 0 |
| **`car.prompt` / `game.prompt` 신설** | 취미 그룹 | 발행량 근거 0. `resolveCTRCategory`는 독립 함수라 `car` 신설로도 CTR 분열이 해소되지 않는다. 네이버 피드메이커는 "자동차/테크"를 **한 카테고리**로 운영 → 오히려 `it` 통합 근거 |
| **`education.prompt` 신설** | 지식 그룹 | 배선 8지점 필요, 하나만 빠지면 죽음(`sports.prompt` 실증). 필요 규율이 `society.prompt`에 이미 있어 `CATEGORY_MAP:116` 한 줄 재배치로 도달 |
| **`society`의 policy축/issue축 분리** | 지식 그룹 | 실체는 `HOMEFEED_ISSUE_STORY_CATEGORIES` 멤버십 1건이고 R4가 닫는다. 분리하면 `CATEGORY_MAP`의 society 6키(`시사·사회·정치·경제·국제·뉴스`)를 어느 쪽에 넣을지 원리적으로 정해지지 않고, 부분매칭 첫-일치 반환 때문에 오배정이 **조용히** 발생한다 |
| **"스포츠 제목 역전" P0 지정** | 취미 그룹 | REFUTED. 카테고리 제목 파일이 없으면 `defaultTitleRules`가 아니라 `title/{mode}/base.prompt`로 폴백하고, **그 base도 동일하게 공식형**이다(`title/homefeed/base.prompt:73-96`·`107-108`·`229`, `title/seo/base.prompt:38-41`·`66`). 커밋 `60021a64`는 `title/` 하위를 **한 파일도** 건드리지 않았다(`seo/base.prompt` 1건만). 역전은 존재하지 않으며 8개 주제가 같은 상태 |
| **`title/*/sports.prompt` 폐기·재작성** | 취미 그룹 | 보류. 커밋 `60021a64`가 홈판 이슈픽(연예·스포츠·경제) 제외를 "제3자 사건에 내 상황이 성립하지 않고, issue-story의 인용 훅이 실측 승자 패턴이라 덮으면 회귀"로 명시 문서화했다. 제목 공식 문제는 32주제 플랜이 아니라 `title/*/base.prompt` 공통 과제로 별도 기표 |
| **SEO 모드 구매판단 분기 신규 추가** (상품리뷰) | 생활 그룹 | `seo/life.prompt` 4행 "제품·서비스의 장점만 나열하지 말고 맞는 대상, 맞지 않는 조건, 확인할 항목을 함께 제시한다"가 요구 내용 그 자체. 1행이 쇼핑을 명시 스코프에 포함 |
| **"네이버 랭킹 불이익" 근거 인용** | 취미 그룹 | 출처가 개인 블로그 재게시본([C]). 공정위 근거만으로 권고가 성립하므로 문장 삭제 |
| **데이터랩·블로그 total 기반 우선순위 근거** | 엔터·생활 그룹 | 절대값 재현 실패(±5~20%), "방송 = 영화의 3.5~5.9배" 재현 실패(2.2~3.9배), 블로그 `total`은 토큰 느슨매칭이라 경쟁 강도 지표로 성립하지 않음("일상 기록" 1위 결과가 두 단어 분리 매칭). 순위 방향만 참고, **수치 인용 금지** |
| **B-6 네이버 탐색 피드 각주 / 아이보스 [A] / 네이버 고객센터 [A]** | 엔터·생활 그룹 | 개인 SNS·개인 게시물 기반이거나 본문 미확인. 각각 삭제 / [C] / [B]로 재등급. 사실 자체는 FTC PDF·김·장 법률사무소로 교차 확인됨 |
| **부정경쟁방지법 타목 시행일 2022-06-08** | 엔터 그룹 | REFUTED. 정확한 시행일은 **2022-04-20**(2021-12-07 공포). 이미지 초상권 SPEC 근거로 쓸 때 정정 필수 |
| **"인플루언서를 명시적 단속 대상으로 밝혔다"** | 지식 그룹 | REFUTED. 복지부 자료 원문에 "인플루언서"라는 단어가 없다. "**비의료인 등**"으로 교체 |

---

## 7. 절대 건드리면 안 되는 것

1. **`src/prompts/homefeed/issue-story.prompt` 본문.** 인용 훅·타임라인·초단문·0~3 소제목은 홈판 노출 20샘플 실측 승자 패턴이며 커밋 `60021a64`에 "덮으면 회귀"로 문서화돼 있다. R4가 바꾸는 것은 **발동 조건뿐**이고 본문은 한 줄도 손대지 않는다.

2. **제목 = 상황·경험 기준 계약 (공식 폐기).** 이번 플랜은 `title/` 트리를 **한 파일도** 수정하지 않는다. `title/*/base.prompt`에 남은 공식형 규칙은 32주제 매핑과 무관한 별건이며, 스포츠 단독 조치의 근거로 삼는 것은 REFUTED됐다.

3. **근거 없는 경험 날조 금지.** R12~R15의 모든 추가 문구는 **가드·한정**이며 "입력 자료에 확인된 값만", "메모가 있을 때만 1인칭" 형식을 유지한다. 어떤 문구도 모델에게 경험을 생성하라고 지시하지 않는다.

4. **품질 게이트 경고-only.** R16을 포함해 어떤 릴리즈도 새 발행 차단을 추가하지 않는다. 차단 권한은 PrePublish 게이트에만 있고, per-paste 검증은 복구 트리거로 강등된 상태를 유지한다.

5. **`seo/travel.prompt` 국내 전제 본문.** 국내여행 행과 정확히 일치하는 유일한 프롬프트다. R13의 해외 분기는 **추가**이지 기존 줄의 수정이 아니다.

6. **`HOMEFEED_ISSUE_STORY_CATEGORIES`의 `'society'` 멤버십.** 경제·시사 홈판 골격이 여기 걸려 있다. R10은 `'sports'`를 **추가**할 뿐 기존 2개를 제거하지 않는다.

7. **`resolveCTRCategory`(`ctrCombat.ts:249-262`)의 독립성.** 프롬프트 카테고리와 CTR 카테고리는 서로 다른 축이다. 두 축을 강제로 하나로 합치지 말 것 — 자동차(R14)에서 두 축이 정렬되는 것은 결과이지 목표가 아니다.

8. **`affiliate/base.prompt:23-25`의 공정위 고지 소유권.** 제휴 모드의 고지 책임은 이 파일에 있다. R11은 에디터 삽입 **서식**만 다루며 소유권 구조를 옮기지 않는다.

9. **`seo/life.prompt` 1·4행.** 상품리뷰의 구매판단 분기가 여기 있다. 중복 추가·이관 금지.

10. **`celebrityAssertionSanitizer.ts:29-31`의 비대칭 설계.** homefeed 모드 전체를 celebrity로 취급하는 것은 의도된 광범위 적용이다. R16 fix2는 정규식을 **넓히기만** 하고 이 게이트를 좁히지 않는다.

11. **`promptLoader.ts:265-268` 오버레이 순서 주석과 합성 순서.** issue-story가 마지막에 오는 이유가 명시돼 있고 `homefeedIssueStorySkeleton.test.ts`가 순서를 잠그고 있다. 새 오버레이를 이 뒤에 끼우지 말 것.

12. **릴리즈 트리.** 격리 워크트리/fresh checkout은 CRLF라 지문 핀·소스 단언 테스트가 깨진다. 모든 릴리즈는 메인 워킹트리에서 수행한다.
