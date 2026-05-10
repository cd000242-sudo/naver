# Automation Workflow Diagnosis -- Detail (2026-04-29)

본 문서는 naverBlogAutomation.ts(9,227 LOC) + src/automation/(11,210 LOC, 18 파일) 전체 구조 진단의 상세 보고서이다. 코드 수정은 수행하지 않으며, 재설계 권고만 제시한다.

## 1. naverBlogAutomation.run() 책임 분류 + 분리 후보

### 1.1 run() 메서드(L8987-L9220, 234줄) 단계별 분석

| 단계 | 라인 범위 | 호출/작업 | 책임 분류 | 분리 후보 |
|---|---|---|---|---|
| 0 | 8989-8990 | globalLimiter.acquire(publish) | 인프라 (concurrency) | ConcurrencyGate adapter |
| 1 | 8992-9007 | cancelRequested=false, resolveRunOptions, categoryName 동기화 | 옵션 해석 | OptionsResolver (pure) |
| 2 | 9012-9063 | dead code (if false ... 썸네일 합성, 51줄) | 삭제 대상 | -- |
| 3 | 9065 | setupBrowser() | 브라우저 세션 부트스트랩 | Phase 1 BrowserSession |
| 4 | 9070 | ensureDialogHandler() | 브라우저 부가 설정 | Phase 1 (포함) |
| 5 | 9073 | loginToNaver() | 인증 | Phase 2 Auth |
| 6 | 9074 | navigateToBlogWrite() | 페이지 이동 | Phase 3 EditorBootstrap |
| 7 | 9075 | switchToMainFrame() | iframe 전환 | Phase 3 (포함) |
| 8 | 9078 | 1초 대기 | 단일 magic number | Phase 3의 postcondition wait로 흡수 |
| 9 | 9081-9085 | closeDraftPopup(), closePopups() | 모달 정리 | Phase 3 (postcondition) |
| 10 | 9087-9091 | applyStructuredContent() 또는 applyPlainContent() | 콘텐츠 작성 | Phase 4 Content / Phase 5 Image |
| 11 | 9094 | publishBlogPost() | 발행/예약/저장 | Phase 6 PublishModal |
| 12 | 9098 | activateEditorForEditing() | 에디터 후처리 | Phase 7 PostPublish |
| 13 | 9100-9112 | 로그/URL 반환 | 결과 보고 | Phase 7 |
| 14 | 9118-9214 | finally -- 브라우저 keep/close, 여운 행동(스크롤/이동), 스테일 페이지 정리 | 세션 정리 | Phase 7 PostPublish + Concurrency release |

### 1.2 naverBlogAutomation.ts의 41 메서드 책임 분류

| 책임 영역 | 메서드 (라인 위치) | 분리 후보 (Phase 매핑) |
|---|---|---|
| 옵션/유틸 | resolveRunOptions(1398), validateScheduleDate(4463), randomInt/Float(402/406), hashAccountId(345), getAccountConsistentProfile(362), getTypingDelay(411), findChromeExecutable(1271), stripRepeatedHookBlocks(324), enforceOrdinalLineBreaks(335), normalizeSubtitleText(6438) | OptionsResolver / domain utils (이미 automation/utils.ts로 이동 가능 -- 중복 정의 존재) |
| 브라우저 세션 | setupBrowser(1542), closeBrowser(8951), minimizeBrowserWindow(8887), restoreBrowserWindow(8923), ensurePage(1338), ensureDialogHandler(2056) | Phase 1 BrowserSessionAdapter |
| 인증 | loginToNaver(2165, ~1500 LOC), isDeviceConfirmUrl(785), waitForManualLogin(별도) | Phase 2 AuthAdapter |
| 에디터 부트 | navigateToBlogWrite(3634), switchToMainFrame(3962, ~310 LOC), closePopups(4271), closeDraftPopup(4200) | Phase 3 EditorBootstrapAdapter |
| 콘텐츠 | inputTitle(4327), typePlainContent(4398), applyStructuredContent(6568, **위임만**), applyPlainContent(5581), extractBodyForHeading(6815) | Phase 4 ContentAdapter (이미 editorHelpers.ts로 일부 이동) |
| 이미지 | insertImagesAtHeadings(7524, ~990 LOC), verifyImageInserted(7475), generateAltWithSource(8510) | Phase 5 ImageAdapter (이미 imageHelpers.ts로 일부 이동) |
| 발행 | publishBlogPost(4507, ~1500 LOC), selectCategoryInPublishModal(775, **위임만**) | Phase 6 PublishAdapter |
| 후처리 | activateEditorForEditing(5893), getPublishedUrl(9223), 여운 행동 인라인 | Phase 7 PostPublishAdapter |
| 오케스트레이션 | run(8987), runPostOnly(8745), cancel(1368), stopAutomation(1385), retry(6013) | PublishingOrchestrator (<=200 LOC 목표) |
| 로그/취소 | log(1076), ensureNotCancelled(1199) | Cross-cutting (logger / cancellation token) |

> **god-file 분리 후보 총량**: 9,227 LOC -> 7 phase 어댑터 (각 ~600 LOC) + Orchestrator(~200 LOC) + Pure utils(automation/utils.ts 통합). 현재 helpers로 이동된 분량은 ~6,400 LOC인데도 god-file이 9,227 LOC로 유지된 것은 forwarder 메서드(return await editorHelpers.X(this, ...))가 그대로 남아있고 인라인 거대 메서드 4개(loginToNaver, navigateToBlogWrite, setupBrowser, publishBlogPost 인라인 일부)가 분리되지 않았기 때문이다.

