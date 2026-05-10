# SPEC-FLOW-001: Flow (Nano Banana 2) 이미지 생성 시스템

**Status**: draft
**Created**: 2026-04-23
**Domain**: FLOW

---

## 목적

Google Labs Flow (내부 모델명 NARWHAL, 브랜드명 Nano Banana 2)를 Playwright UI 자동화로
구동하여 AI Pro 쿼터 내 무료로 이미지를 생성하는 시스템이다.
`recaptchaContext.token`이 페이지 내부에서만 동적 생성되어 API 직접 호출이 불가하므로
DOM 자동화 방식을 채택하고 있다 (L9–L13).

---

## 아키텍처

```
generateWithFlow(items)
        │
        ▼
generateSingleImageWithFlow(prompt)  ← MAX_RETRIES=2
        │
        ├─ [1/3] ensureFlowBrowserPage()
        │         ├─ 캐시 히트? → 반환 (L189–203)
        │         ├─ off-screen 시작 → isLoggedInToFlow
        │         │        세션 OK  → cachedContext/Page 저장 → 반환
        │         │        세션 없음 → ctx.close() + 1.5s 대기
        │         │                    → on-screen 재시작 → 5분 로그인 대기
        │         │                    → 성공 시 → ctx.close() + 1.5s
        │         │                    → off-screen 재시작 → cachedContext/Page 저장
        │
        ├─ [2/3] ensureFlowProject(page)
        │         ├─ URL에 /project/ 포함 → 재사용
        │         ├─ cachedProjectUrl 있음 → goto() + 검증
        │         └─ "새 프로젝트" 클릭 → waitForURL(/project/)
        │
        ├─ [3/3] typePromptAndSubmit(page, prompt)
        │         ├─ dismissCookieBanner()
        │         ├─ fill() → pressSequentially → keyboard.type (폴백 체인)
        │         └─ arrow_forward 클릭 (일반 → force → JS 폴백)
        │
        ├─ waitForNewImage(page, prevCount, 120s)
        │         └─ 2초 폴링 · naturalWidth/Height≥200 · 완전 로드 필수
        │
        └─ downloadImageAsBuffer(page, url)
                  └─ ctx.request.get() × 3회 재시도
```

---

## 요구사항

- WHEN 사용자가 이미지 생성을 요청하면, THE SYSTEM SHALL Playwright persistent context를
  통해 `labs.google/fx/tools/flow`에 접속하고 세션을 재사용해야 한다.
- WHEN Google 세션이 만료된 경우, THE SYSTEM SHALL on-screen 브라우저를 표시하고
  사용자에게 Google 로그인을 요구하며 최대 5분간 대기해야 한다 (L244–263).
- WHEN labs.google가 headless Chromium을 감지하면 이미지 렌더가 차단되므로,
  THE SYSTEM SHALL `headless: false`를 유지하고 off-screen 시 `--window-position=-10000,-10000`을
  사용해야 한다 (L143–148).
- WHILE 이미지 생성 대기 중, THE SYSTEM SHALL 2초 간격 폴링으로 `naturalWidth≥200`이고
  `complete===true`인 이미지만 신규 이미지로 인정해야 한다 (L553–555).
- WHEN 프롬프트 입력이 실패하면, THE SYSTEM SHALL fill → pressSequentially → keyboard.type
  3단계 폴백을 순차 시도해야 한다 (L471–493).
- WHEN `FLOW_` 접두사 에러가 발생하면, THE SYSTEM SHALL 이후 배치 항목 생성을 즉시 중단하고
  해당 에러를 상위로 전파해야 한다 (L779–788).
- WHERE 디버그 로그가 필요한 경우, THE SYSTEM SHALL `C:\Users\박성현\Desktop\새 폴더\`에
  `flow-debug-YYYYMMDD-HHMMSS.log`를 세션당 하나 생성해야 한다 (L31–59).

---

## 생성 파일 상세

| 파일 | 역할 |
|------|------|
| `src/image/flowGenerator.ts` | 전체 시스템 단일 파일 (830줄, 하드 리밋 초과) |
| `src/image/types.ts` | `ImageRequestItem`, `GeneratedImage` 인터페이스 |
| `src/image/imageUtils.ts` | `writeImageFile` — 디스크 저장 |
| `src/image/promptBuilder.ts` | `PromptBuilder.build` — 영문 프롬프트 생성 |
| `src/apiUsageTracker.ts` | `trackApiUsage` — 비용 추적 (cost=0) |
