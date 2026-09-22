# 네이버 홈판 Prompt Final Merge 결과

기준: P1(`1e8df71d`~`78cca552`) 위. 릴리스 없음, Critic Loop 미구현, 유료/구독 LLM 호출 0(전부 `PROMPT_DRY_RUN=1`).

## 1. 커밋
`81c7e390` refactor(prompt): 홈판 최종 병합 — 제목·도입부·CTA 정본 3개, 중복 블록 8곳 정리, 반복 예산 테스트 (13 파일). 기존 P1 커밋 squash/reset 없음.

## 2. 홈판 Prompt 구성도 (런타임, C-final-prompt 기준 · 변우석 텐텐 연예/issue-story)

| 블록 | 생산 코드 | BEFORE chars | AFTER chars | 조치 |
|---|---|---|---|---|
| [MODE VOICE: 홈판] | promptLoader.ts `MODE_VOICE.homefeed` | 1,063 | 657 | 글 구조·우선 요소(도입/CTA 재진술) 삭제 |
| [GAMMA-7] | homefeed/base.prompt | 738 | 773 | **HOMEFEED_INTRO_RULES 정본** (SD-2 가치·요약 반복 금지 흡수) |
| [TITLE] | homefeed/base.prompt | 1,780 | 1,596 | **HOMEFEED_TITLE_RULES 정본** (제목 필수 조건·whyClick 흡수, 배수 서술 삭제) |
| [RETENTION] | homefeed/base.prompt | 460 | 553 | **HOMEFEED_CTA_RULES 정본** (목적·최대 1회·근거 없는 행동 단정 금지) |
| [FINAL CHECK] | homefeed/base.prompt | 9항 | 6항 | 중복 항목 병합 |
| [상황-공감 깊이 SD-1~3] | promptLoader ← shared/situation-depth.prompt | 1,154 | 0 | 홈판 미주입(GAMMA-7 정본이 담음) |
| HOMEFEED 90+ | shared/homefeed-90-quality.prompt | 1,236 | 623 | 첫 화면·말투·저장·정직성 재진술 → 고유 5줄 |
| [HEADINGS: 홈판]+[ISSUE-STORY] | headings-homefeed + homefeed/issue-story.prompt | 6,514 | 5,250 | 제목 통계·길이 재설명·실측 사고 서사 삭제 |
| [홈판 상위노출 본문 원칙] | content/homefeedExposurePattern.ts | 905 | 503 | 첫 화면·주체 공개·팩트·CTA 삭제, 모바일·문체·소제목만 |
| [원본 제목 활용 지침] | promptLoader.ts | 265 | 110 | 홈판 1줄 |
| [홈판 모드 필수 구조 규칙] | contentJsonPromptFormat.ts | 615 | 492 | JSON 필드 계약만 |
| [홈판 모드 제목 필수 조건] | contentJsonPromptFormat.ts | 365 | 257 | 정본 포인터 + 1:1 일치 + 궁금증 상환 (28~42 충돌 제거) |
| [홈판 제목 제약] (비이슈 카테고리) | content/neoHookTitles.ts | 1,237 | 1,005 | 길이·자가검토 중복 삭제 |
| 그대로: BLOGGER IDENTITY, STYLE OVERRIDE, SECTION -2, STRUCTURE, HUMAN WRITING, MOBILE, 주장·사실 규율, HASHTAG, ANGLE, HUMAN WRITING ANTI-PATTERN, 팩트 규율, JSON 스키마, 제목보다 추론, 근거 인용, 이미지 규칙, 최종 강제, SITUATION DEPTH, FINAL CONTRACT, 1회 완성 | | | 공유 계약·안전 규칙 — 삭제 안 함 |

## 3. BEFORE / AFTER (같은 키워드 dry-run)

| | 변우석 텐텐 (연예·홈판) BEFORE | AFTER |
|---|---|---|
| total chars | 57,342 | 53,235 |
| ~tokens | 33,700 | 31,315 |
| instruction chars | 47,826 | 45,108 |
| system part | 39,045 | 35,126 (−3,919) |
| source chars | 9,516 | 8,127 |
| instruction ratio | 5.03 : 1 | 5.55 : 1 |

지시문 블록 순변화(자료 유래 블록 제외) **−3,566자**. 비율이 되레 오른 이유는 자료 분모: 원기사가 2024-06(2년 전)이라 신선한 자료가 블로그 2건뿐이고 stale 유지 1건 — 지시문이 아니라 자료 현실. 홈판 4:1 목표는 이 키워드에서 미달(5.55).

## 4. 5유형 Dry Run (홈판 모드)

| 키워드 | 유형 | total | instruction | source | ratio |
|---|---|---|---|---|---|
| 2026 청년도약계좌 조건 | 정책 | 66,423 | 47,454 | 18,969 | **2.50** |
| 청약통장 금리 | 금융 | 66,722 | 48,229 | 18,493 | **2.61** |
| 2026 셀토스 하이브리드 모의견적 | 자동차 | 59,827 | 42,606 | 17,221 | **2.47** |
| 변우석 텐텐 | 연예(issue-story) | 53,235 | 45,108 | 8,127 | 5.55 |
| 제주 10월 가볼만한곳 | 여행 | 57,223 | 42,280 | 14,943 | **2.83** |

## 5. 일반 SEO Prompt 회귀
SEO system part 42,770자 — 병합 전 dry-run(`k2xp0t`)과 5키워드 AFTER 6런 전부 **바이트 동일**(`sys(before)===sys(after)` true). SEO 5유형 ratio 2.30~3.38(자료 크기 차이).

## 6. 제거된 중복
- 제목: 10곳 → 정본 1 + 카테고리 골격(issue-story 3공식)·비이슈 보조(neoHook 블랙리스트)·JSON 필드 계약(clickReason/whyClick) 포인터. 길이 값 1종(28~42 제거).
- 첫 화면: 9곳 → GAMMA-7 정본 + FINAL CONTRACT 절충 1줄 + issue-story [도입 유형](카테고리 고유).
- CTA: 8곳 → RETENTION 정본 + FINAL CONTRACT 1줄(정본과 동일 문구).
- 기타: 90+ 계약 재진술, SD 오버레이, 상위노출 원칙 4항, 구조 규칙 3항, 원본 제목 3줄, FINAL CHECK 3항, 실측 통계 서사.

## 7. pinned test 변경
- 유지(A): situationTitleContract·titlePayoffAndPersuasion·homefeedTitleClickReason·titleModeObjective·homefeedIssueStorySkeleton·homefeedExposureAxis·finalVerdictContract 등 — 정본 문구를 그대로 살려 단언 변경 없이 통과.
- semantic 전환(B): `homefeedExposurePattern.test`(첫 화면·주체 공개·팩트·CTA 단언 → base 정본 존재 + 이 블록의 재진술 부재), `tonePersonaNaturalness.test`(MODE VOICE 우선 요소 문구 → GAMMA-7/RETENTION 정본 문구).
- 제거: 0.
- 신규: `homefeedPromptCanonicalRules.test` — 연예/일상 두 카테고리 최종 프롬프트에서 필수 규칙 11종 존재(의도·제목 약속·팩트·근거 숫자·출처·도입부·소제목·CTA·FAQ·모바일·중복 억제), 정본 선언 각 1회, 반복 예산(CTA≤4·첫 3문장≤3·33~42≤4·28~42=0·8~20%≤3·답부터≤4·클릭베이트≤3·알아보겠습니다≤4), 문체 규칙 0점/폐기 금지.

## 8. P0 / P1 회귀
가드 테스트 150 GREEN: humanizer LIGHT 잠금(contentPostGenerationIntegrity)·로컬 dateBucket(retryCacheKey*)·SOURCE_EMPTY 게이트·공통 빌더(generationSourceBuilder)·자료 절단/귀속/숫자(p0QualityRecovery)·JSON 부분 성공 없음(jsonParserCompleteness)·관련도 v2(sourceRelevanceV2)·귀속 오탐(attributionGuard). dry-run 로그 `Grounding: OFF … requested=false used=false` 정직 표기 유지.

## 9. 자동 테스트 / tsc / build
vitest **10,052 / 10,052**(1,031 파일), tsc 0, build OK, legacy-baseline `eb24ef0b…`, 지문 `9b5128a2…`.

## 10. 남아 있는 문제
1. 연예(issue-story) 홈판 5.55:1 — 지시문 35K 중 공유 계약(HUMAN WRITING ANTI-PATTERN 3.5K·팩트 규율 1.8K·JSON 스키마 2.8K·연예 안전 규율 1.8K)이 큰 몫. 자료가 8K 이하인 이슈에서는 4:1 미달. 더 줄이려면 안전 규칙을 건드려야 해 하지 않았다.
2. Writer 입력 순서(날짜→제목→의도→자료→규칙→출력) 재구성은 `[원본 텍스트]` 캐시 경계 때문에 미실시 → P1.5.
3. 리서치 요약에 사이트 chrome 문장("본문 듣기를 종료하였습니다")·제로폭 문자 중복 유입 — P1.5(정제 규칙).
4. 제주 정제 손실 33.5% warn, 매체명 domain fallback, SmartScheduler UI 트리거·벤더 API 경로 라이브 — 요청대로 분리 유지.

## 11. 최종 판단: **READY_FOR_CRITIQUE_LOOP**
홈판 instruction 5유형 중 4개 ≤3:1, 연예 issue 5.55(자료 분모 한계, 안전 규칙 삭제 없이 더 못 내림) · 중복 대폭 감소 · TITLE/INTRO/CTA 정본화 · P0 회귀 0 · P1 관련도 회귀 0 · Humanizer LIGHT 유지 · 전체 테스트 PASS · build PASS. 이번 커밋에 Critic Loop 는 없다 — 다음 별도 작업.
