# SPEC-FLOW-001 구현 계획

> 현 상태 문서화 SPEC이므로 "구현"이 아닌 **개선/기술 부채 해소** 태스크로 구성.

## 태스크 목록

- [ ] T1: `flowGenerator.ts` 파일 분할 (830줄 → 300줄 하드 리밋 준수)
  - `flowBrowser.ts` — launchWithStealthFallback, ensureFlowBrowserPage, getFlowProfileDir
  - `flowProject.ts` — ensureFlowProject, dismissCookieBanner, isLoggedInToFlow
  - `flowGenerate.ts` — typePromptAndSubmit, waitForNewImage, downloadImageAsBuffer
  - `flowLogger.ts` — initFlowLogFile, writeToFile, flowLog/Warn/Error, saveDebugScreenshot
  - `flowGenerator.ts` — generateWithFlow, generateSingleImageWithFlow (공개 API만)

- [ ] T2: `FLOW_LOG_DIR` 하드코딩 경로 제거
  - 현재: `'C:\Users\박성현\Desktop\새 폴더'` (L31)
  - 개선: `app.getPath('logs')` 또는 앱 설정 경유 동적 경로

- [ ] T3: `countExistingImages` 셀렉터 일반화
  - 현재: `img[alt="생성된 이미지"], img[alt="Generated image"]` (L604) — 언어 고정
  - 개선: waitForNewImage의 3-조건 OR 로직과 통일

- [ ] T4: 연속 생성 간 대기 전략 문서화
  - 현재: 500ms 고정 (L772, v1.5.5에서 2s→500ms 단축)
  - 개선: 이전 이미지 카운트 안정 확인 후 진행 (폴링 기반)

- [ ] T5: `cachedBrowser` 변수 제거 또는 활용
  - 현재: L107에 선언만 되고 실제로 할당/사용 안 됨 (dead code)

## 구현 전략

현 코드는 단일 파일 830줄로 300줄 파일 크기 제한(file-size-limit.md)을 위반 중.
T1 분할이 최우선 과제이며, 분할 시 공개 API 시그니처 (`generateWithFlow`, `generateSingleImageWithFlow`,
`setFlowEnabled`, `isFlowEnabled`, `testFlowConnection`, `resetFlowState`, `getFlowLogPath`) 변경 없이
re-export로 하위 호환 유지.
