# SPEC-CAFE-000 — Plan

## Task Decomposition

| Task ID | Description | Agent | Mode | File Ownership | Duration |
|---|---|---|---|---|---|
| T1 | 실증 스크립트 작성 (3개: A1/A2/A3) | executor | sequential | `scripts/spike/*` | 2h |
| T2 | A1 실행 (세션 재사용 검증) | main session | - | - | 30min |
| T3 | A1 결과 기록 + Gate 결정 | main session | - | `.autopus/specs/SPEC-CAFE-000/research.md` | 15min |
| T4 | A2 실행 (에디터 DOM 덤프) | main session | - | - | 1h |
| T5 | A3 실행 (게시판 API) | main session | - | - | 30min |
| T6 | Research.md 최종 작성 | main session | - | `research.md` | 30min |
| T7 | Acceptance.md 작성 (다음 단계 조건) | main session | - | `acceptance.md` | 15min |

**총 예상 시간**: ~5시간 (1일)

## Dependencies

- T1 → T2 (스크립트 필요)
- T2 → T3 (A1 결과 필요)
- T3 → T4 (A1 성공 시에만 A2 진행)
- T4 → T5 (A2/A3 병렬 가능하지만 순차가 안전)
- T5 → T6 → T7

## Pre-conditions

1. 테스트 네이버 계정 1개 준비 (스파이크 전용)
2. 테스트 카페 (매니저 권한) 1개 준비
3. `.env`에 `NAVER_ID_SPIKE`, `NAVER_PASSWORD_SPIKE` 설정
4. v1.4.55 이상 설치됨

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| A1 실패 (세션 불일치) | High | cafeLoginFlow 작성 (+1~2일 Phase 추가) |
| A2 완전 실패 (에디터 구조 상이) | High | 카페 에디터 재설계 (+3~5일) |
| A3 토큰 필요 | Medium | 토큰 추출 로직 (+0.5일) |
| 네이버 로직 변경 (4/15~20 사이) | Low | 재시도 |
| 테스트 계정 차단 | Medium | 계정 즉시 교체 |
