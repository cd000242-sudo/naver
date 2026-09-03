# SPEC-BLUEPRINT-2026 — 인수 기준

기준선은 Phase 0 의 같은 20편(홈판 10·SEO 10, GPT-5.6 Terra) 실측이다. 모두 로그 수치로 확인한다.

| # | 기준 | 측정 |
|---|---|---|
| A1 | 게이트 재생성·패치 발화율 ≥ 50% 감소 | `[QualityGate] 🎯 … decision=` 분포, `자동 재시도 트리거`·`patch 적용` 횟수 |
| A2 | 재료 인용 ≥3 인 글에서 본문 직접 인용 ≥2 인 비율 ≥ 90% | `quoteCoverage` 로그, article 본문 따옴표 카운트 |
| A3 | 도입부 첫 문장 상황 단서 통과율 ≥ 90% (홈판) | `homefeedEval` SITUATION_CUES, 게이트 mode issues 에 "첫 화면" 미출현 |
| A4 | 곁가지 문단 0, 자료 서술 문장 0, 사실 보존율 기준선 이상 | `[Fidelity]` 보존율, `materialNarrationStrip` 제거 0건, 사람 검수(주제 이탈 문단 수) |
| A5 | 프롬프트 길이 ≤ 35,000자(중앙값), 설계도 비용 ≤ 본문의 10%, API 시간 +≤20초 | `[PromptBuilder]` 길이 로그, apiUsageTracker 토큰, `[Blueprint]` 소요 |
| A6 | vitest 전체 GREEN, 지문 핀·레거시 베이스라인 갱신, 계약 테스트 유지, 새 파일 ≤300줄 | `npx vitest run`, `fingerprint-pin`, `wc -l` |
| A7 | 설계도 실패 시 기존 경로로 완주(엔진 불변) | 타임아웃 주입 테스트 + 로그 `[Blueprint] 생략` |
| A8 | 라이브: 사용자정의 1편 + 홈판 1편 발행, 게이트 pass, 발행본에 도입부·인용 반영 | 앱 로그 + 발행 글 확인 |

통과 기준: A1~A7 전부 + A8 두 편 중 두 편.
