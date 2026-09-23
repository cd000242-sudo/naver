# SPEC-NAVER-FULLAUTO-2026 — research (호출 경로 감사)

조사 방법: 2026-09-24 작업 트리를 읽기 전용 에이전트 5개로 나눠 정적으로 읽었다(풀오토 즉시·예약·연속/다중계정·이미지 코어/설정 UI·contentGenerator 내부). 앱은 실행하지 않았다. 줄 번호는 조사 시점 기준.

---

## 1. 즉시 완전자동 (원클릭)

| 단계 | 위치 |
|---|---|
| UI | `#unified-publish-btn` → `tailUIUtils` 클릭 → 숨은 `#full-auto-publish-btn` |
| 진입 | `renderer.ts` → `publishingHandlers.handleFullAutoPublish` |
| 글 생성 | `contentGeneration.generateContentFromKeywords/Url` → IPC `automation:generateStructuredContent` → `main.ts` → `contentGenerator.generateStructuredContent` (품질 게이트·패치·재생성·소제목 보정 전부 이 안에서 끝난다) |
| 글 확정 | 수동 제목·쇼핑 SEO 제목 적용 (`publishingHandlers`) |
| 이미지 | **이번 변경 후** `runFullAutoImages` (image/fullAuto) → `generateImagesForAutomationSafely` → `multiAccountManager.generateImagesForAutomation` (1장씩) → `costAndAutoGen.generateImagesWithCostSafety` → IPC `automation:generateImages` → `runWithSquareImageTarget` + `thumbnailDirectorGate` → `imageGenerator.generateImages` |
| 발행 판단 | **신규** `recheckFullAutoDecisionBeforePublish` — AUTO_PUBLISH 가 아니면 저장만 하고 멈춘다 |
| 발행 | `executeUnifiedAutomation` → `fullAutoFlow.executeFullAutoFlow`(이미지 재사용) → `executeBlogPublishing` → IPC `automation:run` → `BlogExecutor.runFullPostCycle` → 에디터 |

변경 전 사실: 이미지 1장이라도 최종 실패하면 throw → 성공한 이미지까지 버려지고 아무것도 발행 안 됨. 서론이 없으면 썸네일을 요청하지 않아 1번 소제목 이미지가 표지로 쓰였다.

## 2. 예약발행

- **화면에서 도달 가능한 예약은 네이버 서버 예약 하나**다(`scheduleType: 'naver-server'`). 앱은 큐가 그 항목에 도달하는 즉시 글·이미지를 만들고 네이버 발행 창에 예약 시각을 입력해 올린다. 예약 시각에 앱이 켜져 있을 필요가 없다 — 사실상 "미리 완성 → 예약 시각에 네이버가 발행" 구조다(§20 목표 충족, 추가 구현 불필요).
- 경로: 연속발행 V2 큐(`continuousPublishing.startContinuousPublishingV2`) · 메인 탭 ⏰예약(`handleFullAutoPublish`) · 다중계정 큐 — 셋 다 1번과 같은 글·이미지·발행 코어를 쓴다.
- 레거시: 앱 스케줄(`scheduled-posts.json` + 1분 cron)은 화면에서 추가할 방법이 없다. SmartScheduler 는 IPC만 있고 호출하는 곳이 없다(SEO 강제·이미지 없음). **둘 다 이번에 손대지 않았다.**

## 3. 연속발행 큐 (5편/일 운영 경로)

| 단계 | 위치 |
|---|---|
| 큐 추가 | `addItemToQueueV2Impl` — 이번에 이미지 전략·소제목 범위·썸네일 문구를 항목에 고정(`readContinuousImageChoicesForQueue`) |
| 항목 처리 | `startContinuousPublishingV2` 루프 — 항목별 `resolvePipelineConfig('continuous')` + **신규** `resolveFullAutoImagePolicyFromPipeline(항목 스냅샷)` |
| 글 | `generateContentFromKeywords/Url(..., item.contentMode, item.category)` — 모드는 항목 값 그대로 |
| 제목 | `applyContinuousTitleOverrides` — **변경**: 키워드 앞 붙이기는 SEO·메이트·제휴 또는 사용자 체크 시에만 |
| 이미지 | **변경** 쇼핑·내 폴더가 아니면 `runFullAutoImages` |
| 판단 | **신규** 검토 필요면 `holdContinuousItemForImageReview` → 상태 `image-review`, 글+성공 이미지 저장, 다음 항목으로 |
| 발행 | `executeUnifiedAutomation` → 1번과 동일 |

변경 전 문제(감사): 같은 글의 재시도가 "2번째 실패"로 세어져 한 글이 큐 전체를 멈춤, 수정 모달에서 바꾼 예약 시간이 무시됨(`scheduleTime` 미갱신), 큐가 항목 모드를 공용 hidden input 에 써 놓고 복원하지 않음, 홈판 제목에도 키워드 강제 접두, 행에 시각만 표시(날짜 없음)·업체 모드가 "홈판"으로 표시.

## 4. 다중계정 큐

- `multiAccountManager` 발행 루프 → IPC `generateStructuredContent` → 이미지 → IPC `multiAccount:publish` → main.
- 변경 전 문제: 비쇼핑 이미지 오류를 삼키고 0장으로 넘기면 main 이 제목만으로 전체 이미지를 다시 생성(`headingImageMode 'all'`), "이미지 없음"·글만 발행 설정이 main 으로 전달되지 않음.
- **변경**: 비쇼핑은 `runFullAutoImages` + 발행 판단, `skipImages`·`headingImageMode` 전달.

## 5. 이미지 코어·설정 (변경 전)

- "이미지 전략" 개념이 없었다. 이미지 동작은 제휴 모드 여부와 카테고리·제목 정규식으로만 갈렸고, 홈판 모드는 이미지 전용 분기가 하나도 없었다.
- 썸네일 디렉터 전체 기능(AUTO 문구·숫자 카드·실제 사진 합성)은 이미지 탭 썸네일 칸에서만. 자동화 흐름은 표준 모드·문구 포함/제외만·실제 사진 0.
- 크기: 모든 AI 엔진이 `writeImageFile` 로 저장 — 정사각에 가까우면 800x800, 넓은 비율은 너비 800 유지. Flow·Dropshot 은 비율 설정을 무시한다. blob 메타의 width/height 는 **원본 프레임** 값이었다.
- 슬롯 상태(PENDING/SUCCESS/FAILED/SKIPPED) 모델 없음.
- 초기 생성의 네이버 검색 폴백은 없음. 나노바나나 최종 안전망은 다른 Gemini 모델로 조용히 바꾸고 추적 정보는 "요청 엔진 그대로·폴백 없음"으로 기록했다.

## 6. 글쓰기 모드 라우팅 (contentGenerator 내부)

- 홈판 요청(`source.contentMode === 'homefeed'`)은 모든 시도(재생성 포함)에서 홈판 작성기 프롬프트를 쓴다. `|| 'seo'` 기본값은 모드가 **비어 있을 때만** SEO 로 간다.
- 제목·소제목·본문을 바꾸는 단계(제목 패치·소제목 보정·휴머나이저·품질 패치 등)는 모두 생성 IPC 안에서 끝난다 → 이미지는 항상 최종 글 뒤에 만들어진다. 발행 직전 콘텐츠 정책 재작성은 기본값에서 소제목 제목을 유지한다(파괴적 정리는 환경변수 옵트인).
