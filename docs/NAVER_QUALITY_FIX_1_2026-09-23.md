# NAVER Quality Fix 1 결과 — Writer Grounding + Terminal Reconciliation

기준: Critique Loop A~D(`e03fb62c`~`9be633df`) 위. **PAID_LLM_CALLS = 0** (새 생성·Critic·Research 호출 없음, 저장된 라이브 6편 + P1 fixture 재생만). 릴리스 없음, 플래그 기본 OFF 유지.

---

## 커밋
| | 커밋 | 내용 |
|---|---|---|
| A | `65eea29d` | Writer Grounding — 설계도 재료 접지(`groundBlueprintMaterial`) + 팩트 규율 6 정본 통합 |
| B | `29a3318d` | High-Risk Claim Scanner·claimNormalize·근거 범위 교정·Editor 규율·Terminal Reconciliation |
| C | (이 커밋) | 오프라인 재생 스크립트·fixture 갱신·테스트 33건·보고서 |

Critique Loop 구조(Critic → Batch Revision → Verification → Editorial/Homefeed → Judge), 수정 2회 상한, stillOpen 우선, issue fingerprint/lifecycle, section preservation, Research Recovery 1회, 선택 엔진, LIGHT humanizer, `NAVER_QUALITY_LOOP` 기본 OFF — **전부 그대로**.

---

## 0. 먼저 보고할 사실: 병목의 절반은 Writer 가 아니었다

저장된 라이브 6편을 재생해 Critic/Judge 가 "자료에 없다"고 막은 지적을, **Writer 가 실제로 본 자료 전문**과 대조했다.

| 판정 | Critic 사실 지적 32건 | Judge BLOCK 15건 |
|---|---|---|
| 자료에 **있었다**(오탐) | **20** | **9** |
| 설계도에만 있었다(탈락 자료 유래) | 5 | 3 |
| 어디에도 없었다(진짜 환각) | 5 | 3 |
| 숫자·날짜·인용이 없어 판정 불가(산문 주장) | 7 | 3 |

오탐의 원인은 근거 팩이 **문서당 700자 발췌**였다는 것이다. 예: 여행 3편이 반복해서 막힌 `10월 18일`·`10월 16~22일`은 S01/S03 본문(2,900번째 글자·범위 표기 `10∼22일`)에 그대로 있었다.

즉 사장님이 지목한 "편당 4~6건"은 **중복 계수된 오탐 + 설계도 유래**가 섞인 수치였고, 실제 미지원 사실은 **6편 합계 6건(편당 1건)**이었다. 그래도 방향은 맞다 — 그 6건의 절반이 Writer 가 아니라 **설계도**가 만든 것이었고, 그것이 이번 수정의 뿌리다.

---

## Writer Grounding Contract

### 근본 원인 — 설계도가 탈락 자료를 본다
`resolveBlueprintMaterial` 은 `blueprintMaterial`(수집 원문 `baseText`)을 우선한다. 이 값은 관련도 파이프라인이 **탈락시킨 문서까지 포함**한다. 실측(20260922-194812·193310·191510 정책 3편): 인터뷰 기사 **S01 이 탈락**해 본문 재료(B-research-input = S02~S07)에는 없는데, 설계도가 거기서 "취업준비생 정모(26)씨" 발언 3개를 인용으로 뽑아 프롬프트에 실었고 본문에 그대로 들어갔다. Critic·Judge 의 "자료에 없는 인용" 지적은 **옳았다**.

→ `groundBlueprintMaterial(source, pipelineText, acceptedDocs)`: 파이프라인이 문서를 채택했으면 설계도 재료를 **채택 본문**으로 교체. URL 모드(구조화 문서 0건)·빈 본문은 원래 재료 유지. 순수 함수 + 배선 핀 테스트.

### BEFORE (팩트 규율 6)
```
6. **확인 못 한 정보는 언급 자체를 하지 않는다.** 삭제가 원칙이다.
   ⛔ "…관련한 언급도 자료에 나오는데, 공식 공지에서 확인하세요"
   ⛔ "정확한 내용은 확인되지 않았습니다", "자료에는 없지만"
   … (불확실성 중계 금지)
```
같은 뜻이 `[EVIDENCE AND INTENT FINAL CONTRACT]`("입력에 없는 숫자·기간·금액을 새로 만들지 않는다")와 `[1회 완성 품질 계약]`("자료에 없는 사실·가격·수치·경험·후기·장단점은 만들지 말고")에 각각 한 번 더 있었다.

### AFTER (정본 1곳 + 포인터 2곳)
팩트 규율 6 = **WRITER GROUNDING 정본**. 새 블록을 만들지 않았다.
- 자료·리서치에서 확인되지 않은 **구체 사실**은 만들지 않는다 — 숫자·날짜·금액·비율·인원·순위·설문 결과·기관/회사/은행 명단·직접 인용·발언·신청 기간·행사 일정·현재 상태.
- 없으면 생략하거나 근거 있는 정보로 재구성한다. **"아마·대체로·보통·알려져 있다"로 흐려서 살리지 않는다.**
- 따옴표 인용은 같은 발언이 자료에 있을 때만. 설문/통계 표현은 근거가 있을 때만. 명단은 확인된 이름만(일부만 확인됐으면 그것만).
- **제목을 채우려고 자료에 없는 설명을 만들지 않는다.** 제목이 자료보다 강하면 제목 쪽을 낮춘다.
- 사실은 근거에 묶되 **설명·해석·연결 문장은 자유**롭게 쓴다(자료 베끼기가 아니다).

다른 두 곳은 정본 포인터로 축소.

### Prompt chars
| 블록 | BEFORE | AFTER | Δ |
|---|---|---|---|
| 팩트 규율(WRITER GROUNDING 정본) | 1,802 | 2,296 | **+494** |
| EVIDENCE AND INTENT FINAL CONTRACT | 1,111 | 1,130 | +19 |
| 1회 완성 품질 계약(해당 줄) | 66 | 63 | −3 |
| **합계** | | | **+510** |

SEO 지시문 56,316자 기준 **+0.9%**. 홈판 Final Merge 성과(정본화·중복 제거)는 되돌리지 않았다 — 오히려 같은 방식(정본 1 + 포인터)으로 한 층 더 정리했다.

---

## High-Risk Claim Scanner

새 LLM 게이트 없음. 기존 결정론 precheck 옆에서 **issue seed 만** 만든다($0).

### 허용값 추출 (item 13) — 기존 유틸 재사용
`numericGroundingCheck.UNITS`(단위 목록)와 `attributionGuard`(귀속 판정)를 그대로 쓰고, `claimNormalize` 가 정규화만 담당한다. 새 LLM 호출 0.

### Numbers (item 14)
`15,000원 = 1만5000원 = 15000원`, `3천 명 = 3000명`, `2.3~3.1%` → 양 끝, 조사 붙은 `50만원까지`도 같은 값, `최고 연 6.0%` → `6%`.

### Dates (item 15)
`10월 16~22일 = 10월 16∼22일 = 10월 16일부터 22일까지`, `2026-09-22 = 9월22일`, 연-월 별도. **허용값에서 ISO 날짜는 제외** — 게시일 메타데이터(`게시일: 2026-09-07`)가 사건 날짜를 승인해 주면 안 된다(라이브 201400 `9월 7일 무료 개방`의 출처가 정확히 그것이었다).

### Quotes (item 16) — 보수적으로
귀속된 직접 인용만 본다(`…씨/대표/관계자/기관 + "…"`, 사이 단어 14자까지 허용). 작품명·상품명·별칭·짧은 표현은 보지 않는다. 8자 shingle 60% 일치면 지원으로 본다(모델이 어미를 다듬기 때문).

### Entities (item 18)
기관 접미사 명사 중 **4자 이상**이고 흔한 일반명사(신청처·문의처·본부…)가 아닌 것, 그리고 **기관 맥락**(은행·기관·취급·참여사·주관…)의 쉼표 나열에서 과반이 자료에 없을 때만.

### Survey/Statistics (item 17)
`설문/조사 결과/응답자/이용자들은/전문가들은/통계에 따르면`이 있는 문장의 수치는 MAJOR.

### 심각도
| 티어 | 대상 |
|---|---|
| MAJOR seed | 자료에 없는 날짜, 설문/통계 수치, 귀속 인용, 기관/명단 |
| MINOR 권고 | 그 밖의 수치, 연-월(계산·추정 가능: 60번=5년×12, 46%=100−54%, "연말"→2026년 12월) |

---

## False Positive

저장 6편 실측 — 스캐너 MAJOR seed **7건, 오탐 0건**(전부 실제 미지원 값 또는 설계도 유래 인용). MINOR 권고 5건은 수정을 부르지 않는다.

오탐을 막은 규칙 3가지(전부 라이브 사례에서 도출):
1. **파생 구간**: 한쪽 끝이 자료에 있는 날짜 범위(`10월 12~18일`의 18일). 라이브 195843 의 "언제 가나" 6행 표가 여기 해당 — 규칙 전에는 5건이 오탐이었다.
2. **인접일 경계**: 문장이 "이후/전날/넘기면"을 말할 때의 ±1일.
3. **날짜 조각 숫자**: `10월 12~18일`이 만드는 숫자 `12일`.

---

## Deterministic Issue Seed
```
{ type: "UNSUPPORTED_VALUE" | "UNSUPPORTED_QUOTE" | "UNSUPPORTED_ENTITY",
  severity: "MAJOR", sectionId, exactSpan: <문장 그대로>, evidenceIds: [],
  origin: "precheck", note: "DETERMINISTIC_PRECHECK" }
```
`Q0b-claims.json` 에 기록. **문장을 삭제하지 않는다**(P0 파괴적 후처리 부활 금지) — seed 만 만든다.

## Issue Propagation (item 19/20)
같은 claim(섹션 + 미지원 값)은 Critic issue 가 이기고(근거 id·요구 변경을 갖고 있다), Critic 이 놓친 seed 만 남는다(`Q1-merge.json`). 남은 seed 는 Critic issue 와 함께 **첫 사이클에** propagation 까지 돈다 — 같은 값이 다음 Critic 에서 새 issue 로 발견되지 않는다.

## Editor Specificity Preservation (item 21~24)
- 지원되는 정확한 값을 흐리게 바꾸면 보존 검사가 잡는다(정본 토큰 비교로 전환: `10월 16~22일` ↔ `10월 16일부터 22일까지` 동일 취급).
- 미지원 값이라 지운 경우는 예외(플래그된 span 안의 값, 근거에 없는 값).
- 수정이 **새로** 넣은 미지원 숫자·날짜·인용은 후보 폐기(`introducedUnsupportedValues`) — 본 수정·편집 데스크 수정 양쪽.
- 편집 계약: "미지원 값은 자료 표현으로 바꾸거나 통째로 뺀다. 더 흐린 말로 바꾸는 것은 수정이 아니다."

## Terminal Reconciliation (item 25~31)
```
integrityOpen > 0          -> MANUAL_REVIEW  (Judge PASS 여도)
else judge == BLOCK        -> MANUAL_REVIEW
else 비사실형 OPEN         -> terminal advisory + 수렴
```
| 계층 | 유형 |
|---|---|
| INTEGRITY BLOCKER | UNSUPPORTED_VALUE / UNSUPPORTED_QUOTE / UNSUPPORTED_ENTITY / FACT_ERROR / CONTRADICTION / MIXED_ENTITY / WRONG_CURRENT_STATE / 결정적 빈 섹션 |
| EDITORIAL·INTENT | TITLE_PROMISE / SEARCH_INTENT / REDUNDANCY / 답 위치(STRUCTURE) / 약한 MISSING_INFORMATION / 홈판 전개 |

Judge 에는 남은 OPEN issue 목록을 간결히 전달하고 질문을 좁혔다("이 남은 issue 가 지금 최종 글의 자동발행을 실제로 막아야 하는가"). 역할 확대 금지 문구도 넣었다("너는 새 비평가가 아니다"). 전면 강등은 하지 않는다.

---

## 정책 3차 Replay (`20260922-194812-92dbnq`, item 32)
| | 기록된 결과 | 새 정책 |
|---|---|---|
| 남은 OPEN | 비사실형 4건(s1/TITLE_PROMISE, s5·s8/REDUNDANCY, intro/STRUCTURE) | 동일 |
| INTEGRITY OPEN | 0 | 0 |
| Judge | PASS | PASS |
| 판정 | MANUAL_REVIEW | **AUTO_PUBLISH** (terminal advisory 4건) |

단, 이 초안에는 스캐너가 새로 잡은 MAJOR seed 4건(`9월16일` ×2 — 기사 게시일이 발표일로 샌 것, 인용 2건)이 있다. **새 파이프라인으로 다시 생성하면 그 4건이 첫 사이클 대상이 되므로**, 이 replay 의 AUTO_PUBLISH 는 "터미널 정책이 불필요한 MANUAL_REVIEW 를 풀어준다"는 것만 보여준다(사실형이 남으면 여전히 막힌다 — 아래 34).

## 여행 3차 Replay (`20260922-203544-orfmzm`, item 33)
Judge BLOCK 1건(`10월 중 … 전국체육대회`) → **MANUAL_REVIEW 유지**. 새 정책이 Judge BLOCK 을 풀지 않는다. ✅

## 저장 Live 6편 Replay (`node scripts/critique-replay.cjs`)

| runId | DRAFT_UNSUPPORTED | PRECHECK_CAUGHT | PRECHECK_HINT | CRITIC_FLAGGED | CRITIC_REAL | CRITIC_FP(자료에 있음) | BLUEPRINT_ONLY | JUDGE | JUDGE_FP | PROPAGATED | INTEGRITY_OPEN | EDITORIAL_OPEN | 기록 | 기대 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 191510 정책1 | 1 | 1 | 0 | 6 | 1 | 2 | 2 | BLOCK 6 | 3 | 0 | 5 | 1 | MANUAL | MANUAL |
| 193310 정책2 | 1 | 1 | 0 | 3 | 1 | 1 | 2 | BLOCK 4 | 1 | 0 | 0 | 0 | MANUAL | MANUAL |
| 194812 정책3 | 3 | 4 | 1 | 8 | 2 | 3 | 1 | PASS | 0 | 0 | 0 | 4 | MANUAL | **AUTO_PUBLISH** |
| 195843 여행1 | 0 | 0 | 0 | 5 | 0 | 5 | 0 | BLOCK 3 | 3 | 0 | 0 | 0 | MANUAL | MANUAL |
| 201400 여행2 | 1 | 1 | 4 | 6 | 1 | 5 | 0 | BLOCK 1 | 1 | 0 | 2 | 4 | MANUAL | MANUAL |
| 203544 여행3 | 0 | 0 | 0 | 4 | 0 | 4 | 0 | BLOCK 1 | 1 | 0 | 0 | 0 | MANUAL | MANUAL |
| **합계** | **6** | **7** | **5** | **32** | **6** | **20** | **5** | **15** | **9** | 0 | | | | |

읽는 법:
- **DRAFT_UNSUPPORTED 6건** = 6편 전체의 진짜 미지원 사실(정규화 후 중복 제거). 인터뷰 인용 ×3(설계도 유래), 게시일→발표일 `9월16일`, 게시일→행사일 `9월7일`, 은행 명단 속 `토스뱅크 연말→2026년 12월`.
- **PRECHECK_CAUGHT 7** 은 같은 claim 이 두 섹션에 반복된 것을 각각 센 수 — claim 기준으로는 **6건 중 5건을 MAJOR 로, 나머지 1건(2026년 12월)을 MINOR 권고로 잡아 6/6 이 Critic 이전에 식별**된다.
- **PROPAGATED 0** 은 정상이다. 이 6편에는 "미지원 값이 다른 섹션에도 반복" 되는 경우가 없었다(여행 2차의 `10월 16~22일` 반복은 이제 자료에 있는 값으로 판명돼 애초에 issue 가 아니다).
- **CRITIC_FP 20 / JUDGE_FP 9** 는 이번 근거 범위 교정으로 사라질 오탐이다(같은 Critic 프롬프트라도 이제 문서 전문을 본다).

---

## Feature Flag OFF
`NAVER_QUALITY_LOOP` 기본 OFF 유지. 단 **플래그와 무관하게 항상 적용되는 변경 2건**이 있다 — 이번 지시의 "근본 원인부터 수정"(item 2~10)이 Writer 쪽이기 때문이다:
1. 설계도 재료 접지(`groundBlueprintMaterial`) — 모든 생성 경로.
2. 팩트 규율 6 정본 + 포인터 2곳 — 모든 Writer 프롬프트(+510자).

루프 쪽 변경(스캐너·근거 범위·터미널 정책·Editor 가드)은 전부 플래그 ON 에서만 실행된다. 플래그 OFF 경로의 호출 수·비용 변화 0.

## 전체 테스트
vitest **10,137 / 10,137**(1,035 파일 — 기존 10,116 + 신규 21), tsc 0, lint 0, build OK, 지문 핀 `f3c2abca…`.
회귀 0: P0·P1·Homefeed Prompt Merge·Critique Loop A~G·LIGHT Humanizer·Source preservation·JSON·Attribution·Relevance.
갱신한 pinned 단언 1건: `seoHomefeedIntegrity` — 삭제된 리터럴 대신 "정본 포인터 또는 원문 + 정본 존재"를 보는 semantic 단언으로 전환(규칙 자체는 최종 프롬프트에 그대로 있다).

## PAID_LLM_CALLS
**0**

## LIVE_VALIDATION
**DEFERRED_BY_COST**

## RESUME_COMMAND
쿼터가 생기면 정책 1편 → 연예 1편 순서로 두 편만:
```bash
# 1) 정책 (SEO)
NAVER_QUALITY_LOOP=1 npx electron scripts/quality-ab-harness.cjs \
  --stage=generate --provider=agent-claude --keywords="2026 청년도약계좌 조건" --mode=seo

# 2) 연예 (홈판)
NAVER_QUALITY_LOOP=1 npx electron scripts/quality-ab-harness.cjs \
  --stage=generate --provider=agent-claude --keywords="변우석 텐텐" --mode=homefeed

# 3) 결과 확인 (userData/generation-runs/<runId>/)
#    Q0b-claims.json  스캐너 seed   |  Q1-merge.json  seed×Critic 병합
#    Q1d-propagated.json 전파       |  Q5b-terminal.json terminal advisory
node scripts/critique-replay.cjs --runs=<runId1>,<runId2>
```
확인 포인트: ① 설계도 인용이 채택 자료에서만 나오는지(`C-final-prompt` 의 인용이 `B-research-input` 에 있는지) ② 스캐너 MAJOR seed 오탐 0 ③ 사실형 0 + Judge PASS 면 AUTO_PUBLISH ④ 호출 수 3/5/≤8.

## 남은 문제
1. **프롬프트 효과는 미검증.** 팩트 규율 6 정본이 실제 생성에서 환각을 줄이는지는 라이브 전에는 확정하지 않는다(설계도 접지는 결정론적이라 효과가 구조적으로 보장되지만, 프롬프트는 아니다).
2. **산문 주장은 여전히 Critic 몫.** 숫자·날짜·인용이 없는 주장("선착순도 아니에요", "매월 초 신청")은 스캐너가 판정할 수 없다(6편에서 10건). Critic·Judge 가 근거 전문을 보게 된 것이 이에 대한 개선이다.
3. **연-월 승격**("연말"→"2026년 12월")은 MINOR 권고까지만. MAJOR 로 올리면 "2026년 10월에 시작" 류 정상 표현이 오탐이 된다.
4. 5섹션 이상 지목 시 2배치 → 호출 8. item 36 대로 최적화하지 않았다.
5. 금융/자동차/연예 라이브 미실행(비용), `10월 중` 류 "흐린 값" 편집 계약도 라이브 미검증.

## 최종 판단: **OFFLINE_GROUNDING_READY**
- 저장 6편의 진짜 미지원 사실 6건 중 **6건이 Critic 이전에 식별**(MAJOR 5 + 권고 1), 스캐너 오탐 0.
- 직접 문장 삭제 0(seed 만), propagation 유지, 지원되는 정확성 보존 / 미지원 정확성 제거 각각 fixture 로 잠금.
- 사실형 OPEN 은 Judge PASS 로 덮이지 않고(34), 비사실형 OPEN + Judge PASS 만 좁게 advisory(35).
- 정책 3차의 불필요한 MANUAL_REVIEW 해소(32), 여행 3차 Judge BLOCK 유지(33).
- 플래그 OFF 회귀 0, 전체 10,137 GREEN, 유료 호출 0.
- 인용 환각의 실제 뿌리(설계도가 탈락 자료를 봄)를 결정론적으로 차단.

릴리스하지 않는다. 기본 ON 으로 바꾸지 않는다.
