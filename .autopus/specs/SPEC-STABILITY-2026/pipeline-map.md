# 파이프라인 지도 — 진단용 차트 (2026-06-10 실측 기준)

> 용도: 문제 발생 시 "증상 → 로그 마커 → 코드 위치"를 1분 안에 특정.
> 모든 경로는 이 세션에서 코드 추적·라이브 검증으로 확인된 것. 변경 시 이 문서를 같이 갱신할 것.

## 0. 진단 인덱스 (증상부터 역으로 찾기)

| 증상 | 로그에서 찾을 마커 | 1차 확인 위치 |
|------|------------------|--------------|
| 꼬리(구분선/CTA/이전글/해시태그) 누락 | `🔎 [TailOptions]` 값(옵션 도착?) → `⌨️ 키보드 입력 확인` vs `⚠️ 키보드 미반응` → `[PrePublish]` | editorHelpers.ts 꼬리 단계 |
| 발행물 요소 누락 전반 | `[PrePublish] 발행 전 검사 N/5` 의 ❌ 항목 | automation/prePublishAssertion.ts |
| 이미지 이중 생성 | `▶ run #xxxx provider=... caller:` 가 같은 글에 2개 | multiAccountManager.ts:361 (generateImagesForAutomation) |
| 썸네일만/이미지 빈 결과 | `headingImageMode` 값 + `🚫 thumbnailOnly=true → 본문 소제목 차단` | costAndAutoGen.ts 초크포인트 / HeadingImageSettings |
| 연속발행 정체("수집만 무한") | `⚠️ 이미지 생성 실패 (n/3), N초 후 재시도` 반복 → `⛔ 연속발행을 중단합니다` | continuousPublishing.ts 이미지 catch(차단기) |
| 세션 풀림/재로그인 | `✅ 발행 전 서버 세션 유효 확인` / `⚠️ 서버 세션 만료 감지` | naverBlogAutomation.ts runPostOnly 게이트 |
| 글 목록/이미지 저장 실패 | `No handler registered for 'blob:...'` / `NUCLEAR CLEANUP` | main.ts IPC 등록부(3854-) + blobHandlers |
| 에디터 구조 변경 의심 | 하네스 1분 실행: `node tmp/tail-typing-live-test.cjs` | tmp/tail-typing-live-test/run 결과 |

## 1. 풀오토 단일 발행 (검증된 체인)

```
handleFullAutoPublish → executeUnifiedAutomation → executeFullAutoFlow   [renderer]
 ├─ 콘텐츠: apiClient 'generateStructuredContent' (fullAutoFlow.ts:1897-1924) → main → contentGenerator
 ├─ 이미지: generateImagesForAutomation(provider, …)        [공유코어 ① · run# 계측]
 ├─ 발행 payload 구성 (fullAutoFlow.ts:2799-2834 — hashtags/ctas/previousPostUrl/thumbnailOnly 명시)
 └─ apiClient 'runAutomation' → preload 'automation:run' → main.ts:2762
     → AutomationService.executePostCycle → BlogExecutor.ts:465-532 (RunOptions 매핑 — 전 필드 전달 확인됨)
     → naverBlogAutomation.run() (~9598) → loginToNaver() [항상 실행, 네비게이션 기반이라 안전]
     → applyStructuredContent (editorHelpers.ts:624-)
         ├─ 본문 정제: stripCtaArtifactsFromBody            [공유코어 ② · 단독 ━구분선 보존]
         ├─ 섹션 루프: 소제목 → 리치 붙여넣기(pasteRichHtmlAtCursor) → 이미지 삽입 → 가로선
         │   └─ heading-N CTA: ensureTailTypingReady 후 삽입 (1983-)   [공유코어 ③]
         ├─ 꼬리: ensureTailTypingReady → CTA(2129-) → 이전글 insertPreviousPostTailBlock(30-, 후킹→링크)
         │        → 해시태그(2405-, 재검증 후)
         └─ [PrePublish] 기대치 스태시
     → publishBlogPost (naverBlogAutomation.ts:4973)
         → [PrePublish] 검사(관찰 모드) → 이미지 문서너비 → 카테고리/예약 → 발행 확정
```

## 2. 연속발행

```
continuousPublishing.ts 루프(~4270)
 ├─ 콘텐츠 생성 → finalStructuredContent
 ├─ 이미지 분기(4517-): isCollectedMode = affiliate && (모드='collected' || 수집이미지 실재)
 │   ├─ 수집 모드 → executeFullAutoFlow에 위임 (수집 이미지 직접 처리)
 │   └─ AI 모드 → generateImagesForAutomation                [공유코어 ①]
 │       └─ 실패: fail-fast(대기 15s/배치 15분 상한) + 2글 연속 실패 차단기(catch, stopFullAutoPublish)
 └─ formData(4653-, thumbnailOnly=headingImageMode 기반) → executeFullAutoFlow → 이후 §1과 동일
     발행은 runPostOnly(9237-): 브라우저 재사용 시 ensureServerSession 실측 게이트
```

## 3. 다중계정 풀오토

```
multiAccountManager.ts 큐(~3107)
 ├─ affiliate: collectImagesFromShopping IPC → 실패 시 generateImagesForAutomation  [공유코어 ①]
 └─ 다중계정 전용 main IPC 경로 (옵션 매핑은 publishMetadataPropagation.test가 잠금) → 이후 §1과 동일
```

## 4. 공유 코어 × 호출자 매트릭스 (여기를 고치면 어디가 흔들리나)

| 공유 코어 | 호출자 | 입력 규칙 | 잠그는 가드 |
|-----------|--------|----------|------------|
| generateImagesForAutomation (mAM.ts:361) | 풀오토 / 연속발행 / 다중계정 / aiFallbackFn 주입 | provider 명시 전달. thumbnailOnly는 options·headingImageMode만 (localStorage 직독 금지) | thumbnailOnlyScope.test · continuousImageFailFast.test · run# 계측 |
| richTextPaste (buildMobileRichHtml / pasteRichHtmlAtCursor / ensureTailTypingReady) | editorHelpers 4지점 + typePlainContent(nBA:4838) | page+frame 명시 전달. 꼬리 타이핑은 반드시 ensureTailTypingReady 뒤 | richPasteTailWiring.test(7) |
| stripCtaArtifactsFromBody | applyStructuredContent 자동/반자동 2경로 | 순수 함수 (입력→출력만) | bodyArtifactCleanup.test(7) |
| prePublishAssertion | publishBlogPost 단일 관문 | 기대치는 applyStructuredContent 스태시, fail-open 계약 | prePublishAssertion.test(10) |
| browserSessionManager (ensureServerSession/keepalive) | runPostOnly 게이트 / keepalive 타이머 | — (R7에서 publishInProgress 명시화 예정) | sessionKeepalive* + 게이트 wiring 가드 |
| blob/migration/recovery IPC | preload → main | **main.ts 직접 등록 필수** (라우터만 등록 금지) | ipcWiringGuards.test(2) |

## 5. 꼬임 방지 규칙 (신규 코드 체크리스트)

1. 공유 코어에 localStorage/전역 직독 추가 금지 — 동작 입력은 호출자가 명시 전달 (R13 원칙)
2. 새 IPC 채널 = main.ts 직접 등록 + ipcWiringGuards.test에 추가
3. 꼬리/에디터 타이핑 추가 = ensureTailTypingReady 뒤에만
4. 발행물에 들어가야 할 새 요소 = prePublishAssertion 기대치에 추가
5. 이 지도와 어긋나는 구조 변경 = 이 문서 갱신을 같은 커밋에 포함
