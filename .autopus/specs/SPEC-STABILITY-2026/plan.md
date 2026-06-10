# SPEC-STABILITY-2026 실행 플랜

> 원칙: **1릴리즈 = 1~3픽스** · 모든 수정은 가드 테스트 선행(RED→GREEN) · 릴리즈마다 spec.md §3의 7개 게이트 전부 통과 · 신규 기능 동결

표기: `R#` = 릴리즈 단위. 예상시간은 코드+테스트+검증 포함.

## R 공통 표준 절차 (모든 릴리즈 단위에 동일 적용 — 아래 각 R에서는 차이점만 기술)

1. **진단 고정**: 수정 전 원인을 file:line으로 문서화 (research.md 추가)
2. **RED**: 가드 테스트 먼저 작성 → 실패 확인 (기능 테스트 불가 영역은 정적 wiring 가드)
3. **수정**: 최소 변경 — 변경 라인이 전부 해당 R의 목적으로 소급되는지 self-check
4. **게이트**: vitest 전체 0 fail → lint 0 errors → build+번들 검증 → (자동화 영역) 라이브 하네스
5. **커밋**: Lore 형식, Tested/Not-tested 정직 기재, 1커밋 = 1목적
6. **라이브 체크**: acceptance.md 해당 항목 실측 → 통과 시에만 다음 R 착수
7. **롤백 준비**: 각 R은 독립 커밋이므로 `git revert <커밋>` 1회로 철회 가능해야 함 — 다른 R과 파일 충돌하는 변경은 분리

위반 시 처리: 게이트 실패 → 출고 중단·원인 수정. 라이브 체크 실패 → revert 후 재진단 (수정 위에 수정 쌓기 금지).

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

### R3: 소제목 이미지 빈 결과 (S3) — 예상 1일 · 의존: 없음 · 위험도: 중

| 단계 | 내용 |
|------|------|
| 3.1 | `src/image/nanoBananaProGenerator.ts` 빈 결과 3경로(L726 응답없음 / L738 catch null / L1700 쿼터0) 각각에 **구조화 실패 객체** `{code: 'QUOTA'\|'RATE_LIMIT'\|'SESSION'\|'EMPTY_RESPONSE', provider, detail}` 도입 — null 반환 전면 제거 |
| 3.2 | 호출 체인(imageGenerator.ts → main.ts:4587 → fullAutoFlow)에 code/detail 전파 — 사용자 로그가 "비어있습니다" 대신 "Gemini 쿼터 소진(키 3/3 소진)" 식으로 표시 |
| 3.3 | 재시도 1회차에 키 로테이션/세션 갱신 강제 (같은 키 재호출 금지) — 재시도 진입 로그에 사용 키 인덱스 표기 |
| 3.4 | provider 자동 전환은 옵트인 설정 "이미지 엔진 자동 대체 허용"(기본 OFF) 신설 후에만 — **자동 폴백 금지 정책 준수** |

- 가드: 빈 결과 → 구조화 에러 전파 단위 테스트, 재시도 키 로테이션 호출 검증, null 반환 부재 정적 가드
- 라이브 판정: 의도적 실패 유발(잘못된 키) 시 로그에 원인 코드 표시 + 연속발행 차단기(c9fcebda)와 연동 동작
- 롤백: revert 1회 (단일 모듈)

### R4: 이미지 이중 생성 single-flight + 뒤섞임 (S4) — 예상 1~2일 · 의존: run# 재현 로그 · 위험도: 중상

| 단계 | 내용 |
|------|------|
| 4.1 | **트리거 확정**: run #태그+호출자 스택 로그(48cde1ed)로 이중 발사 경로 2개 특정 — 확정 전 가드 설계 금지 |
| 4.2 | single-flight 가드: 같은 postTitle 생성이 진행 중이면 **두 번째 호출을 명시 거부**(로그+사유) — 조용한 dedup 금지(provider 다른 호출을 합치면 사용자 의도 위반) |
| 4.3 | 뒤섞임 매핑: 이미지 메타에 `headingIndex`+정규화 키 동시 저장·동시 검증 (imageManagerCore.ts:224 인덱스 폴백 제거) |
| 4.4 | 발행 직전 sync(publishingHandlers.ts:1916-1935)에서 매칭 실패 항목 **폴백 금지 — 스킵+경고**, 삽입 직전 textContent 재확인 |

- 가드: 호출자 매트릭스 테스트(누가 generateImagesForAutomation을 부르는가), heading 변형 시나리오 단위 테스트(jsdom)
- 라이브 판정: 같은 글에 run # 2개가 더 이상 안 찍힘 / 반자동 10건 연속 발행에서 뒤섞임 0
- 롤백: 4.2와 4.3/4.4는 커밋 분리 (독립 revert)

### R5: 풀오토 썸네일 이미지관리 공란 (S5) — 예상 1일 · 의존: blob IPC(13b29f9a) · 위험도: 하

| 단계 | 내용 |
|------|------|
| 5.1 | 합성 썸네일 **로컬 저장 후 로컬 경로로 등록** (웹 URL이면 다운로드 강제) — naverBlogAutomation.ts:9586, fullAutoFlow.ts:542-554 |
| 5.2 | `syncGeneratedImagesArray`(imageManagerCore.ts:515-547) 썸네일 키 폴백('🖼️ 썸네일'/'썸네일'/isThumbnail) + 그리드 onerror 1회 재해석 |
| 5.3 | (Phase 8 연계 선행) migration:imageModelV1 dry-run으로 기존 base64 잔재 규모 측정 — 이관은 별도 결정 |

- 가드: 등록 경로 단위 테스트 (웹 URL 입력 → 로컬 경로 출력)
- 라이브 판정: 풀오토 발행 후 이미지관리 첫 슬롯에 썸네일 표시
- 롤백: revert 1회

> **R4 라이브 증거(2026-06-10)**: 같은 글(소제목 7개)에 dropshot 런과 openai-image 런이 ~53초 간격으로 동시 진행 실측 — 각자 [N/7] 카운터로 14장 생성(비용 2배 + 매핑 오염). `generateImagesForAutomation`에 중복 실행 가드 없음 + 호출 경로 다수 + provider 해석 소스 2개. 진단 계측(run #태그+호출자 스택) 적용 완료 — 4.1의 입력 데이터.

## Phase 4 — R7: 세션 keepalive 구조 (S2 잔여) — 예상 1일

- `browserSessionManager.ts:1026`: keepalive가 `activeAccountId`(=발행 중 가정) 계정을 영구 skip → 단일계정 사용자는 **keepalive가 사실상 0회 동작** → 서버 TTL 만료. R1 게이트가 증상은 막지만(만료 시 자동 재로그인) 근본은 세션을 살려두는 것
- 수정: `SessionInfo.publishInProgress` 플래그 신설, automation이 발행 시작/종료에 마킹(`beginPublish`/`endPublish`), keepalive는 **실제 발행 중에만 skip**
- locked 세션 reconnect 카운터(`consecutiveKeepaliveFails`) 동작 검증 + 종료 race(`isPinging`) 보강
- 가드: 타이머 mock 단위 테스트 (발행 중 skip / 유휴 시 ping / 만료 감지 3회 전이)
- 회귀 위험: 중 — 발행 중 ping 오발동 시 타이핑 간섭 가능 → 플래그 기본값은 보수적으로(세션 보유 = 발행 중 간주) 두고 마킹이 확인된 경로부터 해제

## Phase 5 — 에러 삼킴 + 중복 경로 정리 (R8~R12, 릴리즈 5회 분할) — 예상 1.5주

**선행 작업 (R8 착수 전, 0.5일)**: 87건 전수 스캔 → research.md에 분류표 고정.
각 건마다 `파일:라인 / 삼키는 에러 / 침묵의 결과(어떤 누락·반쪽이 생기나) / 분류` 기록.
분류 3종:
- **A급 SPOF** (발행 무결성 훼손 — 누락 발행 직결) → throw + Pre-publish Assertion 항목 연동
- **B급 복구 가능** → 1회 재시도 + 실패 시 사용자 로그 (조용한 재시도 금지)
- **C급 장식적** (진행에 무해) → 경고 로그 + 운영 대시보드 카운터 (삭제 아님 — 빈도 계측)

| R | 대상 파일 | 작업 | 라이브 판정 |
|---|----------|------|------------|
| R8 | publishHelpers.ts (카테고리/예약/발행확정 — 최다 밀집) | A급 우선 처리: 카테고리 실패→기본값 진행, 예약 실패→즉시발행 진행 등 "맘대로 진행" 전면 차단 | 의도적 카테고리 오설정 시 발행이 사유와 함께 중단 |
| R9 | editorHelpers.ts (본문/꼬리/CTA) | 꼬리 단계 실패의 침묵 제거 — ensureTailTypingReady 실패 시 Pre-publish와 연동해 차단 경로 확보 | [TailRecovery] 실패 로그 시 발행물에 꼬리 누락 0 |
| R10 | imageHelpers.ts + 이미지 삽입부 | 이미지 개별 실패 침묵 제거 — 계획 대비 삽입 수 불일치 시 명시 처리 | [PrePublish] image-count ❌ 발생 시 원인 로그 존재 |
| R11 | naverBlogAutomation.ts 발행부 + `insertHorizontalLine`(9097) 버튼 미발견 silent skip → ━ 텍스트 구분선 폴백 | 발행 확정 경로의 catch 전수 + 구분선 폴백 | 발행물 구분선 누락 0 |
| R12 | 잔여 (utils/publishOutcomeResolver 등) + 분류표 잔여 C급 카운터 배선 | 마무리 + 대시보드 카운터 확인 | 운영 대시보드에 침묵 실패 카운터 표시 |

각 R: 처리 건수와 분류 근거를 커밋 본문에 기재 (예: "A급 6건 throw 전환, B급 3건 재시도화, C급 9건 계측") — 추적 가능성 확보.
- `insertHorizontalLine()`(naverBlogAutomation.ts:9097) 버튼 미발견 시 silent skip → **━ 텍스트 구분선 폴백** (선 누락 0%)
- 중복 구현 통합: `smartTypeWithAutoHighlight` (naverBlogAutomation vs editorHelpers 사본) → typingUtils 단일화. 이전글 삽입도 editorHelpers 단일 경로 확인
- **공유 함수 명시적 입력화 (R13 핵심 — "하나 고치면 다른 곳이 터지는" 구조의 근본 처방)**
  - 원칙: 2곳 이상에서 호출되는 함수는 localStorage/전역 상태를 내부에서 직접 읽지 않는다. 동작을 바꾸는 입력(모드·provider·플래그)은 **호출자가 명시적으로 전달**하고, 해석은 각 플로우 진입점에서 1회만 수행한다
  - 실증(6/10): `generateImagesForAutomation`의 숨은 입력(thumbnailOnly/headingImageMode/provider 폴백 localStorage 직독)이 썸네일 오진·이미지 이중 생성·provider 불일치 3건의 공통 뿌리였음
  - 잔여 감사 대상: generateImagesForAutomation의 provider/headingImageMode 내부 해석, `fullAutoImageSource` vs `globalImageSource` 이원 해석, getSubImageMode 소비처 전수
  - 가드: **호출자 매트릭스 테스트** — 공유 함수마다 "어떤 플로우가 어떤 입력으로 호출하는가"를 정적으로 잠금 (thumbnailOnlyScope.test에서 시작한 패턴의 일반화)
- 각 릴리즈: 해당 파일 가드 테스트 + 라이브 스모크

## Phase 6 — 릴리즈 게이트 자동화 (앱 코드 아님 — Phase 2~5와 병행 가능) — 예상 2~3일

| # | 게이트 | 구현 | 수락 기준 (실증 케이스로 검증) |
|---|--------|------|-------------------------------|
| 6.1 | 번들 식별자 충돌 스캔 (`scripts/copy-static.mjs` 강화) | concat 후 top-level `const/function` 식별자 중복 스캔 + undefined 참조 정규식 → 중복 시 **빌드 FAIL** | 과거 사고(v2.10.85 RecoveryBlockingModal) 재현 픽스처가 FAIL로 잡힘 |
| 6.2 | IPC 계약 검증 (`npm run lint:ipc` 신설) | preload `invoke/send` 채널 전수 추출 ↔ main 프로세스 `ipcMain.handle/on` 등록 대조 → 미등록 채널 시 FAIL | blob:hasMany 사고(13b29f9a 이전 상태) 재현 시 FAIL로 잡힘 — ipcWiringGuards.test의 일반화 |
| 6.3 | self-test 확장 | 기존 로그인 smoke에 번들 헬스(렌더러 모듈 초기화 0 에러) + 핵심 IPC 핸드셰이크 5종 추가 | `npm run self-test` 1회로 "앱이 켜지고 말이 통하는가" 판정 |
| 6.4 | pre-commit 훅 | 변경 파일 10개 초과 시 경고(차단 아님 — 번들 커밋 습관 방지) + Lore 형식 검사 연동 | 11파일 커밋 시도 시 경고 출력 |
| 6.5 | 라이브 하네스 게이트화 | tail-typing 하네스를 릴리즈 전 수동 1클릭 절차로 문서화 (로그인 프로필 재사용, ~1분) — Phase 7.5에서 플로우별 3종으로 확장 | 릴리즈 체크리스트에 하네스 PASS 항목 포함 |

각 게이트는 도입 시 **과거 실제 사고의 재현 픽스처**로 검증한다 — "잡았어야 할 것을 잡는지"가 수락 기준.

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
