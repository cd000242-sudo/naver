# explorer 상세 — 코드베이스 통계 보강

**측정일:** 2026-04-28 / **앱:** v2.7.27 / **에이전트 잘림 → 메인 세션 직접 측정**

## god-file Top 25 (LOC 정렬)

| LOC | 파일 |
|---|---|
| 10,507 | `src/contentGenerator.ts` |
| 9,659 | `src/main.ts` |
| 9,219 | `src/naverBlogAutomation.ts` |
| 9,106 | `src/renderer/renderer.ts` |
| 7,156 | `src/sourceAssembler.ts` |
| 5,092 | `src/renderer/modules/continuousPublishing.ts` |
| 5,007 | `src/renderer/modules/headingImageGen.ts` |
| 4,456 | `src/renderer/modules/multiAccountManager.ts` |
| 3,365 | `src/automation/imageHelpers.ts` |
| 3,303 | `src/renderer/modules/fullAutoFlow.ts` |
| 3,172 | `src/automation/editorHelpers.ts` |
| 3,101 | `src/crawler/productSpecCrawler.ts` |
| 3,000 | `src/renderer/modules/thumbnailGenerator.ts` |
| 2,649 | `src/renderer/components/HeadingImageSettings.ts` |
| 2,225 | `src/automation/publishHelpers.ts` |
| 2,114 | `src/image/imageFxGenerator.ts` |
| 1,971 | `src/image/nanoBananaProGenerator.ts` |
| 1,858 | `src/renderer/categoryPrompts.ts` |
| 1,757 | `src/renderer/modules/videoManager.ts` |
| 1,715 | `src/renderer/modules/localImageModals.ts` |
| 1,678 | `src/crawler/smartCrawler.ts` |
| 1,658 | `src/analytics/keywordAnalyzer.ts` |
| 1,654 | `src/renderer/modules/publishingHandlers.ts` |
| 1,596 | `src/renderer/modules/contentGeneration.ts` |

## 디렉터리별 통계 (상위 20)

| 디렉터리 | 파일 | LOC |
|---|---|---|
| `src/renderer/` | 86 | 71,609 |
| `src/image/` | 25 | 13,021 |
| `src/crawler/` | 25 | 11,241 |
| `src/automation/` | 18 | 11,233 |
| `src/main/` | 37 | 8,261 |
| `src/__tests__/` | 53 | 7,777 |
| `src/content/` | 18 | 5,740 |
| `src/agents/` | 15 | 4,489 |
| `src/tests/` | 18 | 3,357 |
| `src/analytics/` | 6 | 2,946 |
| `src/ui/` | 19 | 2,433 |
| `src/services/` | 7 | 1,962 |
| `src/engagement/` | 3 | 1,171 |
| `src/enhancer/` | 2 | 1,017 |
| `src/debug/` | 3 | 848 |
| `src/monitor/` | 3 | 608 |
| `src/scheduler/` | 3 | 515 |
| `src/account/` | 1 | 498 |
| `src/learning/` | 3 | 361 |
| `src/utils/` | 1 | 347 |

## 의존성 카운트

| 종류 | 수 | 무거운/중복 |
|---|---|---|
| dependencies | 36 | puppeteer + puppeteer-extra + plugin-stealth, playwright + playwright-extra, ghost-cursor + ghost-cursor-playwright, selenium-webdriver — **자동화 8 라이브러리 동시 채택** |
| devDependencies | 17 | electron 31, electron-builder 26, typescript 5.5, vitest 4 |

## 테스트 매핑

- `*.test.ts` 총 52개 (대부분 `src/__tests__/`)
- 테스트 LOC 7,777 / 본문 200K → **테스트 비율 3.7%**
- 메모리 기록과 일치 (커버리지 3.72%)

## IPC 분포

- `main.ts` 인라인 핸들러: **103~105개** (라인별 카운트 차이는 정규식 범위)
- `src/main/ipc/` 분리된 핸들러: **161개**
- `preload.ts` `ipcRenderer.invoke`: **258회** (라인 수 1,051)
- BrowserWindow 생성 위치: 4곳 (main.ts L1478, L1577, L8160, L8420)

## 비어있는 디렉터리 / 떠다니는 파일

- 빈 디렉터리: `src/shared/`, `src/prompts/`, `src/cafe/`
- `src/` 루트에 `.ts` 25개 떠있음 (god-file `contentGenerator.ts`, `aiHumanizer.ts`, `sourceAssembler.ts` 등 도메인 모델 미분류)
