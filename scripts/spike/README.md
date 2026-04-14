# Cafe Mode Phase 0 — Spike Scripts

> 2026-04-20(월) 실행 예정 — SPEC-CAFE-000 실증 스크립트

## 목적

네이버 카페 자동화의 3개 핵심 기술 가정을 실증합니다:
- **A1**: 블로그 로그인 세션이 cafe.naver.com에서 재사용 가능한가
- **A2**: 카페 에디터가 블로그 SmartEditor ONE과 호환 DOM인가
- **A3**: 게시판 목록 API를 사용자 세션으로 호출 가능한가

## 사전 준비

### 1. 테스트 계정 & 카페

```
NAVER_ID_SPIKE=test_spike_account
NAVER_PASSWORD_SPIKE=...
TEST_CAFE_ID=XXX  (매니저 권한이 있는 개인 카페)
TEST_BOARD_ID=L   (자유게시판 기본값)
```

`.env.spike` 파일로 분리 저장 권장 (본 계정 사용 금지 — 차단 리스크).

### 2. 빌드

```bash
npm run build
```

## 실행 순서

```bash
# Step 1: A1 — 세션 재사용 실증
npx ts-node scripts/spike/cafe-session-check.ts

# Step 1 성공 시에만 ↓ 진행

# Step 2: A2 — 에디터 DOM 덤프
npx ts-node scripts/spike/cafe-editor-dom.ts

# Step 3: A3 — API 호출 확인
npx ts-node scripts/spike/cafe-api-check.ts
```

## 산출물

각 스크립트 실행 후:
- 콘솔 로그 — 결과 요약
- `%APPDATA%/BetterLifeNaver/debug-dumps/{timestamp}_SPIKE_*` — 전체 상태 덤프

모두 완료 후:
- `.autopus/specs/SPEC-CAFE-000/research.md`의 Results 섹션 수동 업데이트
- `.autopus/specs/SPEC-CAFE-000/acceptance.md`의 Verdict 매트릭스 확인
- `.autopus/specs/SPEC-CAFE-000/review.md` 신규 작성 (최종 결정)

## 안전장치

- 테스트 **매니저 카페**만 사용 — 외부 카페 글쓰기 금지
- 스파이크 중 실제 글 발행 0회 — 읽기/DOM 덤프만
- 비정상 차단 감지 시 즉시 중단 후 리포트
