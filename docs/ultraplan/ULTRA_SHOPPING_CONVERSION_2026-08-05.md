# ULTRA 플랜 — 쇼핑 전환 & 게이팅

작성 기준: 7영역 적대적 검증 결과 + 본 세션 fresh 재확인(아래 §0). 1릴리즈 = fix 1~3, 릴리즈마다 vitest 전체 GREEN + 영역 full-flow + `git diff` 독립 검증 + 신규 회귀 red-green.

## §0 본 세션에서 직접 재확인한 사실 (플랜 전제)

| 확인 항목 | 명령/파일 | 결과 |
|---|---|---|
| HEAD = `9f3ae425 fix(ui,cost): 일일 권장 무제한 값 노출 차단…` | `git log --oneline -3` | 확인. **버전업 없음** |
| `package.json` = `2.11.160` (= 원인 커밋 `b367a733` 시점 버전) | `node -e` | 확인 → **표시 픽스는 사용자 PC에 아직 없음.** 사용자가 지금 9007199254740991회를 보는 이유는 미릴리즈이지 미수정이 아님 |
| 표시 리졸버 실재 | `src/renderer/renderer.ts:926-934` (`RECOMMENDED_DAILY_POSTS = 3`, `<100` 클램프) | 확인 |
| 유령 저장 잔존 | `src/renderer/modules/priceInfoModal.ts:1436` `dailyPostLimit: parseInt(dailyPostLimit?.value \|\| '3')` | **잔존 (미수정)** |
| 지문 핀 대상 | `src/contentQualityV3/candidateRuntimeFingerprint.ts:543 / :559` | `priceInfoModal.ts`·`renderer.ts` 둘 다 등재 → 편집 시 핀 갱신 필수 |
| 클램프 70 호출부 | `src/contentKeywordPrefix.ts:166 / :168 / :198` | **3곳** (검증 보고는 198만 언급). 일괄 45 변경은 SEO/연속발행 제목까지 오염 |
| 클램프 함수의 소비 범위 | `applyKeywordPrefixToTitle` 호출: `contentGeneration.ts:692/713`, `continuousPublishing.ts:1323/1343/1348`, `contentKeywordPrefix.ts:260` | **전 모드 공유** → 스코프 없는 45 하향은 회귀 cascade |
| 옵션 확장 가능성 | `contentKeywordPrefix.ts:11-19 KeywordPrefixOptions{ensureFront3}` | 존재 → `maxLength?` 추가로 쇼핑 한정 스코프 가능 |
| 축약 함수 실재 | `contentKeywordHelpers.ts:39 preprocessLongKeyword` (25자 초과 시 4어절 컷) | 확인 |

## 판정 요약 (영역별 CONFIRMED)

| 영역 | P0 CONFIRMED | P1 CONFIRMED | REFUTED | PLAUSIBLE |
|---|---|---|---|---|
| shopping-conversion | 1 (제목 압사 체인) | 3 (dead code·2중 페널티·반박 whitelist) + P2 1 | 2 (rescue 롤백 도달불가 / 감사기 "하드강제" 인과) | 2 |
| free-trial-gating | **4** (연속발행 죽은 게이트, 반자동 다중계정 무게이트, 풀오토 multi 무게이트, **신규: ma버튼 부팅 오발동**) | 2 + P2 1 | 2 | 1 |
| adult-verification | 1 (본문 경로 상품 바꿔치기) | 2 (crawlShoppingSite 전체 dead, 창 복원) | 3 (인용파일 dead / 배선 1곳 커버 / tmpdir 프로필) | 2 |
| duplicate-document | 2 (정형문 서론 2종 수렴 = 실질 최상, SOURCE_COPY 심각도↑빈도↓) | 3 | 1 (fidelity 재시도 = env로 사문) | 2 |
| thumbnail-generator | 3 (썸네일 키 오등록, setHeadings 삭제, **신규: 이미지생성이 수동썸네일 덮어씀**) | 2 | 1 (과금 추가 주장) | 1 |
| log-diagnosis | 2 (CTA 오탐, 마커 규칙2) | 3 (Gemini 원인 은폐, 이미지 카운트 오판, 412초 병목) | 3 (MULTI 픽스처, 8/3=v2.11.154 증거, "폴링 이미 있음") | 2 |
| daily-limit-ui | 0 (표시는 **이미 커밋 완료**) | 1 (유령 저장 4줄) | 3 (미커밋 서술·디스크 실증·PRESERVE_KEYS 진단) | 1 |

**총 CONFIRMED P0 13건 / P1 16건.** 실질 최우선 3건 = 쇼핑 제목 압사(매출), 무료체험 P0 4건(매출 누수), 썸네일 P0 3건(사용자 산출물 파괴).

---

## R1 (즉시) — 일일 권장 표시 종결 + 릴리즈

우선순위 2번을 R1에 두는 근거: 코드 픽스가 이미 `9f3ae425`에 있고 남은 건 **유령 저장 4줄 + 릴리즈**뿐이라 검증 부담이 가장 작다. 쇼핑 전환(우선순위 1)은 R2부터 착수하되 코드·프롬프트 변경이라 릴리즈 사이클이 길다 — 사용자가 지금 보고 있는 숫자를 먼저 흘려보낸다.

**fix 1 — `src/renderer/modules/priceInfoModal.ts:1436-1439` 4줄 삭제**
```ts
dailyPostLimit: parseInt(dailyPostLimit?.value || '3'),      // ← 삭제
freeQuotaPublish: parseInt(freeQuotaPublish?.value || '2'),  // ← 삭제
freeQuotaContent: parseInt(freeQuotaContent?.value || '5'),  // ← 삭제
freeQuotaMedia: parseInt(freeQuotaMedia?.value || '30'),     // ← 삭제
```
`daily-post-limit` 입력창은 어떤 HTML에도 없다 → 저장할 사용자 의사가 없는데 `api-keys-save-btn` 등 실재 버튼 4개(`priceInfoModal.ts:1617/1626/1635/1644`)가 `saveSettingsHandler`를 타면서 `dailyPostLimit:3`을 디스크에 박는다. **`:845-848`의 const 4개는 지우지 말 것** — `:1133-1140`(로드), `:1360-1363`(폴백)이 여전히 참조한다. 삭제 범위 정확히 4줄.

**fix 2 — `src/contentQualityV3/candidateRuntimeFingerprintPin.ts` 해시 재계산**
`priceInfoModal.ts`가 지문 목록(`candidateRuntimeFingerprint.ts:543`)에 있어 1바이트 수정만으로 `contentQualityV3RuntimeFingerprint.test.ts`가 RED. `9f3ae425`도 같은 갱신을 동반했다.

**fix 3 — 버전업 + 릴리즈 (v2.11.161)**
`9f3ae425`의 표시 픽스가 패키징본에 들어가야 사용자 화면이 바뀐다.

**검증**
- `npx vitest run dailyRecommendationDisplay postLimitManager paraphraseRiskDisplay contentQualityV3RuntimeFingerprint` → 전건 GREEN (fresh 실행)
- `npx vitest run` 전체 GREEN
- 회귀 잠금 추가: `dailyRecommendationDisplay.test.ts`에 `expect(modal).not.toContain("dailyPostLimit: parseInt(dailyPostLimit?.value")` — **red-green: 삭제 전 RED 확인 필수**
- `git diff HEAD -- src/renderer/modules/priceInfoModal.ts` 로 4줄 외 변경 0 확인
- **메인 워킹트리에서만 작업** (격리 워크트리는 CRLF로 지문 해시가 어긋난다 — 기존 교훈)
- 패키징본 더블클릭 → 요약 카드 "일일 권장 3회" 육안 확인

---

## R2 — 쇼핑 제목 압사 종결 (우선순위 1, P0)

60자 상품명이 제목 앞에 붙고 70자 클램프가 판단 문구를 잘라내는 체인. 실행 재현으로 "판단 문구 27자 중 6자만 생존" 확인된 유일한 P0.

**fix 1 — `src/contentReviewHelpers.ts:36-47` `getReviewProductName` 4어절 축약**
`return` 직전에 `preprocessLongKeyword(...).coreKeyword`(`src/contentKeywordHelpers.ts:39`) 적용. 축약본은 원문의 접두사이므로 `contentGenerator.ts:1387-1389`의 조기 return 포함 판정이 그대로 true를 유지 → 1395행에서 60자 원문이 재접두되는 회귀 없음(검증 완료). 호출부는 `contentStructuredValidator.ts:180`, `contentGenerator.ts:1370`, `:1383` 3곳뿐. 프롬프트(`contentJsonPromptFormat.ts:285`)가 이미 축약본을 쓰므로 비대칭 해소이기도 하다.

**fix 2 — `src/contentKeywordPrefix.ts` 클램프를 쇼핑 한정으로 스코프**
검증 보고의 "70 → 45 전역 하향"은 **채택하지 않는다.** `applyKeywordPrefixToTitle`은 SEO(`contentGeneration.ts:692/713`)·연속발행(`continuousPublishing.ts:1323`)이 공유하므로 전 모드 제목이 짧아진다(§0 재확인). 대신:
- `KeywordPrefixOptions`(`:11-19`)에 `maxLength?: number` 추가, 기본값 70 유지
- clamp 호출부 **3곳 전부**(`:166`, `:168`, `:198`)를 `clampTitleLength(x, options?.maxLength ?? 70)`로
- `src/contentGenerator.ts:1372`의 productName 경로에서만 `{ maxLength: 45 }` 전달

**검증**
- 재현 스크립트(60자 상품명 + 판단형 제목) 수정 전/후 문자 단위 비교 — 수정 전 68자·판단문구 6/27자, 수정 후 전량 생존
- `EARLY RETURN fires === true` 단언 (`contentGenerator.ts:1387` 조기 return 유지 확인 — 제거하면 60자가 두 번 붙는다)
- `npx vitest run keywordPlacementEnforce contentQualityV3GenerationIntegration` + 전체 GREEN. `contentQualityV3GenerationIntegration.test.ts:169`가 `applyKeywordPrefixToStructuredContent(finalContent,` 호출 **2회**를 잠그므로 호출 수 불변 확인
- full-flow: 쇼핑커넥트 1건 생성 → 최종 제목 육안 + 로그의 titleCandidates
- SEO 모드 1건 생성 → 제목 길이가 기존과 동일한지(옵션 미전달 경로 무영향) 대조

---

## R3 — 쇼핑 본문: 가치입증 + 반박제거 (프롬프트 전용)

R2와 분리하는 이유: R2는 문자열 후처리, R3은 LLM 출력 변화 — 회귀 표면이 다르다.

**fix 1 — `src/content/affiliateAuthenticity.ts:159-180` 반론 유형 확장**
3종 정규식에 총비용(소모품·전기요금 반복 지출), 대안 비교, 고장·AS 리스크, 과사양 추가. **`evidenceText`(후기+스펙) 매칭 조건과 `:176-178` "미매칭 시 비활성" 반환은 그대로 유지** — 근거 게이트 불위반, 날조 방지선 유지.

**fix 2 — `src/content/affiliateConversionStructure.ts:29`(3단) 가치입증 1문장 추가**
"확인된 스펙·구성·후기 결과가 무엇을 대체하는지(반복 지출·시간·공간)로 값의 의미를 설명한다. 가격은 단정하지 않는다." → `:408/:409`(가격 단정 금지)와 충돌하지 않는 별도 문장으로 추가. **`:408-409`, `:471-478`, `:489-496`은 손대지 말 것**(허위 가격·출처 위장 방지선).

**fix 3 — `src/contentJsonPromptFormat.ts:260` 명사형 강제를 affiliate 제외**
"모든 모드 공통" 문구가 소제목을 관찰 보고형 명사구로 고정한다 → `contentMode === 'affiliate'`일 때만 분기. (후기분석체 탈피의 실제 지렛대는 감사기가 아니라 이 프롬프트 문구다.)

**검증**
- 프롬프트 빌더 단위 테스트: affiliate일 때 명사형 강제 문구 부재 / 그 외 모드에서 존재 (red-green)
- 반론 확장: evidenceText에 "소모품" 언급이 있는 픽스처 → 활성, 없는 픽스처 → 비활성 반환 단언
- full-flow 쇼핑 1건 생성 후 본문 사람 판독(3인칭 보고체 여부, 가치입증 문장 존재)
- 추정 효과 서술 없이 "생성된 본문에서 관찰된 문장"만 기록

---

## R4 — 쇼핑 시장 맥락 주입 (fix 1)

**`src/sourceAssembler.ts:6110-6111` (+ `:6606`, `:6674` 동일 패턴)**
현재 `crawledReviews.length > 0 ? reviewSection : await buildCompetitorComparisonSection(...)` 삼항이라 **리뷰가 있으면 가격대 블록이 사라진다.** 두 블록을 병합해 리뷰가 있는 글에도 "유사 상품 가격대: N원 ~ M원"이 rawText에 들어가게 한다. LLM 추가 콜 0, 이미 라이브인 코드 재사용. `competitorIntegration.ts`(`buildPricePositioning`) **신규 배선은 하지 않는다** — 동등 기능이 이미 있다.

**검증**: 유사상품 3건 이상 + 리뷰 있는 픽스처에서 rawText에 가격대 블록 존재 단언(red-green), rawText 길이 증가분 확인, 쇼핑 full-flow 1건.

---

## R5 — 무료체험 선행: ma 버튼 부팅 오발동 (fix 1)

이걸 먼저 하지 않으면 R6에서 게이트를 늘릴수록 증폭된다.

**`src/renderer/renderer.ts:2954`** — `initPublishModeSubtabs()`가 배선 트리거로 숨겨진 `multi-account-btn`을 프로그램적으로 `.click()` 한다. `.click()`은 `display:none`에도 디스패치되고, 그 핸들러(`multiAccountManager.ts:813-816`)가 `checkFeatureLockAndShow('multi-account-manage')`를 호출 → **무료 사용자는 앱 실행 직후 PRO 모달을 보고, ma 패널 내부 배선이 중단된다.** 배선 전용 경로로 분리하거나 트리거 직전 `dataset.skipLock` 플래그로 게이트만 우회.

- `multiAccountManager.ts:814`의 게이트 **자체는 삭제 금지**(사용자가 직접 여는 경로에서는 유효)
- `renderer.ts:2949`의 `display:none` + DOM 잔존, `:2959-2961` `forceSingleMode` 250ms/rAF 재확정은 **함께 건드리지 말 것**(2026-06-30 레이스 픽스)

**검증**: `FORCE_LICENSE_CHECK=true`로 패키징 유사 환경 부팅 → 모달 미노출 + ma 패널 상세설정/큐추가 동작 확인. 유료 경로 회귀 확인.

---

## R6 — 무료체험 렌더러 게이트 3건 (P0, fix 3)

신규 코드 한정 **fail-closed** (`if (unlocked !== true) return;`). 기존 4곳의 `=== false` fail-open은 일괄 변경하지 않는다(별도 판단 사안).

1. **`src/renderer/modules/continuousPublishing.ts:4295`** — `startContinuousPublishingV2()` 본문 첫 줄, `if (_continuousDrainPromise)` **앞**에 `'continuous'` 게이트. 기존 게이트가 붙은 `startContinuousPublishing`(non-V2)은 **호출자 0인 죽은 코드**이므로 HTML만 고치면 `continuousPublishing.ts:5275`의 window 노출로 우회 가능.
2. **`src/renderer/renderer.ts:5814`** — `executeBatchPublish()` 본문 첫 줄, `if (publishQueue.length === 0)` **앞**. 신규 키 `'multi-account-semi'`를 `featureLockModal.ts:17`(타입)·`:25`(COPY_TABLE)에 추가. `window.__executeBatchPublish`(`renderer.ts:6078`) 경로도 이 한 곳으로 커버.
3. **`src/renderer/modules/publishingHandlers.ts:350`** — `if (accountMode === 'multi') {` 직후, `handleMultiAccountPublish()` 호출 **앞**에 `'multi-account-fullauto'` 게이트.

`renderer.ts`/`publishingHandlers.ts`는 `@ts-nocheck`가 아니므로 `(window as any).checkFeatureLockAndShow?.(...)` 캐스팅 필수.

**검증**
- 회귀 잠금은 **`startContinuousPublishingV2` 본문 안에** 게이트가 있음을 단언 (`multiAccountQuotaWiring.test.ts:5-8` 슬라이스 패턴). 래퍼 `startContinuousPublishing:1183`을 단언하면 죽은 배선을 박제한다 — 기존 교훈
- `FORCE_LICENSE_CHECK=true` 무료 계정: 연속발행/반자동 다중/풀오토 multi 3경로 전부 모달 → 중단
- 무료 계정 **단일 반자동 발행은 정상 통과** 확인 (발행 무중단)
- 유료 계정 3경로 전부 정상 통과 확인

---

## R7 — 무료체험 main 이중 방어 (fix 2)

1. **`src/main/ipc/blogHandlers.ts:91`** — `validateAutomationRun(payload?: AutomationRequest)`로 시그니처 확장, `payload?._publishFlow === 'continuous' && await isFreeTierUser()` → 차단. 호출부 수정은 `src/main.ts:3262` 한 곳.
2. **`src/main.ts:4798`** (`ensureLicenseValid` 블록 직후) — `isFreeTierUser()` 차단 추가. 근거: `publishingHandlers.ts:1934`가 `multiAccountPublish([accountId], …)`를 **계정 1개씩 루프**로 호출해 `enforceFreeTier('publish', accountIds.length)`(`main.ts:4801`)의 일괄 거부가 이 경로를 못 막는다 — 무료 사용자가 3계정 순차 발행을 통과하고 있다.

**검증**: main 단위 테스트(무료/유료 × continuous/multi 4조합), full-flow 무료 단일발행 정상 + 연속발행 차단, `git diff`로 `enforceFreeTier` 기존 호출 불변 확인.

**반자동 다중계정 main 차단은 R7에서 제외** → 「사용자 결정 필요」 참조.

---

## R8 — 성인인증: 감지 유틸 + 수동 인증 대기 (fix 2)

**선행 조건(코드 전 필수)**: 주류 스마트스토어 상품 1건으로 ① 인터스티셜의 `document.title` / `body.innerText` / 최종 URL ② `m.smartstore.naver.com/{store}/i/v1/products/{id}`의 status·성인 플래그 필드명 실측. 이거 없이 정규식을 짜면 데드코드가 하나 더 늘어난다(기존 `shoppingStrategy.ts:395` 정규식이 이미 그 상태).

1. **신설 `src/crawler/adultVerificationPolicy.ts`** — 순수 함수(`manualLoginRecoveryPolicy.ts` 방식 + 단위 테스트). 입력 `{url,title,bodyText}` → `'none'|'adult-verification'|'login-required'`. 패턴 `성인\s*인증`, `연령\s*확인`, `19세`, `미성년자`, `청소년\s*유해`, `본인\s*확인` + URL `nid.naver.com`. **본문 키워드는 `bodyText.trim().length < 1500`일 때만 신뢰** — `crawlerBrowser.ts:481-484`/`513-516`의 v2.11.134 오탐("과전류시 자동차단기능") 계약 승계.
2. **`src/crawler/crawlerBrowser.ts`** — `:498 checkForCaptcha` 옆에 `checkForAdultGate`, `:533 waitForCaptchaSolved` 골격 복제로 `waitForAdultVerification`(3초 폴링 / base `TimeoutPolicy.MANUAL_LOGIN` 300s / URL 변화 시 window 재시작 / 절대 상한 `SECURITY_VERIFY` 600s / `page.isClosed()` 즉시 중단). 창 복원 헬퍼 `Browser.getWindowForTarget` → `setWindowBounds{windowState:'normal'}` → `bringToFront` 추가(`:141-150` 최소화의 대칭, 기존 캡차 대기에도 동일 적용). 배선은 `:583` 캡차 체크 **직후, `:603 if (maxRetries <= 0)` 앞** — 여기여야 `navigateWithRetry(page, url, 0)`로 들어오는 SmartStore도 대기를 탄다. 성인 상태에서 `:615` 리트라이 루프로 넘기지 말 것.

**검증**: 정책 유틸 단위 테스트(성인/로그인/정상 × 짧은본문/긴본문 매트릭스, 1500자 게이트 red-green), 실측 픽스처로 판정 일치, 라이브 성인 상품 1건 수동 인증 후 진행 확인.

---

## R9 — 성인인증: 본문 경로 fail-closed (fix 2)

R8만으로는 P0가 닫히지 않는다. 잘못된 상품 글이 생성되는 **본문 텍스트 경로는 crawlerBrowser를 한 번도 호출하지 않는다**(Stage1 `fetchWithTLS` → Stage2 `puppeteer.launch({headless:true})`).

1. **`src/sourceAssembler.ts:693`** — `const item = data.items[0];`를 `extractProductIdFromUrl(url).productId`와 **exact match 강제**, 불일치면 `return null`. 현재는 성인 게이트로 제목이 비면 스토어명으로 검색해 **남의 상품 1위**를 제목·가격·이미지째 반환한다(자동 silent 폴백 금지 위반의 실제 현장). SmartStore 전략이 이미 쓰는 계약(`String(item?.productId||'')===productId`)과 동일.
2. **`src/sourceAssembler.ts:5154-5166`** — catch 폴백(`searchNaverImages` + `'[자동 생성] 제품 정보'`)을 성인 판정 시 건너뛰고 `requiresAdultVerification: true`로 fail-closed 반환. 메시지: "성인인증이 필요한 상품입니다 — 열린 브라우저에서 인증 후 다시 시도하세요". **`:5070/:5074`의 `isErrorPage` 산식에 성인 신호를 섞지 말 것**(별도 필드).

**검증**: productId 불일치 픽스처 → `null` 반환 red-green, 성인 판정 픽스처 → `requiresAdultVerification` 반환 + `[자동 생성] 제품 정보` 미발생 단언, 정상 상품 full-flow 회귀.

---

## R10 — 중복문서: 정형문 서론 제거 (fix 1, 단독)

중복 영역에서 **확실히 살아남은 유일한 P0.** 실행 검증에서 "키워드당 서론이 정확히 2종으로 붕괴하는 흡인점" 확인 — 정형문으로 바꾸면 유사도가 LOW로 떨어져 게이트를 통과하므로 파이프라인이 수렴을 **보상**한다.

**`src/contentPolicy/orchestrator.ts:122-129, 147-160`**
- `rewriteIntroductionForSimilarity`(122-129) 삭제
- `shouldRewriteIntroduction`(147-150) 삭제
- 152-154행 → `const directIntro = originalIntroduction || plan.difference_from_recent_posts[0] || original.summary;` (유사도 사유로는 서론을 절대 교체하지 않고, 빈 서론일 때만 계획/요약에서 채움)

**검증**
- 회귀 가드는 **동작 단언**으로: "같은 키워드 두 글의 서론이 서로 달라야 한다" + `.not.toMatch(/차근차근 정리해 보겠습니다|순서대로 살펴보겠습니다/)`. 소스 텍스트 단언 금지(기존 교훈)
- 기존 테스트 영향 사전 확인 완료: `contentPolicyReaderFacingRewrite.test.ts:42-45` 통과(원본 서론 길이>20), `contentPolicyAcceptance.test.ts:95`·`contentPolicyPublishIntegration.test.ts:85` 무관
- `orchestrator.ts:162-166` headings 순서 보존은 **건드리지 말 것**("발행 글이 뒤섞임" 회귀 수정본)

---

## R11 — 중복문서: 제목 중복 방지 확대 (fix 2)

1. **`src/contentJsonPromptFormat.ts:125`** — 모드 화이트리스트 `if` 줄 삭제. 제외 대상은 affiliate만이 아니라 `traffic-hunter`·`custom`도 포함이므로 1줄 삭제가 3모드를 동시에 해소. 호출부 `contentGenerator.ts:2382`는 모드 무관 실행.
2. **`src/main.ts:5893` 근처** — `source.contentPolicyPrompt = generationPolicy.prompt;` 직후 1줄:
```ts
source.previousTitles = source.previousTitles
  ?? generationPolicy.input.recent_posts?.slice(0, 10).map((p) => p.title);
```
렌더러 window 전역은 건드리지 않는다(연속발행 세션 내 최신성은 그쪽이 정확하므로 fallback 순서 유지). 새 저장소 신설 금지 — 본문 프롬프트는 `contentPolicy/generationContext.ts:97-135`가 이미 제목을 싣고 있고, 진짜 구멍은 제목 생성 프롬프트(`contentGenerator.ts:702-709`) 하나뿐.

**검증**: 단일 발행에서 `previousTitles` 비어있지 않음 red-green, 연속발행에서 기존 세터 우선 확인, 동일 키워드 3회 연속 생성 시 제목 3종 확인.

---

## R12 — 썸네일 P0 3건 (fix 3, 반드시 동반)

1. **`src/renderer/modules/thumbnailGenerator.ts:857-901`** — `resolveFirstHeadingTitleForThumbnail()` 호출·heading 대입 제거하고 `renderer.ts:10010-10029` 형태로:
```ts
const thumbForTab = { ...thumbnailImage, heading: '🖼️ 썸네일',
  isThumbnail: true, source: 'thumbnail-generator', isManualThumbnail: true };
ImageManager.setImage('🖼️ 썸네일', thumbForTab);
```
`:871-890` 죽은 `existingImages` 블록 동시 제거. 토스트 `:899-901`의 "1번 소제목" → "썸네일 슬롯". (현 증상은 "발행 시 사라짐"이 아니라 **소제목 1 이미지가 썸네일로 바뀜** — `publishImageSequence.ts:281`이 heading을 덮어쓴다.)
2. **`src/renderer/modules/headingImageGen.ts:1710-1717`** — `hasManualThumbnailInTab`(`:1047-1051`)이 true면 `setImage('🖼️ 썸네일', …)` 건너뛰기. **이걸 빼면 1번은 "적용 → 이미지 생성하기" 한 번에 무효화된다.** `:1062` 전용 썸네일 게이트는 이미 정상이므로 손대지 말 것.
3. **`src/renderer/modules/fullAutoFlow.ts:1454-1463`** — 프리셋 복원을 `'🖼️ 썸네일'` + `isThumbnail:true`로 등록하고, `:1458-1463`의 `imageManagementImages[0] = …` **덮어쓰기를 제거**(소제목 1 이미지 1장 유실 지점). `// @ts-nocheck` + dist 복원본이므로 스타일을 주변 JS에 맞출 것.

**검증**: `thumbnailSlotRegistration.test.ts` 패턴의 소스 계약 테스트 — `setImage('🖼️ 썸네일'` 포함 + `.not.toMatch(/setImage\(firstHeadingTitle/)`, **수정 전 RED 확인 필수**. 메인 트리에서 실행(줄끝 의존). full-flow: 썸네일 적용 → 이미지 탭 노출 확인 → 이미지 생성하기 → 썸네일 유지 확인 → 발행 미리보기에서 썸네일 슬롯/소제목1 이미지 각각 확인.

---

## R13 — 썸네일 P1 (fix 3)

1. **`thumbnailGenerator.ts:819-832` 파일화** — `window.api.saveThumbnailToLocal`(`preload.ts:749`, 선례 `thumbnailPreview.ts:398`)로 저장 후 `filePath`=실경로, `previewDataUrl`=dataURL. 현재는 base64가 `filePath`로 들어가 `imageStorageNormalize.ts:57-80`이 previewDataUrl/url을 버리고 localStorage에 무가드 저장. 실패 시 기존 동작 유지(경고-only).
2. **`continuousPublishing.ts:1603`** — `[data-subtab="thumbnail-generator"]` → `[data-subtab="thumbnail"]` (1줄, `index.html:2453` 대조).
3. **`thumbnailGenerator.ts:1039-1042`** — `ctx.filter`를 `brightness(...) blur(${bgBlur}px)` 결합. `ctx.save()/restore()`(`:1037`/`:1081`) 구간 유지.

**검증**: localStorage 저장 payload에 `data:` 접두 filePath 부재 단언, 서브탭 전환 육안, blur 슬라이더 이동 시 캔버스 변화 육안 + 회귀 테스트.

---

## R14 — 로그: CTA 오탐 + 이미지 배치 카운트 (fix 2, 둘 다 셀렉터/로그 정합)

**CTA (실측 오탐 2건: `main-2026-08-04.log:2639`, `main-2026-08-03.log:3082` — 링크카드는 정상 생성돼 있었는데 "직접 링크를 추가해주세요"가 사용자 진행 로그에 노출)**
- `src/automation/editorHelpers.ts:2574` — `✅ CTA 버튼 삽입 및 확인 완료 (재시도 건너뜀)` → `✅ CTA 버튼 삽입 완료` (검증 호출이 없으므로 "확인" 표현이 거짓)
- `src/automation/ctaHelpers.ts:110-112` — `insertEnhancedCta`가 실제 타이핑된 후킹 문구를 반환하도록 변경, `editorHelpers.ts:2662`에서 `resolved.ctas[0]?.text` 대신 그 값 전달. **대안(더 견고)**: `prePublishAssertion`의 `link-card-count`(이미 1로 정확히 셈)로 판정 대체
- `src/automation/ctaHelpers.ts:60` — 2번 분기 스코프 `'.se-section-text *, .se-main-container *'` → `article.se-components-wrap` 기준
- 판정은 **경고-only 유지**. `:2667-2668` 안내 톤 완화

**이미지 배치 카운트 (최소 변경)**
- `src/automation/imageHelpers.ts:359-374` — `contentSelectors` 배열 + 첫 매치 break 제거. 같은 파일 `:788`의 `IMG_SELECTOR`를 모듈 상수로 승격해 `frame.$$eval(IMG_SELECTOR, …)` 프레임 전역 카운트. **근본 원인은 img 셀렉터가 아니라 컨테이너 스코핑** — 루트 선택기 공용화까지 갈 필요 없다
- 반환값은 계속 무시(`editorHelpers.ts:2674`, `naverBlogAutomation.ts:7669`) — 발행 차단 승격 금지

**검증**: 실제 발행 1건에서 CTA 경고 미출력 + 이미지 카운트가 `prePublishAssertion`의 11개와 일치, full-flow 2회.

---

## R15 — 로그: 마커 누출 (fix 2, 테스트 동반 수정)

**`src/contentTextHelpers.ts:123`** — 문장 중간 규칙을 "브래킷만 제거"에서 "마커 ~ 문장 종결부(`.!?\n`)까지 제거"로. 현 규칙 2는 마커만 떼어내 `marker-leak` 게이트의 탐지 가능성을 영구 제거한다(살아남은 실질 결함).

**동시에 `src/__tests__/stripInternalMarkers.test.ts:68-73`을 뒤집어야 한다.** 현 테스트가 반대 동작(`'대기 시간은 40분이었다. [이미지 설명] 그래서 예약을 추천한다.'` → 뒷문장 보존)을 박제 중이라 수정 없이는 즉시 RED. "마커 이후 문장은 지시문이므로 함께 제거"로 뒤집고 `.not.toMatch(/이미지 설명/)`로 잠글 것 — **틀린 테스트가 회귀를 강제하는 전형**.

**`src/automation/prePublishAssertion.ts:119-125`** — `DEFAULT_FORBIDDEN_MARKERS`에 `'[이미지 설명]'`, `'[사진 설명]'`, `'[이미지 프롬프트'`, `'[그림 설명]'` 추가. **경고-only 유지.**

**`contentTextHelpers.ts:121`(줄 단위 규칙)은 건드리지 말 것** — 청킹 이전 텍스트에서 정상 작동하며, 보고서의 MULTI 픽스처는 파이프라인에 존재하지 않는 입력(에디터 DOM innerText = `editorHelpers.ts:415-419` 22자 청킹 산출물).

**검증**: red-green(수정 전 SINGLE 케이스 RED), 실제 8/3 원문 픽스처로 잔존 0 확인, 전체 vitest GREEN.

---

## R16 — 로그: Gemini 크레딧 소진 원인 노출 (fix 3)

실측: 사용자에게 간 것은 번역 미적용 원문("Your prepayment credits are depleted…"). "1~2분 후 자동 해제" 오안내는 이번 실행에서 **미출력**(`grep "분당 요청 한도"` 0건).

1. **`src/contentGeminiErrorPolicy.ts:10`** — `429` 분기 **앞에** `credits are depleted` / `prepayment credits` 케이스 신설, "1~2분 후 자동 해제" 문구와 분리. 판정 문구는 `src/contentErrorDiagnostics.ts:141-142`(이미 `9f3ae425`에 커밋됨)를 provider-중립 헬퍼로 추출해 재사용.
2. **`src/gemini.ts:206-211`** — **두 번째 번역기.** 동일 처리(`msg.includes('429')` → "무료 사용량 초과" 오안내).
3. **`src/automation/editorHelpers.ts:2100`** — `⚠️ 장단점 추출 실패 - 표 생성 건너뜀`에 원인 요약 덧붙임. 이 라인이 `naverBlogAutomation.ts:1229-1236`을 거쳐 UI에 도달하는 **유일한 경로**이므로 여기 한 줄이면 인지가 해결된다. **새 IPC 훅·모달 프리셋 신설 불필요**(기능 추가 = 복잡도).
   - 덤: `src/crawler/imageRelevanceScorer.ts:301-303` catch에 로그 자체가 없다(완전 무음) → `console.warn` 1줄

**검증**: 429/크레딧소진/일반 rate limit 3케이스 분류 단위 테스트, **"quota"/"exceeded your current quota"를 billing으로 올리지 않음** 회귀 유지(v2.10.356 반대 방향 회귀 방지), 두 번역기 모두 커버.

---

## R17 — 로그: 이미지 업로드 폴링 도입 (fix 1)

**"이미 폴링이 있으니 5초를 위임"은 REFUTED** — `imageHelpers.ts:1027`은 고정 대기(5000+300+300+1000) 후 **단발 측정 1회**다. 폴링 루프가 없다.

**`src/automation/imageHelpers.ts:1027`** — "짧은 초기 대기(500ms) + `imgCount > imgBeforeCount` 될 때까지 200ms 간격 폴링(상한 8초)"으로 교체한 **뒤**, `:678-679`·`:983-984`의 5초 고정 대기 제거. 폴링 도입이 선행 조건.

**`:296-298` 활성 판정 보정은 별건으로 분리** (회귀 cascade 금지).

**검증**: 느린 환경 시뮬(네트워크 스로틀) 포함 이미지 5장 업로드 full-flow 3회 — 증가분 검증 성공률 100%, 소요 시간 기록(추정 효과 서술 없이 실측만).

---

## 사용자 결정 필요 (코드 변경 보류)

| # | 항목 | 결정이 필요한 이유 |
|---|---|---|
| D1 | **무료 체험 "3개 모드 구매 유도"의 정의** | 우선순위 3번의 "3개 모드"가 무엇인지(연속발행/반자동 다중/풀오토 multi 로 해석해 R6를 구성했다) 확인 필요. 유도 카피·CTA 문구는 UI 추가라 명시 요청 전엔 `featureLockModal` 기존 모달 재사용만 한다 |
| D2 | **반자동 다중계정 main 차단용 신규 마커** | `executeBatchPublish` 루프 플래그 → `fullAutoFlow.ts:3672-3674` `_publishFlow` 삼항 → `global.d.ts:233`·`types/index.ts:92` 유니온 확장 = **3파일 타입 변경**. 현재 반자동 다중은 정당한 단일 반자동 발행과 페이로드가 완전히 동일해서, 마커 없이 main에서 `'semi_auto'`를 막으면 **무료 사용자의 정당한 단일 발행이 죽는다**. R6 렌더러 게이트로 충분하다면 보류가 합리적 |
| D3 | **성인인증 라이브 실측 1건** (R8 선행) | 사용자 PC에서 성인 상품 URL 1건의 인터스티셜 `title`/`bodyText`/최종 URL + 모바일 API status 캡처가 필요. 이게 없으면 정규식이 또 데드코드가 된다 |
| D4 | **성인인증 fail-closed = 생성 중단** | R9는 "잘못된 상품으로 글 생성" 대신 **생성 실패**로 끝낸다. 이는 발행 차단이 아니라 소스 수집 실패이지만, 사용자 체감상 "글이 안 나옴"이므로 명시 동의 필요 |
| D5 | **PrePublish 마커/이미지 게이트의 차단 승격 여부** | R14·R15 전부 경고-only로 설계했다. 차단 승격은 발행 무중단 원칙 위반이므로 사용자 결정 사안 |
| D6 | **`buildUniquenessPlan` 생성 프롬프트 주입** | `config/content_policy.yaml`의 `rotation.topic_angles`가 유품정리/이사 **도메인 전용** 값이라 그대로 주입하면 SEO/홈판/쇼핑 글이 무관한 어휘로 끌려간다. 도메인 중립인 `structure_type`만 주입하거나 모드별 분리 후 주입 — **별도 SPEC** |
| D7 | **`<100` 클램프 + 일일한도 입력창 복원 여부** | 현재 `daily-post-limit` 입력창이 HTML에 없어 클램프가 도달 불가. 입력창을 되살릴지 결정 필요(되살리면 100 이상 입력 은폐 문제 재검토) |
| D8 | **`featureLockModal.ts:134` 카피 정합** | "무료 체험판은 단일 발행 · 글 1편 작성까지" vs `freeTrialPolicy.ts:3` = 3. 표시를 3회로 맞출지, 정책을 1편으로 내릴지 = 정책 결정 |

---

## 기각된 오탐 (재조사 방지)

| # | 기각된 주장 | 기각 근거 |
|---|---|---|
| X1 | 쇼핑 P0-2: FinalQualityGate rescue가 20점→0점 악화, 롤백 필요 | `contentGenerator.ts:1387-1389` 조기 return이 `finalizeStructuredContent`를 종료시켜 1397~1440(rescue 1427 포함) 전부 미실행. 쇼핑 경로에서 **도달 불가** — 넣어도 no-op |
| X2 | 쇼핑 P0-4: `affiliateReviewDepth.ts:58-59` 하드리턴이 3인칭 보고체를 "하드 강제" | advisory-only(`:80-83` 주석). `retryDirective` 주입 지점 `contentGenerator.ts:7120`은 affiliate에서 항상 false인 `allowPaidPostGenerationRepair` 안. **모델이 감사기 결과를 한 번도 보지 않는다.** 제거하면 출력은 1자도 안 바뀌고 진단 가시성만 잃는다 |
| X3 | 쇼핑: `evaluators/affiliateEval.ts`에 "사용 경험 톤(20)" 축 | 실제 74행은 "근거 정합성(20점)". 보고서가 파일 상단 4-12행의 **낡은 문서 주석**을 구현으로 인용 |
| X4 | 쇼핑 P2-8: pricePositioning 신규 배선 필요 | 동등 기능(`buildCompetitorComparisonSection`)이 이미 라이브. 진짜 공백은 배선이 아니라 **리뷰 있는 글에 시장 맥락이 안 들어가는 삼항 조건** → R4 |
| X5 | 무료체험: `multi-account-manage` 게이트가 사문화 | 살아 있고 **부팅 시 자동 발동**한다(`renderer.ts:2954` 프로그램적 `.click()`) → R5로 반전 |
| X6 | 무료체험 P1-3: fail-open 원인 = 인라인 번들 concat 순서 의존 | 4개 호출부 전부 함수 내부 런타임 호출이라 번들 순서 무관. 진짜 원인은 `featureLockModal`을 **어떤 TS 모듈도 import하지 않고** `scripts/copy-static.mjs:429` 배열 한 줄에 매달려 있다는 것 |
| X7 | 성인인증 P0 근거 = `sourceCollector.ts:54-62` | 이 파일은 **호출자 0**(참조는 `browserAdapter.ts:19` 주석 한 줄). `ultimateGenerator.ts`·`urlGenerator.ts`도 동일. 도달 불가 |
| X8 | 성인인증: "`detectProductPageQuality`를 배선하라" | 소유 함수 `crawlShoppingSite`(`shoppingStrategy.ts:498`) 자체가 데드. 죽은 파이프에 밸브 다는 격 |
| X9 | 성인인증 C10: "`navigateWithRetry` 1곳 배선이면 전부 커버" | 본문 텍스트 경로는 crawlerBrowser를 **한 번도 호출하지 않는다** → R8+R9 2곳 필요 |
| X10 | 성인인증 C7/C8: tmpdir 프로필 3분기 / SmartStore 리트라이 이탈 | tmpdir 프로필은 데드 경로 소유. `SmartStoreProvider.ts:492`는 `maxRetries=0`으로 리트라이가 **애초에 안 일어남** |
| X11 | 중복문서 P0-2: URL 모드 fidelity 재시도가 원문 복제를 강제 | `contentGenerator.ts:5048-5054` env 게이트(`CONTENT_ALLOW_PAID_POST_GENERATION_REPAIR`)가 `.env`에 없어 **코드가 죽어 있다.** 요구한 수정("사실 보존/표현 재구성 분리")은 `contentUrlModeDirective.ts:30`에 **이미 구현** |
| X12 | 중복문서 P2-1: "HashEmbedder는 같은 키워드 글끼리 쉽게 넘는다" | 실측 동일 주제 두 글 cosine **0.4690**(임계 0.90). 방향이 반대 — 임계 0.90이 hash 표현에선 도달 불가에 가까워 해당 분기가 사문 |
| X13 | 썸네일 P1-3: 수동 썸네일 미인식으로 AI 썸네일 덧생성(과금 추가) | `hasThumbnailHeading`이 표준 플로우에서 **항상 true**(`autoAnalyzeHeadings:3358-3365` → `getCurrentImageHeadings:5600-5621`). 전용 블록은 실행되지 않는다. 대신 발견된 실제 결함은 `headingImageGen.ts:1710` 무조건 덮어쓰기 → R12-2 |
| X14 | 썸네일 P0-1 하위: 발행 payload에서 완전 소실 | `filterImagesForPublish`는 레거시 `runAutomation` 경로 전용. 실제 반자동은 `publishingHandlers.ts:2275-2277 getAllImages()` → **소실이 아니라 소제목1로 오배치** |
| X15 | 로그 신호6: 줄바꿈형 3줄 잔존 / 8/3 로그가 v2.11.154 실패 증거 / 회귀 테스트 없음 | MULTI 픽스처는 청킹(`editorHelpers.ts:415-419`) 산출물이라 strip 시점에 존재하지 않는 입력. 8/3은 v2.11.153으로 해당 정규식 이전. 회귀 테스트는 `stripInternalMarkers.test.ts:44-85`에 **이미 있고 반대 동작을 박제 중** |
| X16 | 로그 신호1: "실패가 사용자에게 도달하지 못한다" | 도달한다(`editorHelpers.ts:2100` → `naverBlogAutomation.ts:1229-1236`, 로그 `:2177` `[+135.1s]`). 도달 못 하는 건 **원인** |
| X17 | 로그 신호5: "성공 판정은 이미 증가분 폴링" | 폴링 아님. 고정 대기 후 **단발 측정 1회**(`imageHelpers.ts:1027`). 5초를 그냥 빼면 업로드 검증이 깨진다 |
| X18 | 일일한도: 다른 세션 미커밋 / 디스크 실증 / `PRESERVE_KEYS` 미등재가 원인 | 이미 커밋(`9f3ae425`), `git status` clean. `saveConfig`는 `cachedConfig` 전체를 매번 재기록하므로 디스크의 3은 구버전 기본값과 구별 불가. `configManager.ts:874-891`은 **값이 없을 때만** 개입하므로 PRESERVE 등재는 해결책이 아님 |
| X19 | 일일한도 P2: 다중계정 MAX 노출 | `addBlogAccount` 호출부 2곳 모두 `dailyLimit`을 항상 포함(`multiAccountManager.ts:311-313`, `:2557-2558`). `blogAccountManager.ts:129` MAX는 **도달 불가한 죽은 기본값** |

---

## 재조사 필요 (PLAUSIBLE)

| # | 항목 | 필요한 증거 |
|---|---|---|
| Q1 | 쇼핑 P1-9: 두 평가기에 "구매 결정" 축이 0개 | 인용이 stale 주석 기반이었다. `affiliateEval.ts` 실제 축 목록을 전수 나열한 뒤 "가치입증/반박제거" 축 부재만 재확인 |
| Q2 | 쇼핑 P1-7: 가치입증 지시 부재 | "대체 표현 지시가 없다"는 거짓(`:409` 후반·`:279` 후반·`:404`·`:411`). 실제 공백은 "대체 비용/사용 빈도/수명" 같은 **비교 준거**뿐 — R3-2가 그 범위인지 생성물로 재확인 |
| Q3 | 성인인증 C6: 최소화 창에서 `bringToFront()`만으로는 못 본다 | 코드로 증명 불가한 런타임 주장. R8의 창 복원 헬퍼를 넣고 **실기 관찰**로 확정 |
| Q4 | 성인인증 C11: `imageUrlUtils.ts:39`의 `nid.naver.com`이 로그인 리다이렉트 관측 흔적 | 해당 목록은 UI 이미지 URL 차단용. 근거로 쓰되 결론으로 쓰지 말 것 |
| Q5 | 중복문서: `contentUrlModeDirective.ts:16` "원본의 85% 이상" 길이 하한이 순서대로 옮기기를 유도 | env 게이트 없이 URL 모드마다 항상 주입되는 건 사실. 실측 근거는 이 코드베이스에 없음 — URL 모드 2회 생성물 비교 필요 |
| Q6 | 로그 신호1-C: "1~2분 후 자동 해제" 오안내 | 코드상 도달 가능하나 이번 실행 로그에 **미출력**. R16 후 재현 로그로 확인 |
| Q7 | 무료체험 P1-3: `copy-static.mjs:429` 한 줄 의존 | tsc/lint/build 전부 통과한 채 4개 게이트가 조용히 무력화되는 구조. 빌드 후 `dist`에 `featureLockModal` 존재를 단언하는 가드가 필요한지 별도 판단 |

---

## 절대 건드리면 안 되는 것 (전 영역 통합)

- `contentGenerator.ts:1387-1389` 조기 return (2중 접두 방지) / `:5048-5054`·`:7070`·`:7115` `allowPaidPostGenerationRepair` 차단 (의도적 과금 차단)
- `releaseActivationManifest.ts`의 v3 INACTIVE — 켜는 순간 `shouldRunLegacySemanticPostDraftMutation`이 전부 false가 되어 후처리 경로가 통째로 바뀐다
- `affiliateAuthenticity.ts:313-317 [후기 평가 금지]`, `:408-409`, `:471-478`, `:489-496`
- `authUtils.ts:105` / `main.ts:968` `!app.isPackaged` 무조건 유료 취급 (개발 편의) — 검증은 `FORCE_LICENSE_CHECK=true`
- `paywallSystem.ts:515/566` 하드 오버레이 재사용 금지 (정당한 단일 발행까지 죽는다) / 기존 4개 게이트의 `=== false` fail-open 일괄 변경 금지 / `featureLockModal.ts:152-164 openInBrowser` / `multiAccountManager.ts:1 @ts-nocheck` / `renderer.ts:2949·2959-2961`
- `types.ts:100-113 ERROR_PAGE_INDICATORS`에 성인·로그인 키워드 추가 금지 / `crawlerBrowser.ts` `body < 1500` 길이 게이트 완화 금지 (v2.11.134 오탐 방벽) / `detectProductPageQuality`·`shoppingStrategy.ts:395`·`navigateWithRetry(page, mobileUrl, 0)` 문자열 삭제 금지 (테스트 잠금)
- `claimRepair.ts:117-120` advisory 강등 / `orchestrator.ts:162-166` headings 순서 / `contentPolicy/generationContext.ts:105 BODY_EXCERPT_CHARS=200` / `policyService.ts:485-499` / `config/content_policy.yaml` 임계 추정 재보정 금지
- `imageManagerCore.ts:234` 예외 확대 금지 / `imageSyncService.ts:102-108`·`:238-242` / `thumbnailPreview.ts:27-33` 함수 자체 수정 금지(호출만 제거) / `headingImageGen.ts:1150 useBatchImageGeneration=false` 되살리기 금지 / `:1062` 전용 게이트
- 휴먼 비헤이비어 고정 대기(`naverBlogAutomation.ts:9084-9131`) / `:2115-2128` 초안 dismiss 분기 / `contentTextHelpers.ts:121` 줄 단위 규칙 / `prePublishAssertion.ts:252` image-count 70% / `verifyImagePlacement` 반환값 무시
- `configManager.ts:678/1221`, `postLimitManager.ts:33-40`, `blogAccountManager.ts:129/243-252`, `continuousPublishing.ts:266 DAILY_POST_LIMIT=20`, `freeTrialPolicy.ts:3` — 표시 계통과 판정 계통 **상수 공유 금지**
- 죽은 코드 정리(`sourceCollector.ts`, `ultimateGenerator.ts`, `waitForCaptchaIfNeeded`, `startContinuousMode`, `startContinuousModeEnhanced`, `automationHelpers.ts`의 `DailyPostManager`, `thumbnailPreview.ts:87-499`) — 언급만, 삭제는 별건 (`automationHelpers.ts`는 지문 목록 등재라 삭제 시 지문 테스트 붕괴)

**릴리즈 순서**: R1(즉시) → R2 → R3 → R4 → R5 → R6 → R7 → R10 → R11 → R12 → R13 → R14 → R15 → R16 → R17. R8·R9는 D3(라이브 실측) 회신 후 R6과 R10 사이에 삽입. **모든 작업은 메인 워킹트리에서** (지문 핀 = 줄끝 의존).
