# SPEC-NAVER-FULLAUTO-2026 — plan (구현 내역)

## 새 모듈 (src/image/fullAuto, 순수 함수 · 렌더러 번들 인라인 등록)

| 파일 | 역할 |
|---|---|
| fullAutoImagePolicy.ts | 이미지 전략(홈판/내 설정) → 정책: 썸네일·소제목 범위·비율·800 정사각·문구 모드·실제 사진 옵션. contentMode 입력 없음 |
| fullAutoImageSlots.ts | 썸네일 + H2 슬롯(1-based), PENDING/SUCCESS/FAILED/SKIPPED_BY_SETTING, 범위 번호 매기기, 결과 대조, 진행 문구 |
| fullAutoPublishDecision.ts | 이미지 준비 판정, 소제목 변경 검사, AUTO_PUBLISH / IMAGE_REVIEW_REQUIRED, 사장님용 안내 문구 |
| fullAutoImageRequest.ts | 최종 글 → 이미지 요청 목록(썸네일 항상 선두), 썸네일 디렉터 요청(AUTO·CARD_PROMISE·실제 사진), 호출 옵션(1:1·800) |
| fullAutoImageRunner.ts | 공용 실행기: 슬롯 계획 → 생성(주입) → 대조 → 판정 → 비용 한 줄. 세 흐름이 모두 이것을 쓴다 |
| fullAutoQueueStatus.ts | 예약 큐 행: 날짜+시각 · 글쓰기 모드 · 이미지 전략 · 글 상태 · 이미지 k/N · 최종 상태 |
| fullAutoImageAsset.ts | 결과 미리보기 배지: 실제사진 2장 합성 / 실제사진 / 내 이미지 / 정보형 / 네이버 이미지 / AI 생성 |
| src/image/squareImageTarget.ts | (main 전용) 한 호출 동안 "이미지 N×N" 을 AsyncLocalStorage 로 전달 |

## 기존 파일 변경

| 파일 | 변경 |
|---|---|
| multiAccountManager.generateImagesForAutomationInner | 정책이 있으면 범위·비율·800·디렉터 요청 적용, 슬롯별 결과 보고, 실패해도 다음 칸 계속(`continueOnImageFailure`), 진행 단계 콜백. 정책이 없으면 기존과 동일 |
| publishingHandlers.handleFullAutoPublish | AI 이미지 분기 → 실행기, 최종 글 확정 로그, 발행 판단(검토 필요면 저장 후 중단) |
| continuousPublishing | 항목별 이미지 선택 고정, 실행기, 검토 보류(`image-review`), 글 단위 차단기, 모드 복원, 행 상태 표시, 수정 모달 예약 시간 버그, 홈판 등 키워드 접두 제외, 단계 문구 순서 |
| multiAccountManager 발행 루프 | 비쇼핑 → 실행기 + 발행 판단, `skipImages`·`headingImageMode` 를 main 으로 전달 |
| costAndAutoGen | 미리 만든 디렉터 요청에도 CARD_PROMISE 채움, 항목 범위가 전역 '썸네일만'에 덮이지 않게, 미리보기 배지 |
| pipelineConfig | 전략 키 4개 해석 + `resolveFullAutoImagePolicyFromPipeline` |
| main.ts | `automation:generateImages` 를 `runWithSquareImageTarget` 로 감쌈 |
| imageUtils.writeImageFile | 정사각 목표가 있으면 800x800(넓은 원본은 attention 크롭), blob width/height 를 저장 바이트 기준으로 |
| imageGenerator | 역할 이력(앞 소제목 역할)을 브리프에 전달, 나노 최종 안전망 사용 시 추적 정보 정직하게 |
| thumbnailDirectorGate | 결과 이미지에 `assetKind` |
| sectionRolePlanner · roleDirectives · sectionRoleAssignment | 자동차 kind·의도별 역할(자동차 글에만), 정보형 클리셰 추가, 이전 이미지 역할 문장 |
| flowGenerator · deepinfraGenerator | 다양성 힌트를 루프 인덱스 대신 소제목 번호(diversityIndex)로 |
| HeadingImageSettings · index.html · tailUIUtils | 완전자동 이미지 전략 설정 칸, 연속발행 이미지 전략 3선택, 발행 버튼 아래 "글쓰기 모드 · 이미지" 한 줄 |
| imageGenStudioCore | 엔진 1장 단가 조회(`studioEngineCostKrw`) |
| scripts/copy-static.mjs · candidateRuntimeFingerprint.ts | 번들 등록 7개, 지문 클로저 8개 |

## 남은 일

- 라이브: 실제 엔진으로 5편 예약 1회(비용 발생 — 사장님 지시 시에만).
- 예약 큐 항목별 "실제 사진 첨부" 입력은 없다. 실제 사진 합성은 사진이 글에 있을 때만 동작(이미지 탭 흐름).
- 연속발행 큐는 메모리에만 있다(앱 재시작 시 사라짐) — 기존 한계, 이번 범위 밖.
