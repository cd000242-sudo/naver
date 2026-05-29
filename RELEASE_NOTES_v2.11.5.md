# v2.11.5 — 사진→글 Quick Mode 추론 시작 IPC mismatch fix

v2.11.4 (업로드 fix) 후속 hotfix.

## 증상

v2.11.4 에서 이미지 업로드는 정상 동작. 그러나 "추론 시작 →" 버튼 누르면 즉시 "Vision 추론 실패" 토스트가 뜨고 Panel 2 로 진입 안 됨.

## 원인

Quick Mode `_runQuickInference` 가 `window.electronAPI.inferImages` 채널을 호출하는데, preload.ts 에 이 이름의 함수가 노출되어 있지 않음. preload는 `window.api.inferAndWrite` 만 노출한다. optional chaining (`?.`) 으로 silent 통과 → result undefined → "Vision 추론 실패" throw.

추가로 응답 스키마도 mismatch. Quick Mode는 `result.error` + `result.plan` 기대했는데, main 핸들러는 `{ success, content, imageMap, message }` 만 반환. plan 객체 자체가 응답에 없어서 Panel 2 review UI 구성 불가.

## 조치

- `main.ts` vision:infer-and-write 핸들러 응답에 `plan` 객체 추가. plan은 `aggregateInferences` 가 만든 NarrativePlan — plain JSON serialisable 이라 IPC 직렬화 안전.
- `preload.ts` inferAndWrite 응답 타입에 `plan?: any` 추가.
- `imageNarrativeQuickMode._runQuickInference` 가 `window.api.inferAndWrite` 호출하도록 통일. 응답 처리도 `result.success`/`result.message`/`result.plan` 으로 정렬. plan 누락 시 명시 에러.

## 회귀 가드

- vitest 2434/2434 PASS (171 files)
- tsc --noEmit exit 0
- main.ts 1 hunk (god file 한도 3 이내), preload.ts 1 hunk, Quick Mode 1 hunk

## 알려진 제한

- HEIC 변환 (`electronAPI.convertHeic`) + EXIF 추출 (`electronAPI.extractExif`) IPC도 preload 노출 누락 상태. HEIC 파일 안 쓰면 보이는 증상 없음. 별도 cycle.
- 사용자 dogfood 우선 검증: Panel 1 이미지 3장 업로드 → Panel 2 "추론 시작 →" → Vision API 응답 (30초 안쪽) → Panel 2 review UI 표시.
- Gemini API 키가 환경설정에 입력되어 있어야 함. 없으면 "API key for provider gemini is not set" 에러.

## 핵심 commit

- (이번 commit) fix(image-narrative): Quick Mode IPC mismatch — api.inferAndWrite 통일 + plan 응답 추가

🐙 SPEC-IMAGE-NARRATIVE-2026 후속 hotfix
