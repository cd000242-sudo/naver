# SPEC-NAVER-IMAGE-2026 — plan

## Phase 0 — 구조·프롬프트·fixture·테스트 (완료, 2026-09-23)

### 새 모듈 `src/image/director/`

| 파일 | 역할 |
|---|---|
| sectionRolePlanner.ts | 전체 소제목 → 소제목별 이미지 역할(7종), 글 종류(이슈/정보/제품/여행) 판정 |
| sectionRoleAssignment.ts | 한 장씩 보내는 호출도 전체 목록 기준으로 같은 역할을 받게 매핑 |
| roleDirectives.ts | 역할별 구도·카메라·재생성 카메라, 실사 문장, 클리셰 문장, 분야별 금지 문장 |
| thumbnailStrategy.ts | 썸네일 방향 4종(비교/숫자/문제 장면/실제 재구성)과 표지 지시문 |
| thumbnailHook.ts | 제목·CARD_PROMISE의 숫자 구절 추출(12자 이내) |
| thumbnailText.ts | AUTO/포함/미포함 판정, 짧은 문구 도출, 제목 전체 복사 판정 |
| realAssetResolver.ts | 자산 5종 분류, 합성 가능 사진 최대 2장, 실제 사진 우선 주제 판정 |
| thumbnailComposer.ts | 800x800 정사각 크롭·확장, 근접 크롭, 짧은 문구 카드(sharp, 로컬, 무료) |
| thumbnailJudge.ts | 고품질 모드 후보 심사 프롬프트·파서. 실패 시 1번 유지 |
| thumbnailDirector.ts | 실제 사진 우선 → AI 표지 1장 → (고품질) 변형 2~3 + 심사 |
| thumbnailDirectorGate.ts | IPC 입구. 썸네일 1장 호출만 가로채고 나머지는 그대로 통과 |
| imageQualityCheck.ts | 결정적 품질 검사(썸네일·소제목 세트) |

### 기존 파일 수정

| 파일 | 변경 |
|---|---|
| src/imageGenerator.ts | 소제목 역할 계획·전달, 재생성 플래그 전달, 썸네일 표지 지시, 짧은 문구(생성 때 오버레이 + 글자 그리는 엔진) |
| src/image/contextualImagePrompt.ts | 역할 줄, 역할 제약, 표지 지시, 썸네일 문구를 정확히 지정하는 텍스트 정책. 입력이 없으면 출력 동일 |
| src/image/promptBuilder.ts | 나노바나나 썸네일 글자 지시를 제목 전체 → 짧은 문구로. 제목은 주제로만 |
| src/image/openaiImageGenerator.ts | 역할이 있으면 자체 각도·조명·색 회전을 끈다. Leonardo·DeepInfra는 브리프를 영어 래퍼로 바꿔 역할이 빠지므로 손대지 않았다 |
| src/image/types.ts | visualRole, coverDirection, thumbnailText, thumbnailDirector 요청, disableTextOverlay/isCollected/directorNotice |
| src/main.ts | IPC와 다중계정 썸네일이 디렉터를 거친다. 상품 썸네일 IPC 문구 단축 |
| src/automation/editorHelpers.ts | 발행 때 오버레이 문구 단축 |
| src/configManager.ts | thumbnailQualityMode 설정 |
| public/index.html | "🏆 고품질 썸네일" 체크박스, 썸네일 문구 체크박스 설명 교체 |
| src/renderer/modules/costAndAutoGen.ts | 전체 소제목 전달, 기사 썸네일 요청에만 디렉터 요청을 붙임(수동 썸네일 편집기 배경 제외), 재생성·수동 프롬프트 유지, 이미지 탭 썸네일 칸 요청(실제 사진·텍스트 모드·카드 허용), 결과 플래그 기억, 안내 로그 |
| src/renderer/modules/headingImageGen.ts | 이미지 탭 결과에 플래그(provider, 오버레이 끔, 실제 사진) 유지 |
| src/renderer/modules/imageManagementTab.ts | 고품질 체크박스 ↔ 설정 동기화 |
| src/crawler/issueHarness/visionJudges.ts | 구독 에이전트 심사가 스테이징된 실제 파일명을 받게 수정 |
| src/contentQualityV3/candidateRuntimeFingerprint*.ts | 매니페스트에 새 모듈 추가, 지문 재고정 |

### 문서

- docs/NAVER_IMAGE_SYSTEM_PROMPT.md (5,170자)
- docs/NAVER_IMAGE_SKILL.md

## Phase 1 — 자산 파이프라인 (사장님 결정 필요)

1. SOURCE_ASSET 확보: 기사·공식 이미지를 사용자 동의 하에 받아 로컬 자산으로 등록한다. 권리 확인 문구와 출처 기록을 함께 남긴다(SPEC-IMAGE-PORTRAIT-2026과 같이 설계).
2. 2인 합성: **기본형 완료(2026-09-23 2차)** — 이슈·연예 글이나 비교 제목에서 합성 가능한 사진이 2장이면 좌우 나란히 + 짧은 문구. 남은 것: 얼굴 검출 크롭, 조명 톤 맞춤.
3. 배경 교체·확장: 현재는 흐린 배경 확장만 있다. 아웃페인팅은 유료 호출이라 옵트인.
4. 소제목 실제/AI 자동 혼합: 수집한 실제 사진을 역할(장면·장소)에 맞는 소제목에 먼저 배정한다.

## Phase 2 — 계측·검증

1. 비용 분리 계측(research.md §6 설계안): 검색·자산 확인 호출과 생성 호출을 다른 장부 행으로 기록한다.
2. 픽셀 다양성: 직전 1~3장과 지각 해시 비교. 비슷하면 역할·거리 변경 후 1회만 재시도(옵트인).
3. CARD_PROMISE 전달 확인: 글 생성 결과의 클릭 사유가 렌더러까지 오는지 확인한다. 글쓰기 엔진을 건드려야 하면 별도 승인.
4. 라이브 확인: 구독 경로(무료)로 박서함·EV3·청년월세·제주 축제 4건.

## 진행 규칙

- 1릴리스 1~3 수정. 이 SPEC의 Phase 0은 한 묶음으로 릴리스하지 말고, 사장님이 릴리스를 지시하면 범위를 나눠 제안한다.
- 유료 검증 제안 금지. 저장본 재계산 → 단위 테스트 → 구독 경로 순.
