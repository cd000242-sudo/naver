# 계획: Anti-BotGuard 스텔스 완주 (Phase A·1~5 + ImageFX)

> 확정 2026-06-21. 승인: 회귀 0 + 최대한 막히지 않게. #2(모드별 글퀄리티)는 라이브 테스트 후 별도 울트라플랜.

## 스코프 경계
- 코드 게이트(tsc/build/vitest)는 매 Phase 100% 통과 보장.
- 실제 BotGuard 우회 성공은 라이브 + 계정/IP 플래그 의존 → 단위테스트 불가. "테스트 통과"=코드 게이트.

## Phase A — 사전존재 2 실패 정리 (vitest 0 failed 달성)
- verifyPreviousWork(프롬프트 글자수 baseline) + continuousImageGenerationSafety(ImageFX 메시지) 정리.

## Phase 1 — 행동 엔진 확장
- humanInteraction: 마우스 워밍업/랜덤 스크롤/idle. Flow 진입~생성 전 행동 이력 축적 + 클릭 humanClick 통일.

## Phase 2 — 페이싱 정상화 (버스트 제거)
- 공격적 재시도/새프로젝트 남발 완화 → 한 프로젝트 재사용 + 인간형 간격(백오프 우선).

## Phase 3 — ImageFX Phase 0 (headless 제거) + 공통 옵션 유틸
- imageFxGenerator headless=1 → headful. Flow/ImageFX 공통 브라우저옵션 유틸로 중복 제거. reviewer 회귀 agent.

## Phase 4 — 프로토콜/엔진 강화 (낮은 우선)
- patchright 최신 점검 + (옵션) rebrowser runtime-fix env + AdsPower 경로 승격 검토.

## Phase 5 — 검증·안전망
- 봇감지 빠른 분류(N연속 거부 → 즉시 중단 + 명확 안내, 420초 멈춤 제거) + 텔레메트리.

## 매 Phase 게이트
tsc 0 · build exit 0(충돌 0) · vitest 0 failed · god-file면 reviewer 회귀 · Lore 커밋 1/Phase.

## 리스크
라이브 우회 보장 불가(BotGuard 최상급) · god-file cascade(Phase당 1커밋+회귀agent) · 계정/IP 플래그면 코드 무관(라이브 확진 권장) · behavioral+pacing 처리량 trade-off.

## 범위 밖 (별도 트랙)
#2 모드별 글퀄리티 극대화 — 라이브 테스트 완료 후 별도 울트라플랜. 릴리즈 — 스텔스 검증 후.

---
## 이전 계획 (아카이브)
이전 SPEC-STABILITY-2026 / Phase 7 god-file 분해 계획은 `prompt_plan.prev.bak` 및 git 히스토리에 보존됨(완료·라이브 검증된 베이스라인).
