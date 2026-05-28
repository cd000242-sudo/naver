# v2.11.4 — 사진→글 Quick Mode 이미지 업로드 fix

사용자 보고 hotfix.

## 증상

"사진→글 (Quick Mode)" 모달에서 이미지 드래그/파일 선택/폴더 선택을 해도 "0장 업로드됨" 그대로. 어떤 방법으로도 이미지가 추가 안 됨.

## 원인

`imageNarrativeQuickMode.ts` 의 `_bindQuickUpload` 가 파일/폴더 input의 change 이벤트와 drop 이벤트를 잡기는 했는데, 받은 file 객체를 실제 처리 함수 (`imageNarrativeUpload._handleFiles`) 에 forward 하지 않았다. 주석에 "Forward to upload module by dispatching to the main drop zone" 이라고 적혀 있지만 실제 forward 코드가 빠져있었음. count만 갱신하고 끝나서 `getUploadedImages()` 가 영원히 0건.

추가로 썸네일 렌더링 함수가 `image-narrative-thumbnail-grid` ID만 찾아서 Quick Mode 모달의 `quick-thumbnail-grid` 는 인식 못 했다. 업로드돼도 미리보기가 안 보임.

## 조치

- `imageNarrativeUpload.ts` 의 `_handleFiles` 를 `addFiles` 로 export. 외부 모듈도 같은 처리 파이프라인 재사용 가능.
- `imageNarrativeQuickMode.ts` 의 `_bindQuickUpload` 가 파일/폴더/드래그 3개 모두 `await addFiles(files)` 호출. file input value 초기화도 동일하게.
- `_renderThumbnails` 가 두 grid ID 중 존재하는 것을 사용 (`image-narrative-thumbnail-grid` 또는 `quick-thumbnail-grid`).

## 회귀 가드

- vitest 2434/2434 PASS (171 files)
- tsc --noEmit exit 0
- 변경 파일 2개 (imageNarrativeUpload 322줄 / imageNarrativeQuickMode 412줄), god file 영역 미진입

## 알려진 제한

- 본 hotfix는 Panel 1 업로드까지만 fix. "추론 시작 →" 클릭 시 호출되는 IPC (`electronAPI.inferImages`) 가 main 핸들러 (`vision:infer-and-write`) 와 이름/응답 스키마가 다른 별개 이슈가 남아있다. Panel 2 진입은 v2.11.5에서 추가 fix 예정.
- 우선 검증 요청: 이미지 3장 이상 드래그/선택 → 썸네일 그리드에 표시 + "N장 업로드됨" 카운트 정상.

## 핵심 commit

- (이번 commit) fix(image-narrative): Quick Mode 파일 업로드 forward 누락 — addFiles export + Quick Mode wiring

🐙 SPEC-IMAGE-NARRATIVE-2026 후속 hotfix
