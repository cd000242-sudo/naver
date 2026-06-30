# SPEC-HOMEFEED-EMPATHY-2026: 홈판 노출 — 상황·판단 공감 엔진 + 복리 학습 루프

**Status**: draft
**Created**: 2026-06-30
**Domain**: CONTENT / HOMEFEED / EXPOSURE
**Target Module**: better-life-naver (root, cross-module)
**Version Context**: v2.11.71 기준 (홈판 F7/F8 로컬커밋·릴리스 보류 상태)
**선행/관련**: SPEC-HOMEFEED-100(자가진화), SPEC-TITLE-200(제목), SPEC-AEO-EXPOSURE-2026(노출·반균질화 교훈), SPEC-REVIEW-001(날조 금지), SPEC-CONTENT-LENGTH-2026
**입력**: 사용자 지시(2026-06-30) — "지금 글로는 홈판 노출 불가. 미래지향적으로, 지금 바로 먹히는 것보다 꾸준히 하면 성과 나게. 제목이 핵심. 소름/굉장해 같은 봇 말투 금지. 상황과 판단을 만들어줘야 공감이 된다."

---

## 0. 설계 철학 — "지금 먹히는 패치"가 아니라 "꾸준히 복리"

사용자 요구의 핵심은 **즉효 해킹 거부 + 복리형 시스템**이다. 두 축으로 푼다.

1. **본문 품질의 부호를 바꾼다** — 감정 필러·봇 단어·회피(hedging)를 **상황(situation) + 판단(judgment)**으로 교체. 공감·댓글·체류(=홈판 노출 신호)는 "소름!"이 아니라 독자가 자길 대입할 구체 상황과 글쓴이의 솔직한 한쪽 판단에서 나온다.
2. **죽어 있는 학습 루프를 살린다** — 발행 글의 실제 노출/조회/공감을 수집해, 이긴 글의 패턴을 다음 글에 few-shot으로 상속. 계정이 아니라 **시스템이 복리로 똑똑해진다**. 이것이 "꾸준히 하면 성과"의 실체.

### ⚠️ SPEC-AEO-EXPOSURE-2026 자가비평 계승 (반드시 준수)
per-post 형식을 모든 글에 **강제(forcing)**하면 글 골격이 동형화(template signature)되어 어뷰징/자가표절 패턴을 키우고 노출을 **깎을** 수 있다. 따라서 본 SPEC의 상황·판단 규칙은:
- **강제 재생성 게이트가 아니라 advisory(자문) + 다양성(반균질화)** 로 작동한다.
- "표 1개 강제" 같은 cargo-cult 보상을 만들지 않는다.
- 복리 루프(기둥 3)는 **고정 템플릿이 아니라 실제 승자에서 학습**하므로 동형화의 해독제다 — 이 SPEC의 중심을 기둥 3에 두는 이유.

---

## 1. 실측 베이스라인 (2026-06-30, n=10 gemini A/B)

홈판 생성물의 사람다움 측정. 채점기 `src/content/evaluators/humanlikeEval.ts`(homefeed 가중치 40% = 최대), 입력=수상 뉴스(관찰형 하드모드).

| humanlike 하위신호 (만점) | OLD avg | NEW(F7/F8) avg | 진단 |
|---|---|---|---|
| burstiness (20) | 20.0 | 20.0 | ✅ |
| lexicalDiversity (12) | 12.0 | 12.0 | ✅ |
| **directExperience (15)** | 3.4 | 4.2 | ❌ **-11, 최대 드라이버** |
| **noAiCliche (15)** | 9.0 | 9.0 | ❌ -6, 내부 모순 |
| **endingDiversity (18)** | 10.4 | 12.0 | ⚠️ -6~8 |
| informalWords (8) | 5.0 | 5.0 | ⚠️ -3 |
| **humanlike 합계** | **69.4** | **72.6** | 목표 90 미달 |

**F7/F8(감정필러 억제)는 humanlike를 +3밖에 못 올렸다 = 엉뚱한 레버.** 진짜 드라이버는 directExperience·noAiCliche·endingDiversity.

### 확인된 2대 구조 결함
1. **루브릭 모순(noAiCliche)**: "소름"(본문 5회)·"실화"(7회)가 `humanlikeEval` AI_CLICHE 감점 대상인데, **본문측 emotionTriggers/MODE_VOICE는 같은 단어를 클릭유도로 권장**한다. (제목 프롬프트 `prompts/title/homefeed/base.prompt`는 이미 충격/경악/실화 0점 처리 → 제목은 정렬됨, 본문만 모순.)
2. **복리 루프 사망**: `recentWinnersExtractor`(상위 20% 조회수 글 제목·도입부 → few-shot)는 구축됐으나 (a) `contentRecentWinnersBlock.ts:22` resolver가 `intro:''` 하드코딩 → `extractRecentWinners`가 intro 없는 항목 skip(line 63) → **항상 0건 반환**, (b) `postMetricsStore`에 실제 네이버 노출/조회 데이터를 쓰는 프로덕션 writer 부재. (`feedback_loop` 플래그는 기본 ON.) → 복리가 안 돈다.

---

## 2. directExperience의 본질 — 누락이 아니라 정직성과의 충돌

홈판 본문 프롬프트는 **이미** 1인칭 경험을 의도적으로 억제한다(정직성):
- `base.prompt` G2-1(line 117): "1인칭 경험 흔적 7개 중 3개 의무" (체험형 예시만)
- `base.prompt` H1(line 287~304), line 350~351: **"사용자 입력에 체험이 없으면 1인칭 감각 묘사 금지"**, "현장에 있었다/직접 만났다 날조 금지" — SPEC-REVIEW-001 환각 방지.

→ 수상 뉴스처럼 **입력에 1차 체험이 없는 관찰형 토픽**에서는 프롬프트가 정직하게 경험 신호를 비우고, 채점기는 그걸 감점한다. **프롬프트가 옳고 채점기가 관찰형에 오보정**이다.

**해법: "한 경험(행위)"이 아니라 "본 경험(관찰)"을 정직하게 인정.** 시청자/팬으로서 무대·영상·소식을 본 것은 진짜 1차 경험이다("내가 그 방송을 실시간으로 지켜봤다"는 사실, "내가 콘서트에 갔다"는 날조).

---

## 3. 요구사항 (EARS)

### 기둥 1 — 제목 (재건축 ❌, 학습 연결만)
- R1-1. THE SYSTEM SHALL 홈판 제목 시스템(SPEC-TITLE-200)을 **변경하지 않는다** — 이미 봇단어 금지·정체성저격·공감상황 정렬됨.
- R1-2. WHEN 복리 루프(기둥 3)가 가동되면, THE SYSTEM SHALL 이긴 제목 패턴을 제목 생성 few-shot에 주입한다. (기둥 3에 종속)

### 기둥 2 — 상황·판단 공감 엔진 (본문)
- R2-1. THE SYSTEM SHALL 본문측 emotionTriggers/MODE_VOICE에서 **소름·실화·충격·경악** 등 봇 자극어를 권장 목록에서 제거하고 금지로 통일한다(humanlikeEval·제목 프롬프트와 일관). **단 advisory** — 기존 글 강제 재생성 트리거로 만들지 않는다.
- R2-2. THE SYSTEM SHALL `humanlikeEval.DIRECT_EXPERIENCE_SIGNALS`에 **정직한 관찰형 경험 신호**(지켜봤/실시간으로 봤/영상으로 봤/중계로 봤/직관/캡처를 다시/보는 내내/소식을 접하고 등)를 추가해, 관찰형 콘텐츠의 정직한 경험을 채점에 반영한다.
- R2-3. THE SYSTEM SHALL 홈판 본문 프롬프트의 F7/F8을 **"감정 억제"가 아니라 "상황+판단 강제"로 재설계**한다: (a) 감정 단어 대신 독자가 대입할 **구체 상황 한 장면**, (b) 양비론 금지·**솔직한 한쪽 판단** 1회 이상. (기존 F8 (4)/(2) 강화·통합, 신규 규칙 남발 금지)
- R2-4. THE SYSTEM SHALL 토픽 타입별 경험 트랙을 분기한다: 체험형(food/living/travel/health=직접 써봤/가봤, 입력에 체험 있을 때만) vs 관찰형(entertainment/society=본 경험 1인칭). `resolveCategory` 재사용.
- R2-5. THE SYSTEM SHALL F7/F8 번호 충돌(base.prompt line760 기존 F7/F8=파편문장/감정흔들림)을 리넘버링으로 해소한다.
- R2-6. THE SYSTEM SHALL R2 변경이 **날조를 유발하지 않음**을 보장한다 — 추가 신호는 전부 "본 경험"만, H1/faithfulness 검출기 그대로 작동(SPEC-REVIEW-001 불변).

### 기둥 3 — 복리 학습 루프 (꾸준히 → 성과, 중심)
- R3-1. THE SYSTEM SHALL 발행 글의 실제 성과(노출/조회/공감)를 `postMetricsStore`에 기록하는 프로덕션 writer를 배선한다(앱의 naverBlogCrawler/publishedPostTracker/serpProbe 활용, 자기 글 한정).
- R3-2. THE SYSTEM SHALL `contentRecentWinnersBlock` resolver가 **실제 제목+도입부**를 반환하도록 수정한다(현재 `intro:''` 버그 제거).
- R3-3. WHEN 메트릭 표본 ≥ 5, THE SYSTEM SHALL 상위 20% 글의 제목·도입부를 다음 생성 few-shot으로 주입한다. WHEN < 5, THE SYSTEM SHALL 빈 블록(노이즈 잠금 방지, 기존 minSampleSize 게이트 유지).
- R3-4. THE SYSTEM SHALL 승자 학습이 **동형화로 수렴하지 않도록** 다양성 가드를 둔다(승자 패턴을 복사 강제가 아니라 참고로, 반균질화 우선).

---

## 4. 검증 (Evidence-Based)

- V1. 기둥 2: `tmp/homefeed-ab.cjs` A/B 하네스로 before/after 측정 — **directExperience 밀도↑ + humanlikeScore↑ + 날조 패턴(현장/직접만남류) 무증가**. 관찰형(연예) + 체험형(맛집) 두 입력 각각. (electron 실행 시 `ELECTRON_RUN_AS_NODE` unset, 프롬프트 src+dist 스왑 후 복원 필수.)
- V2. 회귀: `humanlikeEval` 변경은 `qualityEvaluator.test.ts`·`modeGoldenQuality90.test.ts` 골든 테스트 통과 + SEO/affiliate 모드 채점 중립 확인.
- V3. 기둥 3: resolver 단위테스트(실 title+intro 반환) + 표본<5 빈블록 게이트 + 실데이터 1주기 후 승자 주입 동작.
- V4. 전체 vitest fresh + build PASS (커밋 메시지 재사용 금지 — verification.md 철칙).
- V5. 추정 효과 나열 금지 — 변경 내용 + 실측 델타만 보고(feedback_no_speculation).

## 5. 회귀 가드 / 롤아웃

- 회귀 cascade 금지: 1릴리스 1~3 fix, 단계마다 A/B + vitest + (god file 영역) full-flow.
- 단계: **Phase A = 기둥 2**(저위험·즉시 측정: R2-1 봇단어 모순, R2-2 관찰형 신호, R2-3 상황+판단, R2-5 리넘버링) → A/B 검증 → 릴리스. **Phase B = 기둥 3**(R3-1 메트릭 writer → R3-2 resolver fix → R3-3 주입 → R3-4 다양성가드), 실데이터 누적 의존이라 느리게 효과(="꾸준히").
- 모든 본문 규칙은 advisory 우선, 강제 재생성 최소화(AEO 자가비평 준수).

## 6. 비목표 (Non-Goals)
- 제목 시스템 재설계(SPEC-TITLE-200 소관) — 본 SPEC은 학습 연결만.
- 계정 권위/C-Rank/어뷰징 진단(SPEC-AEO-EXPOSURE-2026/NAVER-PROTECTION 소관).
- 즉효성 보장 — 본 SPEC은 복리형이며 단발 노출을 약속하지 않는다.
