# SPEC-REVIEW-001 — Plan

## Phases Overview

| Phase | 목적 | 선행 의존 | 예상 시간 | Feature Flag |
|---|---|---|---|---|
| P0 | 즉시 출혈 차단: 데이터 없으면 리뷰 섹션 미생성 | 없음 | 2~4h | `REVIEW_GUARD_V1` |
| P1 | 블로그/일반 모드 댓글 수집(근본 해결) | 없음 (P0 병렬) | 1~1.5d | `USER_VOICE_COLLECT` |
| P2 | 데이터량 기반 분량 탄력화 | P0 완료 후 | 4~6h | `TARGET_LEN_ADAPTIVE` |
| P3 | 환각 검증 레이어(factChecker) + 메트릭 | P1 완료 후 | 1~1.5d | `FACT_CHECK_V1` |

총 예상: 3.5~5일. 롤아웃은 P0 → (P1 ∥ P2) → P3 순서로 점진 공개.

## Task Decomposition

### P0 — 즉시 출혈 차단

| Task ID | Description | File:Line | Agent | Duration |
|---|---|---|---|---|
| T0.1 | `reviewAvailable: boolean` 플래그 도출 | `src/contentGenerator.ts:4404-4411` | executor | 30min |
| T0.2 | `buildFullPrompt()`에서 `reviewAvailable=false` 시 리뷰 블록 "스펙/공식 설명 기반 분석"으로 치환 | `src/promptLoader.ts:600-620` | executor | 45min |
| T0.3 | `shopping_review.prompt`에 조건부 규칙 삽입("리뷰 없을 경우 섹션 생략, '써본/2주 테스트' 금지") | `src/prompts/affiliate/shopping_review.prompt:41-44, 88-92` | executor | 30min |
| T0.4 | `shopping_expert_review.prompt` 동일 규칙 삽입 | `src/prompts/affiliate/shopping_expert_review.prompt:148-156` | executor | 30min |
| T0.5 | 빈 `reviews=[]` 스모크 테스트 3건 작성 | `tests/smoke/review-guard.test.ts` (신규) | tester | 45min |
| T0.6 | 금지 표현 문자열 검출 유틸 | `src/content/forbiddenPhrases.ts` (신규, <80줄) | executor | 30min |

**롤백 조건**: 스모크 3건 중 1건이라도 금지 표현 발견 → P0 재작업.

### P1 — 블로그/일반 모드 리뷰 수집 도입

| Task ID | Description | File:Line | Agent | Duration |
|---|---|---|---|---|
| T1.1 | 네이버 블로그 댓글 DOM 조사 + 덤프 (Pre-P1) | Chrome DevTools + `src/debug/domDumpManager.ts` | main session | 1h |
| T1.2 | 댓글 셀렉터 엔트리 신설 | `src/automation/selectors/commentSelectors.ts` (신규, <100줄) | executor | 45min |
| T1.3 | `commentCrawler.ts`의 수집 함수를 "소스 수집용"으로 export 재정비 | `src/engagement/commentCrawler.ts` | executor | 1h |
| T1.4 | `naverBlogCrawler.ts`에 `comments: string[]` 반환 추가 | `src/naverBlogCrawler.ts:113-512` | executor | 1.5h |
| T1.5 | `sourceAssembler.ts`에 `userVoice: { comments, questions }` 조립 | `src/sourceAssembler.ts` | executor | 1h |
| T1.6 | `*.prompt`에 `{{userVoice}}` 슬롯 추가, 미존재 시 후기톤 섹션 전체 스킵 | `src/prompts/**/*.prompt` | executor | 1h |
| T1.7 | `privacyScrubber.ts` 강제 경유(개인정보 제거) | `src/sourceAssembler.ts` → `src/privacyScrubber.ts` | executor | 30min |
| T1.8 | 댓글 수집 상한 + 타임아웃 방어 | `src/naverBlogCrawler.ts` | executor | 30min |
| T1.9 | 블로그 URL 10건 확보율 측정 스크립트 | `scripts/spike/comment-collect-rate.ts` (신규) | tester | 1h |

**롤백 조건**: 확보율이 acceptance.md 임계 미달 or 크롤링 시간 30% 이상 증가 → Feature flag OFF.

### P2 — 분량 정책 탄력화

| Task ID | Description | File:Line | Agent | Duration |
|---|---|---|---|---|
| T2.1 | `computeTargetLength(reviewCount, hasSpec)` 함수 신설 | `src/promptLoader.ts` | executor | 45min |
| T2.2 | 공식: `baseLen(800) + perReview(200) × N`, 상한 2,200 / 리뷰 0개 시 1,200 | `src/promptLoader.ts` | executor | 15min |
| T2.3 | 프롬프트 고정 분량 문구를 플레이스홀더 `{{targetLength}}`로 교체 | `src/prompts/affiliate/shopping_review.prompt:88-92` | executor | 30min |
| T2.4 | `shopping_expert_review.prompt` 동일 적용 | `src/prompts/affiliate/shopping_expert_review.prompt` | executor | 30min |
| T2.5 | `computeTargetLength` 단위 테스트 | `tests/content/target-length.test.ts` (신규) | tester | 45min |
| T2.6 | SEO 최소 글자수와 충돌 체크 | `src/publishingStrategy.ts` 리뷰 | executor | 30min |

**롤백 조건**: 분량 공식 적용 후 SEO 하한 미달 발행물 발생 → `baseLen` 상향.

### P3 — 환각 검증 레이어

| Task ID | Description | File:Line | Agent | Duration |
|---|---|---|---|---|
| T3.1 | `factChecker.ts` 신규(<250줄): 수치/기간/비교주장 추출 | `src/content/factChecker.ts` (신규) | executor | 2h |
| T3.2 | rawText 원문 매칭 함수(정규식 + 토큰 유사도) | `src/content/factChecker.ts` | executor | 1.5h |
| T3.3 | `contentGenerator.ts` 발행 직전 훅: 매칭 실패 문장 1회 재생성, 2회 실패 시 삭제 | `src/contentGenerator.ts` | executor | 1.5h |
| T3.4 | `operationsDashboard.ts`에 `hallucinationRate` 메트릭 추가 | `src/monitor/operationsDashboard.ts` | executor | 1h |
| T3.5 | 회귀 시나리오 5건 작성(수치 환각/기간 환각/비교 환각/정상/모호) | `tests/content/fact-checker.test.ts` (신규) | tester | 1.5h |
| T3.6 | 오탐율 임계 설정(운영 튜닝 파라미터) | `autopus.yaml` or `src/content/factChecker.ts` | executor | 30min |

**롤백 조건**: 오탐률 10% 초과 → `FACT_CHECK_V1` OFF, 튜닝 후 재활성.

## Dependency Graph

```
P0 (독립) ─────────┐
                  ├─→ P2 (P0 완료 후)
P1 (독립, P0 병렬)─┼─→ P3 (P1 완료 후)
                  │
P2 ────────────────┘
P3 (P1 후)
```

- **병렬 가능**: P0 ∥ P1 (서로 영향 없음)
- **순차 필요**: P2는 P0의 프롬프트 구조 변경에 의존, P3는 P1의 `userVoice` 입력에 의존

## Rollout Sequence & Checkpoints

1. **D1(월)**: P0 전체 완료 → 스모크 3건 통과 → Feature flag `REVIEW_GUARD_V1` ON (내부)
2. **D1~D2**: P1 T1.1(DOM 조사) 선행 → T1.2~T1.8 구현
3. **D2(화)**: P2 전체 완료 → 단위 테스트 통과 → `TARGET_LEN_ADAPTIVE` ON
4. **D3(수)**: P1 완료 → 10건 확보율 측정 → 임계 통과 시 `USER_VOICE_COLLECT` ON
5. **D4~D5(목~금)**: P3 전체 → 회귀 5건 통과 → `FACT_CHECK_V1` ON (내부)
6. **D6(월)**: 실발행 10건 모니터링 → `hallucinationRate` 기준선 확정
7. **D7(화)**: 공개(모든 사용자) 전환 여부 결정

## Pre-conditions

1. `npm run build` 및 `npx vitest run` 기준선 그린 상태
2. 테스트 네이버 계정 + 댓글 달린 샘플 블로그 URL 10건 준비
3. `.env`에 `LLM_API_KEY_*` 정상 동작
4. v1.4.66 이상 설치

## Risk Register

| Risk | Severity | Mitigation | Flag Fallback |
|---|---|---|---|
| R1. 프롬프트 변경으로 기존 발행 톤 붕괴 | High | 스모크 3건 선 검증 | `REVIEW_GUARD_V1` OFF |
| R2. 네이버 댓글 DOM 변경 | High | 셀렉터 레지스트리 + 원격 패치 | `USER_VOICE_COLLECT` OFF |
| R3. SEO 최소 글자수 충돌 | Medium | `baseLen` 800 하한 유지 | `TARGET_LEN_ADAPTIVE` OFF |
| R4. factChecker 오탐 | Medium | 1회 재생성 정책 | `FACT_CHECK_V1` OFF |
| R5. 크롤링 시간 증가 | Medium | 타임아웃 + 상한 | 수집 건수 하향 |
| R6. 개인정보 프롬프트 유입 | High | `privacyScrubber.ts` 강제 경유 | 수집 중단 |

## Rollback Strategy

- **각 단계 독립 Feature flag 보유** → 롤백 시 해당 flag만 OFF
- P0 롤백: 즉시 기존 경로 복귀, 데이터 영향 없음
- P1 롤백: `naverBlogCrawler.ts`의 댓글 수집 블록을 조기 return, `sourceAssembler.ts`의 `userVoice` 빈 객체로 고정
- P2 롤백: `targetLength` 하드코드 원복
- P3 롤백: 발행 직전 훅 skip, 메트릭은 노출 유지(대시보드 회귀 없음)

## Out-of-Scope in This Plan

- 기존 발행분 backfill
- 카페 모드 리뷰 수집
- 다국어 환각 검증(한국어 한정)
