# v2.11.2 — SPEC-MIGRATION-2026 3축 활성화 (보안 · 자동화 통일 · 그라운딩)

본 릴리즈는 SPEC-MIGRATION-2026 4축 마이그레이션 중 3축의 실제 코드 활성화를 포함합니다. 사용자 입력 0건, 회귀 가드 vitest 2434/2434 PASS.

## 🔐 M1 P3 — API 키 at-rest 암호화 자동 활성화 (CRITICAL)

- Electron `safeStorage` 기반 OS 키체인 암호화를 `configManager`에 통합. 평문 → 암호화 1회 자동 마이그레이션 (사용자 재입력 0건, 하위 호환 R3 준수).
- 디스크 항상 `enc:v1:` 접두사 base64. 메모리는 평문 유지 → 기존 provider 호출 100% 호환.
- 마이그레이션 대상 18개 필드 + `geminiApiKeys[]` 배열: Gemini / OpenAI / Claude / Perplexity / Leonardo / DeepInfra / 네이버 검색·데이터랩·광고 API + 네이버 ID/PW + 라이선스 자격.
- 복호화 실패는 silent fallback 0 (feedback_no_fallback). 다른 PC에서 키 불러올 수 없을 때 환경설정 재입력 안내 (console.error로 surface, UI 모달은 후속 hunk).
- safeStorage 미가용 OS (Linux without keyring): 평문 그대로 유지 + skipReason 로깅. 사용자 의사 결정 없이 절대 silent 평문 → 암호화 전환 0.

## 🤖 M2 P3 — Puppeteer browserFactory → Playwright adapter 통일 (HIGH)

- legacy `crawler/utils/browserFactory.ts` (Puppeteer + stealth) 4개 호출 사이트를 `automation/browserAdapter.ts` (Playwright + stealth)로 점진 swap.
- 호출 사이트:
  - `googleImageSearch.ts` searchGoogleImages (L39) — Playwright launchAdaptedBrowser
  - `googleImageSearch.ts` 구글 폴백 in searchImagesForHeadings (L405)
  - `googleImageSearch.ts` crawlImagesFromUrl (L548) — Puppeteer-only API (setUserAgent / evaluateOnNewDocument / setRequestInterception / setViewport / page.on('request')) 제거, adapter context 책임으로 위임. `networkidle2` → Playwright `networkidle` 매핑
  - `strategies/generalStrategy.ts` crawlGeneralPage
- `sourceCollector.ts` launchBrowser re-export 제거 (외부 사용 0건 확인)
- `crawler/utils/browserFactory.ts` 파일 삭제 (코드 호출 0건 도달)
- 봇 감지 회피 stealth plugin 정합 보존 (`playwright-extra`).

## 🔎 M3 P2 — OpenAI GPT-4o Search Preview UI 옵션 노출 (MEDIUM, opt-in)

- 환경설정 텍스트 엔진 선택 영역에 새 라디오 카드 추가: 🔎 GPT-4o Search (웹 그라운딩).
- `model='gpt-4o-search-preview'` + `web_search_options:{}` 분기는 commit fbb93e19에서 이미 도입 → 본 릴리즈는 UI 노출 + 비용 동의 흐름만 추가.
- 1회 비용 동의 모달 (sessionStorage 플래그):
  - 1편당 약 ₩101 ($0.072)
  - 검색 호출 1회당 약 ₩35 ($0.025) 추가
- 거부 시 이전 선택값으로 자동 revert (silent fallback 0, feedback_no_fallback 준수).
- 디폴트 OFF — 실시간 정보가 필요한 글에서만 사용자가 명시 선택해야 활성 (R7 준수).
- LLM 환각 차단 효과: web_search_options ON 시 OpenAI가 실시간 검색 결과를 인용 후 답변.

## 회귀 가드 baseline (v2.11.2 시점)

- vitest 2434/2434 PASS (171 files)
- tsc --noEmit exit 0
- 사용자 검증: M1 P3 safeStorage 마이그레이션은 본인 PC dogfood 필요 (자동 1회 변환). M3 P2 GPT-4o Search는 비용 동의 후 사용.

## 알려진 제한 사항

- M3 P3 (Claude grounding `web_search_20250305`) 는 `@anthropic-ai/sdk` 0.30+ 필요 — Stage 4 별도 SPEC 진행 후 v2.12.x 예정.
- M1 P3 decrypt 실패 시 UI 모달은 후속 hunk. 현재는 console.error로만 surface.
- M2 P3 잔존 Puppeteer 사용처: `naverBlogAutomation.ts`, `productSpecCrawler.ts` 등 god file 영역 — 별도 SPEC 단계적 진행.

## 핵심 commits

- `2730c216` feat(grounding): GPT-4o Search Preview UI 옵션 노출 + 비용 동의 모달 (M3 P2 활성화)
- `fb28b007` feat(security): configManager safeStorage 자동 암호화/복호화 활성화 (M1 P3)
- `a790ac79` feat(automation): Puppeteer browserFactory 전 호출자 Playwright adapter swap + factory 폐기 (M2 P3 완료)
- `b6e4c78b` feat(automation): browserAdapter Playwright + stealth — M2 P3 첫 코드 이관
- `28c1b836` docs(mcp): M4 P1 MCP Discovery (보류 결정)
- `fbb93e19` feat(grounding): OpenAI gpt-4o-search-preview 모델 분기 + web_search_options (M3 P2)
- `d491e88e` feat(security): safeStoragePort + Wrapper + EncryptionMigrator 신규 모듈 (M1 P2)
- `fd827546` feat(security): WindowManager 보안 헤더 강화 — sandbox + partition (M1 P1)

🐙 Generated with SPEC-MIGRATION-2026 — Autopus-ADK
