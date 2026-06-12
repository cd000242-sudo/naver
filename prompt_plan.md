# SPEC-STABILITY-2026 진행 현황 (2026-06-11 세션 종료 시점)

## 완료 (코드 + 가드 테스트, 전부 "라이브 대기")
- R1~R5, R7, R8(A-1/A-2), R11(A-3/A-4) — 에러 삼킴 A급 10건 전부 소진
- S1~S18 증상 전부 코드 종결 (acceptance.md 매트릭스 참조)
- Phase 6.1(번들 식별자 게이트, 레거시 28건 동결) / 6.2(lint:ipc)
- R4 이중 생성(비용 절반) + 뒤섞임 이중신호 / S13 입력 프록시 재조준 / S18 가독성 계약
- ImageFX·Flow 라인업 제거 → dropshot 기본
- 게이트 상태: vitest 2,979/2,979 GREEN · tsc 0 · lint 0 errors · build PASS

## 이번 추가분 (06-12)
- R6 단계적 차단(0cbe0042) / R12 침묵 실패 카운터(da5a2735) / Phase 7.3 플로우별 하네스
- S18-2 외톨이 파이프 행 노출 차단(3abe6b04 — 발행물 실측 버그)
- R12 잔여 종결: 운영 대시보드 silentFailures 배선(28f0baec)
- Phase 6.3 self-test 확장(033396b4): 모의 smoke 복구 + SELF_TEST=1 실부팅 + 번들 헬스 + IPC 핸드셰이크 5종 — npm run self-test 6/12 PASS 실측
- Phase 6.4 경고형 git 훅(28f0baec): 10파일 초과 경고 + Lore 형식 검사, npm run hooks:install (설치됨)
- Phase 6.5 하네스 게이트화(02d5305e): scripts/harness/ 승격 + npm run harness:tail + 런북 절차 문서화 — **Phase 6 전체 완료**
- 매트릭스 일괄 "완료" 마감은 라이브 증거 없이는 불가 — 3점 잠금 원칙 유지 (전 행 "라이브 대기")
- 게이트 상태: vitest 3,002/3,002 GREEN · tsc 0 · lint 0 errors · build PASS · self-test PASS

## 다음 세션 순서
1. **라이브 검증 1세션** (사용자): 연속발행 2건(카테고리 지정·이전글·CTA·해시태그) + 풀오토 1건
   → 매트릭스 "라이브 대기" 일괄 마감 + R6 진입 조건(오탐 데이터) 확보
2. R6 잔여: link-card/divider 검사의 차단 승격 — 라이브 오탐 0 확인 후
3. ~~R12 잔여~~ — 완료 (6/12: C급 핵심 9지점 배선 + 대시보드 표시, 7f03b117)
4. Phase 7: 7.3 하네스 완료 → 7.1 PipelineConfig / 7.2 코어 순수화 / 7.4 god file 분해는 라이브 검증된 베이스라인 + characterization 테스트 선행 필수
5. Phase 8: 성능 (migration:imageModelV1 등)

## 주의
- 미검증 픽스 ~45커밋 누적 — 라이브 검증 전 추가 동작 변경 금지
- 발행물 검증은 에디터가 아니라 **발행된 글(모바일 페이지)**에서 (S13 교훈)
