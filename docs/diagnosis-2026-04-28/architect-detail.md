# architect 상세 — 모듈 분리 마이그레이션 계획

**기준일:** 2026-04-28 / **앱:** v2.7.27 / **에이전트 잘림 → architect-summary 기반 + 메인 보강**

## god-file 분해 표 (5개)

| 현재 파일 | LOC | 책임 (관찰) | 분리 후 모듈 (제안) | 예상 LOC |
|---|---|---|---|---|
| `src/contentGenerator.ts` | 10,507 | 글 생성 진입점 + 프롬프트 빌드 + provider 라우팅 + 검증/필터 + 후처리 | (a) `content/title-pipeline.ts`<br>(b) `content/validators.ts`<br>(c) `content/prompt-builder.ts`<br>(d) `content/provider-router.ts` (gemini/claude/openai/perplexity)<br>(e) `content/finalizer.ts` | 각 ≤ 800 |
| `src/main.ts` | 9,659 | Electron 부트 + 105 IPC 핸들러 + 윈도우 4개 + 라이센스 + 자동업데이트 | (a) `main/bootstrap.ts` (app/Tray/Menu)<br>(b) `main/ipc/{namespace}Handlers.ts` (잔류 105개 이주)<br>(c) `main/windows/*.ts` (login/main/license)<br>(d) `main/services/autoUpdater.ts` | ≤ 600 / 각 |
| `src/naverBlogAutomation.ts` | 9,219 | 발행 워크플로우 + 로그인/세션 + 에디터 조작 + 결과 검증 | (a) `automation/workflow.ts`<br>(b) `automation/loginFlow.ts`<br>(c) `automation/editorFlow.ts`<br>(d) `automation/publishFlow.ts`<br>(e) `automation/verifyFlow.ts` | 각 ≤ 800 |
| `src/renderer/renderer.ts` | 9,106 | 13K → 8.8K로 축소된 레거시 모놀리스. 잔존 책임 분산 필요 | 진행 중인 `renderer/modules/*` 패턴 계속 — 이벤트 바인딩, 폼 검증, IPC 어댑터를 별도 모듈로 | 목표 ≤ 2,000 |
| `src/sourceAssembler.ts` | 7,156 | 외부 데이터 소스 통합 + 정규화 + 머지 | (a) `assembler/sources/*.ts` (소스별)<br>(b) `assembler/normalize.ts`<br>(c) `assembler/merge.ts`<br>(d) `assembler/index.ts` (orchestrator) | 각 ≤ 800 |

## 의존성 다이어그램 (텍스트)

### 현재 상태 (위반)
```
[main.ts] ─── (이미 일부 분리)
   ↓                    ↑ 역참조
[main/ipc/*]      [image/*]
   ↓                    ↑
[main/services/*]  [crawler/*]   ← 레이어링 위반:
   ↓                    ↑          도메인이 main 측 서비스를 import
[automation/*]   [services/bestProductCollector]
   ↓
[contentGenerator.ts] ─→ [renderer.ts] (type-only이지만 강결합)
```

### 목표 상태 (헥사고날)
```
[main]                [renderer]
  ↓ depends             ↓ depends
[main/ports/*]        [preload bridge]
  ↑ implements          
[main/adapters/*]     [renderer/modules/*]
  ↓
[domain/automation]  [domain/content]  [domain/image]  [domain/crawler]
                              ↑
                         [domain/shared]
```

## 레이어링 위반 사례 (구체)

| 위반 | 파일 | import |
|---|---|---|
| 1 | `src/image/deepinfraGenerator.ts` | `../main/services/AutomationService.js` |
| 2 | `src/image/leonardoAIGenerator.ts` | `../main/services/AutomationService.js` |
| 3 | `src/image/openaiImageGenerator.ts` | `../main/services/AutomationService.js` |
| 4 | `src/crawler/crawlerBrowser.ts` | `../main/utils/adsPowerManager.js` |
| 5 | `src/services/bestProductCollector.ts` | `../main/services/AutomationService.js` |
| 6 | `src/renderer/renderer.ts` | `../contentGenerator.js` (type-only) |

## 모듈 분리 마이그레이션 단계

### Stage A — IPC 잔류 이주 (P0, 1주)
1. `main.ts`의 `ipcMain.handle/on` 105개를 namespace별로 분류:
   - `main/ipc/contentHandlers.ts` (글 생성 IPC)
   - `main/ipc/automationHandlers.ts` (발행 IPC)
   - `main/ipc/configHandlers.ts` (설정 IPC)
   - `main/ipc/imageHandlers.ts` (이미 일부 존재)
   - `main/ipc/systemHandlers.ts` (이미 존재)
2. `registerOnce(channel, handler)` 가드 추가 — 이중 등록 silent regression 방지
3. main.ts에 `registerAllIpcHandlers()` 한 줄로 호출
4. **예상 main.ts 감축: 9,659 → 약 5,500줄**

### Stage B — 도메인 ↔ main 역참조 끊기 (P1, 2주)
1. `BrowserHostPort` 인터페이스 정의 (`domain/automation/ports/BrowserHostPort.ts`)
2. `AutomationService`가 이 포트를 implement
3. `image/*`, `crawler/*`, `services/*`는 포트를 주입받음 (의존성 역전)
4. `adsPowerManager`도 같은 패턴 (`AdsHostPort`)
5. **레이어링 위반 5건 모두 해소**

### Stage C — contentGenerator 5분할 (P2, 4주)
1. 기존 `src/content/contentGenerator/` 디렉터리 활용
2. 5분할 (위 표 참조)
3. 각 분할당 unit test 추가 (현재 testCoverage 3.7% → contentGenerator 영역 커버)
4. **예상 contentGenerator.ts 감축: 10,507 → 0 (proxy re-export만)**

### Stage D — sourceAssembler 분해 (P3, 4주)
1. 외부 소스별 어댑터 추출
2. 정규화·머지 분리
3. orchestrator만 진입점

### Stage E — renderer.ts 잔여 책임 분산 (P3, 6주)
1. 진행 중인 `renderer/modules/*` 패턴 계속
2. 이벤트 바인딩 / 폼 검증 / IPC 어댑터 모듈 분리
3. 목표 ≤ 2,000줄

## 위험도 평가

| Stage | 회귀 가능성 | 의존 사슬 | 권고 |
|---|---|---|---|
| A | 중 | IPC 채널 이름 단일 진실 보장 필요 | `registerOnce` 가드 + smoke 테스트 |
| B | 중상 | image/crawler/services 모두 영향 | 포트 정의 후 단계적 마이그레이션 |
| C | 상 | LLM 응답 처리 핵심. 회귀 시 글 품질 직격 | 분할 전후 동일 입력 회귀 테스트 |
| D | 중 | 외부 소스 변경 시 영향 | 소스별 단위 테스트 |
| E | 저 | UI 단의 점진적 작업 | 모듈별 PR |

## 신규 모듈 (v2.7.27) 평가

| 파일 | LOC | 적절성 | 비고 |
|---|---|---|---|
| `src/runtime/adaptiveLimiter.ts` | 100 | ✅ 적절 | 200줄 이내, electron 직접 import 없음 |
| `src/runtime/runtimeStats.ts` | 102 | ⚠️ 개선 권고 | `process.env.TEMP`가 함수 내 박혀 있어 테스트 주입성 약함 — 경로를 인자로 받도록 |
| `src/diagnostics/eventLoopWatchdog.ts` | 116 | ✅ 적절 | runtime 모듈만 import (단방향) |
| `src/diagnostics/lowSpecMode.ts` | 85 | ✅ 적절 | os 모듈만 사용 |
