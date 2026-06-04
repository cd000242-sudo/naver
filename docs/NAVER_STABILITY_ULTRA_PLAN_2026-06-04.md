# Naver Automation Stability Ultra Plan

Date: 2026-06-04
Scope: Better Life Naver desktop app, Naver Blog SmartEditor ONE publishing flows, scheduler flows, license/session guards, regression prevention.

## Current Verification Snapshot

- `npm test`: passed, 193 files / 2657 tests. Last verified: 2026-06-05.
- `npm run lint`: passed with 0 errors and 1045 existing warnings.
- `npm run e2e`: passed, 8/8 Electron Playwright tests.
- `npm run build`: passed standalone and as part of `npm run e2e`.
- Release status: P0/P1 stabilization patch set is verification-clean and ready for user review, not yet packaged/released.

## Completed Stabilization Patch Set

- Added stale-response write guard for license revalidation.
- Preserved real published post URLs for immediate and scheduled publish flows.
- Aligned Naver image validation with official limits: 20MB per image, 50MB batch policy reference, JPG/JPEG/PNG/GIF/BMP/WEBP support.
- Added Electron E2E startup hardening so tests wait for the real main window, skip external license/server gates in E2E mode, and close cleanly.
- Added stable settings UI test hook and modal open/close state (`show`, `aria-hidden`) so freeze tests measure actual UI response instead of selector timeout.
- Added publish modal DOM fixture tests for toolbar publish, modal confirm, category, and schedule controls.
- Added publish failure classification (`failureCode`) for immediate publish, scheduler, and multi-account result paths.
- Added shared immediate publish outcome guard (`resolveImmediatePublishOutcome`) and wired both high-level Naver publish entry points so editor-stuck/no-post-URL outcomes fail with typed error codes instead of silent success.
- Hardened cohort survival aggregation against timestamp boundary jitter so 30/60/90-day suspension windows do not fluctuate by millisecond timing.
- Added automated-login stall guard so a generic login-page stall fails fast with an actionable error instead of waiting in the 10-minute captcha/security loop.
- Added an abortable server-session gate for reusable browser sessions so pre-publish session checks cannot hang indefinitely.
- Added locale/timezone fingerprint contract guards: `--lang=ko-KR`, `navigator.language`, `navigator.languages`, and `page.emulateTimezone('Asia/Seoul')` are kept aligned.
- Added content-mode prompt contract tests for Homefeed, SEO, Shopping Connect/affiliate review, business promotion, and custom prompt override modes.
- Tightened custom prompt safety guardrails: no facts outside supplied material and no fabricated first-person experiences/reviews.

## 목표

네이버 로직 또는 사용자 입력값이 실제로 바뀐 경우를 제외하고, 일반적인 네트워크 지연, 에디터 로딩 지연, 예약/즉시 발행 분기, 결과 URL 추적, 라이선스 재검증 순서 문제 때문에 발행 실패나 상태 회귀가 발생하지 않도록 만든다.

## 리서치 근거

- Naver SmartEditor ONE은 현재 블로그 PC 작성/발행의 기준 에디터이며, PC/모바일 호환과 드래그 기반 편집을 제공한다. `https://help.naver.com/service/5593/contents/15506?lang=ko`
- 사진 첨부는 에디터의 사진/SNS 사진 버튼 경로가 공식 경로다. 사진은 1장 20MB, 1회 50MB, JPG/GIF/PNG/BMP/WEBP 지원이며, 복사/붙여넣기 또는 HTML 소스 등록은 미노출 가능성이 있다. `https://help.naver.com/service/5593/contents/15468?lang=ko&osType=PC`
- 발행은 우측 상단 발행 버튼 이후 설정 창 하단 발행 버튼으로 완료된다. 설정에는 카테고리/주제, 공개 설정, 검색 허용, 태그 최대 30개, 현재/예약 발행이 포함된다. `https://help.naver.com/service/5593/contents/15541?lang=ko&osType=PC`
- 블로그 홈/추천 영역은 공식적으로 정보성, 반응도, 인기도, 최근성 같은 신호를 사용한다. 주제별 TOP은 최근 24시간 게시글 중 주목도 지수가 높은 글을 1시간 단위로 갱신하고, 핫토픽은 관심 키워드와 이슈성을 반영한다. `https://help.naver.com/service/5593/contents/15187?lang=ko`
- 2026-05-11부터 2026-06-01까지 안내된 "요즘 뜨는 인기글" AB 테스트는 블로그 홈 피드와 게시글 하단 추천 영역에서 전체공개 글 중 좋은 반응을 얻은 글을 다양한 지표로 선정한다고 설명한다. 홍보성, 광고성, 선정성 콘텐츠는 제외될 수 있다. `https://help.naver.com/service/5593/contents/25151?lang=ko`
- 광고/제휴/쇼핑커넥트 성격의 글은 경제적 이해관계를 명확히 표시해야 한다. 특히 문자 중심 매체에서는 표시 위치와 인식 가능성이 중요하므로, 쇼핑커넥트 모드는 고지 누락을 품질 리스크가 아니라 법적/플랫폼 리스크로 취급한다. `https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000280130&chrClsCd=010201`
- 브라우저 자동화 안정화는 고정 sleep보다 자동 대기/재시도 가능한 locator, 사용자가 보는 속성 기반 선택자, web-first assertion을 우선해야 한다. `https://playwright.dev/docs/locators`, `https://playwright.dev/docs/actionability`, `https://playwright.dev/docs/best-practices`

## 현재 확인한 핵심 문제

### P0 - 릴리스 차단

1. 라이선스 재검증 응답 순서 회귀
   - 증상: 늦게 도착한 오래된 서버 응답이 더 최신 라이선스 상태를 덮어쓸 수 있음.
   - 영향: premium/standard/free 상태가 사용 중 되돌아가 기능 잠금 또는 잘못된 권한 판정으로 연결됨.
   - 처리: sequence 기반 write-guard 추가 완료.

2. 발행 성공 URL 손실
   - 증상: `POST_URL` 로그는 남지만 내부 `publishedUrl`이 비는 분기가 있었고, 예약 스케줄러는 실제 글 URL 대신 블로그 홈 URL을 저장했다.
   - 영향: 발행은 됐는데 결과 추적, 완료 상태, 사용자 검토 링크가 틀어짐.
   - 처리: 실제 run 결과 URL 우선 사용, 모든 즉시 발행 성공 분기에서 `publishedUrl` 저장, 회귀 가드 테스트 추가 완료.

3. 실제 Naver 에디터 UI 변화에 대한 가드 밀도 부족
   - 증상: 선택자 registry와 fallback은 있으나, 즉시/예약 발행 전체 시나리오를 DOM fixture로 검증하는 테스트가 부족함.
   - 처리 방향: publish modal fixture 기반 테스트 추가. 발행 버튼, 예약 라디오, 날짜/시간 input, 확인 버튼, 성공 URL 후보를 분리 검증.

4. 실패 원인 분류 부족
   - 증상: 캡차/보안인증, 에디터 미로딩, 조건 부족, URL 미전환, 파일 업로드 실패가 일부 동일한 실패 메시지로 섞임.
   - 처리 방향: 발행 실패 타입을 `LOGIN_CHALLENGE`, `EDITOR_NOT_READY`, `PUBLISH_CONDITION`, `NAVIGATION_TIMEOUT`, `IMAGE_REJECTED`, `UNKNOWN_UI_CHANGE`로 정규화.

5. 자동 로그인 generic stall
   - 증상: 로그인 버튼 fallback이 모두 미해결이거나 로그인 페이지에 머무는 경우, 실제 캡차/2FA가 없어도 사용자 개입 대기 루프로 들어가 오래 멈춰 보일 수 있음.
   - 영향: 풀오토/연속/다중계정 발행에서 한 계정이 전체 큐를 잡고 있는 것처럼 보임.
   - 처리: 캡차/2FA/보안문자 징후와 generic login stall을 분리하고, generic stall은 90초 뒤 `자동 로그인 응답 없음`으로 실패시켜 다음 복구 흐름이 작동하게 함.

6. 서버 세션 확인 무한 대기
   - 증상: 재사용 브라우저 세션에서 `PostWriteForm.naver` 서버 확인 fetch가 네트워크/세션 문제로 반환되지 않으면 발행 직전 멈춤처럼 보일 수 있음.
   - 영향: 발행 버튼까지 가기 전 대기 상태가 길어지고, 사용자는 자동로그인 또는 발행 파이프라인 문제로 인식함.
   - 처리: 8초 AbortController timeout을 추가하고 실패 시 `loginVerifiedAt=0`, `isLoggedIn=false`로 내려 다음 흐름이 재로그인/복구를 선택하게 함.

### P1 - 안정성/속도

1. 대형 파일 집중
   - `src/naverBlogAutomation.ts`, `src/main.ts`, `src/renderer/renderer.ts`, `src/contentGenerator.ts`가 너무 커서 회귀 범위가 넓다.
   - 처리 방향: 새 기능 추가 금지 구역으로 두고, 수정 시 helper/test를 먼저 분리한다.

2. 대기 정책 혼재
   - 일부 `waitForNavigation(...).catch(() => undefined)`와 고정 delay가 남아 있어 실패가 성공처럼 지나갈 위험이 있다.
   - 처리 방향: 발행 완료 판정은 URL, 에디터 잔류 여부, 성공/오류 문구, 네이버 홈 fallback 여부를 합성한 단일 resolver로 통일한다.

3. 이미지 업로드 경로 리스크
   - Naver 공식 도움말상 HTML/붙여넣기 사진은 미노출 가능성이 있으므로, 발행 품질 경로는 파일 선택 업로드를 우선해야 한다.
   - 처리 방향: Base64/HTML fallback은 마지막 수단으로 격리하고, 사용 시 결과 DOM 검증을 필수화한다.

4. 웹지문 일관성
   - 세션별 WebGL/screen/hardware 값은 account 기반으로 안정화되어 있었으나, 언어/타임존이 브라우저 launch arg, navigator, CDP timezone 사이에서 분리될 여지가 있었다.
   - 처리: `ko-KR`/`Asia/Seoul`을 account profile 계약에 포함하고, Chrome arg/header/navigator/timezone을 같은 방향으로 맞춘다.

5. 콘텐츠 모드 품질
   - 홈판 모드는 네이버 공식 추천 신호상 "최근성 + 반응도 + 정보성"을 우선해야 하며, 클릭 bait나 과도한 광고 문구는 추천 제외 리스크가 있다.
   - SEO 모드는 검색 의도, 모바일 첫 문단, 제목/본문 키워드 반복 억제를 계약으로 유지한다.
   - 쇼핑커넥트/업체홍보 모드는 경제적 이해관계 고지, 거짓 후기 금지, 연락처/가격/혜택의 근거성 유지가 핵심 안정성이다.
   - 사용자정의 모드는 자유도를 유지하되 자료 외 사실과 거짓 1인칭 경험을 금지한다.

### P2 - 유지보수/사용감

1. lint warning 1000개 이상
   - 현재 lint는 error 없이 통과하지만 warning이 많아 진짜 위험 신호가 묻힌다.
   - 처리 방향: 자동 수정 가능한 항목부터 별도 PR/릴리스로 분리.

2. renderer innerHTML 사용량
   - 이미 sanitizer가 있는 곳도 있으나, 사용자 생성값이 섞이는 UI는 안전 wrapper로 점진 이동해야 한다.

## 이행 계획

### Phase 1 - P0 회귀 차단

- [x] 라이선스 재검증 stale write guard.
- [x] 예약 발행 결과 URL resolver.
- [x] 즉시 발행 성공 분기 `publishedUrl` 저장 누락 제거.
- [x] URL 저장 회귀 가드 테스트.
- [x] publish modal DOM fixture 테스트.
- [x] 실패 타입 정규화 최소 뼈대.

### Phase 2 - 발행 성공 판정 단일화

- [x] `resolveImmediatePublishOutcome()` 추가.
- [x] 입력: beforeUrl, afterUrl, finalUrl, retryUrl, publishStatus, editor URL 패턴.
- [x] 출력: `{ success, url, reason, retryable, userActionRequired }`.
- [x] `src/naverBlogAutomation.ts`의 고수준 즉시 발행 진입점 2곳에 검증 guard 연결.
- [x] source wiring guard, URL helper regression test, editor-stuck regression test 추가.

### Phase 3 - 이미지/본문 조건 검증 강화

- [x] 공식 조건 기반 이미지 사전 검증: 확장자, 단일 파일 20MB, 배치 50MB, 영문/숫자 파일명 normalization.
- [x] 콘텐츠 모드별 prompt contract test 추가.
- [x] 사용자정의 모드 자료 외 사실/거짓 경험 금지 guardrail 추가.
- [ ] 본문/제목/카테고리/태그/공개 설정을 발행 전 preflight로 표시.
- [x] 실패 시 “수동 확인 필요”와 “자동 재시도 가능”을 분리하는 실패 타입 최소 뼈대.

### Phase 4 - 스케줄러/다계정 안정화

- [x] 앱 스케줄러와 즉시 발행의 결과 URL 모델 정렬.
- [x] 다중계정/스케줄러 결과에 `failureCode` 전파.
- [x] reusable session의 서버 세션 확인 timeout 추가.
- [x] generic login stall이 풀오토 큐를 장시간 붙잡지 않도록 fail-fast guard 추가.
- [ ] 예약 발행 재시도 시 과거 시간이 되면 현재+20분 보정 로직에 테스트 추가.

### Phase 5 - 릴리스 게이트

릴리스 전 아래가 모두 통과해야 한다.

- `npm test`
- `npm run build`
- `npm run lint`
- 가능하면 `npm run e2e`
- 샘플 발행 dry-run 또는 수동 검토: 로그인, 글쓰기 진입, 이미지 첨부, 즉시 발행, 예약 발행, 취소/중단, 다계정 queue.

## 현재 검증 상태

- `npx vitest run src/__tests__/sessionGateTimeout.test.ts src/__tests__/loginStallGuard.test.ts src/__tests__/fingerprintConsistency.test.ts src/__tests__/contentModePromptContracts.test.ts`: 통과, 4 files / 37 tests.
- `npm test`: 통과, 193 files / 2657 tests.
- `npm run build`: 통과.
- `npm run lint`: 통과, error 0 / warning 1045.
- `npm run e2e`: 통과, 8/8 tests.

## 2026-06-05 추가 진단 결론

- 발행 시 멈춤처럼 보이는 주요 원인은 실제 발행 버튼 이후보다 발행 전 단계의 세션 확인 및 로그인 페이지 대기 정책에 더 가까웠다.
- 캡차/2FA는 사용자가 개입해야 하므로 10분 대기 정책을 유지하되, 캡차 징후가 없는 generic login stall은 90초 fail-fast로 분리했다.
- 재사용 브라우저 세션은 네이버 서버 확인을 통해 로그인 상태를 보강하는 구조가 맞지만, 네트워크 요청에 hard timeout이 없으면 풀오토/연속/다중계정 발행에서 큐 전체가 멈춘 것처럼 보일 수 있다.
- 웹지문은 이미 계정 기반 WebGL/screen/hardware profile을 쓰고 있어 뼈대는 양호했다. 이번 패치로 언어와 타임존까지 같은 profile 계약 안에 넣어 일관성을 높였다.
- 홈판 모드는 네이버가 공개한 홈/추천 신호에 맞춰 정보성, 반응도, 최근성, 전체공개/정책 적합성을 우선해야 한다. "10만/20만 유입"은 보장값이 아니라 노출 가능성을 높이는 방향으로 다뤄야 한다.
- 쇼핑커넥트와 업체홍보 모드는 성과 문구보다 고지/근거/정책 안전성이 먼저다. 고지 누락 또는 거짓 체험형 문구는 추천 제외뿐 아니라 법적 리스크로 분류한다.

## 릴리스 전 사용자 검토 항목

- 실제 발행 완료 화면에서 결과 링크가 예시 블로그/실제 글 URL로 열리는지.
- 예약 글이 블로그 홈이 아니라 발행된 글 또는 예약 완료 상태로 추적되는지.
- 라이선스가 재검증 후 premium/standard/free 상태를 잘못 되돌리지 않는지.
- 이미지 첨부가 버튼 업로드 경로로 처리되고, 발행 후 이미지가 보이는지.
- 캡차/보안인증 상황에서 자동 실패로 오판하지 않고 사용자 개입 안내가 뜨는지.
