# ULTRA 안정화 플랜

**운영 원칙 (전 Phase 공통, 협상 불가)**
- 1릴리즈당 fix 1~3개. 각 릴리즈마다: `npx vitest run` 전체 GREEN + 해당 영역 full-flow(`npm run test:full-flow` / `test:login` / `test:images` / `self-test`) + git diff 독립 검증.
- 신규 회귀 테스트는 red-green 사이클 필수(수정 revert 시 FAIL 확인).
- 기능 추가 없음 — 위험 제거·간과 보완만. silent 폴백 신설 금지(실패는 명시 실패로).
- 품질 게이트는 경고-only 유지. 발행 차단 수위 변경이 필요한 항목은 전부 "사용자 결정 필요"로 분리했다.
- 릴리즈는 메인 워킹트리에서만(워크트리 CRLF 지문 이슈), 타 세션 WIP 존재 시 대기.

---

## 판정 요약 (도메인별 CONFIRMED 개수)

| 도메인 | P0 | P1 | PLAUSIBLE | REFUTED |
|---|---|---|---|---|
| publish | 2 | 4 (+검증 중 신규 1: salvage stale 스냅샷) | 1 (Ctrl+Z 오버슈트) | 0 |
| image | 1 | 3 | 0 | 1 (library 소스) |
| cost | 0 | 1 (+신규 1: FINAL_ROTATION) | 0 | 1 (이미지 4단계 폴백 인용 경로) |
| session | 1 | 5 | 1 (bare page 407) | 0 |
| config | 1 | 6 | 0 | 0 |
| scheduler | 3 | 5 | 0 | 0 |
| renderer-ipc | 1 | 2 | 0 | 1 (log/progress 독립 항목) |
| content-pipeline | 0 | 3 (1건은 publish P0-2와 동일 사안) | 0 | 0 |
| error-recovery | 0 | 6 | 0 | 0 |
| engagement-crawler | 3 | 5 | 0 | 0 |
| **합계** | **12** | **40 (+신규 2)** | **2** | **3** |

---

## Phase 1 (P0 — 즉시): 릴리즈 R1~R7

### R1 — 보안·과금 차단 (2 fix)
1. **프록시 자격증명 하드코딩 제거** — `src/crawler/utils/proxyManager.ts:19-24`. 리터럴 폴백 삭제, env/설정 경유로 전환. **코드 외 조치: 노출된 자격증명 즉시 로테이션**(asar 추출로 이미 탈취 가능한 상태).
   - 검증: 전 소스 grep으로 리터럴 0건 + vitest 전체 + 프록시 기본 비활성 동작 불변 smoke.
2. **이미지 관리 탭 엔진 select 무시 → nano-banana-pro 과금** — `src/renderer/modules/headingImageGen.ts:1416-1634`(순차 체인에 dropshot/nano-banana 계열 분기 부재), `1611-1617`(else에서 `provider: 'nano-banana-pro'` 하드코딩), `5076-5084`(개별 재생성 동일). 누락 분기 추가 + 최종 else는 대체가 아니라 **명시 실패 처리**(자동 폴백 금지 정책 준수). 썸네일 경로(1093-1094)와 대칭화.
   - 검증: vitest + `npm run test:images` + 라이브에서 dropshot 선택 후 생성 1회, 요청 provider 로그 실측.

### R2 — config 계정 설정 소거 (1 fix + 테스트 보강)
1. **매 부팅 화이트리스트 밖 필드 소거** — `src/main/config/configManager.ts:708-733`(죽은 `__userId` 분기 + `cachedConfig=null` 후 빈 기반 머지), `836-866`(PRESERVE_KEYS 44개만 복원). 수정 불변식: **부분 업데이트가 전체 파일을 빈 기반으로 재작성하지 않는다** — cachedConfig null이면 디스크 현재 파일을 로드해 머지 기반으로 사용, 죽은 분기 제거.
   - 검증: 신규 회귀 테스트 — 비-PRESERVE 필드(`dailyPostLimit`, `imageQualityMode`, `apiUsageTrackers` 등) 저장 전후 생존 단언(red-green) + 기존 T4/T4-b 확장 + 앱 부팅 2회 후 settings.json diff 실측.

### R3 — 세션 쿠키 백업 wipe (1 fix)
1. **keep-alive가 빈 쿠키로 백업 덮어쓰기** — `src/sessionPersistence.ts:127-141`. `page.cookies()`에 네이버 URL 명시(`naverBlogAutomation.ts:2204` 패턴 이식) + `validCookies` 0건이면 기존 `cookies.json` 보존(덮어쓰기 skip + 경고 로그).
   - 검증: 빈 배열 시 파일 불변 단위 테스트(red-green) + `npm run test:login` + 라이브 keep-alive 1주기 후 cookies.json 실측.

### R4 — 스케줄·한도 (3 fix)
1. **시간당 가드 키 불일치** — `src/main/services/BlogExecutor.ts:489`(체크 키: payload accountId/naverId) vs `1018→659-662`(증가 키: resolveAccount 반환값). 단일 resolve 함수로 체크·증가 키 통일.
2. **예약 cron 한 틱 전량 연속 발행** — `src/main.ts:8779-8809`. 틱당 1건 처리 + 잔여 due 포스트 다음 틱 순연(기존 lease 구조 유지).
3. **한도 모듈 미배선** — `src/postLimitManager.ts:151-180`(`validatePublishAllowed` 호출 0곳)을 발행 경로에 배선. **주의**: 사용자가 직접 설정한 dailyPostLimit의 이행이므로 품질 게이트가 아니나, "발행 완주" 정책과의 경계가 있어 **사용자 확인 전에는 초과 시 경고+순연**으로 배선(즉시 차단 아님). hard-block 승격 여부는 사용자 결정.
   - 검증: `perAccountPostLimitGuard` 테스트를 소스텍스트 단언에서 실호출 검증으로 교체(red-green), cron 순연 단위 테스트, vitest 전체 + full-flow.

### R5 — 예약발행 성공 오판정 (2 fix)
1. **클릭 후 검증 0회** — `src/automation/publishHelpers.ts:1500-1515`(클릭+2초 대기 후 무조건 성공), `naverBlogAutomation.ts:6184-6212`(후속 검증 전무), `BlogExecutor.ts:61-63`(schedule 모드 URL 단언 스킵). 즉시발행 `verifyImmediatePublishOutcome`(naverBlogAutomation.ts:9279-9297) 등가물 도입 — 모달 닫힘/URL 전환/예약 반영 중 최소 1개 확인, 미확인 시 기존 `SCHEDULE_PUBLISH_OUTCOME_UNKNOWN` 경로로 합류.
2. **텍스트 폴백 툴바 버튼 제외 누락** — `publishHelpers.ts:1453-1464`. 즉시발행 쪽 제외 로직(`naverBlogAutomation.ts:5680-5691`, 리포 내 실측 주석 있음) 이식.
   - 검증: vitest + full-flow 예약 경로 + 라이브 예약발행 성공/실패 각 1회 유도 실측.

### R6 — 렌더러 죽은 블록 부활 (3 fix, god-file 외과수술)
1. **updateProgress 도달 불가 블록** — `src/renderer/renderer.ts:1696-2185`. 내부에 갇힌 IPC 리스너 6종(onLog, image-generation:log, main:console, recovery:show-modal, automation:reset-fields, onStatus)과 updateProgress 재배선. 수정 전 출하 번들 `dist/public/renderer.js` AST characterization 확보.
2. **살아있는 onStatus(1248-1307)에 `success === false` 분기 추가** — 현재 발행 실패가 UI에 표시되지 않음.
3. **savePublishedPost 이중 저장 가드** — `src/renderer/modules/postStorageUtils.ts:45-52`. 죽은 블록 부활 시 2중 저장이 실제 발생하므로 **가드를 선행 적용**.
   - 검증: 빌드 후 dist/public/renderer.js AST 재검(구독 생존 위치 단언), vitest, `self-test`(실부팅 IPC 핸드셰이크), 라이브 발행 1건 로그 패널 수신 확인.

### R7 — 크롤 무한루프·자료 0 환각 (3 fix)
1. **news/article URL 무한 재귀** — `src/crawler/smartCrawler.ts:519-526`(override가 auto 조건 밖) + `557-568`(_triedModes에 'fast' 미기록). override를 `mode === 'auto'` 한정 + 실제 실행 mode 기록 + 재귀 깊이 상한.
2. **검색 API 수집 본문 placeholder 덮어쓰기** — `src/sourceAssembler.ts:7123-7125`. baseBody에 실본문이 있으면 교체 금지(P0-2 "자료 0" 시나리오의 직접 원인 중 하나).
3. **fact-check 발동 조건 공백** — `src/main.ts:5703-5717`. `hasKeywords` 필수 조건 탓에 URL-only 입력에서 advisory조차 미발동 — 발동 조건 보완. **게이트 수위는 경고-only 유지**(발행 차단 없음, 사용자 정책 준수).
   - 검증: crawlPerfect throw 반복 mock으로 재귀 상한 단언(red-green), placeholder 보존 회귀 테스트, vitest 전체.

### Phase 1 부속 — 사용자 결정 필요 (코드 변경 보류)
- **PrePublish 차단 사문화 (publish P0-2 = content-pipeline P1-2, 동일 사안)**: `strictPrePublishVerification` true 세팅 0곳 + 제2 게이트 CQv3 `editorCommitBoundary.ts:504-526`도 `CONTENT_QUALITY_V3_STRICT_PUBLISH_VERIFICATION=1` env 잠김 — 사실 확정. 그러나 커밋 69223add가 **의도적 옵트인 강등**(발행차단 오탐 사태 후 사용자 정책)이므로 기본값 변경은 하지 않는다. 즉시 수행: stale 주석(`naverBlogAutomation.ts:5146-5148` "R6 upgrades failures to a hard block") 정정만. R6(경고 가시성 회복)가 실질 선행 조치. **옵트인 배선(설정 노출) 여부는 사용자 결정 대기.**

---

## Phase 2 (P1): 릴리즈 R8~R29

### R8 — 과금 fail-open 2건
1. **Perplexity 자동 리서치 무옵트인** — `src/contentGenerator.ts:4749-4775`(키만 있으면 sonar 과금), 진입 `src/sourceAssembler.ts:7319-7331`. `researchWithGeminiGrounding`(4888-4901)과 동일한 함수 레벨 fail-closed 옵트인 게이트. 미옵트인 시 리서치 skip은 기존 "키 없음" 경로와 동일하므로 silent 폴백 아님.
2. **FINAL_ROTATION 잠금 우회** — `src/image/nanoBananaProGenerator.ts:1908-2003`. `isModelLocked` 가드 부재로 사용자 미선택 모델 순차 과금 — 잠금 시 로테이션 없이 명시 실패(v2.10.335 잠금 계약 정합).
   - 검증: 옵트인 OFF 시 fetch mock 미호출 단언 / 잠금 시 로테이션 미진입 단언(각 red-green) + vitest.

### R9 — 세션 판정 3건
1. **ensureServerSession origin 의존** — `src/browserSessionManager.ts:846-873`. 비 blog.naver.com origin(항상 about:blank인 첫 run 포함)에서 CORS throw를 만료로 오판 — origin 부적합 시 판정 skip(unknown), 만료 단정 금지.
2. **keep-alive 만료 감지 도달 불가** — `browserSessionManager.ts:1099-1153`. `redirected=true` 성립 조합 부재로 1120-1153 복원 로직 전부 사도 — 감지 로직을 fetch redirect 의존에서 실검증 가능한 신호로 교체하거나 "TTL 유지 전용"으로 역할 명시(죽은 분기 정리).
3. **attemptReconnect 무의미 대기** — `browserSessionManager.ts:138-167`. `puppeteer.connect` 부재로 항상 실패 — 10초 대기 제거, 즉시 재생성 경로 단일화.
   - 검증: 단위 테스트 + `test:login` + 라이브 앱 재시작 후 불필요 재로그인 유무 실측.

### R10 — 세션 수명 2건
1. **locked 판정 키 normalize 불일치** — 저장 raw(`src/account/blogAccountManager.ts:112-122`) vs 판정 normalized(`BlogExecutor.ts:676` → `browserSessionManager.ts:757-758`). 단일 normalize 함수로 저장·조회 통일.
2. **CLEANUP_INCOMPLETE → 동일 프로필 이중 Chrome** — `naverBlogAutomation.ts:1641-1644`(무가드 폴백 launch), closeSession 실패 반환(browserSessionManager.ts:982-984). close 미확인 시 폴백 launch 금지 + 명시 에러. 재사용 블록(1651-1691)의 프록시 변경 미적용은 명시 로그.
   - 검증: 단위 테스트 + 다중계정 전환 smoke.

### R11 — config 암호화 3건
1. **at-rest 암호화 평문 회귀** — `src/main/config/encryptionMigrator.ts:94-105`(configEncrypted 스킵) + `221-267`(로드 시 플래그 유지). 로드에서 복호화했으면 저장 경로에서 재암호화 수행하도록 정합.
2. **`enc:v1:` 문자열 실키 유통** — `configManager.ts:1001-1010` `applySecretEnv`에 isEncrypted 검사 추가 — env 주입 차단 + 한글 안내 에러(명시 실패, silent 아님).
3. **kebab 트윈 평문 병기** — `encryptionMigrator.ts:39-58` SENSITIVE_FIELDS에 kebab 별칭 포함 또는 저장 전 트윈 제거.
   - 검증: 저장→로드→저장 왕복 후 디스크에 평문 키 부재 단언(red-green) + vitest.

### R12 — config 쓰기 안전 2건
1. **비원자적 쓰기** — `configManager.ts:919, 976` 직접 writeFile → tmp+rename(wipe 경로 main.ts:8332-8335 기존 패턴).
2. **파싱 실패 → 빈 config 영구화** — `configManager.ts:695`. 파손 파일 백업 보존 + 미러 우선 복구 + 명시 경고(빈 기반 첫 저장 차단).
   - 검증: 파손 JSON 주입 테스트 + vitest.

### R13 — config 보존 2건
1. **버전 wipe 화이트리스트 공백** — `main.ts:8180-8207` PRESERVE_FIELDS에 확정 소거 필드(customImageSavePath, defaultAiProvider, apiUsageTrackers 등) 추가, `8291` 'Network' 삭제 목록 제외(userDataMigration.ts:484-497 쿠키 보호와 모순), 동기 재씨딩(8034-8051)과 미러 복원(8018-8029) 순서 역전 해소.
2. **마스킹 가드 잔여 필드** — `src/main/config/secretValueUtils.ts:1-17` SECRET_CONFIG_FIELDS에 naverClientId·savedNaverPassword 등 추가 + `main.ts:1080, 1132-1134` 직주입을 applySecretEnv 경유로. 무가드 소비처는 sourceAssembler.ts:669 등(naverSearchApi.ts:175는 이미 가드됨 — 재작업 금지).
   - 검증: 버전 문자열 변경 후 부팅 시뮬레이션 설정 생존 diff + vitest.

### R14 — 라이선스 이중화 1건
1. **licenseFallback 미배선 + 프로토콜 불일치** — `src/licenseFallback.ts:230-236`(`data.success` 요구) vs GAS 실응답 `ok/valid`(licenseManager.ts:820, 1116, 1290). 프로토콜 정합 후 신규 로그인 경로 배선(기존 설계 의도 복원 — 기능 추가 아님). 기존 인증자의 로컬 유지(1255-1277)는 불변.
   - 검증: GAS mock 장애 시나리오 테스트 + vitest.

### R15 — 에디터 계측 2건
1. **readEditorStats 에러→chars:0 위장** — `src/automation/richTextPaste.ts:1559`. catch에서 정상값 0으로 둔갑 금지 — 실패 마킹으로 프레임 재획득 방어선(naverBlogAutomation.ts:6745-6759) 도달 가능하게.
2. **salvage 판정 stale 스냅샷** (검증 중 신규 발견) — `richTextPaste.ts:2913`. 롤백 이전 스냅샷으로 ok:true 가능 — 롤백 후 fresh 재측정 기반 판정.
   - 검증: frame detach mock 단위 테스트(red-green) + full-flow.

### R16 — 예약 UI 자기확인 2건
1. **라디오·날짜 순환 검증** — `publishHelpers.ts:1379-1405`(같은 .checked 재독), `891-916`(같은 .value 재독, 658-659 자인 주석). 세팅 수단과 독립된 신호(React 렌더 결과/모달 표시값)로 검증 교체.
2. **isToday 검증 전체 스킵** — `publishHelpers.ts:666-673`. 당일 예약(최빈 케이스)에도 최소 확인 수행.
   - 검증: full-flow 예약 경로 + 라이브 당일 예약 1건 실측.

### R17 — 타이핑 폴백 단위 1건
1. **중복 카운트 → 빈 tail → 전량 재타이핑** — `src/automation/editorHelpers.ts:397-406`(중첩 셀렉터 6종 합산, 5~6배 인플레이션) + `468-472`(인플레이션 값을 단일 카운트 오프셋으로 사용). 측정 기준을 단일 컨테이너로 통일 + tail 오프셋 재계산(`typingFallbackPlan.ts:77-79` 'full' 오폭 제거).
   - 검증: 중첩 DOM fixture 산술 단위 테스트(red-green) + full-flow.

### R18 — 콘텐츠 생성 2건
1. **쇼핑 조기 return 0원 게이트 우회** — `src/contentGenerator.ts:1387-1389`. return 전 `runPostGenValidator` 호출(1285/1320 경로와 대칭). 게이트 수위 자체는 기존 그대로.
2. **소제목 골격 본문 반환** — `src/services/contentStructuredValidator.ts:144-147`(빈 bodyText 무검증 합성) + `contentGenerator.ts:5845-5882`(복구 로직 비대칭). 골격-only 결과는 **생성 단계 실패**로 명시 처리 — 발행 전 단계이므로 발행무중단 정책과 무충돌.
   - 검증: 0원 아티팩트/빈 본문 fixture 테스트(red-green) + vitest.

### R19 — 크롤 데드라인 2건
1. **내부 시간 예산 0** — `src/sourceAssembler.ts:1601-1616`(중단 조건이 성공 수·문자 수뿐) + fetchArticleContent(1604) 무타임아웃. 루프 전체 데드라인 + 호출별 타임아웃 래퍼, 렌더러 30초(`contentGeneration.ts:1026`)와 정합.
2. **타임아웃 시 부분 결과 소실** — `contentGeneration.ts:1091-1095`(crawledText '' 유지). 타임아웃 시점까지 수집분 반환.
   - 검증: 지연 mock 테스트 + smoke.

### R20 — 좀비 크롤링 2건
1. **렌더러 포기 후 main 계속 실행** — `src/main/ipc/miscHandlers.ts:47-80`. 기존 `automation:cancelContentGeneration`(main.ts:5580) 취소 패턴 이식.
2. **동시 실행 가드** — `collectContentFromPlatforms` 무락 — 실행 중 중복 진입 방지.
   - 검증: 취소 후 진행 로그 부재 단언 테스트.

### R21 — 프로세스 방어 3건
1. **uncaughtException 이중 핸들러 모순** — `main.ts:333-354`(계속 실행 설계, 죽은 5회 카운트) vs `9535-9547`(무조건 exit 1) + 9549-9551 거짓 주석. 정책 1개로 단일화(cleanup+exit 유지, 죽은 코드·주석 정리).
2. **autosave 거짓 보고** — `src/renderer/modules/errorAndAutosave.ts:123-143`. 저장 결과 반환받아 메시지 분기, `_autosaveDisabledForSession` no-op 상태 고지.
3. **window.error 4회/3초 blocking alert** — `errorAndAutosave.ts:126-133`. alert를 비차단 통지/로그로 — 무인 연속발행 정지 제거.
   - 검증: 크래시 mock 테스트 + vitest.

### R22 — 크롤러 좀비 Chrome 1건
1. **LewordCrawler 3중 방어망 사각지대** — `src/crawler/crawlerBrowser.ts`에 `trackBrowserPid`/`trackChild` 배선(naverBlogAutomation.ts:1808 등 기존 패턴), zombieRecovery lock 엔트리 등록(zombieRecovery.ts:209 순회 대상 편입).
   - 검증: lock 엔트리 단언 테스트 + 강제 종료 후 재부팅 좀비 kill 실측.

### R23 — 크롤러 페이지 수명 2건
1. **전략 타임아웃 = 방치** — `src/crawler/providers/BaseProvider.ts:144-157`. race 실패 시 해당 페이지 강제 close로 실행 실중단.
2. **releasePage 미보장** — `BrandStoreProvider.ts:94-96` finally 이동(`crawlerBrowser.ts:119-124` 자동 정리 타이머 no-op 해소).
   - 검증: 타임아웃 mock 테스트 + `_activePages` 누수 단언.

### R24 — 크롤러 프로필·플러그인 2건
1. **사용자 실제 Chrome 프로필 사용** — `smartCrawler.ts:1483-1509`. `shoppingStrategy.ts:521` tmpdir 전용 프로필 패턴으로 통일(ProcessSingleton 충돌·실프로필 오염 제거).
2. **stealth 플러그인 무한 누적** — `naverBlogCrawler.ts:281-282`, `smartCrawler.ts:1479-1481`, `shoppingStrategy.ts:509-511`, `crawlerBrowser.ts:257-259`. 모듈 레벨 1회 등록 가드.
   - 검증: launch 인자 단언 테스트 + 크롤 smoke.

### R25 — 크롤 백오프 1건
1. **차단 시 무중단 재시도 증폭** — `sourceAssembler.ts:1601-1616`(실패 즉시 continue, 중단 없음) + `naverBlogCrawler.ts:648-659`(실패 후 동일 API 재요청). 연속 실패 N회 시 잔여 후보 스킵 + 경고(수집 중단은 silent 폴백이 아니라 명시 중단).
   - 검증: 전량 실패 mock에서 총 요청 횟수 상한 단언.

### R26 — 스케줄 저장 2건
1. **scheduled-posts.json 포맷 상호 소실** — `src/scheduler/smartScheduler.ts:70-95`(객체) vs `scheduledPostsManager.ts:34, 70`(배열), 동일 경로. 파일 분리 또는 포맷 감지 비파괴 처리.
2. **setTimeout 오버플로 즉시 발행** — `smartScheduler.ts:108-109, 125-127, 267-273, 336-339`. 2^31-1 초과 delay 클램프+체이닝.
   - 검증: legacy 포맷 fixture 왕복 테스트 + 원거리 예약 단위 테스트.

### R27 — 연속발행 카운터 1건
1. **in-memory 상한 + 쿨다운뿐** — `src/renderer/modules/continuousPublishing.ts:259, 266, 376-378`. postLimitManager 영속 카운터 연동(재시작 시 소실 제거). 초과 시 수위는 R4에서 사용자가 정한 수위 따름.
   - 검증: 재시작 시뮬레이션 카운터 유지 단언.

### R28 — 빌드·IPC 등록 2건
1. **copy-static ENOENT 삼킴** — `scripts/copy-static.mjs:382`(최외곽 try 안 access), `1111-1119`(warn 후 exit 0). 필수 산출물 누락 시 exit 1 + release-gate에 dist staleness 검사.
2. **main.ts 단일 try 6그룹 전멸** — `main.ts:8712-8734`. 그룹별 개별 try + 실패 명시 처리, `ipcWiringGuards.test.ts` 확장.
   - 검증: 산출물 제거 후 빌드 exit code 단언 + `self-test`.

### R29 — 이미지 부분 생성 2건
1. **다중계정 부분 생성 발행** — `src/main.ts:5290`(0건만 실패). 일반 IPC 경로(3695-3700)와 동일 기준으로 대칭 복원(기존 정책 정합이지 신규 차단 아님).
2. **expectedImageMin 순환 산정** — `src/automation/editorHelpers.ts:2636`(이미 부족한 배열 기준). 요청 수 기준 보정 — 단 PrePublish 수위는 경고-only 유지.
   - 검증: 부분 생성 mock 테스트 + `test:images`.

---

## Phase 3 (P2 개선): 릴리즈 후보 번들

1. **데드코드·문서 정합 정리** — `src/image/imageFormatPipeline.ts:291`(processImageForUpload 미사용), QUMA-VL 클러스터(`imageTextConsistencyChecker.ts:230` 호출 0곳 + `contentValidationPipeline.ts:10-11` 거짓 헤더), `src/publishingStrategy.ts:117,132,190,346`(미호출 4함수), extendedImageLibrary 죽은 IPC(`main.ts:6348`), `src/errors/` 미배선, `sessionPersistence.ts:207-265` isLoginValid. 삭제 또는 배선 결정 후 CLAUDE.md 기재 불일치(imageFormatPipeline, 댓글 시스템) 정정. 검증: vitest + 참조 grep 0건 단언.
2. **비원자적 쓰기 일괄** — `src/engagement/commentResponder.ts:92-126`, `postLimitManager.ts:85`, `postLimitManagerPerAccount.ts:63` → tmp+rename. 검증: 쓰기 중단 fixture 테스트.
3. **자원 누수·오판정 소소** — blob 임시파일 누적(`src/main/utils/materializePublishingImages.ts:23-25`), mainWindowRef destroyed send(`ipcHelpers.ts:27`), 임시저장 성공 오판정(`naverBlogAutomation.ts:5277-5281`), 예약 모달 미열림 폴스루(`publishHelpers.ts:1266-1269`), imageUtils 1200px 스킵 시 EXIF 잔존(`imageUtils.ts:133`), catch 내 context.close 에러 마스킹(`smartCrawler.ts:1638-1642`). 검증: 각 단위 테스트 + 영역 smoke.
4. **뇌관 상수·스코프** — maxAttempts=99 사문 상수(`contentGenerator.ts:3511, 3796, 4204`), 그라운딩 옵트인 스코프(`content/groundingCostPolicy.ts:28`), guarantee 폴백 대상 최고가 모델(`imageGenerator.ts:863-864`), 번들 식별자 중복 28건 동결(`scripts/bundle-identifier-baseline.json`) 점진 해소. 검증: vitest + 빌드 후 dist 스캔.

---

## 재조사 필요 (PLAUSIBLE — Phase 편입 보류)

1. **Ctrl+Z 오버슈트 복구 부재** (publish P1-4) — `richTextPaste.ts:1806-1815`. 방어 부재(redo 0건·오버슈트 감지 없음)는 코드 사실이나 리포 내 실측은 undershoot뿐. 조치: 롤백 전후 길이 계측 로그만 추가(동작 변경 없음) 후 라이브 데이터로 재판정. ※ 부속 발견인 salvage stale 스냅샷(2913)은 CONFIRMED로 R15에서 처리.
2. **keep-alive bare page 407** (session P1-5) — `browserSessionManager.ts:1094-1098` 재생성 page에 `page.authenticate`(518-521) 미적용. 프록시 인증 사용자 한정 + 도달성 좁음. 인증 재적용 자체는 소규모라 도달성 실측 후 R10에 동반 가능.

---

## 기각된 오탐 목록 (재조사 방지용)

| 항목 | 기각 사유 |
|---|---|
| image "library 소스 0개 + success:true" | `autoCollectImages` 호출부 전소스 0건 — 도달 불가. UI의 library 소스는 별도 경로(`getLibraryImages`). 죽은 IPC 정리(Phase 3)만 |
| cost "이미지 4단계 자동 폴백" (인용 경로) | 메인라인은 forceModelKey 상시 잠금 + guarantee 옵트인 + 썸네일 폴백은 사문 코드. 유효 잔존분은 FINAL_ROTATION 신규 항목(R8)으로 대체 |
| renderer-ipc "automation:log/progress 독립 P1" | sendProgress 호출부 0곳(죽은 배선 양단 — 유실될 피해 자체가 없음). log 유실은 P0(R6)에 포함 |
| session P1-5 중 "webdriver/fingerprint 급변" | StealthPlugin이 browser-level 훅으로 newPage 전체 자동 적용 — 407만 잔존(재조사 2번) |
| config P1-3 인용 지점 `naverSearchApi.ts:175` | 152-157행에 isMaskedSecretValue 가드 실재 — 항목은 유지하되 무가드 소비처(sourceAssembler.ts:669 등)로 대상 정정(R13) |
| publish "이미지 전량 삭제 통과" 시나리오 | 삽입 전량 실패는 `IMAGE_INSERTION_FAILED` abort(imageHelpers.ts:1628-1629) 존재 — 부분 실패·삽입 후 소실만 유효 |
| session P0 "발행 없이 15분 대기" 단독 시나리오 | 세션 0개면 keep-alive skip(browserSessionManager.ts:1049-1052) — P0 자체는 취소/실패 잔존 세션·멀티탭 경로로 확정(R3 유지) |

---

**비고**: 본 플랜은 변경 내용과 검증 방법만 기술하며 효과 추정치는 포함하지 않는다. R4-3(한도 hard-block 수위)과 Phase 1 부속(PrePublish 옵트인 배선)은 사용자 결정 전 기본 경고-only/순연 수위를 유지한다.
