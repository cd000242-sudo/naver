# SPEC-NAVER-FULLAUTO-2026 — acceptance

실행 기준: 2026-09-24, 네트워크 없음, 유료 호출 0. 이미지 엔진은 스텁이다. 크기 검사는 실제 sharp 로 파일을 만들어 잰다. 흐름 파일(연속발행·다중계정·원클릭 풀오토)은 node 에서 실행할 수 없는 god file 이라 소스 계약 테스트로 묶었고, 공용 코어는 실제 함수로 테스트했다.

## 지시 §30 테스트

| # | 시나리오 | 테스트 파일 | 결과 |
|---|---|---|---|
| T1 | HOMEFEED 풀오토 → 홈판 작성기 + 홈판 이미지 | fullAutoScenario(작성기 표지 `[홈판 제목 제약]`, SEO 표지 없음) · fullAutoImagePolicy(모드 무관 동일 정책) | PASS |
| T2 | SEO 풀오토 → SEO 작성기 + 홈판 이미지 | fullAutoScenario(`[MODE VOICE: SEO 검색 최적화]`) · fullAutoImagePolicy | PASS |
| T3 | 다른 실제 모드(메이트) → 해당 작성기 + 홈판 이미지 | fullAutoScenario(메이트 규칙 유지) | PASS |
| T4 | H2 5 → 1+5장 | fullAutoImageSlots · fullAutoImageRunner(6/6, 비용 한 줄) | PASS |
| T5 | 예약 5개 서로 독립 | fullAutoImageRunner(5편, 한 편 보류) · fullAutoScenario §28 | PASS |
| T6 | 예약 HOMEFEED 글 → 홈판 글 유지 | 항목 모드 그대로 생성(기존 코드) + 작성기 라우팅 + 큐 종료 후 모드 복원(fullAutoWiring) | PASS |
| T7 | 예약 SEO 글 → SEO 유지 | 같음 | PASS |
| T8 | 실제 사진 2장 → REAL_PAIR | fullAutoScenario(디렉터 실제 실행: AI 호출 0, real-pair, 배지 "실제사진 2장 합성", 2장 합성 끄기 → 1장) | PASS |
| T9 | 실제 사진 없음 → 가짜 실존인물 억제 | fullAutoScenario(표지 지시에 lookalike 금지, issue 제약) | PASS |
| T10 | 자동차 문제 해결 → 문제 부위·상황 | fullAutoScenario · automotiveImageRoles | PASS |
| T11 | 자동차 가격 → 비교 | 같음 | PASS |
| T12 | 정책·세금 → 정보형, 클리셰 금지 | fullAutoScenario(정보 kind · 동전/돈다발/판사봉/우산/네온 금지 · 비자동차 제목 10개 오분류 없음) | PASS |
| T13~T16 | ALL / ODD / EVEN / NONE (1-based, 썸네일 별도) | fullAutoImageSlots(H2 5·4) · fullAutoPublishDecision(설정상 제외는 정상) · 기존 headingImageSelection 과 홀짝 동일 | PASS |
| T17 | 썸네일 실패 → AUTO_PUBLISH 금지 | fullAutoPublishDecision · fullAutoImageRunner | PASS |
| T18 | H2 실패 → 슬롯 번호 유지 | fullAutoImageSlots · fullAutoImageRunner(h2-3 실패, h2-4 제자리) | PASS |
| T19 | 선택 provider 유지 | fullAutoImageRunner(5개 엔진 그대로 1회) · fullAutoPublishDecision(다른 모델로 만든 이미지 → 검토) · 기존 imageRegenerateRouting 30개 | PASS |
| T20 | 썸네일 문구 중복 0 | fullAutoScenario(엔진이 그리면 앱 카드 없음, 아니면 카드 1장) · 기존 thumbnailTextState | PASS |
| T21 | 예약 상태 UI | fullAutoQueueStatus(지시 예시 3행 그대로) · fullAutoWiring | PASS |
| T22 | 글쓰기 모드 / 이미지 전략 별도 UI | fullAutoWiring(큐 3선택·발행 버튼 아래 한 줄·설정 모달) | PASS |
| T23 | 반자동·풀오토·예약이 V1 코어 공유 | fullAutoWiring(세 흐름 모두 runFullAutoImages + 공용 자동화 루프) | PASS |
| T24 | 한 예약 실패가 다른 예약에 영향 없음 | fullAutoImageRunner · fullAutoScenario · fullAutoWiring(차단기 글 단위, 실행마다 초기화) | PASS |

## 새 테스트 파일

| 파일 | 개수 |
|---|---|
| fullAutoImagePolicy.test.ts | 9 |
| fullAutoImageSlots.test.ts | 9 |
| fullAutoPublishDecision.test.ts | 12 |
| fullAutoImageRunner.test.ts | 9 |
| fullAutoQueueStatus.test.ts | 6 |
| fullAutoSquareImageTarget.test.ts | 4 (실제 sharp, 16:9 → 800x800) |
| fullAutoWiring.test.ts | 23 |
| fullAutoScenario.test.ts | 27 |
| automotiveImageRoles.test.ts | 18 |
| 합계 | 117 통과 |

되돌림 확인(red-green): 800 정사각 강제를 끄면 1개 실패 → 복구 후 통과. 자동차 단서를 모든 글에 적용하면 "비자동차 소제목 역할 유지" 실패 → 복구 후 통과.

## 전체 회귀

| 항목 | 결과 |
|---|---|
| vitest 전체 | 1,062개 파일, 10,533개 통과, 실패 0 |
| tsc --noEmit | 오류 0 |
| eslint(변경 41개 파일) | 오류 0. 새 파일 경고 0 |
| 지문 핀 | 재계산 0a1c2f5e… (클로저에 새 모듈 8개 등록) |
| 빌드 | 실행 안 함(지시 §31) |

## 독립 리뷰 2회

- 1차(다중계정·연속발행): HIGH 1(전역 "이미지 없음"이 항목 "전체"를 조용히 덮음 → 전역 스위치는 유지하되 행·추가 시 경고로 드러냄), MEDIUM 1(보류 항목 대기 생략 — 기존 콘텐츠 실패와 같은 규칙으로 유지, 주석), LOW 2(건너뛴 칸 소제목 비교 제외, 차단기 표시 실행마다 초기화) 반영.
- 2차(원클릭·이미지 생성기·역할 계획·설정): MEDIUM 3(자동차 약한 단어 오분류 → 강한 단어만, 자동차 기본 역할에서 비교·문제 제외, 설정 모달 복원값), LOW 2(보류 시 재사용 캐시 삭제로 수동 발행 뒤 중복 발행 차단, 미리보기 썸네일 칸 판정 유지) 반영. 나머지 LOW 2(중복 소제목의 이전 역할 근사, 요약 줄이 쇼핑·내 폴더 경로를 구분하지 않음)는 영향이 문구뿐이라 남김.

## 미검증 (라이브)

- 실제 엔진으로 5편 예약 1회(비용 발생 — 사장님 지시 시에만).
- Flow·Dropshot 가로 결과의 attention 크롭 품질(피사체가 잘리는지).
- 앱 빌드 후 렌더러 번들 로드(빌드 금지 — 번들 등록·식별자 충돌 가드 테스트는 통과).
