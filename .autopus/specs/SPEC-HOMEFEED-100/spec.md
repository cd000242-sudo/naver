# SPEC-HOMEFEED-100: 홈피드 92~95점 엔진 + 자가진화 시스템

## 1. 목적

네이버 홈피드 노출·터짐 확률을 현재 약 70점 → **92~95점**으로 끌어올리고, 이후 A/B 데이터로 자가 진화하는 엔진을 구축한다. 100점은 과최적화 역효과와 정책 리스크 때문에 의도적으로 포기한다.

## 2. 배경

2026-04-20 Agent Teams 토론(architect/planner/reviewer/security-auditor) 합의에 따라, 프롬프트 설계(93점)는 완성되었으나 다음 5가지가 미연결:

1. **측정 기반 없음** — 어떤 개선이 실제 효과가 있는지 모름
2. **출력 검증 레이어 없음** — 프롬프트 지시가 실제 본문에 반영됐는지 확인 안 함
3. **썸네일 자동 생성 미연결** — 홈피드 CTR 50% 결정 요소
4. **실측 피드백 루프 없음** — 네이버 애널리틱스 데이터 → 프롬프트 학습
5. **발행 시간대 최적화 없음**

## 3. 금지 범위 (절대 구현 금지)

- **서로이웃 자동 방문**, **자동 공감·댓글** — 네이버 정책 위반 Critical. 형법 314조 2항 가능성. 합법 대안: 발행 30분 후 SNS 공유 리마인더 푸시.
- **네이버 애널리틱스 세션 스크래핑** — ToS 위반 + 컴퓨터등장애업무방해죄 판례 (크림 v. 네이버 2021). 반드시 **네이버 서치어드바이저 공식 API**만 사용.
- **문체 수정 validator** — AuthGR이 다회전 정제 텍스트의 지문을 학습 중. Validator는 **팩트체크·구조 체크만** 담당, 문체는 건드리지 말 것.

## 4. 4주 로드맵

### W1 — 측정 기반 + Validator 파사드 (완료: 2026-04-20)

- [x] `src/analytics/featureFlagTracker.ts` — A/B 메타로그 (feature flag + 발행 메타 저장)
- [x] `src/services/contentValidationPipeline.ts` — 기존 3개 모듈(`contentQualityChecker` + `authgrDefense` + `imageTextConsistencyChecker`) 파사드 통합
- [x] QUMA 앵커 스캐너 + 검증 루프 3중 장치 스캐너 + 0원 가격 아티팩트 2차 방어 스캐너 신설
- [x] 단위 테스트 19개 + Red-Green-Red 검증 완료
- [x] MaxRetry는 호출자 책임. 파사드는 순수 함수. 차단 게이트 금지.

### W2 — 썸네일 자동 생성 + 발행 메타 기록 (완료: 2026-04-20)

- [x] `src/image/thumbnailHintParser.ts` — `===THUMBNAIL_HINT===` 블록 파서 + 카테고리 톤 프리셋
- [x] `src/services/thumbnailAutoGenerator.ts` — 힌트 → nanoBananaProGenerator 어댑터. 실패 시 비차단 (ok=false + 폴백)
- [x] `src/services/publishMetadataRecorder.ts` — 발행 시 featureFlagTracker 래퍼. 저장 실패 시에도 발행 계속
- [x] 단위 테스트 16 + 6 + 8 = 30 cases. 388/388 전체 통과. tsc 에러 0.
- [x] 렌더러 UI "후킹 1문장 입력 (선택)" 슬롯 — public/index.html + contentGeneration.ts + main.ts + promptLoader 관통 (2026-04-20)
  - 입력: `#unified-hook-sentence` (max 40자)
  - 전달: payload.assembly.hookHint → source.hookHint → buildFullPrompt hookHint 파라미터
  - 프롬프트: [사용자 후킹 1문장] 블록으로 주입, QUMA/DIA+ 1차 경험 신호로 명시
  - ⚠️ UX 실물 QA 미완료: Electron 렌더러 GUI는 `npm run dev`로 수동 확인 필요
- [ ] [후속] 썸네일 ON/OFF A/B 대시보드

### W3 — 성과 수집 저장소 + 코호트 분석 (완료: 2026-04-20)

- [x] `src/analytics/postMetricsStore.ts`: append-only JSON 저장소. source 필드로 `manual / search_advisor / analytics_api / unknown` 구분. 스크래핑 경로 영구 차단.
- [x] `src/analytics/cohortAnalyzer.ts`: featureFlagTracker × postMetricsStore join. compareCohort / rankFeaturesByImpact API. latest-per-post 중복 제거.
- [x] 테스트 13 + 6 = 19 cases. Red-Green-Red 검증. 전체 412/412 PASS. tsc 0 에러.
- [ ] [후속] 네이버 서치어드바이저 공식 OpenAPI 연동 훅 (source='search_advisor' 자동 주입)
- [ ] [후속] 수동 입력 UI (사용자가 블로그 admin 통계를 복사 붙여넣기)
- [ ] [후속] 일일 배치로 postMetricsStore → cohortAnalyzer 리포트 생성

### W4 — 피드백 루프 + 스케줄러 (예정)

- [ ] 주 1회 배치: 상위 20% 성과 글에서 제목·도입부 패턴 추출
- [ ] 프롬프트의 `## RECENT_WINNERS` 섹션에 few-shot으로 주입 (전체 재학습 X)
- [ ] `scheduler/smartScheduler.ts`: 오전 7~9시 / 점심 12~1시 / 저녁 8~10시 발행 슬롯
- [ ] 발행 시간대 × feature flag cohort 분석 리포트

## 5. 점수 계산 (예상)

| 단계 | 점수 | 근거 |
|------|------|------|
| 현재 (2026-04-20) | 70 | 프롬프트만 93, 실전 70 |
| W1 완료 후 | 78 | Validator 2차 방어 + A/B 기반 구축 |
| W2 완료 후 | 85 | 썸네일 CTR 개선 |
| W3 완료 후 | 88 | 측정 데이터 축적 |
| W4 완료 후 | **92~95** | few-shot 진화 + 시간대 최적화 |

**100점 포기 근거:**
- reviewer: "완벽한 글은 네이버 AI가 어뷰징으로 인식"
- planner: "알고리즘 블랙박스 특성상 구조적 불가능"
- security: "100점에 필요한 자동화는 정책 위반"

## 6. 리스크 및 완화

| 리스크 | 등급 | 완화 |
|--------|------|------|
| Validator 재시도 무한루프 | High | 호출자 MaxRetry=2 hard cap |
| Validator → AuthGR 역지문 | High | 문체 수정 금지, 사실/구조만 |
| API 비용 폭증 | High | validator는 skipFingerprint 옵션 + 캐싱 |
| 네이버 알고리즘 변경 | Medium | W3 피드백 루프가 변경 감지 가능 |
| 사용자 UX 부담 (6번) | Medium | "1문장 선택 입력"으로 축소 |

## 7. 성공 기준

- W1: 단위 테스트 100% 통과 ✓ (완료)
- W2: CTR A/B 비교에서 enabled 코호트 +15% 이상
- W3: 30일간 100개 포스트 메타데이터 수집 성공
- W4: 피드백 루프로 프롬프트 자동 업데이트 1회 이상 실행

## 8. 관련 파일

- `src/analytics/featureFlagTracker.ts` (신규, W1)
- `src/services/contentValidationPipeline.ts` (신규, W1)
- `src/__tests__/featureFlagTracker.test.ts` (신규, W1)
- `src/__tests__/contentValidationPipeline.test.ts` (신규, W1)
- `src/contentQualityChecker.ts` (기존, 파사드 대상)
- `src/authgrDefense.ts` (기존, 파사드 대상)
- `src/image/imageTextConsistencyChecker.ts` (기존, 파사드 대상)
- `src/image/nanoBananaProGenerator.ts` (기존, W2 대상)
- `src/analytics/postAnalytics.ts` (기존, W3 확장 대상)
- `src/scheduler/smartScheduler.ts` (기존, W4 확장 대상)
