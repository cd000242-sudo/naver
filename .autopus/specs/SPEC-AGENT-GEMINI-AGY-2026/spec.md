# SPEC-AGENT-GEMINI-AGY-2026: 에이전트·제미나이 경로를 gemini-cli → Antigravity CLI(agy)로 이관

**Status**: draft
**Created**: 2026-07-23
**Domain**: AGENT-CLI
**Target Module**: better-life-naver (root)
**Version Context**: v2.11.144 → v2.11.14x
**Trigger**: 사용자 실사용 중 `agent-gemini` 글 생성 100% 실패 (IneligibleTierError)

---

## 1. 목적

`agent-gemini` 제공자를 **죽은 `gemini`(npm) CLI에서 살아있는 `agy`(Antigravity CLI)로 이관**해,
codex/claude 에이전트와 동일하게 **별도 API 키 없이 구독 할당량으로** 글 생성이 되게 한다.

Non-goal: 일반 `gemini` 엔진(API 키 방식)은 **건드리지 않는다**. 이번 SPEC의 blast radius는 `src/agentCli/` + 렌더러 라벨 4곳으로 한정한다.

### 왜 하는가 (사용자 확인, 2026-07-23)

1. **안티그래비티 구독료를 이미 지불 중** — 되살리지 않으면 지불한 할당량이 놀게 된다.
2. **codex/claude 구독 한도가 부족** — 제미나이로 생성량을 분산해야 한다.

→ 이 SPEC의 성공 기준은 "에러가 안 난다"가 아니라 **"codex/claude 한도가 찼을 때 제미나이로 실제 생성이 이어진다"** 이다. G1 게이트를 이 기준으로 판정한다.

### 성공 기준이 아닌 것 (범위 밖)

- 생성되는 **글의 품질** — 이 SPEC은 배관 복구지 품질 축이 아니다.
- 제공자 자동 전환 / 한도 대시보드 — 요청되지 않았고, 기능 비대화에 해당하므로 추가하지 않는다.

---

## 2. 근본 원인 (확정 사실)

| # | 사실 | 확인 방법 | 확신도 |
|---|---|---|---|
| F1 | 구글이 2026-06-18부로 Gemini Code Assist 개인 티어(무료/AI Pro/Ultra)의 Gemini CLI 요청 처리를 중단 | 구글 공식 deprecation 문서 + gemini-cli Discussion #28017 | 높음 |
| F2 | 그 결과 `oauth-personal` 로그인이 서버에서 거부됨 → `IneligibleTierError` | 사용자 실행 로그 (17:39:11) | 높음 |
| F3 | 사용자 PC의 `~/.gemini/settings.json`은 이미 `selectedType: "oauth-personal"` (앱이 v2.11.140에 기록한 값) — 클라이언트 설정은 정상 | 파일 확인 | 높음 |
| F4 | `~/.gemini/oauth_creds.json` 부재 → OAuth 자격증명이 애초에 발급되지 못함 | 파일 확인 | 높음 |
| F5 | `@google/gemini-cli@0.51.0` 정상 설치됨 → **CLI 버전 문제 아님** | `npm ls -g` | 높음 |
| F6 | 대체 경로는 `agy` (Antigravity CLI). AI Pro/Ultra/무료 티어 계정 로그인 지원, `-p` 비대화형 지원 | 구글 공식 CLI 문서 + Discussion #27274 | 높음 |
| F7 | 사용자 PC에 **`agy` 미설치**. Antigravity IDE만 설치됨 (`AppData\Local\Programs\Antigravity`) | `which agy` + 파일 탐색 | 높음 |
| F8 | `agy`는 npm 패키지가 **아님** (네이티브 단일 바이너리) → 앱의 `npm i -g` 자동설치 경로를 못 탐 | 구글 CLI 설치 문서 | 높음 |
| F9 | 현재 이 에러가 `nonzero_exit`으로 분류되어 원문이 그대로 노출됨. `classifyExit`의 로그인 정규식이 `authentication`만 잡고 `authenticating`은 못 잡음 (`parse.ts:159`) | 코드 확인 + 사용자 로그 | 높음 |

### 미검증 — 실측 전에는 코드로 옮기지 않는다

| # | 미확인 사항 | 왜 중요한가 |
|---|---|---|
| U1 | `agy`의 구조화 출력 플래그 (`--output-format json` 대응물) | `parseGeminiEnvelope` 재작성 여부가 여기서 갈림 |
| U2 | `agy`의 프롬프트 전달 방식 (`-p <문자열>` vs stdin) | **인자 방식이면 자료 많은 글에서 터짐 — 임계값은 §2.5에서 실측 완료** |
| U3 | 로그인 상태 확인 명령 (`codex login` / `claude auth login` 대응물) | `probeGeminiLogin`의 `oauth_creds.json` 검사가 완전히 무효 |
| U4 | Windows 헤드리스에서 stdin 미종료 시 hang / stdout 무출력 이슈 실재 여부 | 이 프로젝트는 Windows 주력. 재현되면 `spawnHelper` 손봐야 함 |
| U5 | 사용자 계정이 실제로 agy 자격 통과하는지 | "AI Pro 구독인데 not eligible" 버그 리포트 존재 |
| U6 | 모델 지정 플래그 (`-m` 대응물) | `runGemini(prompt, { model })` 시그니처 유지 가능 여부 |
| U7 | `agy` 설치 경로 / PATH 등록 방식 / 사일런트 설치 가능 여부 | P2 자동설치 설계 전제 |

---

## 2.5 사전 대조 실측 (2026-07-23, agy 설치 **전**에 앱 코드만으로 확인)

agy 없이도 확인 가능한 항목을 먼저 실측해 §5의 지뢰 3개를 검증했다. 아래는 전부 실행 결과이며 추정이 아니다.

### M1 — 테스트 baseline 및 결합도 (지뢰 1: 확인됨, 범위 축소)

`npx vitest run` 에이전트 관련 7개 파일 → **7 files / 80 tests 전부 GREEN** (3.26s). 이관 시작 전 기준선.

| 테스트 파일 | gemini 결합 행 | 테스트 수 | P1~P2에서 |
|---|---|---|---|
| `agentInstaller.test.ts` | 25 | 31 | **교체 필요** (패키지명·버전 단언) |
| `geminiAgentLoginDetection.test.ts` | 20 | 3 | **전면 재작성** (`oauth_creds.json` 전제 무효) |
| `agentSubscriptionEnv.test.ts` | 7 | 5 | 부분 교체 |
| `agentProviderRouting.test.ts` | 4 | 4 | 부분 교체 |
| `agentNpmInvocation.test.ts` | 3 | 8 | 부분 교체 (agy는 npm 아님) |
| `agentCli.test.ts` | **0** | 29 | 무영향 — 회귀 감시용으로 사용 |
| `agentFailureMessage.test.ts` | **0** | 2 | 무영향 |

→ 당초 "6개 파일이 깨진다"보다 실제 범위는 좁다. **29+2개 테스트는 gemini와 무관하므로 이관 중 회귀 탐지기로 쓴다.** 이관 중 이 31개가 빨개지면 codex/claude를 망가뜨린 것이므로 즉시 롤백 신호다.

### M2 — `classifyExit` 오분류 (지뢰 2: 확인됨)

컴파일된 `dist/agentCli/parse.js`에 실제 사용자 에러 문자열을 그대로 넣어 실행:

| 입력 | 분류 결과 | 판정 |
|---|---|---|
| `Error authenticating: IneligibleTierError: This client is no longer supported...` (실제 로그) | `nonzero_exit` | **오분류 확인** |
| `Your current account is not eligible for Antigravity` | `nonzero_exit` | **오분류 확인** |
| `You are not logged in` (대조군) | `not_logged_in` | 정상 |
| `HTTP 429 too many requests` (대조군) | `rate_limited` | 정상 |

→ 함수 자체는 정상이고 **패턴 커버리지만 부족**하다. `parse.ts:159`의 정규식이 `authentication`은 잡지만 `authenticating`·`ineligible`은 못 잡는다. 대조군이 통과하므로 P3 수정은 저위험(패턴 추가)이다.

### M3 — 프롬프트 길이 (지뢰 3: **하향 조정**, 단 임계값 확보)

`buildModeBasedPrompt()` + `wrapAsAgenticTask()` 실측. 에이전틱 봉투 오버헤드는 973자.

| 참고자료(rawText) | 최종 프롬프트 | Windows 한계 대비 |
|---|---|---|
| 0자 | 13,193자 | 40% |
| 2,000자 | 13,918자 | 42% |
| 8,000자 | 19,918자 | 61% |
| **20,000자** | **31,918자** | **97% — 임계** |

모드별 차이는 미미 (seo 13,193 / homefeed 13,111 / affiliate 13,251).

추가 확인: `spawnHelper.ts:113,294`가 **`shell: false`** 로 spawn한다 → cmd.exe의 8,191자 제한은 **적용되지 않고** CreateProcess의 32,767자만 적용된다. 만약 `shell: true` 였다면 자료 없는 기본 글(13,193자)조차 전부 실패했을 것이다.

**[정정] 2만 자는 도달하지 않는 수치다.** 위 20,000자는 파괴점을 찾으려고 넣은 스트레스 입력이지 관측값이 아니다. 실제 `rawText`의 출처와 상한:

| 출처 | 실제 상한 | 근거 |
|---|---|---|
| `sourceType: naver_news` / `daum_news` | 뉴스 기사 1편 (통상 1,000~3,000자) | `ContentSource` 정의 (`contentGenerator.ts:1645`) |
| 붙여넣기 분류 경로 | **8,000자 하드캡** | `pasteClassifyHandlers.ts:52` |
| 상품 스펙 크롤 | **2,000~3,000자 캡** | `productSpecCrawler.ts:2373,2450,2776` |

현실 최대치인 **8,000자에서도 프롬프트는 19,918자 = 한계의 61%**. 네이버 블로그 자동화 워크로드에서 32,767자에 닿는 경로는 확인되지 않았다.

**결론**: M3는 **실질 위험 아님**으로 강등한다. "긴 글 전부 실패"도 "2만 자에서 터짐"도 둘 다 과장이었다. 단, agy가 stdin을 받으면 이 항목은 논의 자체가 불필요해진다 (codex·claude 러너는 이미 셋 다 stdin 방식 — `codexRunner.ts:59`, `claudeRunner.ts:54`).

→ **U2는 P0에서 "stdin 지원 여부"만 확인. 미지원이어도 실사용 범위에서는 통과할 가능성이 높다.**

---

## 2.6 P0 실측 결과 (2026-07-23, agy 1.1.5 설치 후) — **게이트 G0 통과**

설치: `irm https://antigravity.google/cli/install.ps1 | iex` → 성공. 소스 수정 0줄.

| ID | 실측 결과 | 판정 |
|---|---|---|
| **U5** | `agy -p` exit 0, 실제 글 생성 성공 | ✅ **통과 — 최대 관문 해소** |
| **U1** | JSON 봉투 플래그 **없음**. 모델 응답 본문이 stdout에 그대로 출력 | `parseGeminiEnvelope` **불필요** |
| **U2** | **stdin 지원 확인** (`-p` 없이 파이프만으로 동작) | 길이 지뢰 완전 소멸 |
| **U3** | `login`/`auth` 서브커맨드 **없음**. 자격증명은 시스템 키링 | `oauth_creds.json` 판정 **완전 무효** |
| **U4** | hang **없음**. stdin 종료 시 정상 (13,193자 통과) | 리스크 해소 |
| **U6** | `--model` (앱은 현재 `-m`). 모델 11종 노출 | 플래그명 변경 필요 |
| **U7** | `%LOCALAPPDATA%\agy\bin\agy.exe` + User PATH 레지스트리 자동 등록 | 3rd-party 블로그의 `%LOCALAPPDATA%\Antigravity\agy.exe`는 **오정보** |

### 앱 동등 조건 재현 (spawn shell:false + stdin UTF-8 + API 키 제거)

실제 `buildModeBasedPrompt` + `wrapAsAgenticTask` 프롬프트 13,193자 투입:

| 지표 | 값 |
|---|---|
| exit code | **0** |
| 소요 시간 | **52,397 ms** |
| stdout | **4,291자 — 순수 JSON** (프리앰블·봉투 없음) |
| stderr | **0자** |
| 한글 | 정상 |

생성물은 `selectedTitle` / `titleCandidates` / `headings` / `conclusion` / `hashtags` / `category` 구조의 유효 JSON.

> **주의**: 현행 `parseGeminiEnvelope`는 이 출력에 대해 *우연히* 동작한다 (`response` 필드가 없어 raw로 폴백). 우연에 의존하지 말고 P1에서 명시적으로 제거한다.

### P0에서 새로 발견된 항목 (사전 계획에 없던 것)

| ID | 발견 | 영향 |
|---|---|---|
| **N1** | agy는 대화 이력을 디스크에 **영구 저장** (`~/.gemini/antigravity-cli/conversations/`). 3회 실행 → 3.6MB, **글 1건당 약 1.2MB** | 글 1,000건 = 약 1.2GB 누적. codex/claude에는 `--no-session-persistence` 등 격리 플래그가 있으나 **agy help에는 없음** → P2에서 정리 정책 필요 |
| **N2** | Antigravity 구독으로 **`claude-sonnet-4-6` / `claude-opus-4-6-thinking` / `gpt-oss-120b`도 호출 가능** (`agy models`) | 한도 분산 목적에 추가 레버. 단 기능 추가는 별건이며 이번 SPEC 범위 밖 |
| **N3** | 브라우저 로그인 없이 즉시 인증 통과 — **Antigravity IDE의 키링 세션 재사용** | **IDE 미설치 사용자는 별도 로그인 필요.** 배포본 온보딩에 영향 → P2 필수 검토 |

---

## 3. 영향 파일 (현재 배선)

| 파일 | 줄 | 현재 | 이관 후 |
|---|---|---|---|
| `agentCli/geminiRunner.ts` | 41–55 | `gemini --output-format json` + stdin | `agy` + U1/U2 실측값 |
| `agentCli/geminiRunner.ts` | 37 | `ensureGeminiOAuthPersonalConfig()` | **삭제** (agy는 자체 인증) |
| `agentCli/geminiAuthConfig.ts` | 전체 63줄 | `~/.gemini/settings.json` 기록 | **파일 삭제** |
| `agentCli/detect.ts` | 276–284 | `oauth_creds.json` 존재 검사 | U3 실측값 기반 재작성 |
| `agentCli/detect.ts` | 87~ | `gemini --version` | `agy --version` |
| `agentCli/version.ts` | 17–19 | `GEMINI_VERSION_PATTERNS` | agy 출력 형식 |
| `agentCli/installer.ts` | 33 | `@google/gemini-cli` | npm 경로 제거 (F8) |
| `agentCli/installer.ts` | 46 | `gemini: '0.51.0'` | 제거 또는 agy 버전 하한 |
| `agentCli/subscriptionEnv.ts` | 66–71 | 공유 키만 허용 | agy 홈/토큰 키 허용 여부 결정 |
| `agentCli/parse.ts` | 90–111 | `parseGeminiEnvelope` | U1 실측값 |
| `agentCli/parse.ts` | 158–164 | 로그인 정규식 | `authenticating` / `ineligible` 추가 (F9) |
| `renderer/modules/priceInfoModal.ts` | 226, 1040, 1588 | UI 라벨/버튼 | 문구는 이미 "Antigravity"라 대체로 유효, 설치 버튼 동작만 변경 |

### 락이 걸린 테스트 (깨질 것으로 예상 — 사전 식별)

- `__tests__/agentInstaller.test.ts:92,150,212,218` — `@google/gemini-cli` 패키지명/버전 단언
- `__tests__/geminiAgentLoginDetection.test.ts` — `oauth_creds.json` 기반 판정 단언
- `__tests__/agentSubscriptionEnv.test.ts` — GEMINI 허용키 단언
- `__tests__/agentProviderRouting.test.ts`, `agentCli.test.ts`, `agentNpmInvocation.test.ts`

> **주의(과거 교훈)**: 이 테스트들은 *현재 동작을 박제*한 것이다. "테스트가 빨개졌으니 소스를 되돌린다"는 판단 금지. 이관 대상 단언은 **명시적으로 교체**하고, 교체 사유를 커밋 메시지에 남긴다.

---

## 4. 요구사항 (EARS)

- **R1** WHEN `agent-gemini` 생성이 요청되면 THE SYSTEM SHALL `agy`를 호출하고, `gemini` 실행 파일은 어떤 경로에서도 호출하지 않는다.
- **R2** THE SYSTEM SHALL 에이전트 경로에서 `GEMINI_API_KEY`/`GOOGLE_API_KEY` 등 API 키 변수를 계속 차단한다. 구독 실패가 조용한 API 과금으로 폴백되어서는 안 된다. (기존 원칙 유지)
- **R3** WHEN `agy` 미설치 또는 미로그인 상태에서 생성이 요청되면 THE SYSTEM SHALL 원문 CLI 에러가 아니라 다음 행동을 지시하는 한국어 메시지를 노출한다.
- **R4** THE SYSTEM SHALL 일반 `gemini` 엔진(API 키 방식)의 동작을 1바이트도 바꾸지 않는다.
- **R5** WHERE 실측되지 않은 플래그/출력 형식이 있으면 THE SYSTEM SHALL 해당 코드를 작성하지 않는다. 추정 기반 구현 금지.
- **R6** THE SYSTEM SHALL 각 Phase를 개별 커밋으로 분리해 단일 `git revert`로 되돌릴 수 있게 한다.
- **R7** WHEN Phase가 끝나면 THE SYSTEM SHALL §7 실측 기록표에 증거를 기입한 뒤에만 다음 Phase로 넘어간다.

---

## 5. Phase 계획

### P0 — 실측 (코드 수정 0줄)

목표: U1~U7을 사실로 전환. **이 Phase에서 소스 파일을 단 하나도 수정하지 않는다.**

1. `agy` 설치 (윈도우 공식 설치 경로) — 설치 경로/PATH 등록 방식 기록 → U7
2. `agy --version`, `agy --help` 전문 캡처 → U1, U2, U6
3. 로그인 수행 → 자격증명 저장 위치 파악 → U3, U5
4. 앱과 동일한 조건 재현: 임시 cwd + API 키 제거 env + 실제 프롬프트 길이(2000자급)로 `-p` 1회 → U2, U4
5. 실패 시 stderr/stdout 원문 캡처 → `classifyExit` 패턴 설계 근거

**게이트 G0**: U1~U7 전부 표에 값이 채워짐. 하나라도 비면 P1 진입 금지.

### P1 — 러너 배선 (핵심, 최소 diff)

- `geminiRunner.ts` → `agy` 호출로 교체, `ensureGeminiOAuthPersonalConfig()` 호출 제거
- `parse.ts` `parseGeminiEnvelope` → 실측 출력 형식에 맞춤
- `geminiAuthConfig.ts` 삭제

**게이트 G1**: 앱 빌드 후 **실제로 글 1편이 생성됨**(스크린샷 또는 출력 파일). vitest 전체 GREEN. 이 게이트는 단위 테스트로 대체 불가 — 라이브 생성 증거 필수.

### P2 — 탐지 / 설치 경로

- `detect.ts` `probeGeminiLogin` 재작성 (U3 기반)
- `detect.ts` 버전 프로브 + `version.ts` 패턴
- `installer.ts` gemini의 npm 경로 제거, 설치 방식 결정 (자동 vs 안내)

**게이트 G2**: agy 미설치 PC를 가정한 상태(PATH에서 제거)에서 UI가 올바른 상태를 표시. 설치 버튼이 실제로 동작하거나, 동작하지 않으면 명확히 안내.

### P3 — 오류 분류 / UI 문구

- `classifyExit`에 `authenticating`, `ineligible`, agy 고유 문구 추가 (F9)
- `failureMessage.ts` 안내 문구
- `priceInfoModal.ts` 라벨/버튼 정합성

**게이트 G3**: 미로그인·미설치·한도소진 3가지 상황을 강제 재현해 각각 다른 한국어 안내가 나오는 것 확인.

### P4 — 릴리즈

- 버전업 + 릴리즈 노트 (추정 효과 문구 금지, 변경 사실만)
- 패키징본 더블클릭 실행으로 최종 확인

**게이트 G4**: 패키징된 exe에서 `agent-gemini` 글 생성 성공.

---

## 6. 리스크와 대응

| 리스크 | 확률 | 영향 | 대응 |
|---|---|---|---|
| Windows 헤드리스 hang (U4) | 중 | 생성이 타임아웃까지 멈춤 | P0에서 재현 시도. 재현되면 stdin 즉시 종료 + 타임아웃 하한 조정 |
| 프롬프트가 CLI 인자 길이 초과 (U2) | **낮** (M3로 2단계 하향) | 실사용 상한 8,000자에서 61% — 도달 경로 미확인 | 감시만. 실제 초과 시에만 임시 파일 경유 |
| 사용자 계정 자격 미달 (U5) | 낮~중 | SPEC 전체가 무의미해짐 | **P0에서 가장 먼저 확인.** 실패 시 SPEC 중단하고 UI에서 옵션 비활성화로 선회 |
| agy 자동설치 불가 (F8/U7) | 중 | 배포본 원클릭 경험 상실 | P2에서 "안내 후 수동 설치"로 축소 허용. 기능 자체는 살아있음 |
| agy가 폐쇄소스라 향후 또 끊길 수 있음 | 낮 | 재발 | P3에서 실패 시 안내가 명확하면 피해 한정 |

---

## 7. 실측 기록표 (진행하며 채운다 — 사후 추적용)

| ID | 항목 | 측정값 | 측정일 | 결과 |
|---|---|---|---|---|
| U1 | agy 구조화 출력 플래그 | **없음 — 본문 그대로 stdout** | 2026-07-23 | 파서 제거 |
| U2 | 프롬프트 전달 방식 | **stdin 지원 확인** | 2026-07-23 | 지뢰 소멸 |
| U3 | 로그인 상태 확인 방법 | **전용 명령 없음 (키링)** | 2026-07-23 | P2에서 판정법 설계 |
| U4 | Windows 헤드리스 hang | **재현 안 됨** (13,193자 정상) | 2026-07-23 | 해소 |
| U5 | 계정 자격 통과 | **통과 (exit 0, 글 생성됨)** | 2026-07-23 | ✅ 관문 통과 |
| U6 | 모델 지정 플래그 | **`--model`** (앱은 `-m`) | 2026-07-23 | 변경 필요 |
| U7 | 설치 경로 / PATH | **`%LOCALAPPDATA%\agy\bin\agy.exe`** | 2026-07-23 | User PATH 자동 등록 |
| G0 | **P0 게이트** | **통과 — U1~U7 전부 확보** | 2026-07-23 | P1 진입 가능 |
| M1 | 테스트 baseline | **7 files / 80 tests GREEN** | 2026-07-23 | 기준선 확보 |
| M1b | gemini 무관 회귀 감시 테스트 | **31개** (agentCli 29 + failureMessage 2) | 2026-07-23 | 롤백 신호로 사용 |
| M2 | classifyExit 오분류 | **`nonzero_exit`** (대조군 2종은 정상) | 2026-07-23 | 지뢰2 확인 |
| M3 | 프롬프트 길이 (자료 0자) | **13,193자** | 2026-07-23 | 한계의 40% |
| M3b | 프롬프트 길이 (자료 2만 자) | **31,918자** | 2026-07-23 | 한계의 97% — 임계 |
| M3c | spawn 모드 | **`shell: false`** → 한계 32,767 | 2026-07-23 | 8,191 제한 회피됨 |
| U3 | 로그인 상태 확인 방법 | *(미측정)* | | |
| U4 | Windows 헤드리스 hang 재현 | *(미측정)* | | |
| U5 | 계정 자격 통과 | *(미측정)* | | |
| U6 | 모델 지정 플래그 | *(미측정)* | | |
| U7 | 설치 경로 / PATH 등록 | *(미측정)* | | |
| G1 | 라이브 글 1편 생성 (앱 경유) | *(미도달 — CLI 단독으로는 성공)* | | |
| G2 | 탐지/설치 UI | *(미도달)* | | |
| G3 | 오류 안내 3종 | *(미도달)* | | |
| G4 | 패키징본 검증 | *(미도달)* | | |

---

## 8. 중단 조건 (SPEC을 접어야 하는 경우)

다음 중 하나라도 성립하면 **구현을 중단하고 `agent-gemini` 옵션 비활성화 + 안내**로 선회한다.

1. U5 실패 — 사용자 계정이 agy 자격을 통과하지 못함
2. ~~U2 프롬프트 길이~~ → M3 실측으로 기각. 중단 조건에서 제외.
3. U4가 재현되고 우회책이 `spawnHelper`(507줄, 3개 제공자 공유)를 구조 변경해야만 하는 경우 → 별도 SPEC으로 분리

---

## 9. 임시 대응 (SPEC 완료 전까지)

사용자는 일반 **"제미나이(Gemini)"** 엔진 사용. 저장된 Gemini API 키로 정상 동작한다.
에이전트(구독) 방식이 필요하면 **Codex / Claude 에이전트**는 영향 없음.

---

## 10. 참고

- Gemini Code Assist 개인 계정 지원 중단: https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals
- Gemini CLI → Antigravity CLI 전환 공지: https://github.com/google-gemini/gemini-cli/discussions/27274
- 개인 계정 요청 중단 공지: https://github.com/google-gemini/gemini-cli/discussions/28017
- Antigravity CLI 저장소: https://github.com/google-antigravity/antigravity-cli
- Antigravity CLI 설치/인증 문서: https://antigravity.google/docs/cli/install
- Windows 비대화형 hang/무출력 우회 사례: https://gist.github.com/allahsan/a9a9e9c8a49aecede67ce974e64ef3cf
