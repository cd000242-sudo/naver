# Architect 검진 요약 (2026-04-28)

## 핵심 발견 5

1. **God-file 5개 합산 47,618줄** — 300줄 한도 대비 평균 31배 초과. `contentGenerator.ts`(10,507) `main.ts`(9,659) `naverBlogAutomation.ts`(9,219) `renderer.ts`(9,106) `sourceAssembler.ts`(7,156). CLAUDE.md 규칙(파일당 300줄, 800줄 hard-max) 정면 위반.
2. **IPC 분산 미완 (이중 등록 위험)** — `src/main/ipc/`에 21개 핸들러 파일(161 채널 분리)이 이미 존재하지만 `main.ts`에 여전히 105개 `ipcMain.handle` 호출이 잔존. 분리 작업이 절반에서 멈춰 있고, 동일 채널 이중 등록 발생 시 마지막 등록만 살아남는 silent regression 위험.
3. **레이어링 위반 — image/crawler/services → main 역참조** — `src/image/{deepinfraGenerator,leonardoAIGenerator,openaiImageGenerator}.ts`, `src/crawler/crawlerBrowser.ts`, `src/services/bestProductCollector.ts`가 `../main/services/AutomationService.js` `../main/utils/adsPowerManager.js`를 import. 도메인 레이어가 Electron-bound main 레이어에 의존하는 역방향 화살표.
4. **Renderer가 Node 타입(`StructuredContent`)에 직접 의존** — `renderer.ts`는 `../contentGenerator.js`(Node-only, electron 의존)에서 type을 가져옴. preload IPC 경계를 우회한 강결합으로 type-only import라도 ts/build 그래프상 도메인 모델 변경이 UI까지 전파.
5. **신규 runtime/diagnostics 모듈 — 위치는 적절, 결합 경로는 깨끗** — 4개 파일 모두 200줄 이하, electron 직접 import 없음, 단방향(diagnostics → runtime)만 존재. main.ts에서만 진입. 단 `runtimeStats.ts`의 stats 파일 경로가 `process.env.TEMP`에 직접 박혀 있어 테스트성/주입 가능성 약함.

## 권고 우선순위 Top 3

- **P0 (이번 주) — IPC 핸들러 잔류 105개 마저 이주.** main.ts → main/ipc/{namespace}Handlers.ts. 이중 등록 가드 추가(`registerOnce` 래퍼). 완료 시 main.ts 약 4,000줄 감축 예상.
- **P1 (2주) — main 역참조 5건 끊기.** `AutomationService` `adsPowerManager`가 image/crawler/services에서 호출되는 부분을 인터페이스(예: `BrowserHostPort`, `StopSignal`)로 추상화하고 main 측에서 주입. 헥사고날 ports & adapters 패턴.
- **P2 (4주) — contentGenerator.ts 도메인 분해.** 이미 `contentGenerator/` 디렉터리(현재 schema.ts 1개)가 있음. (a) title pipeline, (b) validators, (c) prompt builder, (d) provider router(gemini/claude/openai/perplexity), (e) finalizer로 5분할. 각 800줄 이하 목표.
