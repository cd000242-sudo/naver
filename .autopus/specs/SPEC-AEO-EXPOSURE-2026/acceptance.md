# SPEC-AEO-EXPOSURE-2026 — 합격 기준 (acceptance)

테스트 가능한 기준만. 각 항목은 명령으로 검증.

## A. 진단 게이트 (Phase 0.5)
- [ ] A1: 계정 과거 우량 글 노출 재측정 결과로 "계정/글/혼합" 판정이 산출된다.
- [ ] A2: 계정 레벨 판정 시 형식 트랙(R1~R3)은 보류되고 SPEC-NAVER-PROTECTION-2026로 라우팅된다.

## B. R0 — 반균질화 스캐너 (이번 단계) ✅ 완료 2026-05-29
- [x] B1: `structuralSimilarityScanner.ts` 단위 테스트 전부 GREEN — 13/13 통과.
- [x] B2: 순수 함수 — I/O 없음, 발행 파이프라인 미연결(import 사용처 = 테스트 1건뿐).
- [x] B3: 동일 골격 2글 → 유사도>0.85, 상이 골격 → <0.6, 빈 history/커스텀 임계 경계 테스트 포함.
- [x] B4: 파일 179줄 (<200).

## B'. R1 — 자문 스캐너 5종 (구현 완료·미연결) ✅ 2026-05-30
- [x] B'1: comparison/sourceFooter/imageRatio/curiosityHook + h2QuestionRatio 단위 테스트 **16/16 GREEN**.
- [x] B'2: 전부 advisory(soft-score/warn), 순수 함수, 발행 파이프라인 **미연결**(import = 테스트 1건뿐). 강제 아님 → 균질화 위험 없음.
- [x] B'3: 각 파일 43~64줄(<200).
- [x] B'4: `contentValidationPipeline` 비차단 등록 완료 — seo 모드에서만 실행, 전부 `info` severity(pass/critical 불변), 새 metrics 5개(non-seo는 null). wiring 테스트 2건 추가. 36/36 GREEN, 전체 2465 GREEN, lint/tsc 0.

## B''. R2 — 외부 설정(aeo_rules.json) ✅ 2026-05-30 (seam 완료, 호출자 연결만 잔여)
- [x] B''1: `src/aeoRulesManager.ts`(86줄) — DEFAULT_AEO_RULES(현재 R1 임계값 바이트 일치) + `parseAeoRules`(검증/폴백, never throw) + `loadAeoRules`(fs, 부재 시 DEFAULT). 단위 7/7.
- [x] B''2: R1 스캐너 3종(imageRatio/curiosityHook/h2QuestionRatio)에 optional 임계값 파라미터 추가(DEFAULT = 기존 상수 → 동작 불변). 단위 통과.
- [x] B''3: 파이프라인 `ValidationOptions.aeoRules?` 추가 → seo 블록에서 `options.aeoRules ?? DEFAULT_AEO_RULES`로 스캐너에 전달. override 테스트 추가.
- [x] B''4: 정규식 외부화 안 함(숫자만). DEFAULT 바이트 일치로 no-op.
- [x] B''5: 호출자 auto-load 완료 — contentGenerator `runPostGenValidator`가 `loadAeoRules(path.join(app.getPath('userData'),'aeo_rules.json'))`로 읽어 `aeoRules` 전달. 기존 electron/path import 재사용(신규 import 0), vitest mock getPath→/mock(throw 없음)+파일부재→DEFAULT로 동작 불변. lint 0 errors, tsc 0, 전체 2476 GREEN(rerun). **외부 설정 체인 end-to-end 완성**: userData/aeo_rules.json 숫자 수정 시 재빌드 없이 R1 임계값 반영.

## C. 회귀 (모든 릴리즈 공통) ✅ R0+R1+R2(seam) 기준 통과
- [x] C1: `npx vitest run` → 174 파일 / **2476 통과 / 0 실패**(R0~R2 누적). ※ licenseManagerRegression L5는 단독/간헐 실패하는 타이밍 flaky(stale-fetch race) — 재실행 시 통과, 본 SPEC 무관(별도 추적). license 모듈은 민감 영역이라 cascade 회피로 미수정.
- [x] C2: `npx eslint` (변경 파일) → exit 0, error 0.
- [x] C3: `npx tsc --noEmit` (전체) → exit 0.

## D. R2 외부화 no-op (해당 릴리즈)
- [ ] D1: DEFAULT_AEO_RULES 값 = 현재 하드코딩 바이트 일치(diff 0).
- [ ] D2: 스캐너 `rules` 파라미터 optional — 기존 테스트 시그니처 무변경 통과.
- [ ] D3: 정규식은 코드 DEFAULT 유지(JSON 직렬화 금지).
- [ ] D4: `qualityEvaluator.test.ts`의 `weights.mode===0.60`/`weights.humanlike===0.40` 통과.

## E. R3 게이트 (해당 릴리즈, 글 레벨 확인 후)
- [ ] E1: 플래그 OFF → 발행 동작 현재와 동일(diff 행동 0). full-flow로 확인.
- [ ] E2: Red-Green — ON+실패 픽스처 → contentSelfCritique 재작성 트리거 / 동일 입력 OFF → 트리거 안 됨.
- [ ] E3: max_retries=2 초과 시 무한루프 없이 발행 진행 또는 review 큐.
- [ ] E4: circuit-breaker — 재작성률 임계 초과 시 log-only 폴백 + 대시보드/UI 가시 경보(로그 캡처로 확인).
- [ ] E5: base.prompt 변경 50줄 미만(diff 라인 수 확인).

## F. 정직성
- [ ] F1: 보고/카피에 Phase 5 실측 전 추정 효과 수치 없음.
- [ ] F2: 진짜 KPI는 검증기 점수가 아니라 exposurePoller 실측임이 문서에 명시.
