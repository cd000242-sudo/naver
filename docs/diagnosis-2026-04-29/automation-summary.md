# Automation Workflow Diagnosis — Summary (2026-04-29)

## 분석 범위
- `src/naverBlogAutomation.ts` (9,227 줄, god-file, 41 메서드)
- `src/automation/` (11,210 LOC / 18 파일) — editor/image/publishHelpers + selectors 레지스트리
- 사용자 보고: 발행 흐름이 자주 멈추거나 모호한 에러로 실패

## 핵심 결함 5

1. **God-file 책임 폭주** — `naverBlogAutomation.ts`가 9,227줄/41 메서드로 setup/login/navigate/edit/image/publish/post-publish 모두 보유. `run()` 한 메서드에 setup, dialog, login, navigate, frame, popup, content, publish, after-actions, cleanup 10단계가 인라인. `applyStructuredContent`/`publishBlogPost`는 helpers로 위임됐지만 `self: any`를 그대로 받아 “forwarder” 가짜 분리. 의존 결합도는 그대로.

2. **타임아웃 정책 카오스** — `waitForSelector` 타임아웃이 `1000ms / 2000ms / 3000ms / 5000ms / 8000ms / 10000ms` 6 단계로 산발 분포. 같은 발행 모달 대기인데 `editorHelpers`는 5초, `publishHelpers`는 3초/5초/10초 혼재. `waitForNavigation({ networkidle0 })`은 `30000ms`로 통일됐지만 `.catch(() => undefined)` 패턴으로 실패가 silent 흡수돼 “멈춘 듯” 보임.

3. **Critical-path 무방어** — `run()`은 setup→login→navigate→switchFrame→closePopup→applyContent→publish 7단계 직선 실행. 단계 사이 멱등성/체크포인트/롤백 없음. `publishBlogPost` 내부의 `retry(fn, 3)`만 단일 보호. 카테고리 선택 실패 시 `closeCategoryDropdown`이 발행 모달까지 닫는 구버전 ESC 부작용 흔적이 주석에 남아 회귀 위험.

4. **모듈 경계 누수** — `editorHelpers`/`imageHelpers`/`publishHelpers`/`ctaHelpers` 모두 첫 인자 `self: any`로 부모 인스턴스 전체를 받음. 즉 helpers ↔ 부모 양방향 의존. `automation/types.ts`의 `AutomationContext`(올바른 ports 형태)는 정의만 돼 있고 실제 사용처 0건. SELECTORS는 `automation/types.ts`와 `automation/selectors/*` 두 곳에 중복 정의.

5. **에러 진단 단절** — `errorRecovery.ts`(`withRetry`, `clickWithRetry`, `navigateWithRetry`)가 import만 되고 실사용 미미. 대부분 인라인 `try/catch + log + 계속 진행` 패턴이라 “왜 멈췄는지” 추적 불가. selector 실패 보고(`reportFailure`)는 수집만 되고 dashboard 노출 경로 없음.

## 재설계 phase 다이어그램 (헥사고날 ports & adapters)

```
┌─────────────────────────────────────────────────────────────┐
│  Application Service: PublishingOrchestrator (~200줄)       │
│  run() = phase1() → phase2() → ... → phase7() (linear, 명시 체크포인트) │
└──┬──────┬──────┬──────┬──────┬──────┬──────┬────────────────┘
   │      │      │      │      │      │      │
   ▼      ▼      ▼      ▼      ▼      ▼      ▼
[P1]   [P2]   [P3]   [P4]   [P5]   [P6]   [P7]
 Browser Auth  Editor Content Image  Publish PostPub
 Session Login Bootstrap Author Place  Modal   Reflect
   │      │      │      │      │      │      │
   └──────┴──────┴──────┴──────┴──────┴──────┘
                       │
                ┌──────▼───────┐
                │ Ports (interfaces) │
                │  BrowserPort       │
                │  AuthPort          │
                │  EditorPort        │
                │  PublishPort       │
                │  SelectorRegistry  │
                │  TimeoutPolicy     │
                └──────┬───────┘
                       │
              ┌────────▼────────┐
              │ Adapters (Puppeteer, Playwright fallback) │
              └─────────────────┘
```

각 phase는 (a) preconditions 검증, (b) 본 작업, (c) postconditions 검증, (d) 명시 체크포인트 기록, (e) 단일 timeout policy 주입. 이를 통해 “어디서 멈췄는지” 한 줄 로그로 식별 가능.

## 다음 단계
- 상세는 `automation-detail.md` 참조 (책임 분류 + 의존성 매트릭스 + 타임아웃 표)
- 권고 우선순위: (1) TimeoutPolicy 단일화 → (2) `self: any` 제거 + `AutomationContext` 실사용 → (3) `run()` 7-phase 분해 → (4) 체크포인트/멱등화 → (5) `errorRecovery` 일관 적용
