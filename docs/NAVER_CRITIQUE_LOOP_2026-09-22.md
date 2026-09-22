# 네이버 Critique Loop 구현 결과

기준: P1(`1e8df71d`~`78cca552`) + 홈판 병합(`81c7e390`, `d81eac39`) 위. **릴리스하지 않는다.** 기능 플래그 기본 OFF.

## 1. 커밋
| | 커밋 | 내용 |
|---|---|---|
| A | `e03fb62c` | Critic 코어 — 섹션 모델·근거 팩·결정론 사전검사·Critic 1 계약·issue 검증/장부·해시태그 출처·플래그 |
| B | `cffa0da0` | 배치 편집(≤4섹션)·검증(stillOpen 우선)·보존 검사·리서치 회복 |
| C | `62370fb1` | 편집 데스크/홈판 비평·Final Judge·오케스트레이션·생성기 훅·config 플래그·지문 핀 |
| D | (이 커밋) | 오프라인 테스트 64건(A~G·5유형 fixture)·fixture 빌더·하네스 열·보고서 |

P1 커밋 squash/reset 없음. 타 세션 미커밋 파일(`payment-page/`, `spa/`, `.claude/scheduled_tasks.lock` 등)은 건드리지 않았다.

## 2. 신규 파이프라인 (플래그 ON 시)
`generateStructuredContent` → `runContentPipeline`(기존 SEARCH→CLEAN→SOURCE QUALITY→BLUEPRINT→TITLE/OUTLINE/DRAFT + 기존 비파괴 후처리·FAQ·CTA·해시태그) → **`maybeRunQualityLoop`** → `attachGenerationIntegrity` → BlogExecutor 발행 게이트.

훅 지점(항목 1): 기존 후처리가 전부 끝난 `StructuredContent` 하나. 발행 코드(`editorHelpers.applyStructuredContent`)가 타이핑하는 순서 그대로 — `introduction`(비면 bodyPlain 첫 소제목 앞에서 복구) → 각 소제목의 bodyPlain 슬라이스(소제목 마커 없으면 `heading.content`) → `conclusion` → CTA → 해시태그 — 를 `sectionModel.buildArticleModel` 이 같은 규칙으로 재구성해 Critic·Judge 에게 준다. 편집은 `headings[].content` 와 `bodyPlain` 양쪽에 리터럴 치환(어느 쪽을 타이핑해도 같은 글). 훅 이후 BlogExecutor 단계는 P0 이후 비파괴(URL 제거·중복 소제목 정리)라 Judge 가 본 글과 발행 글이 같다.

루프 순서: `Q0 precheck($0)` → `Q1 Critic 1` → (`Q1b Research Recovery` 최대 1회 → Critic 재실행) → `Q2 배치 편집` → 보존 검사 → `Q3 검증` (≤2 사이클) → `Q4 편집 데스크/홈판 비평` → `Q4b 최소 수정 1회` → `Q5 Final Judge` → `Q-ledger`. 전부 `generation-runs/<runId>/` 에 파일로.

## 3. 모델 정책
전 단계 `resolveSideTaskRoute(source, stage, 'quality')` — 사용자 선택 엔진의 quality tier 만. 벤더 하드코딩·키순서 폴백·저비용 모델(gpt-4.1-mini/haiku/flash-lite) 0. 라우트가 없으면 `SKIPPED`(글 그대로, 호출 0). 단계별 모델은 `criticModel / revisionModel / verificationModel / editorialModel / judgeModel` 로 `meta.extra.qualityLoop.models` 와 `_qualityLoop` 에 기록, `run.recordModel('critic(quality)', …)` 로 `actualModelsUsed` 에도 남아 NO_SILENT_MODEL_OVERRIDE 게이트가 검사한다.

## 4. Critic 1
입력(항목 5·6): 오늘 날짜, 키워드, 코드 산출 검색 의도(topicType 별), 제목, **보이는 도입부**, 섹션(id·제목·본문), 근거 팩(수용 자료 발췌 700자 × ≤8 + researchSummary 핵심 숫자/날짜/독자 질문), 계약. Writer 프롬프트 미복사. 실측 프롬프트 7.8K~15K자(Writer 76K).
계약(항목 8~11): A TITLE PROMISE / B SEARCH INTENT / C MISSING INFORMATION / D CONTRADICTION. CRITICAL 은 자료와 반대·대상 혼합·현재/과거 뒤바뀜·제목 핵심 사실 오류·검색 대상 오설명·공식 정보 충돌만. 문체 CRITICAL 불가(validator 가 강등). 자료에 구체 값 없으면 "더 구체적으로" 금지 → NEEDS_MORE_RESEARCH.
검증(항목 19): 유효 sectionId + 본문 exactSpan, 사실 이슈 evidenceIds 필수, 막연한 요청 MINOR/advisory. 강등 사유는 `note` 로 장부에 남는다(라이브 정책 1편에서 Critic 7건 중 1건 강등 — CONTRADICTION 을 소제목만으로 지목).

## 5. MISSING_INFORMATION insertionAnchor
`MISSING_INFORMATION + ADD` 의 exactSpan 이 H2/H3 제목과 일치하면 `insertionAnchor` 로 허용(MAJOR 가능). 편집 프롬프트에 "삽입 위치: 소제목 X 아래" 로 전달. `CONTRADICTION/MIXED_ENTITY/UNSUPPORTED_VALUE/REDUNDANCY/FACT_ERROR` 는 본문 exactSpan 필수(fixture C). `STRUCTURE`(소제목-본문 불일치·빈 섹션)는 소제목 앵커 허용 — 라이브 1차에서 편집 데스크가 이 유형을 "exactSpan not found" 로 잃어 Judge 만 잡던 것을 고쳤다.

## 6. Research Recovery
`NEEDS_MORE_RESEARCH + researchQueries` → 편집 **전에** 검색(운영: `collectKeywordMaterials` → `prepareSourceMaterial`, P1 수집·CLEAN·관련도 그대로), 새 자료 `R01..` 재번호, 근거 팩 갱신, Critic 1회 재실행. 글당 1회. 검색 함수가 없거나 자료가 안 늘면 MANUAL_REVIEW 사유. 지어내기 경로 없음(fixture G).

## 7. Batch Editor
섹션별 묶음, 호출당 ≤4섹션. 입력 = 대상 섹션 + 이슈 + 인용 근거 + 짧은 맥락. 요청 밖 섹션은 버림(over-edit 시도로 기록), 무변경은 미패치, REPLACE/REMOVE 만인 섹션 1.35배 초과·REMOVE 없이 0.6배 미만은 "다시 쓰기" 거부. `patchedIssueKeys` 는 정보일 뿐.

## 8. Verification
편집자 자가 보고 불신. 수정된 섹션 + pending 이슈 → RESOLVED/OPEN, stillOpen 우선, 미언급 pending 은 OPEN. 새 이슈는 수정이 만든 CRITICAL 만, 2라운드부터 `causedByRevision=true` MAJOR 만. 해석 불가 = 0건 해소(fixture D).

## 9. Editorial / Homefeed Critic
사실 검수 뒤 구조만: 3섹션+ 같은 핵심 사실 반복(도입·상세·요약 1회 정상), 답 너무 늦음, 소제목-본문 불일치, 빈 섹션, 억지 키워드, 초점 불일치. CRITICAL 상한 MAJOR. 홈판이면 첫 화면 이유·제목 궁금증 연결·답 은닉·훅용 과장·메타 시작 항목 추가, "더 자극적으로" 금지. 수정 예산이 남으면 1회 최소 수정(Q4b).

## 10. Final Judge
질문 하나 "자동발행을 막아야 하는 명백한 문제가 있는가". 입력 = 본문+FAQ+CTA+해시태그(출처 actualSearch/article/semantic/hashtag 표기, 항목 33). BLOCK 은 type·sectionId·exactSpan(구조면 소제목)·reason 필수, 취향 사유(더 자연스럽게/흥미롭게/다양하게/SEO 개선/풍부하게/분량)는 advisory 강등, 위치 못 잡으면 강등, 해석 불가 = BLOCK. Judge 는 편집이 반영된 실제 최종 `StructuredContent` 를 본다.

## 11. Fast Path
Critical=0 & Major=0 → 편집·검증 0, critic→editorial→judge 3호출(fixture E, 5유형 fixture c).

## 12. Revision Cycle
`MAX_REVISION_CYCLES=2`. 사이클마다 편집→보존검사→검증. REVISION_NOOP·PRESERVATION_VIOLATION 이면 후보 폐기(글 그대로) 후 중단, 2사이클 후 미해결 → `UNRESOLVED_AFTER_2_CYCLES` MANUAL_REVIEW. 편집 데스크 수정은 남은 예산 1회를 쓴다.

## 13. 5유형 Offline (P1 실행 결과 fixture, $0)
`scripts/critique-fixture-build.cjs` 가 P1 런(3056zs·31x0dj·j5s30r·jia9c6·3kkif5)의 D/A/B 파일에서 `src/__tests__/fixtures/critique/*.json` 생성. `critiqueLoopFiveTypes.test.ts` 30건 GREEN.

| 유형 | 섹션 | 자료 | precheck MAJOR | Critic 프롬프트 | Judge 프롬프트 | coreFact | vague | redundant | action |
|---|---|---|---|---|---|---|---|---|---|
| 정책 | 9 | 6 | 0 | 13,911 | 13,625 | 0.84 | 0 | 9 | 0.57 |
| 금융 | 8 | 7 | 0 | 15,023 | 14,690 | 0.54 | 0 | 6 | 0.67 |
| 자동차 | 8 | 7 | 0 | 13,565 | 13,272 | 0.63 | 0 | 7 | 0 |
| 연예(홈판) | 7 | 3 | 0 | 7,836 | 7,220 | 0.75 | 0 | 1 | 0 |
| 여행 | 8 | 6 | 0 | 13,146 | 12,792 | 0.65 | 0 | 1 | 0.5 |

각 fixture 에서: 섹션 모델 = headings 와 1:1, all-PASS 라우트 → Fast Path·글 바이트 동일, MISSING+ADD(소제목 앵커) 1건 → s2 만 변경·나머지 바이트 동일·untouchedPreserved=true.
특수 fixture A~G(`critiqueLoopOrchestrator.test.ts`): A 일반 설명 CRITICAL 강등 / B 앵커 ADD 수정 / C 소제목만 CONTRADICTION 비차단 / D 자가보고 vs stillOpen → 2사이클 후 MANUAL_REVIEW(7호출) / E 깨끗한 글 3호출 / F 3섹션+ 반복만 redundant / G 편집 전 검색. 추가: 요청 밖 섹션 폐기, 3배 다시쓰기 거부, 유효 숫자 유실 폐기, 라이브 회귀(플래그 span 안 미지원 숫자 제거 허용), Judge 취향 BLOCK 강등, hard stop 호출 0, 라우트 없음 SKIPPED, 모델·원장 기록.

## 14. Live 정책 (`2026 청년도약계좌 조건`, agent-claude, NAVER_QUALITY_LOOP=1)
**1차 `20260922-191510-hr3r5z`: MANUAL_REVIEW — 루프의 버그 발견.** Critic 6 MAJOR(자료에 없는 금리 4.5%/6.0%·금융위 설문 1,245명/54%·인터뷰 인용, 다른 정책과 혼합, 신청 방법 누락 — 전부 실제 결함, 강등 1). 편집자는 지목된 4섹션만 고쳤고 untouchedPreserved=true 였으나, **보존 검사가 미지원 숫자 4.5%/6.0% 의 삭제를 "숫자 유실" 로 판정해 수정을 폐기** → 검증 미실행 → Judge 가 같은 결함 6건 BLOCK. 호출 5(critic·revision·editorial·revision·judge), 프롬프트 6~13K자, 63~104초/호출.
수정: 보존 검사는 플래그된 span 안의 값과 근거에 없는 값의 유실을 허용(유효 값만 보호). STRUCTURE 소제목 앵커 허용. 회귀 테스트 추가.
**2차 `20260922-193310-0baqv0`: MANUAL_REVIEW — 루프의 두 번째 버그.** 사실 루프는 완주(Critic 5 MAJOR → 4섹션 편집 → 검증 5/5 RESOLVED → 편집 데스크 2건 수정 → Judge). 미지원 설문 `1245명/54%` 는 최종 글에서 사라졌다. 그러나 Critic 이 인터뷰 인용(정모(26)씨)·14개 은행 명단을 `UNSUPPORTED_VALUE` + evidenceIds 로 정확히 짚고도 **severity MINOR** 로 라벨해 validator 가 강등 → 편집 대상에서 빠짐 → Judge BLOCK 4(그 둘 + Critic 이 놓친 설문 paraphrase·"3차 모집 계획"). 호출 6, base 4 / total 10.
수정: 위치·근거가 있는 사실형 이슈는 라벨과 무관하게 최소 MAJOR(validator). Critic 계약에 "인용·통계·명단·향후 일정 단정은 사실 결함, 섹션마다 issue" 추가. 회귀 테스트 추가.
**3차 `20260922-194812-92dbnq`: Judge PASS(BLOCK 0·advisory 9), 최종 MANUAL_REVIEW(사이클 상한).** Critic 11 MAJOR(미지원 설문·인용·은행 명단·3차 모집·다른 정책 혼합 + 반복 3 + 제목 약속 1). 1라운드 편집 5섹션(2배치) → 검증 9 RESOLVED / 2 OPEN → 2라운드 1섹션 → 검증 1 RESOLVED. 미지원 값 4종 전부 제거, untouchedPreserved=true, 유효 값 유실 0(`lost=1245,54` 는 하네스의 기존 factPreservation 지표가 미지원 값 삭제를 센 것). coreFactCoverage 0.95, readerQuestionCoverage 1.0, actionability 1.0. 남은 OPEN 1건 = `s1/TITLE_PROMISE`(도약계좌 기본 조건 추가, 편집자가 2라운드에서 미적용) → `UNRESOLVED_AFTER_2_CYCLES` + 편집 데스크 4건 `EDITORIAL_UNFIXED`(예산 소진) → 항목 34 대로 MANUAL_REVIEW. 호출 8(critic 1·revision 3·verification 2·editorial 1·judge 1) — 목표 ≤7 초과 1은 5섹션이 2배치로 나뉜 탓.

정책 성공 기준 대조: 미지원 값 0 ✅(Judge 확인) · 유효 값 삭제 0 ✅ · over-edit 0 ✅ · 검색 의도 충족 — Judge advisory "s1 에 도약계좌 기본 요건 한두 줄" (부분) · 비용 정상 ✅(구독, 호출 8) · QUALITY_CONVERGED ❌(사이클 상한).

## 15. Live 금융 / 16. Live 자동차
미실행. 지시 순서(정책 → 연예/여행 → 그 뒤)대로 정책·여행까지만. 오프라인 fixture 로만 검증(§13).

## 17. Live 연예
미실행(여행을 2순위로 택함 — 연예는 자료 3건·8K 라 Research Recovery 경로가 먼저 걸릴 가능성이 커 별도 회차 권고).

## 18. Live 여행 (`제주 10월 가볼만한곳`, agent-claude)
**1차 `20260922-195843-ddr04w`: MANUAL_REVIEW — 루프의 세 번째 버그.** Critic 7 MAJOR(미지원 날짜 `10월 18일`·`10월 16~22일`·`10월 31일 휠체어 마라톤`, 미지원 인용, 누락, 반복) → 5섹션 편집 → 검증 7/7 RESOLVED(수정본에 두 날짜 없음 확인). 그런데 **편집 데스크 비평이 제목("종료일이 8일 11일 18일")에 맞추라며 `10월 18일`·`10월 16~22일` 을 다시 넣으라고 요구**했고 편집자가 그대로 복원 → Judge BLOCK 3(정확히 그 날짜들). 편집 데스크는 근거를 보지 않으므로 어떤 값이 미지원으로 제거됐는지 몰랐다.
수정: (1) 편집 데스크 프롬프트에 "사실 검수에서 제거된 값" 목록 전달(제목과 어긋나면 제목을 고치라고 지시). (2) 결정론 회귀 가드 — 해소된 사실 이슈가 제거한 숫자/날짜 토큰이 2라운드 편집·편집 데스크 수정에서 재유입되면 그 후보를 폐기(Q4c 기록). 회귀 테스트 추가.
**2차 `20260922-201400-jq7nj0`: MANUAL_REVIEW.** Critic 8(CRITICAL 1·MAJOR 7) → 5섹션 편집 → 검증 6 RESOLVED / 2 OPEN → 2라운드 1섹션 → 검증 0/1. 편집 데스크 프롬프트에 "제거된 값" 목록 전달 확인, 예산 소진으로 Q4b 미실행. Judge BLOCK 1: `10월 16~22일` 이 **결론부에** 남아 있었다 — Critic 은 intro·s6 두 곳만 지목하고 세 번째 반복을 놓쳤다(Critic 재현율). 호출 8.
수정: 결정론 전파(`issuePropagation`, $0) — Critic 이 미지원으로 확정한 숫자/날짜 토큰이 다른 섹션에 반복되고 근거에도 없으면 그 문장에 파생 issue 를 자동 생성. 짧은 섹션에서 REPLACE 로 문장 하나를 빼면 "다시 쓰기" 로 거부되던 축소 하한도 지목 span 길이를 반영하도록 수정. 회귀 테스트 추가.
**3차 `20260922-203544-orfmzm`: MANUAL_REVIEW(Judge BLOCK 1).** Critic 6 + **전파 6**(`18일` intro/s1/s2/s3/s4, `10월16일` conclusion) = 12건 → 8섹션 2배치 편집 → 검증 **12/12 RESOLVED, 1사이클** → 편집 데스크 3건 수정 적용(재유입 가드 통과) → Judge. 미지원 인용 2·미지원 날짜 전 반복 제거, untouchedPreserved=true, 유실 0, 호출 7. 남은 BLOCK 1 = 편집자가 `10월 16~22일` 을 `10월 중` 으로 **흐리게 바꾼** 문장(여전히 자료에 없는 단정). 편집 계약에 "미지원 값은 자료 표현으로 바꾸거나 통째로 뺀다 — 더 흐린 말로 바꾸는 것은 수정이 아니다" 추가(라이브 미검증).

여행 성공 기준 대조: 누락 정보 — Judge advisory(감귤 체험 상시 코스 미반영, 자료 범위 안) · 제목 궁금증 상환 — 1차에서 제목의 `18일` 자체가 미지원 값이라 편집 데스크가 제목 쪽을 문제 삼도록 지시 · 추상 조언 — vague 0 · 억지 연관 키워드 — 없음 · 필요한 곳만 수정 — 지목 섹션 외 변경 0 · QUALITY_CONVERGED ❌.

## 19. section preservation
편집자가 지목되지 않은 섹션을 바꾸면 후보 폐기 + MANUAL_REVIEW. over-edit 지표 `unchangedSections/revisedSections`. 라이브 1차 6/2(편집 데스크 포함 4+2 섹션 지목).

## 20~24. 관찰 지표 (게이트 아님)
CORE_FACT_COVERAGE = 근거 숫자/날짜 토큰 중 본문 등장 비율. READER_QUESTION_COVERAGE = 자료 독자 질문 내용어 60%+ 등장 비율(질문 0이면 null). VAGUE_SENTENCE_RATIO = 상투 문구 정규식(현재 0 — 정규식이 좁다, 관찰용). REDUNDANT_CORE_FACTS = 3섹션+ 반복 숫자/날짜 토큰 수(정책 9 — "3년·50만원" 류가 표·본문·요약에 걸쳐 반복, 편집 데스크는 "새 의미 없이" 조건이라 MAJOR 로 잡지 않았다). ACTIONABILITY = 행동 문장 있는 섹션 비율.

## 25. 비용 / 26. 호출 수
`meta.extra.qualityLoop.calls = {base, quality, total}`, `cost = {base, quality, total}`. 구독 CLI 는 quality 0 USD, base 는 기존 경로가 USD 를 산출하지 않아 null(추정치 기재 금지). 라이브 정책 1차: base 5 / quality 5 / total 10. 목표 3(깨끗)·5(1회 수정)·≤7(2회) — 오프라인 D fixture 7, E 3.

## 27. MANUAL_REVIEW
`_generationIntegrity.publishDecision` 에 합류(`QUALITY_LOOP: <사유>`), `meta.publishDecision`, `Q-ledger.json`, 하네스 행 `qualityLoop`. UI 추가 없음.

## 28. Feature Flag OFF 회귀
`isQualityLoopEnabled`: config `naverQualityLoop===true` 또는 env `NAVER_QUALITY_LOOP=1` 만 ON, `=0` kill switch. OFF 면 `maybeRunQualityLoop` 가 같은 객체·summary null 반환(테스트: 라우트 호출 0). 훅 이전 코드 무변경, `attachGenerationIntegrity` 는 `qualityLoop` null 이면 기존 판정 그대로. 전체 vitest OFF 로 실행.

## 29. 전체 테스트
vitest **10,116 / 10,116**(1,034 파일; 기존 10,052 + 신규 64), tsc 0, build OK, 지문 핀 `a73daf03…`(critique 모듈 + 동적 import 대상 generationSourceBuilder/thinMaterialExpansion 클로저 편입), P0/P1/병합 회귀 117 GREEN.

## 30. 남아 있는 문제
1. **라이브 7편 중 QUALITY_CONVERGED 0.** 원인은 루프 기계가 아니라 초안 자체다 — 정책·여행 초안마다 자료에 없는 인용·설문·날짜·기관 명단이 4~6건 들어 있었다(P1 Writer 문제, 이 작업 범위 밖). 루프는 매 회차 그 결함을 줄였고(3차 정책: Judge PASS, 3차 여행: 12/12 해소) 남은 결함이 있으면 발행을 막았다. 루프 자체 버그 3건(보존 검사 오판·Critic MINOR 라벨·편집 데스크 재유입)은 라이브에서 잡아 고쳤고 회귀 테스트로 잠갔다.
2. **사이클 상한 정책.** 정책 3차는 Judge PASS 인데 비사실형 MAJOR 1건(`TITLE_PROMISE`)이 2사이클 뒤 OPEN 이라 항목 34 대로 MANUAL_REVIEW. "Judge PASS 면 비사실형 미해결은 advisory 로 내린다" 는 발행 차단 의미를 바꾸는 결정이라 구현하지 않았다 — 사장님 결정 필요.
3. 편집자가 미지원 값을 "더 흐린 값" 으로 바꾸는 패턴(`10월 중`). 계약 문구는 넣었으나 라이브 미검증. 결정론 대안: 파생 토큰이 아닌 "월 단위" 흐림은 코드로 못 잡는다.
4. 호출 수: 지목 섹션이 5개 이상이면 배치가 2개가 되어 1회 수정에 6~8호출(목표 ≤7 를 1 초과). 상한을 4→5로 올리면 프롬프트 11K→14K. 유지 권고.
5. 연예(홈판)·금융·자동차 라이브 미실행. 연예는 자료 3건이라 Research Recovery 경로가 먼저 걸릴 것.
6. 관찰 지표 중 VAGUE_SENTENCE_RATIO 정규식이 좁아 항상 0, REDUNDANT_CORE_FACTS 는 표·요약 반복을 세어 정책 글에서 5~13. 게이트가 아니므로 두었다.
7. 백그라운드 하네스 래퍼가 세션 도구에서 반복 kill 됐다(electron 은 살아남음). 라이브 회차는 포그라운드 폴링으로 수집.

## 31. 최종 판단: **NEEDS_FIX**
루프 기계는 설계대로 동작한다 — Critic 입력 7.8~16K자(Writer 50K 미복사), 문체 CRITICAL 0, 지목 섹션 외 변경 0(라이브 7편 전부), 유효 값 유실 0, 호출 3/5/≤8, 플래그 OFF 회귀 0(10,116 GREEN), 모델 전 단계 선택 엔진, 환각 잔존 시 자동발행 차단. 그러나 지시된 성공 기준(정책 QUALITY_CONVERGED)에 라이브에서 도달하지 못했고(0/7), 남은 결정 1건(§30-2)과 라이브 미검증 계약 1건(§30-3)이 있다. 기본 OFF 옵트인으로 두고, §30-2 결정 후 정책 1편·연예 1편 재검증을 권고한다. 릴리스하지 않는다.
