# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Better Life Naver** (v1.3.16) — 네이버 블로그 자동화 Electron 데스크톱 앱.
Electron + TypeScript + Puppeteer/Playwright 기반의 블로그 콘텐츠 자동 생성/발행 시스템.

## Tech Stack

- **Framework:** Electron v31
- **Language:** TypeScript (268+ .ts files)
- **Browser Automation:** Puppeteer, Playwright (stealth plugins)
- **AI:** Anthropic Claude, Google Gemini, OpenAI, Perplexity
- **Image:** Sharp, ImageFX, @imgly/background-removal
- **Database:** MongoDB (Mongoose), Redis
- **Build:** electron-builder (NSIS, portable, dir)

## Architecture

```
src/
├── main/           — Electron main process (IPC, services)
├── renderer/       — UI renderer (renderer.ts: 13,000+ lines, modules/ for split)
│   ├── modules/    — 45 UI modules
│   └── types/      — Type definitions
├── automation/     — Browser automation (editor, image, publish)
│   └── selectors/  — 중앙 셀렉터 레지스트리 (Phase 1-1)
├── errors/         — 에러 코드/클래스 체계 (Phase 2-2)
├── engagement/     — 댓글 크롤링/자동 응답 (Phase 3-2, 5-1)
├── monitor/        — 운영 대시보드/모니터링 (Phase 4-3)
├── publisher/      — Post-publish boosting
├── crawler/        — Web crawling
├── image/          — Image processing pipeline
├── content/        — Content generation
├── services/       — Business logic services
└── utils/          — Shared utilities
```

## Build & Run

```bash
# Build
npm run build

# Start (build + run)
npm run start

# Dev (without rebuild)
npm run dev

# Release (NSIS installer)
npm run release

# Full release (all formats)
npm run release:full
```

## Testing

```bash
npm run self-test          # Smoke test
npm run test:integration   # Integration test
npm run test:images        # Image smoke test
npm run test:login         # Login test
npm run test:full-flow     # Full flow test
```

## Key Modules

- **콘텐츠 생성:** `src/contentGenerator.ts`, `src/contentOptimizer.ts`, `src/aiHumanizer.ts`
- **AuthGR 방어:** `src/authgrDefense.ts` — AI 지문 분석, 전문성 주입, 품질 평가
- **QUMA-VL 대응:** `src/image/imageTextConsistencyChecker.ts` — 이미지-텍스트 일관성 검증
- **자동 발행:** `src/automation/`, `src/renderer/modules/continuousPublishing.ts`
- **발행 제어:** `src/postLimitManager.ts`, `src/publishingStrategy.ts` — 빈도/한도 지능화
- **이미지 처리:** `src/image/imageFormatPipeline.ts` — 포맷 변환, EXIF 제거, 크기 검증
- **셀렉터 관리:** `src/automation/selectors/` — 중앙 레지스트리 + 원격 업데이트
- **에러 체계:** `src/errors/` — ErrorCode enum + AutomationError 클래스
- **세션 관리:** `src/sessionPersistence.ts` — 쿠키 저장/복원, 세션 워밍업
- **댓글 시스템:** `src/engagement/commentCrawler.ts`, `src/engagement/commentChain.ts`
- **모니터링:** `src/monitor/operationsDashboard.ts` — 셀렉터/품질/발행/세션 메트릭
- **라이선스:** `src/licenseManager.ts`, `src/licenseFallback.ts` — 이중화 + 오프라인 그레이스
- **스케줄링:** `src/scheduler/smartScheduler.ts`, `src/scheduler/daily.ts`
- **크롤링:** `src/crawler/`, `src/naverBlogCrawler.ts`

## Selector Registry

네이버 에디터 CSS 셀렉터를 중앙 관리. 네이버 UI 변경 시 코드 수정 최소화.

```typescript
import { SELECTORS, findElement, waitForElement } from './automation/selectors';

// 사용법
const el = await findElement(page, SELECTORS.login.idInput, 'idInput');
const btn = await waitForElement(frame, SELECTORS.publish.confirmPublishButton, 'confirm');
```

- `loginSelectors.ts` — 로그인 (7개 엔트리)
- `editorSelectors.ts` — 에디터 (23개 엔트리)
- `publishSelectors.ts` — 발행/카테고리/예약 (25개 엔트리)
- `imageSelectors.ts` — 이미지 (14개 엔트리)
- `ctaSelectors.ts` — CTA (7개 엔트리)
- `remoteUpdate.ts` — 원격 패치 + 텔레메트리

## Development Notes

- `renderer.ts` is 13,000+ lines — use modules/ for new UI features
- Package manager: npm
- Cross-platform: Windows primary, macOS secondary
- Stealth mode: puppeteer-extra-plugin-stealth for anti-detection
- Korean language content — maintain Korean UI strings
- 236+ unit tests via vitest (`npx vitest run`)

## Key Commands

- `/plan` - Implementation planning
- `/tdd` - Test-driven development workflow
- `/code-review` - Quality review
- `/build-fix` - Fix build errors
- `/e2e` - Generate and run E2E tests
- `/verify` - Verify implementation
- `/quality-gate` - Quality gate check
- `/docs` - Update documentation
- `/refactor-clean` - Clean refactoring

## Agent System

This project uses the Everything Claude Code (ECC) agent system:
- **agents/** — Specialized subagents (planner, code-reviewer, security-reviewer, etc.)
- **rules/** — Always-follow coding guidelines (common + TypeScript)
- **commands/** — Slash commands

## Contributing

- Follow conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Use TypeScript strict mode
- No hardcoded API keys — use .env
- Test before commit
