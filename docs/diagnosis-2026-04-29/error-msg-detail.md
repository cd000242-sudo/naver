# 사용자 노출 에러 메시지 상세 카탈로그 (v2.7.40)

조사 일자: 2026-04-29
점수 기준: 5=한국어+원인+해결책, 4=한국어+원인, 3=한국어+모호, 2=한국어 기술용어 혼재, 1=영문/jargon

## 우선 개선 Top 20 (체감 효과 큰 순서)

| # | 파일:라인 | 현재 메시지 | 점수 | 개선안 |
|---|---|---|---|---|
| 1 | src/image/flowGenerator.ts:421 | `FLOW_LOGIN_TIMEOUT:Google 로그인이 완료되지 않음 (창 닫힘 또는 5분 초과). 다시 시도해주세요.` | 2 | `Google 로그인 시간이 5분을 넘었습니다. 다시 [Flow 로그인] 버튼을 누르세요.` (코드 prefix 제거) |
| 2 | src/image/flowGenerator.ts:460 | `FLOW_SESSION_LOST:로그인 후 off-screen 전환 시 세션 유실. 다시 시도해주세요.` | 1 | `Google 세션이 끊겼습니다. 다시 [Flow 로그인]을 진행해주세요.` |
| 3 | src/image/flowGenerator.ts:606 | `FLOW_NEW_PROJECT_BUTTON_NOT_FOUND:labs.google/fx/tools/flow에서 "새 프로젝트" 버튼을 30초 내 찾지 못함...` | 1 | `Google Flow 페이지가 변경되었습니다. 1) 인터넷 연결 확인  2) 1시간 후 재시도  3) 계속 실패하면 패치를 기다려주세요.` |
| 4 | src/image/flowGenerator.ts:643 | `FLOW_PROMPT_INPUT_NOT_FOUND:프롬프트 입력창(contenteditable)을 15초 내 찾지 못함.` | 1 | `Flow 입력창을 찾지 못했습니다. 페이지를 새로고침 후 다시 시도해주세요.` |
| 5 | src/image/flowGenerator.ts:802 | `FLOW_IMAGE_TIMEOUT:이미지 ${n}초 초과. 스크린샷+img 목록 저장됨.` | 2 | `Flow 이미지 생성이 ${n}초 안에 끝나지 않았습니다. 프롬프트 단순화 또는 5분 후 재시도해주세요.` |
| 6 | src/image/flowGenerator.ts:1283 | `FLOW_ALL_FAILED:모든 이미지 생성 실패. 이전 로그 확인 필요.` | 2 | `Flow 이미지 생성이 모두 실패했습니다. 1) Google 로그인 상태 확인  2) Flow 쿼터(시간당 한도) 확인  3) 다른 이미지 엔진 선택` |
| 7 | src/automation/publishHelpers.ts:1216 | `발행 버튼을 찾을 수 없습니다. 스크린샷을 확인하세요.` | 3 | `발행 버튼을 찾지 못했습니다. 네이버 에디터 UI가 변경되었을 수 있습니다. 앱을 최신 버전으로 업데이트해주세요.` |
| 8 | src/automation/publishHelpers.ts:1904 (+1955, 2117, 5178, 5431) | `발행이 완료되지 않았습니다. 에디터 페이지에 머물러 있습니다.` (5중복) | 3 | 발행 후 검증 로직 단일화 + `발행이 끝나지 않았습니다. 네이버에서 차단/캡차 발생 가능. 잠시 후 수동 확인하거나 1시간 뒤 재시도하세요.` |
| 9 | src/automation/publishHelpers.ts:2027/2149/2179 | `임시저장 버튼도 찾을 수 없습니다.` (3중복) | 2 | 폴백 안내까지 포함해서 `발행과 임시저장 모두 불가능한 상태입니다. 네이버 로그아웃/재로그인 후 다시 시도해주세요.` |
| 10 | src/contentGenerator.ts:7883 / 8061 / gemini.ts:451 | `Perplexity/Gemini/OpenAI 생성 실패: ... 원인 불명` (다수) | 2 | `${엔진} 호출에 실패했습니다. 사유: ${translateError(e)}. API 키와 사용량 한도를 확인해주세요.` (translate 함수가 매핑 못한 케이스를 catch-all로 한국어 가이드 추가) |
| 11 | src/crawler/smartCrawler.ts:656/700/1233/1301/1411 | `Fast 모드도 Access Denied 차단됨` 등 5건 | 1 | `네이버가 봇 접근을 차단했습니다 (Access Denied). 5~10분 후 다시 시도하거나 IP를 변경해주세요.` |
| 12 | src/naverBlogAutomation.ts:2369 | `프록시 연결 실패로 로그인 페이지를 열 수 없습니다. (HTTP 407) 프록시 설정을 확인하거나 비활성화하세요.` | 4 | (양호) — 단 `HTTP 407` 대신 `프록시 인증 실패(407)`로 보강 |
| 13 | src/naverBlogAutomation.ts:6072/6078/6089 | `${operationName} 실패 - 브라우저 프레임이 유효하지 않습니다. 다시 시작해주세요.` | 3 | `${operationName} 도중 네이버 페이지가 새로고침되었습니다. [작업 재시작] 버튼을 눌러주세요.` |
| 14 | src/image/imageFxGenerator.ts:448/455/476/494/501 (+11곳 중복) | `AdsPower API HTTP 503` / `AdsPower 프로필 없음` / `AdsPower WebSocket URL 없음` / `AdsPower 컨텍스트 없음` | 1-2 | `AdsPower 브라우저 연결 실패. AdsPower 앱을 실행 후 프로필이 있는지 확인해주세요.` (사용자가 모르는 jargon 통합) |
| 15 | src/image/imageFxGenerator.ts:429 | `Playwright Chromium 자동 설치 실패. Chrome 또는 Edge를 설치해주세요.` | 3 | (대체로 양호) `이미지FX 사용에 필요한 브라우저 설치 실패. Chrome 또는 Edge를 설치한 뒤 앱을 재시작해주세요.` |
| 16 | src/main.ts:6766 | `NAVER_ALL_KEYS_FAILED: ${detail}` | 1 | `등록한 네이버 검색 API 키 모두에서 오류가 발생했습니다. 환경설정 → 네이버 API에서 키를 다시 확인해주세요. 상세: ${detail}` |
| 17 | src/engagement/commentCrawler.ts:64 | `Invalid JSONP response format` | 1 | `네이버 응답 형식이 변경되었습니다. 댓글 기능 패치를 기다려주세요.` |
| 18 | src/__tests__/licenseFallback.test.ts (`ENOENT`) → src/licenseFallback.ts:225/231 | `HTTP ${status} ${statusText}` / `서버 응답 형식 오류` | 2 | `라이선스 서버 응답 오류 (HTTP ${status}). 인터넷 연결 확인 후 5분 뒤 재시도하세요. 7일간 오프라인 사용 가능합니다.` |
| 19 | src/automation/publishHelpers.ts:2189/2503 / naverBlogAutomation.ts:5503 | `예약발행 날짜가 지정되지 않았습니다.` (중복) | 4 | (양호) — 단 "예약 시간을 설정한 뒤 발행해주세요" 안내 보강 |
| 20 | src/contentGenerator.ts:5705 / gemini.ts:331/335 / perplexity.ts:245/249 | `구조화된 콘텐츠가 비어 있습니다.` / `빈 응답` / `품질 기준 미달` | 2 | `${엔진} 응답이 비어 있거나 품질 기준에 미달했습니다. 자동 재시도 중입니다... (다른 엔진으로 전환을 권장)` |

## 카테고리별 카탈로그

### A. 이미지 생성

| 파일:라인 | 현재 메시지 | 점수 | 개선안 |
|---|---|---|---|
| src/imageGenerator.ts:287 | `이미지를 생성할 소제목과 프롬프트를 확인해주세요.` | 4 | (양호) |
| src/imageGenerator.ts:328/352/375 | `[덕트테이프] ${userMsg}` / `[DALL-E 3] ${userMsg}` / `[Leonardo AI] ${userMsg}` | 3 | "[덕트테이프]" 대신 "[OpenAI 이미지]"로 사용자 친화 명칭 |
| src/imageGenerator.ts:402/406 | `[ImageFX] 이미지 생성 실패: ${rawMsg}\n💡 가능한 원인: 1) 시간당 한도... 2) Google 세션...` | 4 | (우수, 그대로 유지) |
| src/imageGenerator.ts:434 | `[Flow] 이미지 생성 실패: ${rawMsg}\n💡 가능한 원인: ...` | 4 | (양호) |
| src/imageGenerator.ts:471 | `[local-folder] 내 폴더 이미지는 renderer의 localFolderImageLoader에서 처리해야 합니다. generateImages로 전달되면 안 됩니다.` | 1 | 사용자에게 노출 금지 — 내부 assertion으로 격리 |
| src/imageGenerator.ts:529 | `이미지 생성 실패: 지원하지 않는 이미지 제공자(${options.provider}) 및 Gemini 폴백 실패 - ${msg}` | 2 | `이미지 생성에 실패했습니다 (${provider}). 환경설정에서 다른 이미지 엔진을 선택해주세요.` |
| src/image/openaiImageGenerator.ts:209/225/232 | `이미지 데이터가 응답에 없습니다 (model: ${m})` / `b64_json/url 모두 비어있음` / `OpenAI가 빈 이미지 반환 (안전필터/쿼터 의심)` | 2 | model 정보는 디버그 로그로, 사용자에게는 `OpenAI 이미지 생성 실패. 안전 필터에 걸리거나 사용량 한도일 수 있습니다.` |
| src/image/openaiImageGenerator.ts:325 | `OpenAI 덕트테이프로 단 1장의 이미지도 생성하지 못했습니다. (키 source: ${keySource})${detail}` | 1 | "덕트테이프" 사내 은어. `OpenAI에서 이미지를 한 장도 생성하지 못했습니다. API 키와 사용량 한도를 확인해주세요.` |
| src/image/leonardoAIGenerator.ts:93/137 | `v1 생성 ID를 받지 못했습니다: ${JSON.stringify(...)}` | 2 | JSON 덤프를 사용자에게 보여주지 말 것. `Leonardo AI에서 응답 ID를 받지 못했습니다.` |
| src/image/leonardoAIGenerator.ts:159 | `사용자 중지 요청` | 4 | (양호) |
| src/image/leonardoAIGenerator.ts:189 | `Leonardo AI 이미지 생성 실패` | 3 | 원인 명시 — 네트워크/한도/안전필터 추정 사유 추가 |
| src/image/leonardoAIGenerator.ts:195 | `이미지 생성 타임아웃 (120초 초과)` | 4 | (양호) |
| src/image/nanoBananaProGenerator.ts:1539 | `Gemini 응답에서 이미지를 찾을 수 없습니다 (finishReason: ${reason})` | 3 | finishReason 영문 그대로 노출됨 — 한국어 매핑 추가 (SAFETY→안전필터, MAX_TOKENS→길이초과) |
| src/image/nanoBananaProGenerator.ts:1767 | `[Gemini] ❌ 이미지 생성에 실패했습니다. 나노바나나 모든 모델(...)이 응답하지 않았습니다. API 키와 네트워크를 확인해주세요.` | 4 | (우수) |
| src/image/imageUtils.ts:54/60 | `❌ 이미지 데이터가 비어있습니다.` / `❌ 이미지 데이터가 너무 작습니다 (${n}바이트).` | 4 | (양호) |
| src/image/imageTextConsistencyChecker.ts:104/146/153 | `Failed to fetch image: ${status} ${text}` / `Gemini API error: ${status}` / `Gemini API returned empty response` | 1 | 영문 — 한국어로 변환 필요 |
| src/image/gifConverter.ts:11 | `ffmpeg-static을 찾을 수 없습니다.` | 2 | `GIF 변환 라이브러리(ffmpeg)를 찾을 수 없습니다. 앱을 재설치해주세요.` |
| src/image/tableImageGenerator.ts:67 | `Card element not found` | 1 | 영문 그대로 — `장단점 표 카드를 찾지 못했습니다.` |
| src/image/types.ts:54 | `지원하지 않는 이미지 제공자입니다: ${provider}` | 4 | (양호) |
| src/image/imageFormatPipeline.ts:374 | `이미지 파일을 읽을 수 없습니다: ${inputPath}` | 4 | (양호) |
| src/image/deepinfraGenerator.ts:325 | `DeepInfra API 키가 설정되지 않았습니다. 환경설정에서 입력해주세요.` | 5 | (우수) |
| src/automation/imageHelpers.ts:432/852/2883 | `네이버 블로그에서 이미지 업로드 버튼을 찾을 수 없습니다` (3중복) | 3 | 통합 + `네이버 에디터의 이미지 업로드 UI가 변경된 것으로 보입니다. 앱 업데이트를 확인해주세요.` |
| src/automation/imageHelpers.ts:592/891 | `파일 전송 오류: 네이버 에디터에서 이미지 업로드 거부 (용량 초과 또는 형식 오류)` (중복) | 4 | (양호) |
| src/automation/imageHelpers.ts:694 | `잘못된 Base64 Data URL 형식입니다` | 3 | (사용자가 받기 어려움) `이미지 데이터 형식이 올바르지 않습니다.` |
| src/automation/imageHelpers.ts:941 | `파일 선택했으나 이미지가 삽입되지 않음` | 3 | `네이버에 이미지 파일은 전송되었으나 본문 삽입에 실패했습니다. 다시 시도해주세요.` |
| src/automation/imageHelpers.ts:961 | `이미지 삽입 실패 (FileChooser + Base64 모두 실패): ${msg}` | 2 | "FileChooser+Base64" jargon 제거 |
| src/automation/imageHelpers.ts:1425 | `이미지 삽입이 확인되지 않음` | 3 | `이미지 삽입을 검증하지 못했습니다. 에디터에서 직접 확인해주세요.` |

### B. 발행/네이버 자동화

| 파일:라인 | 현재 메시지 | 점수 | 개선안 |
|---|---|---|---|
| src/automation/publishHelpers.ts:917 | `예약 날짜 설정 실패: 목표 ${y}-${m}-${d} (${n+1}회 시도 후 UI 검증 실패)` | 3 | `예약 날짜 설정에 ${n+1}번 모두 실패했습니다 (${y}-${m}-${d}). 네이버 캘린더 UI가 변경되었을 수 있습니다.` |
| src/automation/publishHelpers.ts:1078 | `예약 날짜/시간 입력 실패: 날짜/시간 입력 필드를 찾을 수 없습니다. 네이버 에디터 UI가 변경되었을 수 있습니다. 로그의 input 스캔 결과를 확인하세요.` | 4 | (양호) |
| src/automation/publishHelpers.ts:1216/1482/1640/2046 | `발행/확인/저장 버튼을 찾을 수 없습니다` (4중복) | 3 | 단일 헬퍼로 통합. UI 변경 가능성 안내 추가 |
| src/automation/publishHelpers.ts:1324/1394 | `예약 라디오 버튼을 찾을 수 없습니다.` / `예약 라디오 버튼을 선택할 수 없습니다.` | 3 | (양호) |
| src/automation/publishHelpers.ts:1904/1955/1992/1995 | `발행이 완료되지 않았습니다 / 발행 버튼이 비활성화되어 있거나 / 발행 확인 버튼이 계속 비활성화되어 있습니다. 발행 조건을 확인해주세요.` | 3 | "발행 조건"이 모호 — 본문 글자 수, 카테고리, 카드형 콘텐츠 누락 등 체크리스트 제시 |
| src/automation/publishHelpers.ts:1945 | `발행 실패: ${publishStatus.errorText}` | 2 | errorText가 영문일 가능성 — 매핑 테이블 필요 |
| src/automation/publishHelpers.ts:2031/2153/2183 | `즉시 발행 실패: 발행 확인 버튼을 찾을 수 없습니다. 임시저장 폴백도 실패: ${msg}` (3중복) | 2 | 통합 + 한국어 명료화 |
| src/automation/publishHelpers.ts:2189 | `예약발행 날짜가 지정되지 않았습니다.` | 4 | (양호) |
| src/automation/publishHelpers.ts:2221 | `예약발행 ${MAX_SCHEDULE_RETRIES}회 시도 모두 실패: ${msg \|\| '알 수 없는 오류'}` | 3 | 마지막 오류를 한국어 매핑 추가 |
| src/naverBlogAutomation.ts:1073 | `수동 로그인 시간이 초과되었습니다. (10분)` | 4 | (양호) |
| src/naverBlogAutomation.ts:1122/1201 | `사용자가 자동화를 취소했습니다.` (중복) | 5 | (양호) |
| src/naverBlogAutomation.ts:1340/1868 | `브라우저 페이지가 초기화되지 않았습니다. setupBrowser()를 먼저 호출하세요.` | 1 | "setupBrowser()" 함수명 노출 — 사용자 메시지에서 제거. 내부 assertion |
| src/naverBlogAutomation.ts:1363 | `메인 프레임에 접근할 수 없습니다. switchToMainFrame()을 먼저 호출하세요.` | 1 | 함수명 노출 |
| src/naverBlogAutomation.ts:1414 | `예약발행 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD HH:mm 형식)` | 5 | (우수) |
| src/naverBlogAutomation.ts:1435 | `CTA 링크는 유효한 URL 형식이어야 합니다. (http:// 또는 https://로 시작)` | 5 | (우수) |
| src/naverBlogAutomation.ts:1483/1495 | `❌ 발행 실패: 제목/본문이 없습니다. 콘텐츠 생성이 필요합니다.` | 5 | (우수) |
| src/naverBlogAutomation.ts:1623 | `브라우저 연결 끊김` | 2 | `네이버 브라우저 연결이 끊겼습니다. 인터넷 상태를 확인해주세요.` |
| src/naverBlogAutomation.ts:2371 | `아이디 입력 필드를 찾을 수 없습니다. (URL: ${failUrl}, 제목: ${failTitle})` | 3 | URL/제목은 디버그 로그로, 사용자 토스트는 짧게 |
| src/naverBlogAutomation.ts:2487/2741/4346/4622/5320 | `비밀번호/로그인/제목/저장 버튼을 찾을 수 없습니다.` | 3 | 사유 추가 — UI 변경 추정 + 앱 업데이트 안내 |
| src/naverBlogAutomation.ts:3115/3119 | `보안 인증 해결 시간이 초과되었습니다. (10분) 최종 URL: ${u}` / `로그인 시간이 초과되었습니다. (10분) 최종 URL: ${u}` | 3 | URL은 사용자에게 의미 없음 — 디버그 로그로 |
| src/naverBlogAutomation.ts:3619 | `로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요. 최종 URL: ${u}` | 4 | URL 제거하면 5점 |
| src/naverBlogAutomation.ts:3624 | `로그인에 실패했습니다. URL이 변경되지 않았습니다.` | 2 | "URL 변경" 사용자에게 무의미 |
| src/naverBlogAutomation.ts:3890/3892 | `수동 로그인 후 블로그 에디터가 아닌 메인 페이지로 이동되었습니다.` / `수동 로그인 후에도 블로그 페이지 접근 실패` | 4 | (양호) |
| src/naverBlogAutomation.ts:4015 | `로그인 후에도 블로그 페이지 접근 실패. 네이버 계정 보안 설정을 확인해주세요.` | 4 | (양호) |
| src/naverBlogAutomation.ts:4163 | `메인 프레임으로 전환할 수 없습니다. iframe이 아직 로드되지 않았을 수 있습니다.` | 2 | "iframe" jargon — 일반 사용자에게는 그냥 "에디터 로딩 실패" |
| src/naverBlogAutomation.ts:4337 | `제목이 비어있습니다.` | 4 | (양호) |
| src/naverBlogAutomation.ts:4386 | `제목 입력에 실패했습니다 (3회 시도)` | 4 | (양호) |
| src/naverBlogAutomation.ts:4465/4472/4479 | `날짜 형식이 올바르지 않습니다.` / `예약 날짜는 현재 시각보다 미래여야 합니다.` / `예약 날짜는 1년 이내로 설정해야 합니다.` | 5 | (우수) |
| src/naverBlogAutomation.ts:5178~5575 | publishHelpers와 거의 동일한 12+ 메시지 중복 | 2 | DRY — publishHelpers로 통합 |
| src/automation/editorHelpers.ts:502/509 | `본문 입력 실패: 에디터에 내용이 없습니다.` / `본문 입력 실패: 입력할 텍스트가 비어있습니다.` | 4 | (양호) |
| src/automation/ctaHelpers.ts:373/446/634 | `상단/중간에 CTA 삽입 실패` / `CTA HTML 파싱 실패` | 3 | 원인/해결책 추가 — 네이버 에디터 변경 가능성 |

### C. AI 글생성 엔진

| 파일:라인 | 현재 메시지 | 점수 | 개선안 |
|---|---|---|---|
| src/contentGenerator.ts:3737 | `프리셋을 찾을 수 없습니다: ${presetKey}` | 4 | (양호, 단 사용자가 보면 의미 모를 수도 있음) |
| src/contentGenerator.ts:5705 | `구조화된 콘텐츠가 비어 있습니다.` | 2 | `AI 응답에 본문이 없습니다. 자동 재시도 중...` |
| src/contentGenerator.ts:7168 | `Gemini API 키가 설정되지 않았습니다.` | 5 | (우수) |
| src/contentGenerator.ts:7788 | `Perplexity API 키가 설정되지 않았습니다. 환경설정(⚙️)에서 Perplexity API 키를 입력해주세요. (Perplexity 웹 구독과 API 키는 별도입니다. https://www.perplexity.ai/settings/api 에서 API 키를 발급받으세요)` | 5 | (모범 사례 — 다른 엔진도 이 수준으로) |
| src/contentGenerator.ts:7849/7974/8229 | `Perplexity/OpenAI/Claude API 빈 응답` (3건) | 2 | `${엔진}이 빈 응답을 반환했습니다. 자동 재시도 중...` |
| src/contentGenerator.ts:7883 | `Perplexity 생성 실패: ${translatePerplexityError(e) \|\| '원인 불명'}` | 2 | translate 함수가 매핑 못한 케이스에 한국어 catch-all 필요 |
| src/contentGenerator.ts:7904 | `OPENAI_API_KEY가 설정되어 있지 않습니다.` | 3 | "OPENAI_API_KEY"는 변수명 — `OpenAI API 키가 설정되어 있지 않습니다.`로 통일 |
| src/contentGenerator.ts:8000/8273 | `OpenAI/Claude API 키가 유효하지 않습니다. 환경설정에서 API 키를 확인해주세요.\n원본 오류: ${msg}` | 4 | "원본 오류"가 영문이면 사용자가 혼란 — 디버그 로그로 |
| src/contentGenerator.ts:8012 | `OpenAI API 결제 한도에 도달했습니다. OpenAI 대시보드에서 결제 정보를 확인해주세요.` | 5 | (우수) |
| src/contentGenerator.ts:8061 | `OpenAI 모델 사용 불가. 시도한 모델: ${list}\n마지막 오류: ${msg}` | 3 | 모델 목록은 사용자에게 별 의미 없음 |
| src/contentGenerator.ts:8070 | `CLAUDE_API_KEY가 설정되어 있지 않습니다.` | 3 | 변수명 — `Claude API 키가 설정되어 있지 않습니다.` |
| src/contentGenerator.ts:8866 | `rawText가 필요합니다.` | 1 | 변수명 그대로 — `원본 텍스트가 필요합니다.` |
| src/contentGenerator.ts:9040/9050 | `사용자가 콘텐츠 생성을 취소했습니다.` (중복) | 5 | (양호) |
| src/contentGenerator.ts:10014/10037 | `콘텐츠 생성 실패 (엔진: ${e}, ${n}회 시도): ${msg}` | 3 | 마지막 사유의 한국어 변환 필요 |
| src/gemini.ts:133 | `⏳ [사용량 초과] Gemini API 할당량이 소진되었습니다. 다른 AI 엔진(Claude/OpenAI)으로 전환하거나 잠시 후 다시 시도해주세요. (감지된 모델: ${m})` | 5 | (우수 — 모범 사례) |
| src/gemini.ts:147/276/463 | `GEMINI_API_KEY 환경변수가 설정되지 않았습니다.` (3중복) | 3 | 변수명 — `Gemini API 키가 설정되지 않았습니다.` |
| src/gemini.ts:268 | `생성할 내용을 입력해주세요.` | 5 | (양호) |
| src/gemini.ts:331/335 | `빈 응답` / `품질 기준 미달` | 1 | 사용자에게 단독 노출 시 무의미 — 컨텍스트 추가 |
| src/gemini.ts:451/535 | `Gemini 생성/스트리밍 실패: ${translateGeminiError(e) \|\| '원인 불명/모든 모델 시도 실패'}` | 2 | translate 미스 시 한국어 가이드 |
| src/perplexity.ts:203/217/245/249/296 | gemini.ts와 거의 동일한 5개 패턴 | 2 | 동일 처리 |
| src/agents/baseAgent.ts:79 | `Gemini 응답 형식이 올바르지 않습니다.` | 4 | (양호) |
| src/imageHeadingMatcher.ts:171 | `응답 형식 불일치` | 2 | `AI 응답 형식이 예상과 달라 분석할 수 없습니다.` |
| src/jsonParser.ts | `throw new Error(...)` 1건 | — | (개별 확인 필요) |
| src/titleSelector.ts:484 | `JSON 파싱 실패` | 3 | `AI 제목 응답을 분석하지 못했습니다.` |
| src/urlGenerator.ts:18/71 | `GEMINI_API_KEY가 환경변수에 설정되지 않았습니다.` / `URL 글생성 실패: ${msg}` | 3 | 변수명 / 영문 사유 노출 가능 |

### D. 라이선스/네트워크/크롤러

| 파일:라인 | 현재 메시지 | 점수 | 개선안 |
|---|---|---|---|
| src/licenseFallback.ts:225/231 | `HTTP ${status} ${statusText}` / `서버 응답 형식 오류` | 2 | 한국어 사유 + 오프라인 그레이스 안내 |
| src/preload.ts:265~485 | `라이선스/기기 ID/트렌드/검색 트렌드/관련 키워드 ... 중 오류가 발생했습니다: ${msg}` (7건) | 3 | catch-all로 영문 사유 그대로 노출됨 — 매핑 함수 필요 |
| src/crawler/smartCrawler.ts:656/700/1233/1301/1411 | `Fast/Standard 모드도 Access Denied 차단됨` 등 | 1 | "Access Denied" 영문 — `네이버가 봇 차단했습니다. ...` |
| src/crawler/smartCrawler.ts:1226/1295 | `모바일 페이지 응답 오류: ${status}` / `OG 추출 응답 오류: ${status}` | 3 | 사유 한국어화 |
| src/crawler/shopping/providers/SmartStoreProvider.ts:132 | `API 응답 실패: ${status}` | 3 | `네이버 쇼핑 API 응답 실패 (HTTP ${status})` |
| src/naverBlogCrawler.ts:29/79/172/175/251/472/505 | `HTTP ${status}` / `본문 부족 (${n}자)` / `❌ 존재하지 않는 페이지 (404)` / `❌ 페이지 접근 오류` / `❌ 오류 페이지 감지` / `❌ 본문 내용이 부족` / `네이버 블로그 크롤링 실패: ${msg}` | 3 | 일부 양호하나 ❌ 이모지 일관성·사유 명료화 필요 |
| src/naverDatalab.ts:108~280 | `키워드는 1개 이상 5개 이하여야 합니다.` / `네이버 데이터랩 API 오류: ${msg}${code}` | 4 | (양호) |
| src/naverSearchApi.ts:127/153 | `네이버 검색 API 키가 설정되지 않았습니다.` / `네이버 검색 API 오류 (${status}): ${text}` | 4 | (양호) — errorText 영문일 경우 매핑 필요 |
| src/main.ts:6766 | `NAVER_ALL_KEYS_FAILED: ${detail}` | 1 | 한국어 변환 |
| src/engagement/commentCrawler.ts:64 | `Invalid JSONP response format` | 1 | 영문 |
| src/postLimitManager.ts:74 | `Invalid state` | 1 | 영문 |

### E. 시스템/AdsPower/내부

| 파일:라인 | 현재 메시지 | 점수 | 개선안 |
|---|---|---|---|
| src/image/imageFxGenerator.ts:429~1809 | `AdsPower API HTTP ${s}` / `AdsPower 프로필 없음` / `AdsPower 시작 실패: ${msg}` / `AdsPower 컨텍스트 없음` (15+곳) | 1-2 | 통합 헬퍼 + `AdsPower 브라우저 연결 실패` 단일 메시지 |
| src/image/imageFxGenerator.ts:623/924 | `Google 로그인 시간 초과 (5분). AdsPower 브라우저에서 Google 로그인 후 다시 시도해주세요.` | 4 | (양호) |
| src/main\utils\adbIpChanger.ts:179/547 | `... ${errMsg \|\| '알 수 없는 오류'}` | 3 | 영문 errMsg 그대로 노출 가능 |
| src/main\services\BlogExecutor.ts:678 | `${(error).message \|\| '알 수 없는 오류가 발생했습니다.'}` | 3 | catch-all 한국어 |
| src/preload.ts (전반) | 7건 모두 `... 중 오류가 발생했습니다: ${msg}` 패턴 | 3 | msg가 영문 케이스 다수 |
| src/ui/utils/domUtils.ts:41 | `Required element #${id} not found` | 1 | 영문 |
| src/ui/services/ApiBridge.ts:33~143 | `runAutomation/generateContent/savePost/... API not available` (6건) | 1 | `자동화/콘텐츠/저장 API를 사용할 수 없습니다. 앱을 재시작해주세요.` |
| src/analytics/postMetricsStore.ts:110~116 | `appendMetric: postId is required` 등 4건 | 1 | 내부 검증 — 영문 전제. throw 대신 silent skip + log |
| src/analytics/featureFlagTracker.ts:118 | `recordPublish: postId is required` | 1 | 동일 |
| src/sourceAssembler.ts:646/2344/3026/3031/3969/3995/4014 | `API 응답 오류: ${s}` / `브랜드스토어 에러 페이지 지속: "${msg}"` / `쿠팡 접근이 차단되었습니다. 잠시 후 다시 시도해주세요.` / `페이지 로드 실패: ${msg}` / `네이버 스마트스토어가 봇 접근을 차단했습니다.` / `HTTP ${s}` (2) | 3-4 | 일부 양호. HTTP 코드는 한국어 사유 추가 |
| src/scheduledPostsManager.ts:65~187 | `예약 포스팅 저장/제거/시간변경 실패: ${msg}` / `예약 목록을 불러올 수 없습니다.` / `해당 예약을 찾을 수 없습니다.` | 4 | (양호) |
| src/thumbnailService.ts:32 | `원본 이미지를 찾을 수 없습니다: ${path}` | 4 | (양호) |
| src/ultimateGenerator.ts:176 | `콘텐츠를 가져올 수 없습니다. URL을 확인해주세요.` | 5 | (우수) |
| src/licenseManager.ts:11 | `알 수 없는 오류가 발생했습니다. 관리자에게 문의해주세요.` | 3 | 사유를 더 좁히는 시도 후 폴백으로만 사용 |
| src/main.ts:192 | `notifyRendererOfError('UncaughtException', error.message \|\| 'Unknown error')` | 1 | "UncaughtException" / "Unknown error" 모두 영문 |
| src/main.ts:4088~4228 | `Leonardo AI/Perplexity/OpenAI/Claude/DeepInfra 연결 실패: ${msg \|\| '알 수 없는 오류'}` (5건) | 4 | (양호) |
| src/main.ts:9232 | `${generatedPosts?.error \|\| '알 수 없는 오류'}` | 3 | 폴백 한국어 |

### F. Renderer (UI)

| 파일:라인 | 현재 메시지 | 점수 | 개선안 |
|---|---|---|---|
| src/renderer/renderer.ts:2254/2302 | `배너 저장 실패 / 장단점 표 생성 실패: ${msg}` | 4 | (양호) |
| src/renderer/renderer.ts:3299 | `❌ 페러프레이징 실패: ${msg}` | 4 | (양호) |
| src/renderer/renderer.ts:3465 | `📝 URL을 먼저 입력해주세요.` | 5 | (우수) |
| src/renderer/renderer.ts:4365/4371/4679 | `발행할 계정/항목을 먼저 선택해주세요.` / `먼저 글을 생성하고 이미지를 세팅해주세요.` | 5 | (우수) |
| src/renderer/renderer.ts:6058/6128 | `⚠️ 예약 시간은 현재 시간 이후로/예약 시간을 선택해주세요.` | 5 | (우수) |
| src/renderer/renderer.ts:7603 | `❌ 통합 자동화 실행에 실패했습니다.` | 3 | 사유 추가 |
| src/renderer/renderer.ts:8076/8082 | `소제목 분석이 먼저 필요합니다.` / `소제목이 없습니다. 먼저 소제목 분석을 해주세요.` | 5 | (우수) |
| src/renderer/utils/apiClient.ts:121 | `🚫 API 일시 중단 중 - 30초 후 자동 복구됩니다` | 5 | (우수) |
| src/renderer/utils/apiClient.ts:326/347 | `⚠️ 연결 재시도 중... (${a}/${r})` / `❌ 연결 실패: ${method} - ${msg}` | 4 | apiMethod 영문 그대로 노출 — 한국어 매핑 |
| src/renderer/modules/aiAssistant.ts:380 | `자동 수정 실패` | 3 | 사유 추가 |
| src/renderer/utils/stabilityUtils.ts:128 | `중복사용은 금합니다` | 3 | 어색함 — `이 글은 이미 사용되었습니다.` |
| src/renderer/modules/videoManager.ts (52건) | `소제목 영상 배치 실패: "${title}" (${msg \|\| 'unknown'})` 외 | 3 | "unknown" 폴백을 한국어로 |
| src/renderer/modules/continuousPublishing.ts (93건 appendLog + 30건 toast) | 90% 한글, 일부 `unknown` 폴백 | 4 | 양호하나 `❌` 이모지 + 사유의 한국어 변환 일관성 |
| src/renderer/modules/headingImageGen.ts (126 appendLog) | 패턴 다수 — 미확인 표본 필요 | — | 추가 점검 |
| src/renderer/modules/postListUI.ts (27 appendLog) | — | — | 추가 점검 |
| src/renderer/modules/imageManagementTab.ts (26 appendLog) | — | — | 추가 점검 |

## 우수 사례 (모범 — 다른 곳에 복제 권장)

- src/contentGenerator.ts:7788 (Perplexity API 키 안내 — 발급 URL까지 포함)
- src/gemini.ts:133 (할당량 초과 — 대안 엔진 안내)
- src/imageGenerator.ts:402-434 (이미지FX/Flow — 💡 가능한 원인 4가지 명시)
- src/contentGenerator.ts:8012 (OpenAI 결제 한도 — 대시보드 안내)
- src/naverBlogAutomation.ts:1414/1435/4465-4479 (입력 검증 — 형식+예시)

## 메타 권장사항

1. **공용 에러 매퍼**: `errors/userMessageMapper.ts` 신설 — 영문/HTTP/내부 코드 → 한국어 변환 단일 지점
2. **DRY**: publishHelpers.ts와 naverBlogAutomation.ts의 발행 관련 60+ 중복 메시지를 하나의 헬퍼로 통합
3. **Prefix 정책**: `[FLOW_*]`, `[NAVER_*]` 같은 디버그 prefix는 로그 파일에만, 사용자 표시 메시지에서는 strip
4. **이모지 표준화**: 오류=❌, 경고=⚠️, 성공=✅, 정보=💡, 진행=⏳ 일관 적용
5. **catch-all 한국어**: `'원인 불명'`, `'unknown'`, `'알 수 없는 오류'` 폴백을 `'잠시 후 다시 시도하거나 다른 옵션을 선택해주세요'`로 대체
6. **민감 정보 비노출**: URL, 함수명(`setupBrowser()`), 변수명(`OPENAI_API_KEY`), JSON 덤프는 사용자 메시지에서 제거
