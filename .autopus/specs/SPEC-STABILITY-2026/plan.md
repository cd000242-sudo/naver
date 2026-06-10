# SPEC-STABILITY-2026 실행 플랜

> 원칙: **1릴리즈 = 1~3픽스** · 모든 수정은 가드 테스트 선행(RED→GREEN) · 릴리즈마다 spec.md §3의 7개 게이트 전부 통과 · 신규 기능 동결

표기: `R#` = 릴리즈 단위. 예상시간은 코드+테스트+검증 포함.

---

## Phase 0 — 릴리즈 규율 (코드 변경 없음, 즉시 발효)

| 항목 | 내용 |
|------|------|
| 기능 동결 | 안정화 완료(R13)까지 신규 기능/UI 추가 금지. 예외는 사용자 명시 승인만 |
| 커밋 정책 | 번들 "release" 커밋 금지 → `fix:` 단위 커밋 + `chore: 버전업` 분리 (bisect 복구) |
| 롤백 경로 | 다운로드 페이지에 직전 안정 버전 링크 상시 유지. 신규 릴리즈는 본인 계정 1일 운용 후 공개 |
| 라이브 스모크 | 패키징 후 실제 실행: 풀오토 1건 + 반자동 1건 발행 → 발행물 7항목 검수 (제목/본문/구분선/이전글카드/CTA/이미지 순서/썸네일) |

---

## Phase 1 — R1 (v2.11.33): 이번 세션 수정 출고 ✅ 코드 완료

### 포함 수정 (코드/테스트 완료, 게이트 통과: vitest 2,885 GREEN · lint 0 err · build OK)

1. **본문 구분선 보존** — `src/automation/bodyArtifactCleanup.ts` 신설.
   기존 정제 정규식이 본문 속 ━ 구분선 줄을 통삭제하던 것을 "CTA가 붙은 구분선/말미 잔여 구분선만 제거"로 축소.
   적용: `editorHelpers.ts` applyStructuredContent 자동·반자동 두 경로.
2. **이전글 구분선 ━ 복원** — `editorHelpers.ts:27` `PREVIOUS_POST_SEPARATOR`를 하이픈 62자 → 앱 표준 ━ 38자로 통일 (v2.11.27 회귀).
3. **꼬리 블록 포커스 재고정** — 리치 붙여넣기/이미지 단계가 키보드 포커스를 뺏으면 구분선·CTA·이전글·해시태그 타이핑이 허공에 들어가던 간헐 누락 차단. `focusLastEditableLine` export 후 ① CTA/해시태그 꼬리 단계 진입 직전 ② `insertPreviousPostTailBlock` 진입 직전 재고정.
4. **발행 전 서버 세션 게이트 배선** — `naverBlogAutomation.ts` `runPostOnly`: 브라우저 재사용 시 로그인 검증을 통째로 건너뛰던 경로에 `browserSessionManager.ensureServerSession()` 실측 검증 추가. 만료 시 자동 재로그인 (v1.6.0 설계가 8개월간 미배선이었음).
5. **기준선 정상화** — `costInvariants.test.ts` 스테일 기대값(재시도 3→0 정책 미반영) 수정. 전체 suite 0 fail 복구.

### 신규 가드 테스트 (13개)
- `bodyArtifactCleanup.test.ts` (7) — 단독 구분선 보존/CTA 구분선 제거/말미 구분선 제거 등 기능 테스트
- `richPasteTailWiring.test.ts` (6) — 구분선 상수·정제 경유·포커스 재고정·세션 게이트 배선 정적 가드

### R1 라이브 검증 체크리스트 (출고 전 필수)
- [ ] 이전글 설정된 글 발행 → 발행물에 ━ 구분선 + 후킹문구 + 제목 + **링크카드** 모두 표시
- [ ] CTA 설정된 글 발행 → ━ 구분선 + 📎 문구 + 링크카드 표시
- [ ] 본문에 구분선이 있는 글 → 발행물 본문 중간 구분선 유지
- [ ] 연속발행 2건째 로그에 `✅ 발행 전 서버 세션 유효 확인` 출력
- [ ] 세션 만료 시뮬레이션(브라우저 열린 상태로 네이버 쿠키 삭제) → 발행 시작 시 `⚠️ 서버 세션 만료 감지 — 재로그인` 후 자동 복구
- [ ] 기존 다중계정 1쌍 발행 정상 (이전글 중복 삽입 없음 — 중복체크 제거는 의도된 동작이므로 유지함)

---

## Phase 2 — R2: Pre-publish Assertion (반쪽 발행 구조적 차단) ✅ 코드 완료 (2026-06-10, 관찰 모드)

> 사용자 질문 "이런 오류도 잡히는 거죠?"에 대한 구조적 답. 앞으로 어떤 회귀가 나도 **누락된 글이 발행되는 일 자체**를 차단한다.

- 신설: `src/automation/prePublishAssertion.ts` (≤300줄, 순수 함수 + frame evaluate)
- 발행 버튼 클릭 직전 에디터 DOM 실측:
  - 제목 길이 > 0 · 본문 ≥ 최소 글자수 · 이미지 개수 == 계획 수(`resolved.images.length`)
  - 이전글/CTA 기대 시(`previousPostUrl`/`effectiveCtas`) 링크카드 ≥ 기대수 · 구분선 ≥ 기대수
  - 내부 마커 누출 스캔 (`[원본 텍스트]`, `[구분선]`, 프롬프트 마커)
- **1주차: 관찰 모드** — 불일치 시 경고 로그+카운터만 (false positive 계측). **2주차(R6): 차단 모드** — 불일치 시 발행 중단 + 사유 명시 (silent 진행 금지)
- 가드: jsdom DOM 시뮬레이션 단위 테스트 + wiring 정적 테스트
- 회귀 위험: 낮음(순수 추가형). 관찰 모드 선행으로 오탐 차단.

## Phase 3 — 이미지 파이프라인 3건 (사용자 보고 S3·S4·S5)

### R3: 소제목 이미지 빈 결과 (S3) — 예상 1일
- `src/image/nanoBananaProGenerator.ts` L726/738/1700: 실패를 null로 삼키고 빈 배열 반환 → **구조화 에러(원인 코드+provider+사유) 전파**. 사용자 로그에 "비어있습니다" 대신 실제 원인(쿼터 소진/429/세션 만료) 표시
- 재시도 2회가 같은 키·같은 파라미터 반복으로 무의미 → 재시도 1회차에 **API 키 로테이션/세션 갱신** 강제
- provider 자동 전환은 **자동 폴백 금지 정책 준수**: 무인(풀오토) 모드용 "이미지 엔진 대체 허용" 옵트인 설정(기본 OFF) 신설, ON일 때만 2차 실패 시 전환 + 로그 명시
- 가드: 빈 결과 경로 단위 테스트(에러 전파), 재시도 시 키 로테이션 호출 검증

### R4: 반자동 이미지 뒤섞임 (S4) — 예상 1~2일

> **2026-06-10 라이브 증거 확보**: 같은 글(소제목 7개)에 dropshot 런과 openai-image 런이 ~53초 간격으로 **동시 진행**되는 로그 실측 (각자 [N/7] 카운터로 14장 생성 — 비용 2배 + 매핑 오염 후보). `generateImagesForAutomation`(multiAccountManager.ts:361)에 중복 실행 가드 없음 + 호출 경로 다수(연속발행 직접 / aiFallbackFn 주입 / 풀오토) + provider 해석 소스 2개(fullAutoImageSource vs globalImageSource). 진단 계측(run #태그 + 호출자 스택 기록) 적용 — 다음 재현 로그로 이중 트리거 경로 확정 후 단일 비행(single-flight) 가드 설계.
- 원인: heading 문자열 키 변이(이모지 배지/넘버링 strip 불일치) 시 위치 인덱스 리매핑 폴백이 엉뚱한 소제목에 배정
  - `imageManagerCore.ts:224` (인덱스 리매핑) · `publishingHandlers.ts:1916-1935` (발행 직전 sync) · `naverBlogAutomation.ts:8022-8100` (insertImagesAtHeadings)
- 수정: ① 이미지 메타에 `headingIndex` + 정규화 키 **동시 저장·동시 검증** ② 발행 직전 sync에서 매칭 실패 항목은 **폴백 금지 — 스킵 + 경고 로그** ③ 삽입 직전 textContent 일치 재확인
- 가드: heading 추가/삭제/배지 변형 시나리오 단위 테스트 (imageManagerCore는 renderer 모듈이라 jsdom 테스트 가능)

### R5: 풀오토 썸네일 이미지관리 공란 (S5) — 예상 1일
- 원인 1순위: 합성 썸네일이 웹 URL/임시 경로 그대로 등록 → 그리드 로드 실패 (`naverBlogAutomation.ts:9586`, `fullAutoFlow.ts:542-554`, `imageManagerCore.ts:854`)
- 수정: ① 썸네일 **로컬 저장 후 로컬 경로로 등록** (웹 URL이면 다운로드 강제) ② `syncGeneratedImagesArray`(515-547) 썸네일 키 폴백(`'🖼️ 썸네일'`/`'썸네일'`/isThumbnail) ③ 그리드 `onerror` 시 1회 재해석
- 가드: 등록 경로 단위 테스트 + 라이브에서 이미지관리 탭 첫 슬롯 표시 확인

## Phase 4 — R7: 세션 keepalive 구조 (S2 잔여) — 예상 1일

- `browserSessionManager.ts:1026`: keepalive가 `activeAccountId`(=발행 중 가정) 계정을 영구 skip → 단일계정 사용자는 **keepalive가 사실상 0회 동작** → 서버 TTL 만료. R1 게이트가 증상은 막지만(만료 시 자동 재로그인) 근본은 세션을 살려두는 것
- 수정: `SessionInfo.publishInProgress` 플래그 신설, automation이 발행 시작/종료에 마킹(`beginPublish`/`endPublish`), keepalive는 **실제 발행 중에만 skip**
- locked 세션 reconnect 카운터(`consecutiveKeepaliveFails`) 동작 검증 + 종료 race(`isPinging`) 보강
- 가드: 타이머 mock 단위 테스트 (발행 중 skip / 유휴 시 ping / 만료 감지 3회 전이)
- 회귀 위험: 중 — 발행 중 ping 오발동 시 타이핑 간섭 가능 → 플래그 기본값은 보수적으로(세션 보유 = 발행 중 간주) 두고 마킹이 확인된 경로부터 해제

## Phase 5 — 에러 삼킴 + 중복 경로 정리 (R8~R12, 릴리즈 5회 분할) — 예상 1.5주

- automation 폴더 `catch(() => null/false/{})` **87건 전수 분류**:
  - SPOF(발행 무결성 훼손) → throw + Pre-publish Assertion 연동
  - 복구 가능 → 1회 재시도 + 실패 시 명시 로그
  - 무시 가능(장식적) → 경고 로그 + 운영 대시보드 카운터
- 분할 기준: R8 publishHelpers → R9 editorHelpers → R10 imageHelpers → R11 naverBlogAutomation 발행부 → R12 잔여
- `insertHorizontalLine()`(naverBlogAutomation.ts:9097) 버튼 미발견 시 silent skip → **━ 텍스트 구분선 폴백** (선 누락 0%)
- 중복 구현 통합: `smartTypeWithAutoHighlight` (naverBlogAutomation vs editorHelpers 사본) → typingUtils 단일화. 이전글 삽입도 editorHelpers 단일 경로 확인
- **공유 함수 명시적 입력화 (R13 핵심 — "하나 고치면 다른 곳이 터지는" 구조의 근본 처방)**
  - 원칙: 2곳 이상에서 호출되는 함수는 localStorage/전역 상태를 내부에서 직접 읽지 않는다. 동작을 바꾸는 입력(모드·provider·플래그)은 **호출자가 명시적으로 전달**하고, 해석은 각 플로우 진입점에서 1회만 수행한다
  - 실증(6/10): `generateImagesForAutomation`의 숨은 입력(thumbnailOnly/headingImageMode/provider 폴백 localStorage 직독)이 썸네일 오진·이미지 이중 생성·provider 불일치 3건의 공통 뿌리였음
  - 잔여 감사 대상: generateImagesForAutomation의 provider/headingImageMode 내부 해석, `fullAutoImageSource` vs `globalImageSource` 이원 해석, getSubImageMode 소비처 전수
  - 가드: **호출자 매트릭스 테스트** — 공유 함수마다 "어떤 플로우가 어떤 입력으로 호출하는가"를 정적으로 잠금 (thumbnailOnlyScope.test에서 시작한 패턴의 일반화)
- 각 릴리즈: 해당 파일 가드 테스트 + 라이브 스모크

## Phase 6 — 릴리즈 게이트 자동화 (앱 코드 아님 — Phase 2~5와 병행 가능) — 예상 2~3일

1. **번들 식별자 충돌 스캔** 강화 (`scripts/copy-static.mjs`): top-level 식별자 중복 + undefined 참조 스캔 → 빌드 FAIL (런타임 전용 회귀의 주범)
2. **IPC 계약 검증** `npm run lint:ipc`: main.ts `ipcMain.handle/on` 채널 ↔ renderer `invoke/send` 채널 대조 → 불일치 시 FAIL
3. **self-test 확장**: 번들 헬스(모듈 초기화) + 핵심 IPC 핸드셰이크
4. pre-commit 훅: 변경 파일 10개 초과 시 경고 (번들 커밋 방지)

## Phase 7 — 플로우별 파이프라인 분리 (사용자 핵심 의도: "풀오토는 풀오토, 연속은 연속, 다중계정은 다중계정")

> 목표 상태: 각 발행 플로우가 **자기만의 검증 가능한 파이프라인**을 갖고, 공유되는 것은
> 숨은 상태가 없는 순수 코어(글생성/이미지생성/에디터 조작)뿐이다. 한 플로우를 고치는
> 일이 다른 플로우를 건드릴 수 없는 구조.

1. **PipelineConfig 도입**: 각 플로우(풀오토 단일/연속발행/다중계정) 진입점에서 설정을
   **1회 해석**해 명시적 config 객체로 하위 전체에 전달. 하위 코드의 localStorage/전역
   직독 전면 금지 (R13 명시적 입력화의 완성형)
2. **공유 코어 순수화**: 글생성·이미지생성·에디터 조작을 "입력→출력"만 있는 모듈로 —
   플로우는 코어를 조립만 한다. 코어 변경 시 호출자 매트릭스 테스트가 3개 플로우 영향을
   전부 드러냄
3. **플로우별 라이브 하네스 3종**: tmp/tail-typing-live-test.cjs에서 검증된 패턴을
   풀오토/연속/다중계정 각각의 1분 검증 스크립트로 확장 — "이 플로우만 빠르게 확인"이
   가능해짐 (네이버 개편 조기경보 겸용)
4. god file 분해: 발행부 → 상태 머신(`EDITING → PRE_PUBLISH_CHECK → PUBLISHING →
   PUBLISHED`). **characterization 테스트 선행 필수** — 분해가 회귀를 만들지 않게
5. 커버리지 목표: 발행 파이프라인 핵심 경로 20% (현재 3.7%)
6. 셀렉터 원격 패치(remoteUpdate.ts) 운영 점검 — 네이버 UI 변경 무중단 대응

## Phase 8 — 성능/쾌적성 ("앱이 과부하" 처방, SPEC-PERF-2026 연계)

1. **localStorage 비대 해소 (즉효)**: blob IPC 복구(13b29f9a)로 신규 이미지는 blob
   스토어로 가지만, 기존 base64 잔재가 렌더러 메모리/GC를 짓누름 → migration:imageModelV1
   실행으로 이관 (이번 라이브에서 NUCLEAR CLEANUP 연발이 그 증상)
2. SPEC-PERF-2026 P0 잔여 + P2(Worker offload) 진입 — 무거운 연산을 렌더러 밖으로
3. 번들 다이어트: renderer 단일 스코프 2.3MB — 모듈 lazy 초기화 검토 (식별자 충돌
   스캔과 병행)
4. 측정 기준: 발행 1건 소요시간 / 유휴 메모리 / UI 반응성(입력 지연) — 개선 전후 실측
   비교를 릴리즈 노트에 기록 (추정치 금지)

---

## 타임라인 요약

| 주차 | 릴리즈 | 내용 |
|------|--------|------|
| 1주차 | R1 | ✅ 코드 완료 — 라이브 검증 후 출고 |
| 1주차 | R2, R3 | Pre-publish(관찰) + 이미지 빈결과 |
| 2주차 | R4, R5, R6 | 뒤섞임 + 썸네일 + Pre-publish 차단 전환 |
| 2~3주차 | R7, R8~R10 | keepalive 구조 + 에러 삼킴 1~3차 |
| 3~4주차 | R11~R13 | 에러 삼킴 4~5차 + 중복 통합 / Phase 6 병행 |
| 4주차~ | — | 2주 무회귀 운영 관찰 → SPEC 종료 판정 |
