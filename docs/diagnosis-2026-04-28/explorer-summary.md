# Better Life Naver v2.7.27 — Explorer 요약

**측정 시점**: 2026-04-28
**작업 디렉터리**: `c:\Users\박성현\Desktop\리더 네이버 자동화`

## 핵심 수치

| 항목 | 수치 |
|---|---|
| `src/` TS 파일 수 | 415 |
| `src/` 총 LOC | 209,094 |
| 평균 LOC/파일 | 약 504 |
| 300줄 초과 파일 | 148 |
| 800줄 초과 (god-file) | 50 |
| `dependencies` | 36 |
| `devDependencies` | 17 |
| Vitest 테스트 파일 | 52 |
| 테스트 LOC | 7,769 |
| 1단계 디렉터리 | 35 |
| `ipcMain.handle/on` (main.ts) | 103 |
| `ipcMain.handle/on` (main/ipc/) | 161 |
| `ipcRenderer.invoke` (preload) | 258 |
| `BrowserWindow` 생성 위치 | 4 (main: 1478, 1577, 8160, 8420) |

## 즉시 눈에 띄는 이상 신호 5개

1. **god-file 5개가 5,000줄 이상**: `contentGenerator.ts` 10,507 / `main.ts` 9,659 / `naverBlogAutomation.ts` 9,219 / `renderer/renderer.ts` 9,106 / `sourceAssembler.ts` 7,156. CLAUDE.md `300줄 제한`을 33~35배 초과.
2. **`renderer/` 단일 디렉터리가 LOC 절반 점유**: 71,609 LOC / 86 파일 (전체의 34%). 14개 모듈이 1,000줄 초과.
3. **IPC 노출 면적 불균형**: main.ts에 103개 핸들러가 인라인으로 남아있는 동시에, `main/ipc/`로 분리된 핸들러도 161개 존재 — 이중 등록 패턴.
4. **브라우저 자동화 라이브러리 중복**: `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `playwright`, `playwright-extra`, `ghost-cursor`, `ghost-cursor-playwright`, `selenium-webdriver` 8개 동시 채택.
5. **빈 디렉터리 3개 + 1단계 단독 파일 25개**: `src/shared/`, `src/prompts/`, `src/cafe/`가 비어있고, `src/` 루트에 `.ts` 25개가 떠 있음 (`contentGenerator.ts`, `aiHumanizer.ts`, `sourceAssembler.ts` 등).

## 신규 모듈 (v2.7.27)

| 파일 | LOC |
|---|---|
| `src/runtime/adaptiveLimiter.ts` | 100 |
| `src/runtime/runtimeStats.ts` | 102 |
| `src/diagnostics/eventLoopWatchdog.ts` | 116 |
| `src/diagnostics/lowSpecMode.ts` | 85 |

