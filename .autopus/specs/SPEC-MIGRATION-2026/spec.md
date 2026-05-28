# SPEC-MIGRATION-2026: 앱 전체 마이그레이션 4축 통합 Plan

**Status**: draft
**Created**: 2026-05-28
**Domain**: SECURITY + INFRA + AI
**Target Module**: better-life-naver (root)
**Version Context**: v2.11.1 → v2.12.0~v2.14.0 (단계적 진행)
**Trigger**: 사용자 명시 요청 — "API 키나 보안, 플레이라이트 등등 MCP 등등 마이그레이션을 진행"

## 목적

v2.11.1 시점에서 4-agent 종합 탐색으로 드러난 4가지 기술 부채를 단계적으로 해소:

1. **API 키 평문 저장** — 12 API 키 + 2 자격증명이 `userData/settings.json`에 평문. Electron safeStorage 미적용. (CRITICAL)
2. **Puppeteer ↔ Playwright 이원화** — 6 파일 ~12K LOC가 Puppeteer, 5 파일 ~4.2K LOC가 Playwright. 단일 자동화 라이브러리로 통일 필요. (HIGH)
3. **GPT/Claude 그라운딩 미지원** — Gemini만 `googleSearch` tool 활성. OpenAI는 search-preview 모델 분기 필요, Claude는 Anthropic SDK 0.30+ 필요. (MEDIUM)
4. **MCP 미통합** — `.mcp.json`은 Claude Code 개발용. Electron 앱 내부에 MCP 클라이언트 미통합. AI 에이전트 오케스트레이션 + 컨텍스트 브리징 후보. (LOW, 옵션)

## 핵심 컨텍스트 (사전 분석 결과 — 4-agent 종합)

### 사용처 매트릭스

#### M1: API 키 보안 (`configManager.ts` 평문 JSON)

| 키 종류 | 필드명 | 위험도 |
|--------|-------|--------|
| Gemini | `geminiApiKey`, `geminiApiKeys[]` | HIGH |
| OpenAI | `openaiApiKey`, `openaiImageApiKey` | HIGH |
| Claude | `claudeApiKey` | HIGH |
| Perplexity | `perplexityApiKey` | HIGH |
| Leonardo AI | `leonardoaiApiKey` | HIGH |
| DeepInfra | `deepinfraApiKey` | HIGH |
| Naver Search API | `naverClientId`, `naverClientSecret`, `naverDatalab*`, `naverAd*` | HIGH |
| Naver 로그인 | `savedNaverId`, `savedNaverPassword` | **CRITICAL** |
| 라이선스 | `savedLicenseUserId`, `savedLicensePassword` | **CRITICAL** |

저장 경로: `app.getPath('userData')/settings.json` + `Documents/_safe/` 미러 백업.
Electron `safeStorage.encryptString/decryptString` 미사용.

#### M2: Puppeteer ↔ Playwright 이원화

| 라이브러리 | 버전 | 용도 | 파일 수 | LOC |
|-----------|------|------|--------|-----|
| `puppeteer-extra` + `puppeteer-extra-plugin-stealth` | 3.3.6 / 2.11.2 | 로그인, 발행, 크롤링 | 6 | ~12,300 |
| `playwright` + `playwright-extra` | 1.60 / 4.3.6 | 이미지(ImageFX), 쇼핑(Coupang), Flow | 5 | ~4,200 |
| `@playwright/test` | 1.60 | E2E 테스트 | 2 | ~200 |

핵심 god file: `src/naverBlogAutomation.ts` (3,400 LOC), `src/crawler/productSpecCrawler.ts` (3,500 LOC).

#### M3: GPT/Claude 그라운딩 현황

| Provider | SDK 버전 | Grounding 지원 | 코드 위치 |
|----------|---------|--------------|----------|
| Gemini | `@google/generative-ai@0.24` | ✅ `tools: [{ googleSearch: {} }]` | `contentGenerator.ts:5189` |
| OpenAI | `openai@4.104` | ⚠️ `web_search_options` (search-preview 모델만) | `contentGenerator.ts:5807-5955` (미적용) |
| Claude | `@anthropic-ai/sdk@0.21` | ❌ `web_search_20250305` 미지원 (0.30+ 필요) | `contentGenerator.ts:6034-6227` (미적용) |
| Perplexity | direct API | ✅ Sonar 자체 검색 내장 | `contentGenerator.ts:5655-5802` |

#### M4: MCP 사용 현황

- `.mcp.json` — Claude Code 개발용 6개 서버 (context7/github/memory/exa/playwright/sequential-thinking)
- `@modelcontextprotocol/sdk` — package.json 미의존
- Electron 앱 내부 MCP 클라이언트 0건

### 빌드/런타임 제약

- Node 20.20.2 (electron 31 내장 Node 20.14)
- TS 5.5 / target ES2020 / module CommonJS
- 2413/2413 vitest 통과 baseline (v2.11.1)
- god file: contentGenerator.ts (8K+ LOC), renderer.ts (10K+ LOC), naverBlogAutomation.ts (3.4K), main.ts (~14K)
- ESM 전환 불가: ts-node esm:false, dist는 CJS로 출력
- electron 31 → 41 미적용 (Stage 5 별도 SPEC)

## 요구사항 (EARS 형식)

### R1: 단계적 마이그레이션

WHEN any 4 migration 축이 시작될 때 THE SYSTEM SHALL 4 Phase로 분리 (P1=Quick win, P2=설계 + 사용자 승인, P3=점진 마이그레이션, P4=검증 + 폐기) 후 사용자 승인 없이 P2 이상 진행 금지.

### R2: 회귀 차단 (cascade 방지)

WHERE 1 릴리즈는 1 marathon migration의 1 Phase까지만 포함한다. WHERE god file (contentGenerator/naverBlogAutomation/renderer/main) hunk 변경은 1 릴리즈 ≤3 hunks. WHILE 마이그레이션 진행 중 5개 기존 모드(SEO/홈판/쇼핑/사용자정의/업체) 풀오토 회귀 0 의무.

### R3: 하위 호환

WHEN safeStorage 마이그레이션이 적용되면 THE SYSTEM SHALL 평문 JSON → 암호화 자동 변환 (1회). 사용자 재입력 요구 금지. 다음 앱 실행 시 자동 1회 처리 + 마이그레이션 완료 flag로 재처리 방지.

### R4: API 키 회수 가능성

WHEN safeStorage decrypt 실패 시 (예: 다른 PC, OS 재설치) THE SYSTEM SHALL 사용자에게 재입력 요청 + 명확한 안내 메시지 표시. silent 폴백 금지 (feedback_no_fallback).

### R5: Puppeteer 폐기 조건

WHERE 모든 Puppeteer 사용처가 Playwright로 이관 완료된 후 THE SYSTEM SHALL `puppeteer-extra` + `puppeteer-extra-plugin-stealth` 의존성 폐기. WHILE 부분 이관 중 두 라이브러리 동시 사용 허용 (메모리 600MB+ 주의).

### R6: Stealth Plugin 정합

WHEN Playwright 마이그레이션이 적용되면 THE SYSTEM SHALL `playwright-extra` + `puppeteer-extra-plugin-stealth`(playwright-extra 경유)로 stealth 보장. 봇 감지 회피 동작 보존.

### R7: Grounding optional

WHEN GPT/Claude grounding이 추가되면 THE SYSTEM SHALL UI 토글로 사용자 선택. 디폴트 OFF (비용 ↑). 사용자 명시 ON 시에만 활성.

### R8: MCP 옵션

WHILE MCP 도입은 R7과 무관한 옵션 영역. 사용자 명시 요청 시에만 진행 (현재 본 SPEC scope 외).

## Phase 분할 (각 축별 4 Phase)

### M1 API 키 보안 (safeStorage) — 4 Phase, 6주

#### P1.M1 Quick win — 보안 헤더 + 평문 위험 안내
- `WindowManager.ts`: `sandbox: true` 추가 + CSP 헤더 + `enableRemoteModule: false`
- Settings UI에 "보안 강화 권장" 1회 안내 모달 (다음 업데이트에서 자동 암호화 예고)
- 추정: 1 commit / 1일

#### P2.M1 Design — safeStorage wrapper + 마이그레이션 plan
- `src/security/safeStorageWrapper.ts` 신규 (~200 LOC)
- `src/security/encryptionMigrator.ts` 신규 (~150 LOC) — 평문 → 암호화 1회 변환
- `configManager.ts` 1 hunk — safeStorage 통합 진입점
- 사용자 승인 대기 (보안 정책 + 키 회수 시나리오 검토)
- 추정: 1 commit / 1일

#### P3.M1 Migration — 점진 암호화 적용
- 12 API 키 + 2 자격증명 각각 safeStorage.encryptString 적용
- 마이그레이션 flag (`configEncrypted: true`)로 1회 처리 보장
- `Documents/_safe/` 미러 백업 폐기 또는 암호화
- 추정: 2 commits / 3일

#### P4.M1 Verify + 보안 감사
- 사용자 별도 PC에서 1회 .exe 실행 → 키 회수 시나리오 검증
- 보안 감사 agent로 OWASP 위반 0건 확인
- 추정: 1 commit / 1일 (사용자 dogfood 포함 3일)

### M2 Puppeteer → Playwright — 4 Phase, 8주 (CRITICAL)

#### P1.M2 Quick win — Stealth plugin Playwright 측 검증
- 현재 Playwright Stealth (CoupangProvider 등) 회피 동작 baseline 측정
- Puppeteer Stealth 동작과 1:1 비교 테스트
- 추정: 1 commit / 1일

#### P2.M2 Design — 자동화 추상화 레이어
- `src/automation/browserAdapter.ts` 신규 (~300 LOC) — Puppeteer/Playwright 동시 지원 인터페이스
- 마이그레이션 순서 결정: imageFx(완료) → productSpec(부분) → smartCrawler → browserSessionManager → naverBlogAutomation (가장 고위험)
- 사용자 승인 대기 (자동화 안정성 영향)
- 추정: 1 commit / 2일

#### P3.M2 Migration — 점진 이관 (각 모듈 별도 commit)
- crawler/smartCrawler.ts 이관 (~2K LOC, 1 commit)
- browserSessionManager.ts 이관 (~1K LOC, 1 commit)
- naverBlogAutomation.ts 이관 (~3.4K LOC, 2 commits — 로그인 + 발행 분리)
- main.ts IPC 핸들러 갱신 (3 hunks)
- 각 commit마다 5개 기존 모드 풀오토 회귀 의무
- 추정: 5 commits / 3주

#### P4.M2 Verify + Puppeteer 폐기
- `puppeteer-extra` + `puppeteer-extra-plugin-stealth` package.json 제거
- 봇 감지 회피 동작 14일 베타 관찰
- 추정: 1 commit / 1주 (베타 포함)

### M3 GPT/Claude grounding — 4 Phase, 4주

#### P1.M3 Quick win — Gemini 서버 일시 장애 UI 메시지 제거 (본 commit 포함)
- `contentGenerator.ts:5489` 1 hunk
- 추정: 1 commit / 즉시 (본 SPEC 작성과 동시)

#### P2.M3 OpenAI grounding — search-preview 모델 분기
- `contentGenerator.ts` UI 옵션 `openai-gpt4o-search` 추가 (사용자 명시 선택 시에만)
- `client.chat.completions.create({ model: 'gpt-4o-search-preview', web_search_options: {} })` 분기
- 비용 안내 모달 ($0.025/검색 추가)
- 추정: 2 commits / 3일

#### P3.M3 Claude grounding — SDK 0.21 → 0.30+ 업그레이드
- `@anthropic-ai/sdk` 0.21 → 0.99 (SPEC-DEPS-UPGRADE-2026 Stage 5 의존)
- `contentGenerator.ts:6034-6227` 1 hunk — `tools: [{ type: 'web_search_20250305' }]` 추가
- 사용자 승인 후 진행 (SDK breaking changes 영향)
- 추정: 3 commits / 1주 (SDK 호환 포함)

#### P4.M3 Verify
- 3 provider × 5 모드 = 15 시나리오 dogfood (사용자 베타)
- 추정: 1주 (사용자 dogfood 포함)

### M4 MCP 도입 (옵션) — 4 Phase, 6주

#### P1.M4 Discovery — 도입 후보 영역 분석
- AI agent orchestration / 다중 계정 세션 / 자동화 의사결정 후보 분석
- ROI 평가
- 추정: 1 commit (docs only) / 2일

#### P2~4.M4 — 사용자 명시 요청 시에만

## 5-Phase 마이그레이션 의존성

```
P1.M3 (이번 commit)
    ↓
P1.M1 보안 헤더    P1.M2 Stealth 검증
    ↓              ↓
P2.M1 설계 + 승인  P2.M2 설계 + 승인
    ↓              ↓
P3.M1 마이그레이션  P3.M2 마이그레이션 (병렬 가능, 단 god file 룰 준수)
    ↓              ↓
P4.M1 검증         P4.M2 폐기 + 베타
                                      → P2.M3 OpenAI grounding
                                          → P3.M3 Claude grounding (SDK 0.99 의존)
                                              → P4.M3 dogfood
                                                  → P*.M4 MCP (옵션)
```

## 회귀 위험 매핑

| Phase | 진입 god file | 영향 범위 | 위험 등급 | 완화 |
|-------|--------------|----------|----------|------|
| P1.M3 (이번) | contentGenerator.ts 1 hunk | UI 메시지만 | NONE | 사용자 인지 영향 0 |
| P1.M1 | WindowManager.ts | 보안 정책 | LOW | sandbox=true는 후방 호환 |
| P2.M1 | configManager.ts 1 hunk | 키 저장 경로 | MED | 마이그레이션 flag로 1회 처리 |
| P3.M1 | configManager.ts 2 hunks | 12 API 키 | HIGH | safeStorage decrypt 실패 시 명시 안내 |
| P2.M2 | (신규 모듈) | 자동화 추상화 | NONE | 격리 |
| P3.M2 | naverBlogAutomation.ts | 발행 플로우 전체 | **CRITICAL** | 5개 모드 풀오토 5회 + 베타 |
| P3.M3 | contentGenerator.ts 1 hunk | Claude grounding | MED | SDK 업그레이드 회귀 |

## 롤백 전략

| 축 | 롤백 방법 | 사용자 영향 |
|----|----------|------------|
| M1 P3 | safeStorage flag false → 평문 복구 | 0 (자동) |
| M2 P3 | 각 commit 단위 revert + npm run build | 0 (Phase별) |
| M3 P2 | UI 옵션 disable | 0 (grounding OFF) |
| M3 P3 | SDK 0.99 → 0.21 다운그레이드 | API 호환 검토 필요 |

## 5-Phase 사용자 승인 포인트

| Phase | 사용자가 확인할 것 |
|-------|------------------|
| P1.M3 (이번) | Gemini 서버 일시 장애 UI 안내 사라짐 |
| P1.M1 | "보안 강화 권장" 1회 안내 모달 |
| P2.M1 | safeStorage 동의 + 키 회수 시나리오 검토 |
| P3.M1 | 1회 자동 암호화 후 정상 동작 |
| P2.M2 | 자동화 추상화 인터페이스 검토 |
| P3.M2 | 각 모듈별 풀오토 5회 회귀 0 |
| P2.M3 | 비용 안내 모달 동의 |
| P3.M3 | 3 provider × 5 모드 15 시나리오 dogfood |

## 권장 첫 Phase 시작 시점

**P1.M3: 즉시** (본 SPEC 작성과 동시) — Gemini 서버 일시 장애 UI 메시지 제거 (1 hunk).
**P1.M1: 1주 내** — 보안 헤더 + 사용자 안내. risk 0.
**P2.M1: P1.M1 완료 후 사용자 승인 시** — safeStorage 설계 1회 모달.
**기타: 사용자 명시 요청 시에만** — cascade 룰 + 베타 대기 의무.

## 생성/변경 파일 상세

본 SPEC 자체는 문서. 실제 Phase 별 변경은 별도 PR로:

- P1.M3: contentGenerator.ts +3줄, -4줄
- P1.M1: WindowManager.ts +3줄, 신규 settings UI 모달
- P2.M1: src/security/{safeStorageWrapper,encryptionMigrator}.ts 신규 (~350 LOC)
- P3.M1: configManager.ts 2 hunks, 마이그레이션 flag
- P3.M2: 5 모듈 점진 이관 (Puppeteer API → Playwright API)
- P3.M3: contentGenerator.ts 2 hunks (OpenAI + Claude 분기)

## 의존성 그래프

```
M3 P2 (OpenAI grounding) — UI 옵션 추가만, 즉시 가능
M3 P3 (Claude grounding) — SPEC-DEPS-UPGRADE-2026 Stage 5 (Anthropic 0.99) 선행 필수
M2 P3 (naverBlogAutomation) — M1 P3 (safeStorage) 와 충돌 가능 (configManager hunks 분산)
M1 P3 (safeStorage) — M2 P3 와 commit 분산 의무 (god file 룰)
M4 (MCP) — 사용자 명시 요청 + M1~M3 완료 후
```

## Ref

- 관련 메모리: [feedback_no_cascade_fix], [feedback_regression_check_every_phase], [feedback_no_fallback]
- 관련 SPEC: SPEC-DEPS-UPGRADE-2026 (Stage 5 = Anthropic 0.99, Stage 4 = openai SDK)
- 회귀 사례: v2.10.358 (puppeteer 25), v2.11.0 (_images/_state)
- 4-agent 탐색 결과 통합 (2026-05-28)
