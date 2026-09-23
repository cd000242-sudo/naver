# SPEC-NAVER-IMAGE-2026 — research (기존 구조 감사, V1 §25·§28-C)

조사 방법: 2026-09-23 작업 트리. `src/`를 grep으로 훑고(테스트 제외) 코드를 읽었다. 앱은 실행하지 않았다. 줄 번호는 조사 시점 기준이라 조금씩 밀릴 수 있다. "죽은 경로"는 호출하는 곳이 테스트 말고는 없다는 뜻이다.

---

## 1. 실제로 쓰이는 이미지 프롬프트 위치

정본은 **최종 브리프**(`src/image/contextualImagePrompt.ts`)다. 생성 엔진은 모두 이 브리프에서 출발한다. 앞 단계의 영어 프롬프트는 브리프 안에서 "보조 힌트"로만 쓰인다.

| 단계 | 위치 | 하는 일 |
|---|---|---|
| 렌더러 영어 프롬프트 | `renderer/.../promptTranslation.ts:591` `generateEnglishPromptForHeading` | 선택한 글 엔진 하나로 번역. 에이전트 엔진이면 사전 기반 폴백(`:684` → `headingImageGen.ts:3029`) |
| 메인 영어 프롬프트 | `mainPromptInference.ts:255` `generateEnglishPromptMain` | 메인 다중계정 발행에서 렌더러가 이미지를 안 보냈을 때만(`main.ts:5723`). 썸네일 `:5761`, 소제목 `:5840` |
| 최종 브리프(정본) | `contextualImagePrompt.ts` — `imageGenerator.ts:545`에서 한 번 생성 | 제목·주제·소제목·본문 근거를 앞에 두고 역할·표지 지시·텍스트 정책을 붙인다. ImageFX는 짧은 브리프(`:454-494`) |
| OpenAI 가공 | `openaiImageGenerator.ts` | 브리프 + "글자 없음" 머리말 + 각도·조명·색 회전. 이번에 역할이 있으면 회전을 끔 |
| DeepInfra·Leonardo·Prodia 가공 | `deepinfraGenerator.ts:435-437`, `leonardoAIGenerator.ts:301-303`, `prodiaGenerator.ts:131-132` | 영어 힌트가 있으면 브리프를 짧은 영어 래퍼로 **교체**한다. 역할·표지 지시가 빠진다. 자체 회전은 유지 |
| Flow 가공 | `flowGenerator.ts:2210-2216`, `flowPromptInjection.ts` | 브리프 + 영어 힌트 줄 + "# Subject" + 프레이밍 힌트 8종 중 하나 + 무작위 salt + 금융 사물 치환 |
| 나노바나나 가공 | `promptBuilder.ts:72-83` | 브리프면 바로 반환(브리프 + 렌더링 스타일 한 줄) |
| 글쓰기 엔진의 imagePrompt 지시 | `contentJsonPromptFormat.ts:68-70, 123, 237, 524-525` | 글과 함께 소제목별 imagePrompt를 쓰게 한다. V1 범위 밖이라 손대지 않음 |

흐름별 영어 프롬프트 사용:
- 풀오토: 썸네일만 번역한다(`fullAutoFlow.ts:1151`). 본문 배치는 글쓰기 엔진이 쓴 한국어 imagePrompt를 그대로 보낸다(`:1215-1238`).
- 반자동·이미지 탭·연속 발행·다중계정: 소제목마다 번역한다.

---

## 2. 중복 프롬프트

| 중복 | 위치 | 문제 |
|---|---|---|
| 영어 프롬프트 생성기 2벌 | 렌더러 `promptTranslation.ts` vs 메인 `mainPromptInference.ts` | 메인 쪽은 낡은 사본이다. 기사 맥락이 없고, "End with: NO TEXT NO WRITING" 규칙(`:34`)이 같은 파일 `:247` 주석("그 문구 제거")과 모순된다 |
| 스타일 문구 3벌 | `imageStyles.ts:34-65` STYLE_PROMPT_MAP, `nanoBananaProGenerator.ts:1196-1215`, `main/ipc/imageHandlers.ts:351-369` | 실사 문구가 서로 다르다. "RAW photo·Canon EOS R5·golden hour·film grain", "8K UHD·DSLR·Fujifilm XT3" 같은 문구는 V1이 줄이라는 영화적·AI 느낌 쪽이다. 나노 맵에는 disney·infographic이 없어 "Render in disney style. Hyper-realistic…"처럼 섞인다 |
| 썸네일 제목 글자 구현 8개 + 수동 편집기 2개 | 아래 표 | 같은 일을 여러 곳에서 한다 |

썸네일 제목 글자 구현(이번 작업 후 상태):

| # | 구현 | 살아 있나 | 지금 쓰는 글자 |
|---|---|---|---|
| 1 | 생성 때 오버레이 `imageGenerator.ts` → `thumbnailService.createProductThumbnail` | 살아 있음(나노바나나 2/프로·Flow 제외) | 짧은 문구 |
| 2 | 상품 썸네일 IPC `main.ts:4703-4729` | `publishingHandlers.ts:1319`에서만 도달 | 짧은 문구 |
| 3 | 발행 때 오버레이 `editorHelpers.ts` → `generateThumbnailWithTextOverlay` | 살아 있음 | 짧은 문구 |
| 4 | 브리프 텍스트 정책 | 살아 있음 | 글자를 직접 그리는 엔진(나노바나나 2/프로·Flow)에만 짧은 문구 지정. 그 밖의 엔진은 이전 문장 그대로 |
| 5 | 나노 템플릿 `promptBuilder.ts:122-204` | 폴백에서만 도달 | 짧은 문구 |
| 6 | 짧은 문구 카드 `thumbnailComposer.ts` | 이미지 탭 썸네일 칸에서만 | 디렉터가 고른 문구 |
| 7 | `textOverlay.ts` `addThumbnailTextOverlay` | 죽음 | — |
| 8 | `naverBlogAutomation.ts:8966` | 죽음(`if (false && …)`) | 제목 전체(손대지 않음) |
| 수동 | 썸네일 편집기 캔버스, 썸네일 미리보기 SVG | 사용자가 직접 | 제목 전체 / 사용자가 입력한 글자 |

---

## 3. 죽은 경로 (삭제하지 않았다)

V1 §25대로 지우지 않았다. 지우려면 별도 승인을 받고 한 묶음씩 지운다.

| 경로 | 근거 |
|---|---|
| 이미지 탭 배치 생성 블록 | `headingImageGen.ts:1159` `const useBatchImageGeneration = false;` → `1160-1309` |
| `addThumbnailTextOverlay` 가져오기 3곳 | `deepinfraGenerator.ts:13`, `leonardoAIGenerator.ts:16`, `openaiImageGenerator.ts:14`에서 가져오기만 하고 호출 없음. `textOverlay.ts` 전체가 죽음 |
| `thumbnailHintParser`, `thumbnailAutoGenerator` | 테스트 말고 가져오는 곳 없음 |
| `imageTextConsistencyChecker` | 가져오는 곳 없음(주석에만 등장) |
| AI 이미지 관련도 검사 | `main.ts:3571-3572` `const relevanceCheckEnabled = false;` → `filterImagesByRelevance` 실행 안 됨 |
| `promptSimilarity` | 테스트에서만 사용 |
| 나노 템플릿 A-1~D-2 | 브리프가 항상 먼저 반환. 미지원 엔진 폴백에서만 도달 |
| `flowGenerator.ts:2237` PromptBuilder 폴백 | Flow 항목은 늘 브리프라 `:2210`에서 반환 |
| ImageFX의 PromptBuilder 가져오기 | 가져오기만 하고 호출 없음 |
| 상품 썸네일 블록 | `naverBlogAutomation.ts` `if (false && …)` |
| 쓰이지 않는 내보내기 | `imageStyles.ts`의 `getRandomCameraAngle`, `getRandomPose`, `getRandomComposition` 등. `imageViewpointRotation.ts`의 `appendViewpointHint` |
| 낡은 주석 | `editorHelpers.ts:1138, 1143`("수집 이미지 + 텍스트 오버레이"라고 하지만 원본을 넣음), `:1218-1219`("SVG"라고 하지만 Puppeteer HTML), `types.ts:1`(Prodia 제거라고 적혔지만 아직 지원) |

---

## 4. 감사에서 찾은 기존 버그 (V1 범위 밖, 이번에 고치지 않음)

코드 읽기로 확인했다. 실행해서 재현하지는 않았다.

| # | 버그 | 근거 | 영향 |
|---|---|---|---|
| 1 | 소제목 이미지 모드 "홀수만/짝수만"이 뒤집히거나 전부 빠진다 | `main.ts:3984-4045`. 번호가 요청 안에서의 순서로 매겨지고, 주석은 0번을 썸네일로 가정한다 | 썸네일 없이 본문만 보내는 풀오토 배치에서 "홀수만"이면 2·4·6번 소제목이 남는다. 한 장씩 보내는 호출은 번호가 늘 0이라 "홀수만"이면 전부 빠져 오류가 나고, "짝수만"이면 아무것도 걸러지지 않는다 |
| 2 | 이미지 그리드 재생성이 일부 엔진에서 AI 대신 네이버 이미지 검색을 한다 | `imageDisplayGrid.ts:805-808, 985-987`. nano-banana-2·nano-banana·flow·imagefx·dropshot 분기가 없다. stability·falai 분기는 허용 목록 밖이라 예외가 난다 | 재생성 버튼이 다른 종류의 이미지를 가져온다 |
| 3 | 썸네일 글자가 두 번 찍힐 수 있다 | 생성 때 오버레이(#1)와 발행 때 오버레이(#3)가 서로를 확인하는 표시가 없다. 발행 오버레이 면제 목록(`editorHelpers.ts:1212`)은 nano-banana-pro·pollinations뿐이라 nano-banana-2·Flow가 직접 그린 글자 위에 또 얹힌다 | 문구가 두 줄로 겹칠 수 있다. 라이브 확인 필요 |
| 4 | 그리드 "새 AI" 버튼이 두 번 생성한다 | `renderer.ts:10181`의 나노바나나 단계에 조건이 없다 | 선택한 엔진이 성공한 뒤에도 nano-banana-pro를 한 번 더 부른다(비용) |
| 5 | 이미지 스튜디오가 비용 안전 래퍼를 거치지 않는다 | `imageGenStudio.ts:173`이 `api.generateImages`를 직접 부른다 | 쇼핑 모드 규칙·비용 확인을 건너뛴다 |
| 6 | DeepInfra·Flow의 다양성 힌트가 한 장씩 호출하면 늘 0번이다 | 호출 안의 순서(`i`)를 쓴다. `diversityIndex`를 보지 않는다 | 소제목마다 같은 각도 |

1번과 2번은 사장님이 바로 체감할 수 있는 문제다. 각각 한 릴리스로 따로 고치는 것을 권한다.

---

## 5. 자동화 배선

렌더러의 모든 흐름은 `generateImagesWithCostSafety`(`costAndAutoGen.ts`)를 지난다. 이미지 스튜디오만 예외다. 이 래퍼가 하는 일:
- 제목을 채운다(`postTitle`).
- 연결된 글이면 전체 소제목 목록을 붙인다(`sectionPlanHeadings`). 소제목 역할 계획에 쓰인다.
- 기사 썸네일 1장 요청이면 디렉터 요청(`thumbnailDirector`)을 붙인다. 수동 썸네일 편집기의 배경 요청은 붙이지 않는다.
- 저장된 설정에서 썸네일 문구 여부를 채운다.

| 흐름 | 위치 | 디렉터 | 소제목 역할 |
|---|---|---|---|
| 풀오토 썸네일 | `fullAutoFlow.ts:1166` | 거침 | — |
| 풀오토 본문 배치 | `fullAutoFlow.ts:1245` | — | 연결된 글이면 |
| 반자동 썸네일 / 소제목 | `fullAutoFlow.ts:3090`, `:3245` | 썸네일만 | 연결된 글이면 |
| 연속 발행·렌더러 다중계정 | `multiAccountManager.ts:737` | 썸네일 항목만 | 연결된 글이면 |
| 이미지 탭 썸네일 / 소제목 / 재생성 | `headingImageGen.ts:1102`, `1413-1649`, `4535` | 썸네일만(칸이면 실제 사진·카드 허용) | 연결된 글이면 |
| 이미지 그리드 재생성 | `imageDisplayGrid.ts:734-798, 914-978` | 썸네일이면 | 연결된 글이면 |
| 수동 썸네일 편집기 배경 | `thumbnailGenerator.ts:362`, `thumbnailPreview.ts:222` | **거치지 않음** | — |
| 이미지 스튜디오 | `imageGenStudio.ts:173` | **거치지 않음** | — |
| 메인 다중계정 썸네일 / 본문 | `main.ts:5777` / `:5860` | 썸네일은 명시적으로 거침 | 본문 목록 없음 |

메인 IPC `automation:generateImages`(`main.ts:3878`)는 모든 요청을 디렉터 입구에 넘긴다. 입구는 **디렉터 요청이 붙은 썸네일 1장만** 가로채고 나머지는 그대로 `generateImages`로 보낸다.

---

## 6. 감사 뒤 바로 고친 것 (이번 작업이 만든 문제)

| 문제 | 원인 | 조치 |
|---|---|---|
| 수동 썸네일 편집기의 배경 생성이 디렉터로 들어가 사용자 프롬프트가 제목으로 바뀜 | 입구가 제목에 "썸네일/thumbnail"만 있으면 가로챘다 | 입구는 디렉터 요청이 있을 때만 동작. 렌더러는 편집기 배경 요청에 붙이지 않음 |
| 재생성·수동 프롬프트가 제목으로 바뀔 수 있음 | 썸네일 칸 이름이면 프롬프트를 교체했다 | 재생성이거나 저장된 수동 프롬프트가 있으면 그대로 둠(`keepPrompt`) |
| DeepInfra·Leonardo가 역할도 회전도 없이 생성될 수 있음 | 두 엔진은 브리프를 영어 래퍼로 바꿔 역할 줄이 빠지는데, 역할이 있다고 회전을 껐다 | 역할에 맞춰 회전을 끄는 엔진은 OpenAI만. 두 엔진 파일은 원래대로 되돌림 |
| 오버레이 엔진이 글자를 직접 그리게 될 수 있음 | 짧은 문구 지정이 모든 엔진에 갔다 | 글자를 직접 그리는 엔진(나노바나나 2/프로·Flow)에만 지정 |
| 디렉터 경로의 오버레이 조건이 기존과 조금 달랐음 | 항목 정보 없이 오버레이를 불렀다 | 기존과 같이 항목(`allowText`)을 넘김 |

---

## 7. §27 비용 분리 계측 설계안 (구현하지 않음)

현재 상태:
- 공급자별 누계: `apiUsageTracker.trackApiUsage`. OpenAI 이미지, 나노바나나(gemini), DeepInfra, Leonardo는 기록한다. Flow·ImageFX는 0원으로 기록한다.
- 호출별 기록: `imageUsageLog.ts`(`userData/logs/image-usage.jsonl`). **OpenAI 이미지만** 기록한다.
- 비전 호출: 이슈 수집 비전 검사, 썸네일 심사는 **기록이 없다**(`src/crawler`, `src/image/director`에 기록 호출 없음). 사진 모드 비전만 따로 기록한다.
- 네이버 검색 API: 무료라 기록이 없다.

그래서 지금 앱 데이터로는 "수집이 생성보다 싼가"를 숫자로 답할 수 없다.

제안:
1. 호출별 기록 한 줄에 `purpose`(`generate` / `judge` / `asset-check` / `search`), `stage`(예: `thumbnail-director`, `issue-vision-gate`, `section`), `route`(`api` / `subscription` / `free`), `postId`, 입력·출력 토큰, 걸린 시간을 더한다. 키와 프롬프트 본문은 지금처럼 기록하지 않는다.
2. 모든 생성 엔진이 호출별 기록을 남긴다(지금은 OpenAI만).
3. 비전 호출은 공용 함수 `judgeImagesWithRoute` 한 곳에 기록을 붙인다. 수집 비전 검사와 썸네일 심사가 함께 잡힌다. 구독 경로는 0원 + 호출 수·시간.
4. 네이버 검색·이미지 검색은 호출 수만(0원).
5. 요약: 글 1편 기준 "이미지 생성 비용"과 "검색·확인 비용" 두 줄. 기존 사용량 화면에 한 줄로 보여준다.
6. 단가는 기존 가격표(`estimateImageCostUSD`, 비전은 토큰 × 모델 단가)를 재사용한다. 새 네트워크 호출은 없다.

작업량: 파일 4~5개, 한 릴리스 단위로 분리 가능.

---

## 8. 충돌·주의

- **초상권(SPEC-IMAGE-PORTRAIT-2026, 초안·미구현) vs V1 §6 "실제 인물 사진 우선".** 사장님 법률 조사에 따르면 크롤링한 유명인 사진은 초상권·퍼블리시티권·사진 저작권이 함께 걸리고, AI 닮은꼴도 같은 문제가 된다. 그래서 합성 재료는 사용자가 본문에 넣은 사진으로만 제한했다. 기사 URL은 참고용으로만 쓴다. 이슈 수집기로 받은 사진도 사용자가 본문에 쓰기로 한 경우만 합성한다. 권리를 보증하지는 않는다.
- **CARD_PROMISE.** 렌더러는 글 생성 결과의 클릭 사유를 CARD_PROMISE로 쓰고, 없으면 제목을 쓴다. `titleDiagnostics.ts` 주석에 따르면 파서가 그 값을 버린다. 렌더러까지 오는지는 확인하지 못했다. 고치려면 글쓰기 엔진 쪽이라 별도 승인이 필요하다.
- **300줄 규칙.** 새 모듈 12개는 모두 300줄 미만(최대 269줄)이다. 수정한 기존 파일 가운데 300줄을 넘는 것(예: `contextualImagePrompt.ts` 546→603줄, `promptBuilder.ts` 334→338줄)은 원래부터 넘었다. 이번에 나누지 않았다.
