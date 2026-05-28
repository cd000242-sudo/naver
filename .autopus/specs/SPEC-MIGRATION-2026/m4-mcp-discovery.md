# M4 P1 — MCP Discovery (도입 후보 영역 분석)

**SPEC-MIGRATION-2026 / M4 / P1**
**Status**: discovery-complete
**Created**: 2026-05-28

## 현황

이 Electron 앱(better-life-naver) **내부**에 MCP (Model Context Protocol) 클라이언트/서버는 0건. `.mcp.json`은 Claude Code 개발 워크플로우용 6개 외부 서버 (context7/github/memory/exa/playwright/sequential-thinking)만 등록되어 있고, 앱 런타임은 MCP를 사용하지 않는다.

| 검색 항목 | 결과 |
|----------|------|
| `@modelcontextprotocol/sdk` (package.json) | 미의존 |
| `mcp` / `Model Context Protocol` 문자열 (TypeScript src) | 0건 |
| `.mcp.json` (root) | 개발 도구 전용 |
| `.claude/settings.json` | `mcp__sequential-thinking__sequentialthinking` 권한만 |

## 도입 가치 분석 — 후보 영역 3가지

### 후보 1: AI Agent Orchestration (콘텐츠 생성)
**현황**: 현재 `contentGenerator.ts` (8K LOC)에서 Gemini/OpenAI/Claude/Perplexity 호출이 if-else로 분기. 각 provider 호출이 독립.

**MCP 적용 시 효과**:
- 각 provider를 MCP server로 추상화 → contentGenerator.ts god file 분할 가능
- multi-LLM 비교/투표 (debate) 패턴 구현 용이
- 새 provider 추가 시 server endpoint만 등록

**비용**:
- MCP server 4개 작성 (provider별) — ~600 LOC × 4 = 2.4K LOC
- contentGenerator.ts 통합 hunks ~3개
- 회귀 위험: HIGH (god file 전면 리팩토링)

**ROI**: MEDIUM. 효과는 명확하나 god file 분할이 선결. SPEC-CONVERSION-001과 충돌 가능.

### 후보 2: 다중 계정 Context 브리징 (Memory MCP)
**현황**: `accountManager.ts` + `licenseManager.ts`로 계정별 세션/설정 관리. 메모리 + JSON 파일.

**MCP 적용 시 효과**:
- 계정 전환 시 last-known state를 Memory MCP server에 보존
- 다중 계정 발행 패턴 학습 (시각/주제/품질) 누적
- 사용자 PC 간 동기화 (옵션)

**비용**:
- Memory MCP server 통합 ~300 LOC
- accountManager 통합 hunks ~2개
- 회귀 위험: MEDIUM (계정 격리 깨질 위험)

**ROI**: LOW. 현재 JSON 파일 기반으로 충분. 사용자가 다중 PC 동기화 요청한 적 없음.

### 후보 3: 자동화 의사결정 (Sequential Thinking MCP)
**현황**: `recovery/coordinator.ts`에서 발행 실패 시 분류 + 재시도 결정을 if-else 트리.

**MCP 적용 시 효과**:
- 복잡한 실패 시나리오 분석 (다중 신호 종합)
- 사용자에게 "왜 실패했는지" 자연어 설명
- 실패 패턴 학습 (개인화)

**비용**:
- Sequential Thinking MCP server 통합 ~250 LOC
- coordinator 통합 hunks ~3개
- 회귀 위험: LOW (실패 경로만 영향)

**ROI**: LOW-MEDIUM. 발행 성공률이 이미 높음 (사용자 보고 기준). 실패 시나리오 개선 효과는 제한적.

## 결론 + 권장

**현재 시점에서 MCP 도입 권장 하지 않음**. 이유:

1. 후보 3개 모두 ROI가 다른 우선순위 작업(M1 safeStorage, M2 Playwright)보다 낮음
2. MCP server 추가는 의존성 + 빌드 복잡도 증가 (Electron 앱은 빌드 시간 이미 5~10분)
3. 사용자가 MCP 자체에 대한 명시 요구사항 없음 (단지 "마이그레이션" 전체 언급에 포함)
4. M1 + M2 완료 후 contentGenerator.ts god file이 분할되면 후보 1 (AI Agent Orchestration)의 ROI가 상승할 가능성. 그 시점에 재평가.

## 다음 행동

- M4는 **본 SPEC scope 외 (discovery only)** 로 마감.
- M1 P3 (safeStorage 점진 암호화) + M2 P3 (Playwright 마이그레이션) 완료 후 6개월 시점에 후보 1 (AI Agent Orchestration) 재평가.
- 사용자가 명시적으로 MCP 도입을 요청하면 후보 2 또는 3부터 P2 (Design) 진입.

## Related

- [SPEC-MIGRATION-2026/spec.md](spec.md)
- [SPEC-CONVERSION-001](../SPEC-CONVERSION-001/) — 전환 엔진 (contentGenerator 분할 의존)
