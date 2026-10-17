# 홈판 오토파일럿 설계 (2026-10-15)

> 상태: **P1 구현 완료** (글감 판단·자동 채택). §6 결정 사항 확정(2026-10-15). P2부터 이어서 구현.

## 0. 목표와 범위

### 목표
LEWORD 글감과 홈판 노출 글 분석 결과를 근거로 **무엇을 쓸지 판단**하고,
출처 조사(캡처·인용) → 글 생성 → 자가 비평 → 이미지 → 모바일 서식 → 이전글 연결까지
앱이 끝낸 뒤, **사용자가 검토하고 로그인하면 발행**까지 마무리한다.

### 비목표 (하지 않는 것)
- 로그인 상태의 통계 페이지(블로그 통계·크리에이터 어드바이저) 자동 수집 — §3 레드라인
- 다른 블로그의 본문·사진 복제 — 홈판 노출 글은 **패턴 분석용**으로만 사용
- 사람 확인 없는 완전 무인 발행
- 클라우드·원격 서버에서의 로그인/발행 — 발행은 항상 사용자 PC의 앱에서
  (CLAUDE.md: 발행 크롬은 "이 PC 그대로" 보고, 2026-10-11 보호조치 실측)

### "Claude가 내 프로젝트를 활용한다"의 실제 형태
앱 안에서 이미 쓰는 LLM 라우팅(`resolveSelectedEngineRoute`,
`src/main/ipc/paraphraseAnalysisHandlers.ts`)을 그대로 쓴다. 별도 서버나 클라우드 세션이 아니다.
오토파일럿은 **본문 생성 엔진 선택과 무관하게 항상 Claude API 키(조직 프로모션 크레딧)** 로 판단한다
(2026-10-15 결정 — 구독 CLI는 20일 초기화라 쓰지 않음). 모델은 quality 등급(사용자 주 모델의 Claude 대응, 기본 Sonnet).

## 1. 전체 흐름

```
[S1 글감 판단] ─▶ [S2 출처 조사] ─▶ [S3 생성+비평] ─▶ [S4 이미지]
                                                          │
[S8 성과 피드백] ◀─ [S7 검토·로그인·발행] ◀─ [S6 이전글] ◀─ [S5 서식·가독성]
       │
       └──────────▶ 다음 S1 판단 근거로 되먹임
```

## 2. 단계별 현황과 할 일

범례: ✅ 있음 · 🟡 있지만 연결/보완 필요 · ❌ 없음

### S1. 글감 판단 — 🟡

| 재료 | 상태 | 위치 |
|---|---|---|
| LEWORD 보드 (오늘의 글감·선점·니치) | ✅ 앱이 읽음 | `src/analytics/lewordBoard.ts`, IPC `leword:board` |
| 리더남 홈판 벤치마크 (786 출처, 후보·트렌드) | 🟡 SPA만 읽음 | `spa/public/data/homefeed-benchmarks.json` |
| 홈판 노출 제목 묶음 | 🟡 SPA만 읽음 | `homefeed-benchmark-titles.json` |
| 홈판 작성 가이드 (direction 등) | 🟡 SPA만 읽음 | `homefeed-benchmark-guides.json` |
| 홈판 노출 원장 (하루 ~1,000건) | 🟡 SPA만 읽음 | `data/homefeed-ledger/*.jsonl` |
| 내 글 노출 승자 | ✅ (`feedback_loop` 플래그) | `src/content/exposureWinnersBlock.ts` |

현재 문제:
- Electron 앱은 벤치마크·가이드·원장을 **하나도 읽지 않는다**. LEWORD에서 키워드만 받아 입력칸에 넣는다.
- `parseTopicBriefs`가 브리프의 `primaryIntent`·`value`·`differentiation`을 **버린다**.
  글의 각도가 키워드와 함께 넘어가지 않는다.

할 일:
1. `lewordBoard.ts` 파서가 위 브리프 필드를 보존하도록 확장.
2. 벤치마크·제목·가이드 JSON을 LEWORD와 같은 방식(공개 JSON + 10분 캐시)으로 가져오는 로더 추가.
   배포 경로는 `topic-briefs.json`과 같은 `https://leaderspro.kr/data/…`로 보이나 **확인 필요**.
3. 새 모듈 `topicJudge`: 후보 키워드별로
   벤치마크 일치도 · 포화도(`saturated`, 문서수) · 내 블로그 카테고리 적합도 · 내 과거 노출 승자 유사도를 모아
   LLM이 **1개 + 각도 + 근거 + 차선**을 고른다 (실제 구현: 내 카테고리 적합도·노출 승자 유사도는 P4에서 추가).
4. **자동 채택** (2026-10-15 사장님 결정): 점수 상위 8개를 Claude가 비교해 1개를 고르고, 키워드·홈판 모드·
   추가 요청사항(제목 방향·각도·꼭 넣을 것·피할 것·발행 전 확인)에 바로 넣는다.
   기존 "오늘의 글감" 목록(`lewordBoardPicker.ts`)은 수동 선택용으로 그대로 둔다.

출력 (`TopicDecision`): `keyword`, `angle`, `primaryIntent`, `benchmarkTitles[]`, `guide`, `reasons[]`.

### S2. 출처 조사·캡처·인용 — 🟡

| 기능 | 상태 | 위치 |
|---|---|---|
| 키워드 자료 수집 (네이버 검색 API, 기사 전문) | ✅ | `content/generationSourceBuilder.collectKeywordMaterials` |
| 공식 문서 캡처 (go.kr 등, 소제목 매칭) | ✅ | `crawler/docCapture/harness.ts` `captureOfficialDocs` |
| 이슈 이미지 수집 (비전 게이트) | ✅ | `crawler/issueHarness/harness.ts` `collectIssueImages` |
| 검증된 원문 인용 삽입 | ✅ | `content/blueprint/quoteInsertionPatch.ts` |
| 본문 출처 표기 | ❌ 이미지 캡션에만 있음 | `automation/imageCaption.ts` |

할 일:
1. 오토파일럿 실행 시 `captureOfficialDocs`를 S1의 `TopicDecision`으로 자동 호출 (현재는 별도 모드 UI).
2. **본문 출처 표기 추가**: 인용 문단 뒤 `(출처: 기관·매체명)` 텍스트 + 글 끝 "참고 자료" 블록.
   글 끝 링크는 기존 `editorTailActions.insertTailLinkCardBlock` 재사용 (최대 2~3개, 링크 과다는 피한다).
3. 출처 정책 (코드로 강제):
   - 캡처·인용 대상: 정부·공공기관, 언론 기사, 기업 공식 발표
   - 다른 개인 블로그·카페 본문/사진: 캡처·인용 금지 (패턴 분석만)
   - 인용은 짧게, 본문의 보조로만 — 출처 없는 인용은 삽입 거부

### S3. 생성 + 자가 비평 — 🟡

있는 것: `generateStructuredContent` 안의 품질 루프
(`quality/critique/orchestrator.ts` `runQualityLoop` — 사전점검 → 고위험 주장 스캔 → 비평 →
자료 보강 1회 → 수정·검증 최대 2회 → 편집 비평 → 최종 판정).

현재 문제: 루프가 **기본 OFF** (`naverQualityLoop` / `NAVER_QUALITY_LOOP`, `critique/flag.ts`).

할 일:
1. 전역 기본값은 건드리지 않고, **오토파일럿 실행에서만** 루프를 켠다 (실행 단위 옵션으로 전달).
2. `contentMode: 'homefeed'`로 호출하고, S1의 `guide`·`benchmarkTitles`를 비평 기준 맥락으로 주입.
3. 최종 판정이 `MANUAL_REVIEW`면 S7 검토 화면에 사유를 표시하고 자동 진행을 멈춘다.
4. Humanizer는 기본 LIGHT 유지 (CLAUDE.md). 숫자·고유명사·인용 변경 금지 규칙 그대로.

### S4. 이미지 — 🟡

있는 것: `generateImagesWithCostSafety` → `imageGenerator.generateImages` (기본 `nano-banana-2`),
소제목별 프롬프트(`headingImageGen.ts`), S2의 공식 캡처 이미지.

현재 문제: `image/imageTextConsistencyChecker.ts`(`verifyAllImagesBeforePublish`)가 **실사용 호출처 없음**.

할 일: 오토파일럿에서 이미지 확정 직전에 일관성 검사를 게이트로 연결.
불일치 이미지는 1회 재생성, 그래도 실패하면 S7에서 사용자에게 표시.

### S5. 서식·모바일 가독성 — ✅ (점검만 추가)

있는 것:
- 소제목 인용구 (`editorHelpers.insertQuotation`, line/bracket/underline)
- 본문 리치 HTML (`automation/richTextPaste.ts` `buildMobileRichHtml` — 19px, 하이라이트 최대 8개)
- 모바일 줄 균형 (`content/mobileLineBalance.ts`, 360dp 기준), 문단당 최대 3문장 (`sentenceParagraphs.ts`)

할 일: 발행 전 **가독성 리포트**만 추가 (새 서식 엔진 만들지 않음).
문단 길이, 하이라이트 개수, 이미지 간격, 인용구 개수를 숫자로 보여주고 기준 초과 항목만 경고.

### S6. 이전글 연결 — ✅

있는 것: `shared/previousPostPolicy.ts` (같은 블로그·카테고리의 최신 발행글),
발행 직전 재조회(`automation/previousPostRuntimePolicy.ts`), 글 끝 링크 카드(`insertPreviousPostTailBlock`).

결정 5에 따라 같은 카테고리 최신 글을 유지한다 (주제 유사 옵션은 만들지 않음).

### S7. 검토 → 로그인 → 발행 — 🟡

있는 것: `runAutomation` → `NaverBlogAutomation.run()`, 수동 로그인 지원
(`ensureSessionForUser`, 기기 확인·2단계 인증 체크포인트), 발행 직전 세션 재확인.

할 일: 오토파일럿 전용 **검토 화면** (새 renderer 모듈).
- 표시: 선정 근거(S1), 출처 목록(S2), 비평 요약·판정(S3), 이미지 검사 결과(S4), 가독성 리포트(S5), 연결될 이전글(S6)
- 버튼: `수정` / `재생성` / `로그인 후 발행`
- `로그인 후 발행`을 눌러야만 기존 `executeBlogPublishing` 경로로 진입. 그 전에는 브라우저를 열지 않는다.

### S8. 성과 피드백 — ❌ (레드라인 안에서 설계)

§3 참고. 자동 신호와 사용자가 넘겨주는 데이터만 사용.
0. **어드바이저 캡처 이미지 판독** (2026-10-15 결정): 사용자가 직접 올린 어드바이저 캡처에서
   비전 모델로 홈피드 유입 숫자를 읽어 `postMetricsStore`에 `source: 'manual'`로 기록. 앱이 로그인 페이지에 접근하지 않으므로 레드라인 안.
1. **자동(공개 신호)**: 홈판 노출 원장(`homefeed-ledger`)에 **내 블로그 글 URL**이 `seen`으로 잡혔는지 조인
   → 홈판 노출 여부를 로그인 없이 판정.
2. **자동(기존)**: `exposurePoller` 24/48/72시간 통합탭 순위.
3. **수동**: 사용자가 어드바이저에서 본 홈피드 유입 수를 입력 → `postMetricsStore` (`source: 'manual'`).
4. 결과는 `exposureWinnersBlock`(내 노출 승자)과 S1 `topicJudge`의 판단 근거로 되먹임.

## 3. 레드라인: 로그인 통계 자동 수집 금지

`src/analytics/postMetricsStore.ts` 머리말:
> Under NO circumstance do we scrape the logged-in blog statistics page.
> (Kream v. Naver, 2021 — 컴퓨터 업무방해 판례)

크리에이터 어드바이저의 홈판 유입 화면도 로그인 통계 페이지이므로 **자동 수집하지 않는다.**
요청 원안의 "어드바이저에서 홈판 노출 글 전부 분석"은 §2 S8의 공개 신호 + 수동 입력으로 대체한다.

## 4. 새로 만들 모듈 (예상)

파일당 300줄 제한(CLAUDE.md) 준수 — 목표 200줄 이하.

| 모듈 | 위치 (안) | 역할 |
|---|---|---|
| 벤치마크 로더 | `src/analytics/homefeedBenchmarkFeed.ts` | 벤치마크·제목·가이드 공개 JSON 로드 + 캐시 |
| 글감 판단 | `src/homefeedAutopilot/topicJudge.ts` | 후보 점수화 + LLM 상위 3개 제안 |
| 오케스트레이터 | `src/homefeedAutopilot/autopilotRun.ts` | S1~S6 실행, 단계별 결과 기록, S7 전에서 정지 |
| 출처 표기 | `src/content/sourceAttribution.ts` | 출처 정책 검사 + 본문 출처 문구/참고자료 블록 생성 |
| 가독성 리포트 | `src/content/readabilityReport.ts` | 서식 수치 점검 |
| 노출 조인 | `src/analytics/homefeedSelfExposure.ts` | 원장 × 내 발행 글 URL 조인 |
| 검토 화면 | `src/renderer/modules/autopilotReview.ts` | S7 UI |

각 모듈은 vitest 단위 테스트 동반 (`src/__tests__/`).

## 5. 단계별 구현 계획

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **P1** | S1 글감 판단 (파서 확장 + 벤치마크 로더 + `topicJudge`) | ✅ 버튼 한 번으로 글감이 자동 채택되고 근거가 화면에 나온다 |
| **P2** | S2 출처 표기 + 출처 정책 | 생성 글에 출처 문구·참고자료가 들어가고 블로그 출처는 거부된다 |
| **P3** | 오케스트레이터 + S7 검토 화면 (S3 루프 실행 단위 ON 포함) | 글감 선택 한 번으로 검토 화면까지 도달, 발행은 버튼으로만 |
| **P4** | S8 성과 피드백 (원장 조인 + 수동 입력) | 내 글 홈판 노출 여부가 자동 표시되고 S1 근거에 반영된다 |
| **P5** | S4 이미지 게이트 + S5 가독성 리포트 | 검토 화면에 이미지·가독성 결과가 표시된다 |

## 6. 결정 사항 (2026-10-15 확정)

| # | 항목 | 결정 |
|---|---|---|
| 1 | 벤치마크 데이터 경로 | 앱이 `https://leaderspro.kr/data/homefeed-benchmark*.json` 직접 읽기 **승인** |
| 2 | 글감 채택 | 홈판 노출 확률 × 트래픽을 꼼꼼히 분석해 **자동 채택** |
| 3 | 성과 입력 | 숫자 직접 입력 + **어드바이저 캡처 이미지 숫자 판독**까지 |
| 4 | 오토파일럿 엔진 | 구독 CLI 대신 **Claude API 키(조직 프로모션 크레딧)** |
| 5 | 이전글 | **같은 카테고리 최신 글** (기존 정책 유지, 주제 유사 옵션은 만들지 않음) |

## 6-1. P1 구현 내역

| 파일 | 역할 |
|---|---|
| `src/analytics/homefeedBenchmarkFeed.ts` | 벤치마크·제목·가이드 파서 (출처 URL로 조인, `why`의 채널 수 반영) |
| `src/analytics/lewordBoard.ts` | 브리프 `primaryIntent`·`value`·`differentiation` 보존 |
| `src/homefeedAutopilot/topicScoring.ts` | 점수: 수요 30 · 신선도 25 · 트래픽 20 · 우선순위 15 · 반응 10 − 위험 감점, 14일 내 쓴 소재 제외 |
| `src/homefeedAutopilot/topicJudge.ts` | Claude가 상위 8개 중 1개 + 홈판 제목 + 각도 선택, 실패 시 점수 1순위 채택 |
| `src/main/ipc/homefeedAutopilotHandlers.ts` | IPC `homefeedAutopilot:judgeTopic` (10분 캐시, Claude API quality 경로) |
| `src/renderer/modules/homefeedTopicAuto.ts` | `🏠 홈판 글감 자동 선정 (Claude)` 버튼 → 키워드·홈판 모드·추가 요청 자동 입력 + 근거 패널 |

2026-10-15 실데이터(후보 1,000 · 브리프 34)로 점검: 1위 점수 70 — 채널 9곳·6시간 경과·벤치마크 우선순위 최고.

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| 다들 같은 벤치마크를 따라 써서 포화 | `saturated`·문서수 감점, S8 내 노출 데이터 가중치 ↑ |
| 유사문서·저품질 판정 | 블로그 본문/사진 복제 금지, 품질 루프 ON, 사람 검토 필수 |
| 출처 사이트 캡처 차단·변경 | `captureOfficialDocs` 실패 시 캡처 없이 텍스트 출처만 |
| LLM 비용 증가 (판단+비평+검사) | `quality/critique/costLedger.ts`로 글당 비용 기록, 검토 화면에 표시 |
| 보호조치 | 발행은 사용자 PC·수동 로그인·기존 세션 정책 그대로, 지문 위장 없음 |
