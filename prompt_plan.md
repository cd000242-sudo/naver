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
- 게이트 상태: vitest 3,072/3,072 GREEN · tsc 0 · lint 0 errors · build PASS · self-test PASS

## Phase 7 진행 상태 (6/12 시작)
- ✅ 7.2 R13 1차: generateImagesForAutomation headingImageMode 명시 입력화 (c2a9b845)
  — 코어 options 우선 + 폴백 경고, 진입점 4곳(연속1/다중2/풀오토 래퍼1) 명시 전달
- ✅ 7.2 R13 1차 마감(171d0530): 정적 전수조사로 누락 호출자 2곳 발견·이행 —
  연속발행 직접 호출(AI 메인 경로) + 다중계정 local-folder aiOptions. 직접 호출 6경로 전수 잠금
- ✅ 7.2 R13 2차(d5b0a003): invalid-provider 폴백 체인 → options.fallbackProvider 명시 입력화
  — resolveImageProviderFallback() 단일 정의 + 진입점 6곳 전달 + purity 가드 2건(직독 1회 잠금)
- ✅ 7.2 R13 3차(6cc11363): buildMobileRichHtml 테마 eager 랜덤 제거 + lazy 폴백 경고화
  — 프로덕션 호출자 2곳은 이미 이행 상태였음. editorHelpers localStorage 감사 0건 종결
- (별건 6/13) 퍼플렉시티 환각 처방(b8637c4d): 톤 가이드 경험 위장 지시 제거 +
  분량 확장의 통계/인용/경험담 발명 지시 차단 + 가드 3건 — 라이브 재발행 검증 대기
- 7.2 명시 입력화 잔여 후보 소진 → 7.1 진입
- ✅ 7.1-a~c (02def1cd·09a204ea·f2be7386): PipelineConfig 단일 해석처 +
  3대 플로우 진입점 배선 완료. 멀티에이전트 회귀 리뷰(7 agents) 확정 결함 0건.
  직독 래칫 가드 3건 + 기본값 동등성 단위 3건. 상세: phase71-pipeline-config.md §5
- ✅ 7.1-f (이번 세션): provider/동기화 보조 경로 직독 제거 —
  fullAutoImageSource/globalImageSource/imageFallbackPolicy 계열을 readRawPipelineSettings()
  경유로 통일. 게이트: vitest 3,077/3,077 GREEN · build PASS · lint 0 errors ·
  lint:ipc PASS.
- ✅ 7.1-g (이번 세션): 쇼핑커넥트 sc* 클러스터 흡수 —
  scSubImageMode/scSubImageSource/scAIImageEngine/scAutoThumbnailSetting 계열을
  PipelineConfig.shopping + readRawPipelineSettings() 경유로 통일. 레거시 엔진명은 ai 모드로 정규화.
  게이트: phase71/phase72 타깃 vitest 19/19 GREEN.
- ✅ 7.1-h (이번 세션): 공시/안전(ftc/adb) 클러스터 흡수 —
  ftcDisclosureEnabled/ftcDisclosureText/adbIpChangeEnabled/adbIpChangeEvery 발행 경로 직독 0건.
  제휴 기본 공시 fallback은 보존. 게이트: phase71/phase72 타깃 vitest 20/20 GREEN.
- 다음: Phase 7.4 god file 분해 전 characterization 테스트 보강
- 7.4 god file 분해: characterization은 공유 코어 가드(매트릭스 §4)가 1차 잠금 —
  분해 대상별 추가 잠금은 분해 직전에 (renderer.ts 8.8k / main.ts 8.6k / nBA 9k / contentGenerator)
- 원칙: 1단계=1커밋=1revert, 커밋마다 full vitest+tsc+lint+build, 라이브 발행 회귀 시 즉시 revert

## 다음 세션 순서
1. ~~**라이브 검증 1세션**~~ — ✅ 완료 (6/13 사용자 실행: 연속 2건 + 풀오토 1건 +
   퍼플렉시티 재발행 1건, 문제없음 보고) → 매트릭스 일괄 마감 가능 상태.
   7.1 진행: 설계안 phase71-pipeline-config.md 기안 — 승인 후 7.1-a부터
2. R6 잔여: link-card/divider 검사의 차단 승격 — 라이브 오탐 0 확인 후
3. ~~R12 잔여~~ — 완료 (6/12: C급 핵심 9지점 배선 + 대시보드 표시, 7f03b117)
4. Phase 7: 7.3 하네스 완료 → 7.1 PipelineConfig / 7.2 코어 순수화 / 7.4 god file 분해는 라이브 검증된 베이스라인 + characterization 테스트 선행 필수
5. Phase 8: 성능 (migration:imageModelV1 등)

## 주의
- 미검증 픽스 ~45커밋 누적 — 라이브 검증 전 추가 동작 변경 금지
- 발행물 검증은 에디터가 아니라 **발행된 글(모바일 페이지)**에서 (S13 교훈)
