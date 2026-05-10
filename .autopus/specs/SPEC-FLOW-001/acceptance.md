# SPEC-FLOW-001 수락 기준

## 시나리오

### S1: 기존 세션으로 이미지 1장 생성
- Given: `cachedPage`가 유효하고 Flow 프로젝트 페이지가 열려 있음
- When: `generateSingleImageWithFlow("a red apple", "1:1")` 호출
- Then: `{buffer, mimeType}` 반환, buffer.length ≥ 1024, mimeType이 image/* 형식

### S2: 세션 만료 시 로그인 유도
- Given: Flow 프로필 디렉터리에 세션 쿠키 없음
- When: `ensureFlowBrowserPage()` 호출
- Then: on-screen 브라우저가 표시되고 IPC로 '⚠️ [Flow] Google 로그인 필요' 메시지 전송

### S3: 로그인 5분 초과 시 에러
- Given: 세션 없음, 사용자가 5분 내 로그인 안 함
- When: `ensureFlowBrowserPage()` 호출
- Then: `FLOW_LOGIN_TIMEOUT` 접두사 에러 throw, context 정리 완료

### S4: 쿠키 배너 자동 닫기
- Given: Flow 페이지 첫 진입, 쿠키 동의 배너 노출
- When: `dismissCookieBanner(page)` 실행
- Then: 배너가 닫히고 프롬프트 입력창이 클릭 가능 상태가 됨

### S5: 프롬프트 입력 3단계 폴백
- Given: `fill()`이 "contenteditable not supported" 에러로 실패
- When: `typePromptAndSubmit(page, prompt)` 실행
- Then: `pressSequentially` 또는 `keyboard.type`으로 폴백, 입력 검증 통과

### S6: 이미지 감지 180초 초과
- Given: Flow 서버가 응답 없음 또는 UI 구조 변경
- When: `waitForNewImage(page, 0, 180000)` 호출
- Then: `FLOW_IMAGE_TIMEOUT` 에러, 스크린샷과 img 목록이 `FLOW_LOG_DIR`에 저장됨

### S7: 일괄 3장 생성 중 1장 실패
- Given: items 3개, 2번째에서 `FLOW_PROMPT_INPUT_NOT_FOUND` 발생
- When: `generateWithFlow(items)` 실행
- Then: 2번째부터 중단, results.length = 1, `firstCriticalError` throw

### S8: 브라우저 실행 3종 폴백
- Given: 시스템 Chrome 없음, Edge 없음
- When: `launchWithStealthFallback(profileDir, true)` 호출
- Then: Playwright 번들 Chromium으로 fallback 성공, `navigator.webdriver` 제거 스크립트 주입됨

### S9: 디버그 로그 파일 생성
- Given: 앱 첫 실행 (`flowLogFilePath === null`)
- When: `generateWithFlow(items)` 호출
- Then: `FLOW_LOG_DIR/flow-debug-YYYYMMDD-HHMMSS.log` 파일 생성, 헤더에 앱 버전 포함
