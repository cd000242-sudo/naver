# NAVER Quality Freeze Check

기준: Quality Fix 1(`65eea29d`·`29a3318d`·`b6470a25`) 위. **PAID_LLM_CALLS = 0**, provider live 없음. 기능 추가 없음(새 Gate·Writer 규칙·Critic 규칙·사이클 증가 0) — 감사에서 확인된 입력 경계 문제 2건만 수정.

측정: `node scripts/critique-input-audit.cjs` (저장 fixture 5종, 모델 호출 0). 토큰 추정은 기존 `prompt-budget-report.cjs` 와 같은 1.7자/토큰.

---

## 단계별 입력 (chars / evidence / article / ~tokens)

### Writer Input
| 유형 | chars | ~tokens |
|---|---|---|
| 정책 | 76,913 | 45,243 |
| 금융 | 78,798 | 46,352 |
| 자동차 | 79,756 | 46,915 |
| 연예(홈판) | 57,342 | 33,731 |
| 여행 | 71,649 | 42,146 |

### Critic Input
| 유형 | total | evidence | article | ~tokens | Writer 대비 |
|---|---|---|---|---|---|
| 정책 | 28,596 | 21,287 | 5,262 | 16,821 | 37% |
| 금융 | 30,206 | 22,549 | 5,649 | 17,768 | 38% |
| 자동차 | 30,735 | 24,452 | 4,251 | 18,079 | 39% |
| 연예 | 13,544 | 8,381 | 3,137 | 7,967 | 24% |
| 여행 | 22,697 | 15,766 | 4,917 | 13,351 | 32% |

### Editor Input
| 유형 | total | evidence(인용 자료만) | article(대상 섹션만) | ~tokens |
|---|---|---|---|---|
| 정책 | 6,218 | 3,174 | 2,065 | 3,658 |
| 금융 | 7,037 | 2,999 | 3,058 | 4,139 |
| 자동차 | 6,727 | 3,202 | 2,448 | 3,957 |
| 연예 | 4,329 | 1,126 | 2,205 | 2,546 |
| 여행 | 7,216 | 3,230 | 2,970 | 4,245 |

### Verification Input
정책 6,109 · 금융 6,947 · 자동차 6,620 · 연예 4,225 · 여행 7,121 (~2.5K–4.2K tokens). Editor 와 같은 인용 자료·대상 섹션만.

### Editorial Input
정책 6,650 · 금융 6,995 · 자동차 5,627 · 연예 4,759 · 여행 6,269 (~2.8K–4.1K tokens). **근거 자료 0** — 구조·중복·초점만 보므로 자료를 싣지 않는다.

### Judge Input
| 유형 | total | evidence | article | ~tokens |
|---|---|---|---|---|
| 정책 | 28,561 | 21,287 | 5,262 | 16,801 |
| 금융 | 30,156 | 22,549 | 5,649 | 17,739 |
| 자동차 | 30,747 | 24,452 | 4,251 | 18,086 |
| 연예 | 13,203 | 8,381 | 3,137 | 7,766 |
| 여행 | 22,647 | 15,766 | 4,917 | 13,322 |

---

## BEFORE / AFTER (Critique Loop 최초 → Quality Fix 1 → Freeze Check)

| 유형 | Critic evidence BEFORE(700자 발췌) | AFTER | Judge evidence BEFORE(700자+6,000 절단) | AFTER |
|---|---|---|---|---|
| 정책 | 4,626 | 19,083 | 4,626 | 19,083 |
| 금융 | 5,390 | 19,922 | 5,390 | 19,922 |
| 자동차 | 5,565 | 22,629 | 5,565 | 22,629 |
| 연예 | 2,325 | 7,514 | 2,325 | 7,514 |
| 여행 | 4,648 | 13,963 | 4,648 | 13,963 |

Critic·Judge 모두 Writer 프롬프트의 **24~39%** 에서 멈춘다. 원문 무제한 주입이 아니다.

---

## 감사에서 확인된 문제 2건 (수정함)

**(1) Judge 가 문서 대부분을 못 보고 있었다 — 실제 결함.**
`finalJudge` 가 `describeEvidence(evidence).slice(0, 6000)` 로 **연결 문자열을 통째로 잘라** 앞쪽 2~3개 문서만 남기고 나머지를 통째로 버렸다.
측정(수정 전): 정책 6개 중 4개(S07·S02·S03·S05) 누락, 금융 7개 중 5개, 자동차 7개 중 5개, 여행 6개 중 3개 누락.
이것이 라이브에서 Judge 가 자료에 있는 값을 "자료에 없다"고 막은 경로다(BLOCK 15건 중 9건). → 절단 제거, 블록 제목도 "수용된 자료 전문 — 자료에 없다고 막기 전에 여기서 먼저 찾아라" 로 명시. Judge 입력은 Critic 과 같은 상한(팩 24K) 안에 머문다.

**(2) 근거 예산이 선착순이라 문서가 많으면 뒤쪽이 굶는다 — 경계 결함.**
`buildEvidencePack` 이 총 24,000자를 **먼저 온 문서부터** 소비해, 8개 × 3.2K 같은 경우 마지막 문서가 400자만 받거나 0이 됐다(700자 발췌와 같은 실명 구조). → **균등 배분**으로 교체: `perDoc = clamp(24000/N, 1200, 4000)`. 문서 8개여도 각 3,000자 보장. 문서당 상한은 8,000 → **4,000** 으로 조였다(수집기 상한 3,200 + 여유).

**(3) corpus 3중 중복(모델 전송 아님) — 경미, 수정함.**
결정론 검사용 `evidenceCorpus` 에 `rawCorpus` 와 `blueprintMaterial` 이 따로 합쳐졌는데, 설계도 접지 이후 둘은 **같은 문자열**이다. 같은 20K 를 두 번 스캔했다(프롬프트에는 실리지 않음). → Set 으로 dedupe.

---

## Unbounded Source
**NO**
- 검색 원문 전체 무제한 연결: 없음(문서 ≤8개 × ≤4,000자, 총 ≤24,000자).
- Writer prompt 를 Critic 에 재삽입: 없음(Critic 은 프롬프트가 아니라 문서·글만 받는다).
- HTML + plain text 동시 전달: 없음(`bodyOf` 는 cleanedBody/body 텍스트 한 벌).

## Duplicate Evidence
**NO (프롬프트) / YES (경미·의도적 digest)**
- 같은 SourceDocument 본문이 한 프롬프트 안에 두 번 실리는 경우: **0건**(5유형 전부 측정).
- 다만 `describeKeyFacts` 의 핵심 숫자·날짜 문장은 본문 안에도 있다 — 정책 2,204 / 금융 2,627 / 자동차 1,823 / 연예 867 / 여행 1,803자(근거의 **7~11%**). 모델이 핵심 값을 찾기 쉬우라고 남긴 digest 이며, 제거하면 근거 완전성이 아니라 탐색성이 나빠진다. **유지**하고 수치로 보고한다.
- corpus 중복(위 3)은 수정.

## Evidence Coverage
저장 라이브에서 실제로 다툰 값이 Critic·Judge 입력에 모두 존재하는지 확인(문자열 존재 검사):

| 값 | Critic | Judge |
|---|---|---|
| `10월 18일`(여행 — 라이브 Judge 가 "없다"고 막은 값) | YES | YES |
| `16∼22일`(여행 전국체전 기간) | YES | YES |
| `10월 31일`(여행 페스타 종료) | YES | YES |
| `10월 7일`·`7,500만원`·`50만원`(정책 조건·한도) | YES | YES |
| `청약`·`금리`(금융), `트림`(자동차), `텐텐`(연예) | YES | YES |
| 문서 누락 | **none** | **none** |

취업준비생 인터뷰·은행/기관 명단·직접 인용은 **채택 자료에 없는 것이 정답**이다(탈락 기사 S01 유래) — 설계도 접지 이후 근거에도 프롬프트에도 없고, 그래서 Critic·스캐너가 미지원으로 판정할 수 있다.

## Unsupported Replay
**6 / 6** (MAJOR seed 5 + MINOR 권고 1). Quality Fix 1 수치 그대로 유지 — 근거 범위 변경이 탐지를 흔들지 않았다.

## False Positive
**0** (스캐너 MAJOR seed 오탐 0건, 5유형·6 런 전부 재측정).

## Blueprint Grounding
유지. 정적 검사 2건을 테스트로 고정:
- `resolveBlueprintMaterial(` 호출은 코드베이스에 **1곳**뿐 → 접지를 우회하는 경로가 없다.
- `groundBlueprintMaterial(` 이 `runContentPipeline(` **앞**에서 실행된다 → 설계도는 채택 자료만 본다.
- URL 모드(구조화 문서 0건)·빈 파이프라인 본문은 기존 설계대로 원래 재료 유지.

## Feature Flag
`NAVER_QUALITY_LOOP` 기본 **OFF** 유지. 플래그와 무관하게 적용하기로 한 기존 변경(설계도 접지, 팩트 규율 6 정본)은 그대로. 이번 수정 3건은 전부 루프 내부라 **플래그 OFF 경로 영향 0**.

## 전체 테스트
vitest **10,141 / 10,141**(1,035 파일 — Freeze Check 신규 4건), tsc 0, lint 0, build OK, 지문 핀 `23720302…`.
회귀 0: P0·P1·홈판 Merge·Critique Loop A~G·Quality Fix 1·LIGHT Humanizer·Source preservation·JSON·Attribution·Relevance.

## Provider Live
**NOT RUN** — 유효한 provider credential 확보 전까지 live generation 금지, 실패 provider 재시도 없음.

## Title Pattern
착수하지 않음. 제공 데이터는 보존만 하고 품질 코드와 섞지 않는다.

---

## 최종 판단: **NAVER_QUALITY_ENGINE_FROZEN_OFFLINE**

- Evidence 충분: Critic·Judge 모두 **문서 누락 0**, 다툼이 된 값 전부 입력에 존재.
- Input bounded: 문서 ≤8 × ≤4,000자 = 총 ≤24,000자, Critic·Judge 는 Writer 의 24~39%, Editor·Verification 은 인용 자료만(≤7.2K).
- true unsupported **6/6** 탐지 유지, false positive **0**.
- Blueprint rejected source 재유입 **0**(정적 검사 2건으로 고정).
- Terminal reconciliation 정상(정책 3차 AUTO_PUBLISH, 여행 3차 BLOCK 유지, 사실형 OPEN 은 Judge PASS 로 안 덮임).
- 전체 회귀 0, 유료 호출 0.

**이후 provider credential 이 생길 때까지 품질 엔진 수정 중단.**

## Live Resume (credential 확보 후 딱 2편)
```bash
NAVER_QUALITY_LOOP=1 npx electron scripts/quality-ab-harness.cjs \
  --stage=generate --provider=<검증된 provider> --keywords="2026 청년도약계좌 조건" --mode=seo
# 결과 확인 후에만 2편째
NAVER_QUALITY_LOOP=1 npx electron scripts/quality-ab-harness.cjs \
  --stage=generate --provider=<검증된 provider> --keywords="변우석 텐텐" --mode=homefeed

node scripts/critique-replay.cjs --runs=<runId1>,<runId2>
node scripts/critique-input-audit.cjs
```
확인 항목: DRAFT_UNSUPPORTED_FACTS / PRECHECK_CAUGHT / CRITIC_CAUGHT / REVISION_CYCLES / FINAL_INTEGRITY_OPEN / FINAL_EDITORIAL_OPEN / JUDGE / PUBLISH_DECISION / SECTION_PRESERVATION / CALLS / TOKENS (`meta.extra.qualityLoop` 와 `Q-ledger.json` 에 전부 기록됨).
