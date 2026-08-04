# 무료체험 3회 통합 카운트 — 구현 설계

작성 기준: `src/` 실측 재검증 완료 (2026-08-05, v2.11.162). 아래 모든 file:line 은 본 세션에서 직접 grep/read 로 확인함.

---

## 핵심 판정: 단일 병목 존재 여부 (파일:라인 + 근거)

**엔진은 단일 병목이다 (CONFIRMED). 카운터는 "구조적 단일"이 아니라 "4곳 1:1 배선"이다. 그리고 이번 릴리즈에서는 그 배선을 옮기지 않는 것이 옳다.**

### 근거 1 — 발행 엔진은 하나

| 지점 | 파일:라인 |
|---|---|
| 유일한 발행 오케스트레이터 | `src/main/services/BlogExecutor.ts:739` `runFullPostCycle` |
| 유일한 실제 발행 실행 | `src/main/services/BlogExecutor.ts:625` `await automation.run(runOptions)` |
| 우회 불가 근거 | `src/types/automation.ts:9` `IAutomationInstance` 가 `run()`만 노출 — BlogExecutor 는 다른 발행 메서드를 타입상 호출할 수 없다 |

`NaverBlogAutomation.runPostOnly()` (`src/naverBlogAutomation.ts:8478`) 는 **제2 발행 엔진이 맞다**. 다만 프로덕션 호출자 0건 — 실측 호출자는 `src/tests/testImageInsert.ts:175`, `src/tests/testTypingWithPexels.ts:120`, `src/tests/typingWithPexels.ts:157` 뿐이고, `IAutomationInstance` 에도 없다. 오늘 도달 불가. (조치는 "절대 건드리면 안 되는 것" 아래 별도 항목)

### 근거 2 — 차감은 4곳, 그러나 정확히 1:1 대응

본 세션 grep 실측 (테스트 제외):

```
executePostCycle 프로덕션 호출부  : main.ts:1777, 3285, 5465, 9090   (4곳)
consumeQuota('publish', 1) 지점  : main.ts:1772, 3272, 5452, 8978   (4곳)
```

| # | 경로 | 사전 게이트 | 차감 | 메커니즘 |
|---|---|---|---|---|
| 1 | `automation:run` (단일·반자동·풀오토·연속·일괄) | `main.ts:3262` → `src/main/ipc/blogHandlers.ts:101` | `main.ts:3272` | 직접 consume + 수동 환불 3분기(3312/3320/3338) |
| 2 | `multiAccount:publish` | `main.ts:4802` | `main.ts:5449` lease | `acquireScheduledPublishQuota` |
| 3 | SmartScheduler | `main.ts:1763` | `main.ts:1758` lease | 동일 |
| 4 | 앱 예약 cron | `main.ts:8969` | `main.ts:8964` lease | 동일 |

### 근거 3 — 차감 지점을 BlogExecutor 로 내리면 안 되는 이유 (검증 결과 기각)

`quota-mechanics` 보고서는 `BlogExecutor.cleanup(..., publishSucceeded)` (`BlogExecutor.ts:656-687`) 로 차감을 내리라고 권고한다. **이번 릴리즈에서는 기각한다.**

1. **현행 4곳은 전부 `executeWithContentPolicyManualReview` 바깥에서 1회만 차감한다** — 실측: 3272 < 3284, 5449 < 5464, 1758 < 1776, 8964 < 9090. 검수 재진입(`src/main/contentPolicyManualReview.ts:78` `return dependencies.execute(approvedPayload)`)이 `executePostCycle` 을 두 번 부르지만, 차감은 바깥이라 **이중카운트가 구조적으로 불가능**하다. 즉 현행 위치는 우연이 아니라 방어다.
2. `cleanup` 으로 내리면 lease 3곳과 **이중차감**이 즉시 발생한다. 3곳의 lease 를 동시에 걷어내야 하는데 이는 1릴리즈 1~3 fix 제약과 회귀 cascade 금지에 정면 위배.
3. "5번째 호출부가 생기면 샌다"는 실제 위험이지만, **코드 이동이 아니라 불변식 테스트로 막는 것이 비용 대비 안전하다** (R1 에 포함).

**결론: 카운트 로직은 이번 릴리즈에서 한 줄도 옮기지 않는다. 바꿀 것은 (a) 기능 잠금 제거, (b) 한도 도달 시 루프 조기 종료, (c) 문구뿐이다.**

---

## 카운트 지점 (어디서 +1 하는가, 왜 거기인가, 중복 카운트 위험)

### 현행 유지 — 위 표의 4지점 그대로

- 카운터 실체: `quota-state.json` 의 `publish` 키 (`src/quotaManager.ts:88`, HMAC 서명 `:46-66`, 백업 이중화 `:95-98`)
- 한도: `src/freeTrialPolicy.ts:3` `FREE_TRIAL_DAILY_PUBLISH_LIMIT = 3`
- 판정: `src/quotaManager.ts:285` `isPaywalled: state.publish >= limits.publish`
- **발행 종류 구분이 코드에 존재하지 않는다** — 4지점 모두 `consumeQuota('publish', 1)`. 연속발행이든 다중계정이든 1건 = 1카운트. 사용자 정책이 요구하는 "동일한 하나의 카운터"는 **이미 충족돼 있다.**

### 중복 카운트 위험 3종 (전부 현재는 방어됨 — 깨뜨리지 말 것)

| 위험 | 방어 위치 | 깨지는 조건 |
|---|---|---|
| 검수 재진입 2회 실행 | 차감이 `executeWithContentPolicyManualReview` 바깥 | 차감을 `runFullPostCycle`(`BlogExecutor.ts:739`) 또는 `executePublishing`(`:492`) 안으로 이동하는 순간 |
| 다중계정 루프 N회 | `main.ts:5449` lease 가 항목마다 1회 consume, `finally :5502` rollback | 루프 밖으로 lease 를 올리면 과소, 루프 안에 추가 consume 을 넣으면 과다 |
| 발행 재시도 | `fullAutoFlow.ts:3190/3314/3775/3828` 각 재시도가 별도 `automation:run` → 실패분은 `main.ts:3320` 에서 환불 | 환불 3분기 제거 시 재시도 1회 = 2카운트 |

### 과소집계 잔여 (이번 릴리즈 미조치, 근거는 "쿼터 우회 경로" 절)

`PUBLISH_UNCONFIRMED` (`src/naverBlogAutomation.ts:5808/5870/5878`) 발생 시 — 예약 cron 은 `main.ts:9157-9158` 에서 `commit()`(환불 안 함), 수동(`main.ts:3320`)·다중계정(`main.ts:5502`)은 환불한다. 글은 네이버에 살아 있는데 카운트 0.

---

## 차단 지점 (어디서 막는가, 렌더러/main 이중 방어 필요 여부)

### main = 유일한 차단 권한자 (전부 이미 존재, 신규 없음)

| 차단 | 파일:라인 | 반환 |
|---|---|---|
| 발행 (automation:run) | `src/main/ipc/blogHandlers.ts:101` `enforceFreeTier('publish', 1)` | `{success:false, code:'PAYWALL', message, quota}` |
| 발행 (다중계정 배치) | `src/main.ts:4802` | 동일 |
| 발행 (SmartScheduler) | `src/main.ts:1763` | lease throw |
| 발행 (앱 예약 cron) | `src/main.ts:8969` | lease throw |
| 글생성 선차단 | `src/main.ts:5636-5641` `if (status.isPaywalled)` | `code:'PAYWALL'` |
| 판정 함수 | `src/main/utils/authUtils.ts:157-175` / 중복본 `src/main.ts:1004-1023` | |

`canConsume` (`quotaManager.ts:289-293`) 은 `state + amount <= limit` — 3회 소진 시 4번째는 fail-closed 로 반드시 막힌다. **차단 로직은 신규 개발이 필요 없다.**

### 렌더러 이중 방어는 만들지 않는다 (명시적 기각)

- 사용자 제약: "오탐으로 정당한 발행이 죽는 것이 한도 초과 1건을 놓치는 것보다 나쁘다."
- 실제 오탐 경로가 이미 코드에 있다: `src/renderer/modules/featureLockModal.ts:256-258` — `getLicense()` 호출이 실패하면 `licenseType = 'free'` 로 간주하고 차단한다. IPC 일시 실패·초기화 순서 문제로 **유료 사용자가 막히는 구조**다. 이 패턴을 확산시키면 안 된다.
- 렌더러에서 신설하는 것은 차단이 아니라 **"이미 main 이 PAYWALL 을 반환한 뒤의 루프 조기 종료"** 하나뿐이다. 판정 주체는 여전히 main.

---

## 연속발행·다중계정에서의 동작

**정책대로 "3건까지는 나가고, 4번째에서 멈춘다." 시작 자체는 막지 않는다.**

### 현행 동작 (수정 전) — 멈추긴 하는데 5회 헛돈다

무료 사용자가 10건 큐로 연속발행 시작 →
1~3건: 정상 발행, 카운터 3 도달.
4건째: 글생성 IPC 가 `main.ts:5636-5641` 에서 `code:'PAYWALL'` 반환 → `fullAutoFlow.ts:2484-2487` 이 `activatePaywall(result); return;` → 항목 실패 처리 → **루프는 다음 항목으로 진행**.
5~8건째: 동일하게 실패.
`_consecutiveFailCount >= 5` (`continuousPublishing.ts:5170`) 에 도달해서야 `stopContinuousMode('manual'); break;`.

→ 결과적으로는 3건에서 멈추지만, 사용자는 "5번 실패했다"는 로그를 보고 원인을 오해한다. 발행 종류 잠금을 걷어내면(R1) 이 경로를 무료 사용자가 반드시 밟게 되므로 함께 고쳐야 한다.

### 수정안 (R2) — 단일 신호 + 4개 루프 조기 break

**신호 원천은 이미 단일이다.** 모든 PAYWALL 응답은 `activatePaywall` (`src/renderer/modules/paywallSystem.ts:515`) 로 수렴한다:
- api 전역 래퍼 `paywallSystem.ts:544-567` (`wrapApiForPaywall`) — `apiClient` 가 `(window.api as any)[apiMethod](...)` 를 **호출 시점에** 읽으므로(`src/renderer/utils/apiClient.ts:256`) 래핑이 적용된다.
- 명시 호출부: `fullAutoFlow.ts:2484`, `contentGeneration.ts:649/1239`, `formUtilities.ts:214/341`, `renderer.ts:2314`.

구현:

1. `paywallSystem.ts` 에 읽기 전용 접근자 1개 추가 (모듈 상태 `paywallActive` 는 `:10/:516/:525` 에 이미 존재):
   ```ts
   export function isPaywallActive(): boolean { return paywallActive; }
   ```
   추가로 minify 네임스페이스 충돌 회피를 위해 `featureLockModal.ts:275` 와 동일한 패턴으로 `(window as any).isPaywallActive = isPaywallActive;` 를 붙인다.

2. 4개 발행 루프 상단에서 체크 후 break (신규 UI 없음, 기존 appendLog 재사용):

| 루프 | 파일:라인 | 삽입 위치 |
|---|---|---|
| 연속발행 | `src/renderer/modules/continuousPublishing.ts:4443` | 4444 `const item = ...` 다음, 4445 `if (!isContinuousMode) break;` 앞. 중단 시 `stopContinuousMode('manual')` 동반 (5178 과 동일 패턴 — break 만 하면 "모든 작업 완료" 오표시) |
| 일괄발행 | `src/renderer/renderer.ts:5914` | 5916 의 stop 체크 블록과 같은 자리 |
| 반자동 다중계정 | `src/renderer/modules/publishingHandlers.ts:1806` (`handleMultiAccountPublish`, `:1660`) | 루프 본문 최상단 |
| 다중계정 풀오토 큐 | `src/renderer/modules/multiAccountManager.ts:3133` | 루프 본문 최상단 (조건절이 아니라 본문 — 조건절 수정은 기존 stop 플래그 의미를 흐린다) |

3. 유료 사용자 영향 0: `activatePaywall` 은 main 이 `code:'PAYWALL'` 을 반환할 때만 호출된다. 유료 사용자는 `isFreeTierUser()` (`authUtils.ts:103`) 가 false 라 `enforceFreeTier` 가 항상 `allowed:true` → 신호 자체가 발생하지 않는다.

---

## 사용자에게 보여줄 메시지 (기존 자산 재사용, 정확한 문구)

신규 모달 없음. 기존 3개 자산만 사용한다.

### 1) 전면 페이월 모달 — `paywallSystem.ts` (이미 자동 표시됨)

`activatePaywall` → `setUiBlockedByPaywall(true)` (`:534`) → 오버레이 + 클릭 인터셉트(`:477-485`) + 모달. 이미 카카오톡 1:1 CTA(`:287`)와 유료 단톡방(`:332`)까지 붙어 있다. **추가 개발 불필요, 문구만 수정(R3).**

- 사용량 라벨 (`:208-211` 현재 `2 / 2 사용 완료` 하드코딩) → 실측 반영:
  `오늘 3건 중 3건 사용 완료`
  (`paywallQuotaSnapshot.usage.publish` / `paywallQuotaSnapshot.limits.publish` 에서 산출. 스냅샷 없으면 `FREE_TRIAL_DAILY_PUBLISH_LIMIT` 폴백)
- 본문 최상단에 main 메시지 반영 (현재 `paywallMessageSnapshot` 은 `:521/:530` 에서 저장만 하고 읽는 곳이 0건 — 실측 확인)

### 2) main 이 반환하는 PAYWALL 메시지 (통일)

현재 2종으로 갈라져 있다:
- `src/main/utils/authUtils.ts:149` → `"⛔ 일일 한도 초과! Pro 버전을 사용하면 제한 없이 글을 쓸 수 있습니다."`
- `src/main.ts:1000` → `"⛔ 일일 한도 초과! 아쉽네요. Pro 버전을 사용하는 다른 분들은 지금도 제한 없이 글을 쓰고 있습니다. 기다리지 않고 바로 쓰시겠습니까?"`

통일 문구 (양쪽 동일하게):
```
⛔ 오늘 무료 발행 3회를 모두 사용했습니다. 발행 종류와 상관없이 하루 3회까지 무료이며, Pro로 전환하면 횟수 제한 없이 이용할 수 있어요.
```

### 3) 루프 중단 로그 (기존 `appendLog` 재사용)

```
⛔ 오늘 무료 발행 3회를 모두 사용했습니다. 남은 {N}건은 발행하지 않고 중단합니다.
```
연속발행은 기존 진행 모달(`updateContinuousProgressModal`)에도 동일 취지로:
- step: `⛔ 무료 3회 소진`
- log: `무료 발행 3회를 모두 사용해 중단했습니다.`

---

## 수정할 기존 문구 목록

| # | 파일:라인 | 현재 | 조치 |
|---|---|---|---|
| 1 | `src/renderer/modules/featureLockModal.ts:134` | `💡 무료 체험판은 단일 발행 · 글 1편 작성까지 사용 가능해요` | **사실과 불일치.** → `💡 무료 체험판도 모든 발행 기능을 하루 3회까지 사용할 수 있어요` |
| 2 | `featureLockModal.ts:26-52` | `COPY_TABLE` 의 `continuous` / `multi-account-fullauto` / `multi-account-manage` 3개 엔트리 | R1 이후 도달 불가(dead) → 삭제. 삭제하지 않으면 "연속 발행은 PRO 전용"이라는 잘못된 카피가 코드에 남는다 |
| 3 | `featureLockModal.ts:17` | `type LockFeatureKey = 'continuous' \| 'multi-account-fullauto' \| 'multi-account-manage' \| 'image-gen'` | → `'image-gen'` 단일로 축소 |
| 4 | `featureLockModal.ts:4-14` 헤더 주석 | `연속 발행 / 다중계정 풀오토 / 다중계정 관리` | → 이미지 생성 스튜디오 전용으로 정정 |
| 5 | `featureLockModal.ts:105` | `현재 무료 체험판에서는 잠시 사용할 수 없어요` | 유지 (image-gen 에는 여전히 참) |
| 6 | `src/renderer/modules/paywallSystem.ts:210` | `2 / 2 사용 완료` | → 스냅샷 산출값. `freeTrialPolicy.test.ts` 가 `login.html` 만 검사하고 여기는 커버 못 함 → 회귀 잠금 추가 |
| 7 | `src/main/utils/authUtils.ts:149` | 위 참조 | 통일 문구 |
| 8 | `src/main.ts:1000` | 위 참조 | 통일 문구 |
| 9 | `src/main.ts:5639` | `'오늘 무료 사용량을 모두 쓰셨습니다.'` (글생성 차단) | 유지 검토 — `public/login.html:1046` 과 동일 문구라 일관성 있음. 변경 시 login.html 동시 변경 필요 → **이번 릴리즈 미변경** |

건드리지 않는 문구: `public/login.html:984 / 1071 / 1193 / 1745` — `freeTrialPolicy.test.ts:24-28` 이 `발행 3회 무료 사용하기`, `매일 3회 무료 체험이 가능합니다` 를 잠그고 있고, `/(?:발행|무료|매일)[^\n<']*2회/` 부재까지 단언한다. 일일 정책을 유지하는 한 정확하다.

---

## 쿼터 우회 경로 처리 여부

**4건 전부 이번 릴리즈에서 보류한다.** 공통 근거: 네 건 모두 "차단을 조이는" 방향이고, 조이면 오탐 시 정당한 발행이 죽는다. 사용자 제약("오탐이 한도 초과 1건 놓치는 것보다 나쁘다")에 정면 위배된다. 게다가 R1(잠금 해제)와 같은 릴리즈에 섞으면 회귀 원인 분리가 불가능해진다.

| # | 우회 경로 | 실측 근거 | 판단 | 근거 |
|---|---|---|---|---|
| 1 | `quota-state.json` 삭제 / 쓰기 거부(ACL) | `quotaManager.ts:259-264` `Promise.allSettled` 로 write 실패를 로그만 남기고 삼킴 + `:186-192` 날짜 불일치 시 `EMPTY_STATE` 반환 → 영구 0 | **보류** | 여기를 fail-closed 로 바꾸면 AV 간섭·권한 문제 있는 **정상 사용자가 즉시 전면 차단**된다. 이미 `TAMPERED_STATE(publish:999)` 로 인한 "00시 지나도 초기화 안 됨" 문의 이력이 `:145-151` 주석에 남아 있다. 최악의 오탐 경로 |
| 2 | `_sig` 필드 제거 → 서명 검증 스킵 | `quotaManager.ts:143` `if (parsed._sig) {` — 없으면 검증 자체를 건너뜀. 솔트는 `:46` base64 하드코딩 | **보류** | 조이면 레거시 포맷 파일(서명 도입 이전 사용자)이 전부 `TAMPERED_STATE` 로 떨어져 전면 차단. 마이그레이션 설계가 선행돼야 함 |
| 3 | `license.json` 평문 위조 (`free`→`life`) | `src/licenseManager.ts:276-328` 무검증 load / 평문 save | **보류** | 라이선스 무결성은 별도 SPEC 영역. 또한 `free` 는 서버 재검증을 스킵하고 `life` 위조는 오히려 시간당 재검증(`main.ts` cron)에 노출되므로 "영구·무탐지"가 아니다 — 우선순위 낮음 |
| 4 | `config.geminiPlanType = 'paid'` | `authUtils.ts:118` / `main.ts:979` `if ((config as any).geminiPlanType === 'paid') return false;` | **보류** | 이 분기는 "유료 크레딧 사용자" 정상 경로다. 제거하면 정당한 유료 사용자가 무료로 강등되어 3회에 막힌다. 정면 회귀 위험 |

### 별건 — 이번 릴리즈 밖이지만 즉시 보고 필요

- `src/index.ts:53-54` — 네이버 ID/비밀번호가 소스에 하드코딩(`'tjdgus24280'` / `'@Qkrtjdgus123'`). `src/index.ts:78` `await automation.run()` 는 라이선스·쿼터 검사 0인 CLI 발행 경로이고, `package.json:147-152` `build.files: ["dist/**/*"]` 로 **`dist/index.js` 가 asar 에 패키징된다**(`main` 은 `dist/main.js` 이므로 실행은 안 됨). 실효 위협은 낮으나 **자격증명 노출은 즉시 조치 대상**이며 쿼터 설계와 무관하게 별도 커밋이 필요하다.
- `authUtils.ts:111` `license?.licenseType === 'free'` 는 대소문자 구분인데 같은 파일 `:42` 는 `toLowerCase()` 하고 주석에 *"서버가 'free', 'FREE', 'Free' 등 반환 가능"* 이라고 적혀 있다. 서버가 `'FREE'` 를 주면 라이선스 유효 + 무료 판정 false = 무제한. **1줄 수정이고 조이는 방향이지만 서버 실제 응답값 확인이 선행돼야 한다** → 재조사 항목.

---

## 릴리즈 분할

### R1 — 발행 종류별 기능 잠금 제거 (fix 3)

| fix | 파일:라인 | 내용 |
|---|---|---|
| 1 | `src/renderer/modules/continuousPublishing.ts:1183-1184` | `checkFeatureLockAndShow('continuous')` 게이트 블록 제거. `startContinuousPublishingV2()` 직접 호출로 단순화 (감싼 `(async () => {...})()` 도 함께 정리 — 내 변경이 만든 고아) |
| 2 | `src/renderer/modules/multiAccountManager.ts:814-816`, `:2959-2961` | `multi-account-manage` / `multi-account-fullauto` 게이트 제거 |
| 3 | `src/renderer/modules/featureLockModal.ts:17, 26-52, 134, 4-14` | 문구 목록 #1~#4 반영 |

유지: `src/renderer/modules/imageGenStudio.ts:107` `checkFeatureLockAndShow('image-gen')` — 이미지 생성 스튜디오는 발행 기능이 아니고, `trial` 까지 차단하는 별도 정책(`featureLockModal.ts:263-264`)이다. 정책 변경 대상 아님.

**검증**
- 신규 `src/__tests__/freeTrialPublishAccess.test.ts`:
  - `continuousPublishing.ts` / `multiAccountManager.ts` 소스에 `checkFeatureLockAndShow` 0건 단언
  - `featureLockModal.ts` 에 `'단일 발행 · 글 1편'` 부재 단언
  - **불변식**: `main.ts` 내 `AutomationService.executePostCycle(` 프로덕션 호출부 수 == `consumeQuota('publish', 1)` 지점 수 == 4. 5번째 경로가 생기면 즉시 RED
- red-green: 위 테스트를 먼저 작성 → RED 확인(현재 게이트가 존재하므로 반드시 실패) → fix 적용 → GREEN
- `npx vitest run` 전체 GREEN
- `git diff` 독립 검증 (executor 자가보고 금지)
- 라이브: 무료 라이선스로 연속발행 시작 → 잠금 모달이 뜨지 않고 1건 실제 발행되는지

### R2 — 한도 도달 시 발행 루프 즉시 중단 (fix 2)

| fix | 파일:라인 | 내용 |
|---|---|---|
| 1 | `src/renderer/modules/paywallSystem.ts` (`:10` 상태, `:515` activatePaywall 뒤) | `export function isPaywallActive()` 추가 + `(window as any).isPaywallActive` 등록 |
| 2 | `continuousPublishing.ts:4444` 직후 / `renderer.ts:5915` / `publishingHandlers.ts:1807` / `multiAccountManager.ts:3134` | 루프 본문 최상단 체크 후 break + `appendLog` 안내 |

**검증**
- 신규 단위 테스트: `activatePaywall({code:'PAYWALL'})` 호출 전후 `isPaywallActive()` 가 false→true
- 소스 단언: 4개 루프 파일 각각에 `isPaywallActive` 참조 1건 이상 (5번째 루프 추가 시 수동 확인용)
- red-green: 4항목 큐 시뮬레이션에서 3건 후 break 되는지 — 먼저 RED
- 전체 vitest GREEN + git diff
- 라이브: 무료 계정 + 5건 큐 → 3건 발행 후 4번째에서 즉시 중단 로그 + 페이월 모달 1회 표시. **유료 계정으로 동일 큐 5건 완주 확인 (무중단 회귀 검증 — 필수)**

### R3 — 페이월 문구 실측화 (fix 3)

| fix | 파일:라인 | 내용 |
|---|---|---|
| 1 | `paywallSystem.ts:203-211` | `progressLabel` 에 id 부여(`global-paywall-usage-label`), `2 / 2 사용 완료` 하드코딩 제거 |
| 2 | `paywallSystem.ts:515-541` `activatePaywall` | `paywallQuotaSnapshot` / `paywallMessageSnapshot` 을 DOM 에 실제 반영 (현재 저장만 하고 읽는 곳 0건) |
| 3 | `authUtils.ts:149` + `main.ts:1000` | 메시지 통일 |

**검증**
- 회귀 잠금: `paywallSystem.ts` 소스에 `/2\s*\/\s*2/` 부재 단언 (`freeTrialPolicy.test.ts` 스타일)
- `authUtils.ts` / `main.ts` 의 PAYWALL 메시지 동일 문자열 단언
- red-green → 전체 vitest GREEN → git diff → 라이브에서 실제 "3건 중 3건" 표기 확인

### R4 — 조건부, 사용자 확답 후에만 (fix 1)

"매일 3회"가 아니라 "평생 총 3회"라면: `src/quotaManager.ts:186` (`if (parsed.date !== today) → EMPTY_STATE`) + `public/login.html:984/1071/1193/1745` + `src/__tests__/freeTrialPolicy.test.ts:24-28` 를 **한 릴리즈에서 동시에** 바꿔야 한다. 아래 "재조사 필요" #1 이 해소되기 전에는 착수하지 않는다.

---

## 절대 건드리면 안 되는 것

1. **`src/main.ts:4802`** `const publishAmount = Array.isArray(accountIds) ? accountIds.length : 0;` + `enforceFreeTier('publish', publishAmount)` — 다중계정 루프의 **유일한 방벽**이다. 루프 내부 lease 의 `validate` 는 `main.ts:5450` 에서 `async () => ({ allowed: true })` 로 무조건 통과하고, `consumeQuota` 는 한도 검사를 하지 않는다(`quotaManager.ts:295-307` 단순 증가). 4802 를 완화·제거하면 4, 5, 6… 무제한 발행된다.
2. **차감 4지점의 위치** (`main.ts:1758/3272/5449/8964`) — `executeWithContentPolicyManualReview` 바깥이라는 성질이 이중카운트 방어다. `runFullPostCycle`·`executePublishing`·`cleanup` 안으로 옮기지 말 것.
3. **`main.ts:3312 / 3320 / 3338` 환불 3분기** — 제거하면 재시도 1회가 2카운트가 된다.
4. **`BlogExecutor.ts:499-502`(USER_CANCELLED) / `:517-519`(STRICT_HOURLY hard-block)** 조기 반환 — 여기 앞에 차감을 넣으면 발행 없이 카운트된다.
5. **`quotaManager.ts:143-155` / `:227-232` `TAMPERED_STATE(publish:999)`** — 손대면 정당 사용자 전면 차단이 재발한다. `:171-181` 시계 클램프도 동일.
6. **`quotaManager.ts:186` 날짜 리셋** — R4 확정 전까지 동결.
7. **`src/freeTrialPolicy.ts:3` `= 3`** — 단일 진실. 다른 곳에 숫자 리터럴을 만들지 말 것(`freeTrialPolicy.test.ts` 가 `const limit = 2` 재도입을 잠그고 있다).
8. **`authUtils.ts:104-107` / `main.ts:967-971` dev 우회** (`!app.isPackaged` → 무료 판정 false) — 제거하면 개발·테스트가 불가능해진다.
9. **`src/naverBlogAutomation.ts:8478 runPostOnly()`** — 삭제도 이번 릴리즈에서 하지 말 것. `src/tests/*` 3개 스크립트가 의존하고 `contentQualityV3PublishCommitHook.test.ts:347-356` 이 메서드 시그니처를 소스 단언으로 잠그고 있다. 조치는 "프로덕션 호출자 0건 유지"를 R1 불변식 테스트에 추가하는 것으로 갈음.
10. **`src/renderer/utils/apiClient.ts:256`** `(window.api as any)[apiMethod](...)` — 호출 시점 전역 읽기여야 페이월 래퍼가 적용된다. 모듈 스코프 캐싱으로 "최적화"하지 말 것.
11. **`imageGenStudio.ts:107` image-gen 게이트** — 발행 정책과 무관한 별도 결정.

---

## 재조사 필요

1. **[차단성 — R4 착수 전 필수] "3회"가 일일인가 총량인가.**
   코드·UI·테스트가 전부 "매일 3회"로 정렬돼 있다: `quotaManager.ts:186` 날짜 리셋, `public/login.html:1071` `매일 3회 무료 체험이 가능합니다`, `login.html:1193` `👑 매일 발행 ${FREE_TRIAL_DAILY_PUBLISH_LIMIT}회 무료 사용하기`, `freeTrialPolicy.test.ts:24-28` 이 이 카피를 잠금. 사용자 지시문("3회까지 카운트되고 그다음은 무조건 유료")은 **발행 종류 무관 통합 카운트**를 요구한 것으로 읽었고 일일 리셋 폐지 요구로는 읽지 않았다. 확답 필요.

2. **앱 예약(`app-schedule`) 등록 차단 정책.**
   `main.ts:3209` 가 `isLocalAppSchedule` 을 판정해 `:3270` 에서 차감을 건너뛰지만, 그 앞 `:3262 validateAutomationRun` 은 예외 없이 쿼터 게이트를 건다. 즉 **오늘 3회를 쓴 사용자는 내일치 예약 "등록"조차 못 한다.** 실제 차감은 실행 시점(`main.ts:8978`)이므로 등록은 허용하는 편이 자연스럽다. 정책 확인 후 별도 릴리즈.

3. **`PUBLISH_UNCONFIRMED` 환불 비대칭.**
   예약 cron 은 `main.ts:9157-9158` 에서 `uncertain` 을 commit(환불 안 함), 수동(`:3320`)·다중계정(`:5502`)은 환불. 네이버에 글이 살아 있는데 카운트 0이 된다. 조이는 방향이라 오탐 시 무료 3회가 2회로 줄어드는 위험이 있어 이번 릴리즈에서 뺐다. 라이브 발생 빈도 실측 후 판단.

4. **`trial` 라이선스 타입의 발행 한도.**
   `authUtils.ts:111` 은 `'free'` 만 무료로 본다. `trial` 은 `isFreeTierUser()` false → **무제한 발행**. `featureLockModal.ts:263-264` 는 `trial` 을 `image-gen` 에서만 차단한다. 의도된 설계인지 확인 필요.

5. **`'FREE'` 대소문자 갭.** `authUtils.ts:111` vs `:42-43` 불일치. 라이선스 서버(GAS)가 실제로 어떤 케이싱을 반환하는지 확인 후 1줄 수정.

6. **다중계정 배치 호출의 단일 원소 불변식.**
   `main.ts:4802` 가 안전한 이유는 렌더러가 항상 `[accountId]` 1개짜리 배열을 보내기 때문이다(`publishingHandlers.ts:1934`, `multiAccountManager.ts:3876` — 실측 2곳 모두 단일). 누가 배치 호출로 바꾸면 잔여 3회에 5계정 = `canConsume` 이 **전량 거부**하여 "3건 발행 후 중단"이 아니라 "0건 발행"이 된다. R1 불변식 테스트에 단일 원소 단언을 넣을지 결정 필요.

7. **`paywallActive` 세션 스티키.** `paywallSystem.ts:10/525` 에 리셋 경로가 없다. 앱을 켠 채 자정을 넘기면 쿼터는 리셋되지만 페이월 오버레이는 유지된다. R2 의 루프 break 도 같은 플래그를 읽으므로 동일 영향. **현행 오버레이 동작과 동일한 수준이라 신규 회귀는 아니지만**, 자정 리셋 UX 를 고칠지는 별도 판단.

8. **`multi-account-manage` 게이트 제거 후의 계정 개수 정책.** 무료 사용자가 다중계정 "관리" UI 에 진입 가능해진다. 저장 계정 수 제한이 있는지, 있어야 하는지 확인 필요(현재 코드에 무료 사용자 계정 수 제한은 발견하지 못했다).
