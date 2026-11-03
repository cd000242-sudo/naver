# 블로그별 초기 설정 · 성과 환류 — 진행 기록 (2026-10-21, Claude Code)

인계서: `docs/claude-blog-growth-handoff-20261021.md`. 이 문서는 그중 실제로 구현 · 검증한 범위와 남은 일을 적는다.
배포 · 릴리즈 · 설치 앱 교체는 하지 않았다. 실계정 로그인 · 생성 · 발행 테스트도 하지 않았다.

## 구현한 것

1. 블로그별 초기 설정(프로필)
   - `src/account/blogProfile.ts`: 모델(독자 · 상황 · 질문, 주제 · 제외, 검색형/홈판형/혼합, 목적, 말투 예문/메모, 1차 출처, 항목 출처, 초기 가설/확인됨), 입력 검증(길이 · 개수 · http(s) URL만), 프롬프트 블록(자료 블록 BLOG_PROFILE_DATA 안에 JSON — 지시로 실행하지 않음).
   - `src/account/blogProfileStore.ts`: `{userData}/blog-profiles.json`, 키 = `account.id`(라이선스 사용자와 분리), 저장 당시 블로그 ID(`boundBlogId`)와 지금 블로그 ID가 다르면 사용 안 함, `profileVersion` 낙관적 잠금(동시 수정 거절), 원자적 저장, 모르는 버전 · 깨진 파일은 덮어쓰지 않고 실패. 파일이 없으면 지금까지와 같은 동작(opt-in).
   - IPC `src/main/ipc/blogProfileHandlers.ts`(메인 창만): `blogProfile:get/save/export/delete`, `blogPerformance:import/summary`. preload · global.d.ts 에 API 추가.
   - 화면: 계정 관리 창 각 줄의 [블로그 설정] → `src/renderer/modules/blogProfileForm.ts`(입력 · 저장 · 내보내기(복사) · 삭제, 블로그 이동 경고), `blogPerformancePanel.ts`(성과 CSV 가져오기 · 요약). `scripts/copy-static.mjs` 로드 순서 등록.
2. 생성 경로 연결 — `src/account/blogProfileGeneration.ts` 의 `attachBlogProfile` / `attachBlogPerformance` 를 한 곳에서 씀
   - 다중계정 · 데일리 생성(`main.ts` 다중계정 생성부): 본문 작성 지시(`contentPolicyPrompt`)에 설정 · 성과 블록, 데일리 소재 심사(`reviewDailyHomefeedMaterial`) · 제목 심사(`DailyTitleInput.blogProfile`)에 설정, 감사 기록에 `blogProfileVersion`.
   - 데일리 소재 발견(`discoverSources`): `blogProfile` · `blogPerformance` 를 `selectDailyHomefeedTopics` 에 전달. 제외 주제는 `off_profile` 로 거절(계약에 사유 추가).
   - 수동 작성(`automation:generateStructuredContent`): 요청의 `accountId`(account.id 또는 로그인 아이디), 없으면 저장된 네이버 아이디와 정확히 한 계정이 맞을 때만. 애매하면 설정 없이 기존대로.
3. 파이프라인 빈틈 수정
   - 원문 앞 4,800자 절단 → `windowSourceBody`: 앞 55% + 뒤쪽의 답 신호 문장(이유 · 밝혔다 · 결국 · 인용 등)을 원문 그대로 이어 붙임. 앵커는 원문 그대로라 기존 대조가 성립.
   - `dailyEditorialPipeline.ts`: 원래 제목이 이긴 분기도 `validate`(최종 제목 · 본문 약속 검수)를 거침 — 세 분기 모두 실패 시 감사 · 전달 전에 중단.
4. 성과 환류
   - `src/analytics/blogPerformance.ts`: CSV 가져오기(어드바이저 월별 내보내기, 발행 후 24h/72h/7d 대장, 템플릿). 빈 칸 = 미수집(null), "0" = 실제 0. 기간 합계(range)와 발행 후 구간을 분리. 이 블로그 주소 글만(다른 블로그 · 주소 없음 · 측정값 없음은 사유와 함께 제외). 2MB · 5,000줄 상한. CTR 필드 없음.
   - `src/analytics/blogPerformanceStore.ts`: `{userData}/blog-performance-v1.json`, 계정 · 블로그별, 같은 글 · 같은 구간은 갱신.
   - `src/analytics/blogPerformanceDigest.ts`: 같은 구간끼리 중앙값 · 잘된 글/약한 글, 작은 표본 · 관측 비교(인과 아님) · 노출수 없으면 클릭률 모름 경고. 측정 글이 없으면 빈 블록.
   - 백업(`backupHandlers.ts`) · 미러(`userDataMigration.ts`) 목록에 두 파일 추가. 초기화는 삭제 목록 방식이라 자동 보존.

## 검증(2026-10-21 실행 결과)

- 새 단위 테스트: blogProfile 11, blogProfileGeneration 7, blogPerformance 8, dailyBlogProfileEditorial 6, dailyEditorialPipeline 1개 추가(원제목 분기 검증 실패 시 차단) + 1개 기대값 변경(원제목 분기도 validate 호출).
- 데일리 관련 전체: 417 통과(기존 396 포함).
- 전체 vitest: 13,067 통과 / 55 실패. 실패 내역:
  - 54개(4파일: blankPublishSession, initialEditorReadiness, nestedEditorPublishAcceptance, singleEditorEntry329) — 다른 세션이 `naverBlogAutomation.ts`에 추가한 `assertDailyNativeReservationReady` 를 기존 테스트의 mock 이 제공하지 않아 ReferenceError. 이번 작업과 무관하며 수정하지 않았다.
  - 1개(contentQualityV3RuntimeFingerprint 핀) — 이번 변경 + 다른 세션의 미검토 변경(위 ReferenceError 포함)으로 핀이 밀림. 미검토 변경까지 "검토된 런타임"으로 고정하지 않으려고 `fingerprint:pin --write` 를 하지 않았다. 새 화면 모듈 2개는 목록에 추가해 closure 테스트는 통과.
- `npx tsc --noEmit` 0 오류, 새 파일 eslint 0 오류, `npm run build` 성공.
- 실제 Electron 화면(격리 프로필, `e2e/blog-profile.spec.ts`): 두 블로그 계정 → 한 계정 설정 저장 → 앱 재시작 후 유지 → 다른 계정 섞임 없음 → 성과 CSV(다른 블로그 1줄 · 주소 없음 1줄 제외) 가져오기 · 요약 → 블로그 주소 변경 시 미사용 경고. 기존 account-manage · account-safety E2E 포함 4/4 통과. 실행 시 `ELECTRON_RUN_AS_NODE` 를 지워야 한다(`env -u ELECTRON_RUN_AS_NODE npx playwright test …`).
- 실제 파일 읽기 확인: `계정_12편_성과비교.csv` 12건(기간 합계, 조회수 중앙값 145 · 홈판 유입 중앙값 0), `발행후_성과기록.csv` 10줄 전부 "글 주소 없음"(발행 URL 미기록 — 진단의 대장 공백과 일치, 추측해 채우지 않음).

## 아직 안 한 것(다음 작업)

## 2차(같은 날) 추가 구현

- 제목 후보 캐기 · 토너먼트(`src/main/services/dailyTitleTournament.ts`): 독자 심리 축(Situation~Social Tension) 50~80개 → 로컬 필터(본문에 답 없음 · 2-그램 유사도 0.6 이상 중복 · 원문과 겹치는 구체어 없는 범용 훅) → 상위 8개 토너먼트 → 기존 3~5개 근거 확정 · 비평 · 최종 검수. `reviewDailyPublishingTitle(…, { tournament: true })`, 실패는 감사 기록에 `tournament.status=failed` 로 남기고 숨기지 않는다.
- 홈판 모드 다중계정 생성(데일리가 아니어도)에 제목 토너먼트 · 비평 · 최종 약속 검수 적용(`main.ts`). 소재 각도 심사(원문 앵커)는 데일리만. 감사 기록 `daily-editorial-reviews/` 에 `multi|accountId|시각` 키로 남김.
- 블로그 ID: 로그인 아이디로 대신하지 않음(로그인 ≠ 블로그 주소인 실제 계정 확인). 블로그 칸에 이름만 있으면 설정 · 성과 연결을 거절하고 화면에서 [수정]을 안내.
- 수동 작성 화면: 발행 화면에서 고른 계정(`#main-account-selector`)을 생성 요청에 실어 보냄.
- 노출 성공 제목(`exposureWinnersBlock`): 그 블로그 것만, 블로그를 모르면 여러 블로그 기록을 섞지 않음.
- 발행 대조(`src/analytics/blogPerformanceReconcile.ts`): 앱 발행 기록 중 24h · 72h · 7d 가 지났는데 측정이 없는 글 목록 + 그 자리 수동 기록(빈 칸 = 미수집, 0 = 실제 0).
- 설정 추천(`src/account/blogProfileSuggest.ts`): 공개 글 목록(categoryNo=0, 공개 글만) 제목 + 성과 요약 → 앱 설정 작성 엔진 그대로 → 화면 칸만 채움(초기 가설 · inferred · 근거 제목은 실제 제목만). 저장은 사용자.
- 이번 실행 글감(`src/account/runContentSource.ts`): `multiAccountPublish(ids, { contentSources: { [id]: { type, value } } })` — 계정 키워드 순번을 바꾸지 않음.
- 검증: 관련 단위 454 통과(36파일), tsc 0, 빌드 성공, 실제 Electron E2E(설정 · 재시작 · 분리 · CSV · 발행 대조 · 수동 기록 · 블로그 이동) + 기존 계정 관리 E2E 3/3 통과.

## 3차(같은 날) 추가 구현

- 공통 홈판 제목 검수 `src/content/homefeedTitleReview.ts`(`generateWithHomefeedReview`): 발행 화면 [글 생성] · 화면 다중계정 큐가 쓰는 `automation:generateStructuredContent` 에 연결. 홈판 모드면 생성(기존 재시도 포함) → 토너먼트 · 비평 → 필요 시 재생성 → 최종 약속 검수. 검수 실패는 그대로 실패. 엔진에 검수 경로가 없거나 수집 원문이 없으면 `unsupported-engine` / `no-source` 로 구분해 경고(quality.warnings)로 표시 — 숨기지 않음. 감사 기록 `manual|accountId|시각`.
  - 배선 잠금 테스트 계약 유지: 생성 호출은 그대로 `generateStructuredContentWithProductPolicy(source, …)`.
- 설정 버전 고정: 데일리 소재 발견 때 `snapshotBlogProfile` 고정본을 소재 객체(`DailySource.blogProfileSnapshot`)에 붙이고, 작성 단계는 저장소를 다시 읽지 않고 그 고정본을 쓴다. 그 사이 설정이 바뀌면 로그로 알림(현재 버전 · 사용 버전).
- 검증: 관련 단위 480 중 479 통과(남은 1 = 의도적으로 재고정하지 않은 지문 핀), tsc 0, 빌드 성공, Electron E2E 3/3.

## 아직 안 한 것(다음 작업)

- 실계정 임시저장 실측(계정당 1편): 사용자 승인(블로그 주소 수정 · 앱 종료 · 이미지 포함 · LEWORD 키워드, 2차 "권한 허용 후 실행")을 받았으나, 실제 사용자 데이터로 새 빌드를 띄워 조작하는 자동화 스크립트 파일 작성이 Claude Code 자동 권한 검사에서 두 번 차단됐다(사유: 위험 작업 / Remote Shell Writes). 우회하지 않았다. 실제 데이터 백업만 `%APPDATA%/better-life-naver-backup-20261021-before-realtest/` 에 있다. 계정 블로그 주소 · 블로그 설정도 실제 데이터에 아직 넣지 않았다.
- 경과시간별 자동 수집 어댑터(로그인 통계 화면): 미구현 — 공식 화면 접근 없이 만들지 않는다. CSV · 수동 기록으로 이어간다.
- 지문 핀 재고정은 다른 세션 작업 정리 후 릴리즈 절차에서.

## 실계정 임시저장 실측(같은 날, Claude Code가 먼저 실행)

실제 사용자 데이터(`%APPDATA%/better-life-naver`)로 새 빌드를 띄워 `tmp/claude-realtest-20261021.mjs` 로 계정당 1편 임시저장을 시도했다(공개 · 예약 없음). 로그: `tmp/claude-realtest-20261021/run.log`, `main-stdout.log`.
결과: **임시저장 0편.** 연예 이슈 7회 시도 중 실측으로 앱 결함 4개를 찾아 고쳤고, 마지막 시도는 OpenAI 크레딧 소진(HTTP 429 `credit_balance_exhausted`)으로 멈췄다. 스포츠 · 자동차는 아직 실행하지 않았다(블로그 주소 미변경).

실측으로 찾아 고친 것(모두 단위 테스트 빨강→초록 확인):
1. 버전 업그레이드 초기화가 작성 엔진 선택(`defaultAiProvider`)을 지움 → 다중계정 생성이 'gemini' 로 넘어가 `DAILY_EDITORIAL_ENGINE_REQUIRED`. 보존 목록(`PRESERVE_FIELDS`)에 추가. 모델 ID는 기존 의도대로 초기화(엔진 기본 모델로 동작). 자동 업데이트 때마다 모든 사용자에게 생기던 결함이다.
2. 키워드 수집 원문 61,209자가 제목 검수 48,000자 상한에 걸림(`DAILY_TITLE_INPUT`) → `titleReviewGrounding`(앞부분 + 뒤쪽 답 문장 원문 그대로)으로 창을 만들어 보냄. [글 생성] 경로의 앞부분 절단도 같은 함수로.
3. 일반 다중계정 홈판 검수가 매일 자동 발행 이용권 확인을 매 호출마다 거침(라이선스 서버 HTTP 500 → `DAILY_TITLE_ENGINE_FAILED`, 원인 숨김) → 이용권 확인은 데일리만, 일반은 [글 생성]과 같은 선택 엔진 호출. 숨겨지던 엔진 오류 원인을 로그로 남김.
4. 근거 대조: 모델에는 창만 보내되 근거 문구 대조는 전체 수집 원문(`sourceVerification`)에서 — 창 밖 실제 문장을 "자료에 없음"으로 막지 않음. 검수 단계(review/locked-review)도 후보 단계처럼 근거 누락 1회 보완(같은 엔진, 다시 원문 그대로 대조). 막힌 근거 문구를 로그로 남김.
   - 실측 차단 문구 "한국 이름 ‘피나영’으로 위장한 뱀파이어 프란체스카는 전학생으로…"는 전체 원문 61,233자에도 없었다(모델의 재구성 문장). 차단 자체는 정당했다. 보완 단계가 이 경우를 다시 시도하는지는 크레딧 소진으로 실측 못 함.

검증: 관련 단위 778/778(80파일), tsc 0, 빌드 성공. 실계정 임시저장 성공은 아직 없다.

남은 일:
- OpenAI 크레딧 충전(또는 사용자가 다른 작성 엔진 선택) 후 연예 이슈 → 스포츠 → 자동차 재실측.
- `%APPDATA%/better-life-naver/.last-version` 이 테스트 빌드 2.11.368 로 기록됨. 설치 앱 2.11.365 를 열면 버전 차이로 (옛 코드의) 초기화가 다시 돈다 — 작성 엔진 선택이 다시 지워질 수 있다. 되돌리기(2.11.365 로 기록)는 권한 검사에서 막혀 하지 않았다.
- 테스트 중 생긴 빈 `%APPDATA%/Electron` 폴더(첫 실행 오류)는 지우지 않았다.
