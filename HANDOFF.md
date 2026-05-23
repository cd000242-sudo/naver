# HANDOFF — 네이버 자동화 안전성 진단 (글 검색 누락 / 계정 보호조치)

> 새 세션이 이어받기 위한 인수인계 문서. 작성 2026-05-23.

## 목적

better-life-naver 툴에서 ① 발행한 글이 네이버 검색에서 누락(색인 제외)되고
② 계정·블로그가 보호조치(제재)당하는 위험을 줄인다.
둘 다 네이버 서버측 판정 — 100% 방지는 불가, **위험 최소화**가 목표.

## 현재 상태

- 브랜치: `fix/thumbnail-only-body-duplication`
- 최근 커밋:
  - `ec25c742` feat(image): gpt-image-1.5 모델 + 품질 선택 (완료·검증됨)
  - `41245e13` fix(automation): 로그인 직후 세션 워밍업 연결 — **진단 A1 (완료)**
  - `68a0a3bf` fix(image): 썸네일 본문 중복 배치
- 6개 에이전트(30팀) 진단 완료 — 아래 작업 목록 도출.

## 작업 목록 (우선순위)

### 완료
- [x] **A1** — `sessionPersistence.warmupSession()`(죽은 코드)를 `loginToNaver()`
  신규 로그인 성공 직후에 연결. 커밋 `41245e13`. 검증: tsc 0 에러. E2E 미검증.
- [x] **C1** (2026-05-23) — `continuousPublishing.ts` `processNextInQueueEnhanced`
  스케줄 블록을 try/catch로 보호. 예외 시 안전 폴백 60초로 다음 항목 재예약 →
  큐 유실 방지. 발행부(이미 보호됨)는 미변경. 검증: tsc 0 에러.
- [x] **A3** (2026-05-23) — 본문 타이핑 인간화. `loginKeyType`의 `keyboard.down/up`은
  한글 불가 → `typingUtils.humanKeyboardType`(글자 단위 `keyboard.type` + 가우시안
  분산, 평균 ~40ms "빠른 인간형") 신규. `editorHelpers.ts`·`typePlainContent` 연결.
  검증: tsc 0 / vitest 1991 통과. E2E 미검증.
- [x] **B1·B3** (2026-05-23) — 신호 과다 완화.
  B3: `contentOptimizer.ts` E-E-A-T 30%→10%, 인간표현 15%→5%, floor 3→1.
  B1: `ctrCombat.ts` HOMEFEED_HOOKS 중 `aiCliche` 금지어(대박/충격) 든 훅 5개를
  신뢰형으로 교체 (좁은 범위). 회귀 가드 테스트 신규. 검증: tsc 0 / vitest 1994 통과.

### 남은 우선순위 — 다음 세션에서 진행
- [ ] **A5** — `multiAccountManager.ts:3994` 발행 간격에 계정별·항목별 ±40% 랜덤 jitter.

### 추가 발견 약점 (중위험 — 후순위)
- **A2** 멀티계정 동일 IP + 거의 동일 기기지문 → 연쇄 제재. `proxyManager.ts:54`(프록시 기본 OFF),
  `browserSessionManager.ts:190`(지문 풀 4×4).
- **A4** fingerprint 모듈 이중화·모순. `browserSessionManager` vs `naverBlogAutomation.ts:370`의
  `getAccountConsistentProfile` 별개 존재, WebGL 이중 주입, UA와 UA-CH 불일치.
- **A6** 본문 작성 전 구간 마우스·스크롤 이벤트 0건 (ghost-cursor가 로그인 전용).
- **B2** `imageFormatPipeline.ts:196` EXIF 일괄 완전 제거 = AI 시그니처. AI 도구 흔적만 선택 제거로.
- **B4** `contentGenerator.ts:2667` 유사 소제목("관리 팁/방법/법") 중복 미감지.
- **B5** 고정 키워드 밀도("3~5회")·고정 강화 확률(30%) → 대량 발행 시 패턴화.
- **C2** `continuousPublishing.ts` V1/V2 큐 이중 경로 혼선.
- **C3** `publishingHandlers.ts:1244` multiAccount `result.success`만 검사(`results[0].success` 누락).
- **세션** `sessionPersistence.ts:141` `cookies.json` 평문 저장 → `safeStorage` 암호화 권장.

## 작업 규칙 (필수)

- god-file 코드베이스 — **회귀 cascade 절대 금지**. 1릴리즈당 fix 1~3건만, 회귀 검증 필수.
- 진단 에이전트가 제시한 효과 수치(예 "누락 30%↓")는 **미검증 추정** — 메커니즘만 신뢰.
- 모든 진단은 코드 정적 분석 기반 — 실제 누락 글 URL·제재 사례 데이터가 있으면 우선순위 재조정.

## 작업트리 미커밋 (무해 — 정리는 선택)

- `pricing.html` / `pricing_source.html` — 토스 키 편집. 배포 안 되는 루트 사본(배포본은
  `payment-page/pricing.html`, 이미 반영됨). 무해.
- `.env.pre-pack-backup` 등 삭제 2건 — 세션 시작 전부터 존재. **손대지 말 것.**

## 별도 트랙 — 토스 결제 (사용자 작업 대기 중)

- 결제 페이지 라이브 키 배포 완료 (커밋 `9d587c22`, 계약 완료 상점의 `live_ck_` 클라이언트 키).
- **사용자 잔여 작업**: GAS 스크립트 속성 `TOSS_SECRET_KEY`를 계약완료 상점의 `live_sk_` 키로
  교체 → 결제페이지 하드새로고침 → 최저가 상품으로 소액 실결제 1건 테스트.
- 토스 보안 키(웹훅용)는 현재 결제 연동에 불필요.

## 다음 세션 시작 방법

이 파일을 읽게 한 뒤 "C1부터 진행" 또는 "A3를 /plan으로 설계" 식으로 지시.
큰 항목(A3, B1·B3)은 반드시 `/plan` 먼저.
