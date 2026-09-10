# SPEC-EVENT-RETRIEVAL-2026 구현 계획

## 순서 원칙

측정 → 판정(비용 0) → 쿼리(비용 증가). **거꾸로 가면 임계를 추측으로 박게 된다.**

---

## Phase 0 — 측정 (코드 변경 없음)

| # | 작업 | 산출 |
|---|---|---|
| 0-1 | 저장본(published-posts + 리서치 노트)에서 이슈형 글 표본 추출 | 표본 목록 |
| 0-2 | 각 글의 재료에 사건 서명(인물·날짜)을 붙여 곁가지 비율 계산 | `baseline.json` |
| 0-3 | `apiUsageTracker` 에 수집 호출 카운터 확인 — 없으면 계측 지점만 특정 | 편당 호출 기준선 |
| 0-4 | F7 임계(N·K) 후보 2~3개를 표본에 대입해 오탐/미탐 비교 | 임계 확정 |

**유료 재실행 금지.** 저장본 재계산으로 한다. 부족하면 그때 사장님께 요청한다.

---

## Phase 1 — 사건 동일성 (비용 0)

| # | 작업 | 파일 | 회귀 위험 |
|---|---|---|---|
| 1-1 | `EventSignature` 타입 + 추출기 (순수) | `src/content/eventSignature.ts` (신규, ~150줄) | 없음 (신규) |
| 1-2 | 기존 부품 조립 — `extractVerifiableClaims`·`extractKoreanFactTokens`·`annotateRelativeDates` | 위 파일 | 없음 (읽기만) |
| 1-3 | 중심 사건 판정 + 강등 판정 (순수) | `src/content/eventCohesion.ts` (신규, ~120줄) | 없음 (신규) |
| 1-4 | 설계도 `offTopic[]` 에 강등 자료 주제 주입 | `sourceAssembler.ts` 또는 blueprint 조립부 1곳 | **낮음** — 추가만 |
| 1-5 | 강등 사유 로그 | 위와 같은 곳 | 없음 |
| 1-6 | 실측 사례 회귀 테스트 (송영진 강등, 김서현·김영웅 유지) | `src/__tests__/eventCohesion.test.ts` | — |

**신규 모듈 2개 → 지문 매니페스트 등록 + 재핀 필수** (`candidateRuntimeFingerprint.ts`).
렌더러 모듈이 아니므로 copy-static 인라인 등록은 불필요.

**Phase 1 종료 조건**: 실측 사례 재현 + 자료 총량 불변 + 전체 vitest GREEN.

---

## Phase 2 — 확장 검색 (비용 증가, Phase 1 결과 후 착수)

| # | 작업 | 파일 | 회귀 위험 |
|---|---|---|---|
| 2-1 | 자료 부족 판정 (순수, 임계는 Phase 0 값) | `src/content/thinMaterialDetector.ts` (신규) | 없음 |
| 2-2 | 키워드 엔티티 분해 (순수) | `src/content/keywordDecomposition.ts` (신규) | 없음 |
| 2-3 | 다리 엔티티 탐지 (순수) | `eventCohesion.ts` 확장 | 낮음 |
| 2-4 | 확장 검색 배선 + 호출 상한 | `contentGeneration.ts:1149` 근처 | **중간** — 수집 경로 |
| 2-5 | 설정 토글 `expandedRetrieval` | 설정 UI + config | 낮음 (옵트인) |
| 2-6 | 회귀 테스트 — 상한 준수·일반 키워드 경로 불변 | 신규 | — |

**2-4 가 유일한 위험 지점.** `contentGeneration.ts:1149` 의 "다른 키워드 사용 금지" 결정을
건드리므로, 일반 키워드 경로가 변하지 않는다는 테스트를 먼저 건다.

---

## 릴리즈 분할

프로젝트 규칙(1릴리즈 1~3픽스)에 따라:

- **릴리즈 A**: Phase 1 전체 (신규 모듈 2개 + 배선 1곳)
- **릴리즈 B**: Phase 2-1~2-3 (순수 함수만, 배선 없음 — 안전)
- **릴리즈 C**: Phase 2-4~2-5 (수집 경로 배선 + 토글)

각 릴리즈마다 회귀 검증: `git diff` 독립 확인 + 전체 vitest + lint + 지문 재핀.

---

## 함정 (기록된 것)

- 신규 모듈은 **지문 매니페스트 등록**을 빠뜨리면 빌드는 통과하고 게이트가 막는다.
- 소스 핀 테스트는 **주석 처리된 호출도 통과**시킬 수 있다 — 살아 있는 줄만 세라.
- 릴리즈는 메인 트리에서만. 범프 → sync-build-define → 재핀 → 커밋 → push → release:full.
