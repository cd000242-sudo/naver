# SPEC-NAVER-IMAGE-2026 — acceptance

실행 기준: 2026-09-23, 네트워크 없음, 유료 호출 0. 기본 모드는 심사를 부르지 않는다. AI 생성은 스텁이고, 합성은 테스트 중 만든 샘플 이미지로 실제 sharp를 돌린다.

## V1 §26 테스트 (src/__tests__/naverImagePipelineV1.test.ts)

| # | 시나리오 | 확인하는 것 | 결과 |
|---|---|---|---|
| T1 | 제목만 + 썸네일 | 소제목 없이 실행. 표지 지시가 칸 이름이 아니라 제목으로 만들어짐 | PASS |
| T2 | 제목 + 전체 소제목 | 세트 계획이 품질 검사 GOOD. 한 장씩 보낸 호출도 같은 역할 | PASS |
| T3 | 실제 연예인 사진 2장 | AI 생성 호출 0회. 결과가 실제 사진 합성(collected-image-with-text, 발행 오버레이 끔) | PASS |
| T4 | 기사 URL만 | REFERENCE_ONLY 1, 합성 재료 0. 업로드 안내 문구. 표지 지시에 닮은꼴 금지 | PASS |
| T5 | 정책·금융 | 장면 역할 1개 이하. 동전 더미·판사봉 금지 문장 | PASS |
| T6 | 자동차 + 사용자 차량 사진 | AI 호출 0회. 실제 사진 + 가격 문구 | PASS |
| T7 | 여행·축제 | 여행 판정, 없는 명소 금지 문장 | PASS |
| T8 | 다양성 | 소제목 8개에서 이웃 역할 반복 0. 재생성은 두 번째 카메라 + 재생성 문장 | PASS |
| T9 | 썸네일 텍스트 | 짧은 문구가 제목 전체 복사가 아님. 제목 글자를 쓰는 살아 있는 경로 4곳(생성 오버레이·발행 오버레이·상품 썸네일 IPC·나노 템플릿)이 모두 짧은 문구 함수를 씀 | PASS |
| T10 | 800x800 | 기본 정사각 800, 디렉터 결과 파일 실측 800x800 | PASS |
| T11 | 자동화 payload에 모든 값 | 생성 호출 1회, 안내·질문 0 | PASS |
| T12 | 박서함/안소희 fixture | 기존 AI 상황극 표지 FAIL(사유 3개 이상). 실제 자산 계획 GOOD | PASS |
| T13 | 소제목 GOOD 사례 | 의미(소제목) 유지 + 실사 문장 + 닮은꼴 금지. 두 소제목 역할이 다름 | PASS |

## 추가 테스트

| 파일 | 개수 | 내용 |
|---|---|---|
| thumbnailNativeTextPhrase.test.ts | 7 | 글자를 직접 그리는 엔진에만 짧은 문구 지정(브리프·ImageFX 브리프·나노 폴백 템플릿·쇼핑 템플릿·디렉터 전달). 되돌리면 5개 실패, 복구하면 7개 통과 확인 |
| thumbnailTextAssetsCheck.test.ts | 9 | 텍스트 모드, 문구 도출, 자산 분류, 품질 검사 |
| sectionRolePlanner.test.ts | 15 | 역할 신호, 기본 순서, 이웃 반복 금지, 글 종류 판정 |
| sectionRoleBriefWiring.test.ts | 9 | 역할이 브리프까지 도달, 역할 없으면 브리프 동일. 회전을 끄는 엔진은 OpenAI만(Leonardo·DeepInfra는 원래대로) |
| thumbnailComposer.test.ts | 13 | 800x800 크롭·확장·카드, 글자 크기 |
| thumbnailJudge.test.ts | 29 | 심사 프롬프트, 파싱, 실패 시 1번 유지 |
| thumbnailHookStrategy.test.ts | 9 | 숫자 구절, 방향 4종 |
| thumbnailDirector.test.ts | 13 | 기본 1장·고품질 후보·실제 사진 우선·실패 복원 |
| thumbnailDirectorGate.test.ts | 14 | 디렉터 요청이 있을 때만 동작, 수동 썸네일 편집기 배경은 그대로 통과, 사용자 프롬프트 유지, 오버레이 조건 동일, 끄기 스위치, 결과 플래그. 세 수정을 끄면 4개 실패, 복구하면 14개 통과 확인 |
| thumbnailDirectorRendererWiring.test.ts | 11 | 렌더러 배선(편집기 배경 제외, 재생성·수동 프롬프트 유지, 메인 다중계정 opt-in, 이미지 탭 칸, 플래그 유지, 체크박스) |
| visionJudgesAgentStagedNames.test.ts | 1 | 구독 에이전트 심사 파일명. 되돌리면 실패 확인 |

V1 관련 합계: 12개 파일, 143개 통과, 실패 0.

## 전체 회귀

| 항목 | 결과 |
|---|---|
| vitest 전체 | 1,049개 파일, 10,312개 통과, 실패 0 |
| tsc --noEmit | 오류 0 |
| eslint(변경 파일) | 오류 0. 경고 121개는 모두 기존 줄(변경 줄 위 경고 0) |
| 지문 핀 | 일치(ea4c5b19…) |
| 빌드 | 실행 안 함(V1 §29) |

## 미검증

- 실제 생성 엔진 결과물의 화질·한글 정확도: 유료 호출 금지라 실행하지 않았다.
- 고품질 모드 심사: 구독 경로 1회 라이브 확인(9,206ms, 숫자 카드 후보 선택). 유료 API 경로는 미실행.
- 렌더러에 CARD_PROMISE(클릭 사유)가 실제로 도착하는지.
