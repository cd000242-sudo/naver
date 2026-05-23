# SPEC-NAVER-PROTECTION-2026 — Research

> 30팀 병렬 agent 보고서(A1~A8 외부 조사 / B1~B8 코드 매핑 / C1~C6 보안 약점) 종합.
> 작성일: 2026-05-24. 모든 주장은 라인 번호 또는 외부 URL로 1차 근거 확보.

---

## 1. 네이버 2026 Q2 보호조치 7카테고리

### 1.1 로그인 챌린지 (A1, A2)

| 트리거 | 조건 | 근거 |
|--------|------|------|
| NID 영수증/이미지 캡차 | 5회 이상 로그인 시도 (동일 ID) | [나무위키 CAPTCHA](https://namu.wiki/w/CAPTCHA), [아이보스](https://www.i-boss.co.kr/ab-6141-69919) |
| SMS OTP | 신규 디바이스/IP/위치 — 캡차 격상 | [Inquivix Naver](https://inquivix.com/naver-account/), [Fingerprint 2026](https://fingerprint.com/blog/bot-detection/) |
| 2단계 강제 | 비밀번호 변경 직후, IP 평판 저점 | A2 보고서 종합 |
| Selenium/Puppeteer 입력 자체 탐지 | JS `input` 주입 패턴 → 봇 분류 | [pythondocs](https://pythondocs.net/selenium/) |
| reCAPTCHA v3 (블로그 외 페이지) | 점수 누적 하락 (잦은 발행 패턴) | [Capsolver v3](https://www.capsolver.com/blog/reCAPTCHA/how-to-solve-reCAPTCHA-v3) |
| reCAPTCHA 2026-04-02 정책 변경 | 기능 변화 미공식, 노출 빈도 모니터 필요 | [friendlycaptcha](https://friendlycaptcha.com/insights/recaptcha-news/) |

### 1.2 발행 빈도 제한 (A8)

| 항목 | 값 | 근거 |
|------|-----|------|
| 일일 하드캡 | 100건 (공유글 포함, 삭제 무효, 자정 리셋) | [나무위키 네이버블로그](https://namu.wiki/w/%EB%84%A4%EC%9D%B4%EB%B2%84%20%EB%B8%94%EB%A1%9C%EA%B7%B8) |
| 안전 인터벌 | **1시간 텀 권장** (실무 합의선) | [Threads @pocke_tpotatoes](https://www.threads.com/@pocke_tpotatoes/post/C_mSWNVzJq1) |
| 일일 실무 상한 | 24건 (인플루언서 권장) | 동상 |
| 신생 계정 (≤30일) | 일 1~3건 보수 운영 | [다츠애드](https://dentdots.co.kr/) |
| 외부 링크 | 글당 1~2개, 3개+ 광고성 판정 | [Threads @blogdexreview](https://www.threads.com/@blogdexreview/post/DHvjkhxvSz7/) |
| 키워드 밀도 | 글당 4~5회 한도 | [노랗IT월드](https://yellowit.co.kr/) |
| 새벽 자동발행 | 3페이지 분류 트리거 (자동화 시그널) | [나무위키 문제점](https://namu.wiki/w/%EB%84%A4%EC%9D%B4%EB%B2%84%20%EB%B8%94%EB%A1%9C%EA%B7%B8/%EB%AC%B8%EC%A0%9C%EC%A0%90%20%EB%B0%8F%20%EB%B9%84%ED%8C%90) |

### 1.3 IP 기반 차단 (A4)

| 위협 | 영향 | 근거 |
|------|-----|------|
| IP reputation 1차 게이트 | ASN 단위 DC IP 즉시 차단/CAPTCHA | [browserless](https://www.browserless.io/blog/bot-detection) |
| WebRTC leak | proxy 무력화 (STUN으로 실 IP 노출, ICE timing fingerprint) | [TrustMyIP 2026](https://trustmyip.com/blog/webrtc-ip-leak-test-fix), [BrowserLeaks](https://browserleaks.com/webrtc) |
| KR mobile carrier trust | AS4766(KT)/SKT/LGU+ ↑ vs DC ↓ | [IPinfo AS4766](https://ipinfo.io/AS4766) |
| residential proxy 단가 | $1.75~$8/GB, 계정당 월 1~3GB → 회선당 $5~$15 | [proxy-pricing.io](https://proxy-pricing.io/brightdata-pricing) |
| IPQS fraud_score | ≥75 의심 / ≥90 위험 — 발행 전 차단 가능 | [IPQS docs](https://www.ipqualityscore.com/documentation/proxy-detection-api/overview) |
| TCP/TLS JA4T | MTU/Hops 동시 평가 — JA3 randomization 무력 | A4·A7 종합 |

### 1.4 디바이스 fingerprint (A3, A7)

| 위협 | 우선 | 근거 |
|------|------|------|
| stealth plugin 역탐지 시그널 (CreepJS 80% 적중) | **P0** | [Databay 2026](https://databay.com/blog/how-sites-detect-headless-browsers) |
| fingerprint 정합성(consistency) 검사 — 모순 탐지 | **P0** | [Proxies.sx 2026](https://www.proxies.sx/use-cases/privacy/fingerprinting) |
| WebGL renderer 노출 (NVIDIA/SwiftShader/Mesa) | P1 | [Octo Browser](https://blog.octobrowser.net/canvas-audio-and-webgl-an-in-depth-analysis-of-fingerprinting-technologies) |
| Audio context (OfflineAudioContext+Compressor) — stealth 미패치 | P1 | [Scrapfly Audio](https://scrapfly.io/web-scraping-tools/audio-fingerprint) |
| Electron 특유 누설 (chrome.runtime, navigator.userAgentData) | P1 | [naver/egjs-agent](https://github.com/naver/egjs-agent) |
| Font enumeration/Battery/hardwareConcurrency 정적값 | P2 | [SpyderProxy](https://spyderproxy.com/blog/browser-fingerprinting-detection-guide) |
| BotD/FingerprintJS Pro 99.5% (서버사이드 행동 결합) | P3 | [BotD](https://github.com/fingerprintjs/BotD) |
| **JA4+ TLS fingerprint** (Cloudflare/Akamai/DataDome 채택, JA3 randomization 무력화) | **P0** | [FoxIO JA4](https://github.com/FoxIO-LLC/ja4/blob/main/technical_details/JA4.md) |
| HTTP/2 SETTINGS+WINDOW_UPDATE+PRIORITY frame | **P0** | [Scrapfly H2](https://scrapfly.io/blog/posts/http2-http3-fingerprinting-guide), [Akamai BlackHat](https://blackhat.com/docs/eu-17/materials/eu-17-Shuster-Passive-Fingerprinting-Of-HTTP2-Clients-wp.pdf) |
| undici/Node fetch header 순서가 Chrome과 상이 | P1 | [dev.to datakaz](https://dev.to/datakaz/how-to-bypass-cloudflare-with-tls-fingerprinting-in-nodejs-2pb2) |

### 1.5 이미지 패턴 — AuthGR (A1, A6)

| 위협 | 우선 | 근거 |
|------|------|------|
| AuthGR LLM-driven 신뢰도 평가 (출처/작성자 공신력) | **P0** | [뉴스1](https://www.news1.kr/it-science/general-it/6164096), [네이트뉴스](https://news.nate.com/view/20251217n25536) |
| 장기간 토픽 권위 + 전문성 누적 평가 (isolated post 패널티) | P1 | [1089media 2026](https://1089media.com/entry/naver-search-transformation-survival-strategies-for-digital-marketers-in-2026), [GEO 리드젠랩](https://blog.lead-gen.team/naver-ai-briefing-seo-optimal-strategy) |
| Image provenance (C2PA 계열) + VLM image-text consistency | P2 | [arxiv 2503.11195](https://arxiv.org/pdf/2503.11195) |

### 1.6 콘텐츠 패턴 — QUMA-VL + LLM 탐지 (A6)

| 위협 | 우선 | 근거 |
|------|------|------|
| KatFishNet (한국어 SOTA, POS n-gram + 공백/쉼표 분포) | **P0** | [ACL 2025](https://arxiv.org/abs/2503.00032), [github](https://github.com/Shinwoo-Park/katfishnet) |
| Burstiness 목표 ≥0.60 (GPT-4 raw 0.15~0.20 → 즉시 탐지) | **P0** | [GPTZero](https://gptzero.me/news/perplexity-and-burstiness-what-is-it/), [Pangram](https://www.pangram.com/blog/why-perplexity-and-burstiness-fail-to-detect-ai) |
| HHEM 82.2% TPR (사실 무근 문장 분류기) | P2 | [arxiv 2512.22416](https://arxiv.org/abs/2512.22416) |
| Humanizer: 16~24단어 평균 → 3~5+25+ 의도적 혼합 | P1 | [HumanizerAI 2026](https://humanizerai.com/blog/best-ai-humanizer-2026) |
| QUMA-VL 공식 출처 미확인 (내부 별칭 추정), VLM consistency는 확실 | 메모 | A6 종합 |

### 1.7 행동 패턴 (A5)

| 위협 | 우선 | 근거 |
|------|------|------|
| 마우스 궤적: 휴먼 Gaussian + tremor vs 봇 bimodal | **P0** | [DMTG arxiv](https://arxiv.org/html/2410.18233v1), [Bureau](https://bureau.id/resources/blog/mouse-movement-behavioral-patterns-can-reliably-tell-bots-from-humans) |
| 스크롤 inertia: 휴먼 delta 분산 ~100px vs 봇 <5px | **P0** | [GeeTest](https://www.geetest.com/en/article/behavioral-biometrics-bot-detection) |
| 타이핑 dwell/flight 분포: 휴먼 50~250ms normal vs 봇 ~50ms 일정 | **P0** | [IsHumanCadence HN](https://news.ycombinator.com/item?id=46940197), [Multilogin](https://multilogin.com/glossary/keystroke-dynamics/) |
| ghost-cursor 시그니처화 (weekly 62K dl) | P1 | [Xetera/ghost-cursor](https://github.com/Xetera/ghost-cursor) |
| 클릭 간격 포아송(휴먼) vs fixed(봇) | P1 | [ZenRows](https://www.zenrows.com/blog/datadome-bypass) |
| 멀티시그널 결합 필수 (단일 패치 무력) | P2 | [Playwright Stealth 2026](https://dicloak.com/blog-detail/playwright-stealth-what-works-in-2026-and-where-it-falls-short) |

---

## 2. 현재 앱 대응 매핑 (코드 인용, 라인 번호 근거)

### 2.1 셀렉터 (B1 — 117개, 9 카테고리)

| 카테고리 | 엔트리 | 비고 |
|----------|--------|------|
| login | 7 | remoteUpdate 지원 ✓ |
| editor | 23 | `.se-*` 클래스 의존 (P3 cascade risk) |
| publish | 26 | remoteUpdate 지원 ✓ |
| image | 14 | remoteUpdate 지원 ✓ |
| cta | 7 | `:has-text` 비표준 CSS 일부 |
| place | 15 | **remoteUpdate 미지원** |
| flow | 6 | **remoteUpdate 미지원** |
| shopping | 10 | **remoteUpdate 미지원** |
| topblogger | 9 | **remoteUpdate 미지원** |

- `src/automation/selectors/remoteUpdate.ts:28` — category union이 5개로 제한 (place/flow/shopping/topblogger 누락)
- `remoteUpdate.ts:238, 263` — `schedulePeriodicCheck` / `reportFailureTelemetry` **호출 사이트 0건** (구현만, 미활성)
- 9개 셀렉터 entry는 fallback `[]` (무chain) — placeSelectors, ctaConfirmButton 등

### 2.2 발행 빈도 (B2)

- `postLimitManager.ts:26` — `MAX_HOURLY_COUNT=2`, `MAX_DAILY_COUNT=3` (기본)
- `publishingStrategy.ts:107-111` — maturity별 1~5건/일, 1.5~4시간 인터벌
- `publishingStrategy.ts:298-340` — `checkGoldenZone` 함수 정의됨, **main.ts 호출 사이트 없음** (경고만 가능)
- **`postLimitManager`가 `accountId` 인자를 받지 않음** — 다계정 시 전역 카운터로 무력
- `intervalJitter.ts:23-31` — Math.random ±40% 균등분포
- `intervalJitter.ts:116-120` — hourly window 리셋 경계 버그 (정확히 1h-1초 시점 충돌)

### 2.3 세션/쿠키/워밍업 (B3)

- `sessionPersistence.ts:31-39` — userData 미준비 시 `~/.naver-blog-automation/sessions/` 폴백 (다중 OS 사용자 risk)
- `sessionPersistence.ts:45-53` — 계정별 디렉터리 격리 ✓
- `sessionPersistence.ts:62-71` — 쿠키 신선도 = `expires` 시간만 (서버 세션 미검증)
- **localStorage / IndexedDB 명시 저장 없음** — userDataDir 의존만
- `naverBlogAutomation.ts:3730-3736` — `warmupSession` 예외 무시 (즉시 발행으로 fall-through)

### 2.4 AuthGR 방어 (B4)

- `authgrDefense.ts:109-188` — **한국어 perplexity 모델 부재**, TTR 근사만 사용 (P0)
- `authgrDefense.ts:205-265` — `injectExpertiseSignals` 정적 패턴 사전 + 무작위 선택 (P0, 패턴 반복성)
- `authgrDefense.ts:650-720` — 품질 임계 60/40 하드코딩, 근거 불명 (P1)
- `authgrDefense.ts:414-420` — console.log 기반 모니터링, 구조화 메트릭 부재
- `contentOptimizer.ts:352` — require 동적 로딩으로 `applyAuthGRDefense` 호출
- `contentPlatitudeDetector.ts` — PlatitudeDetector v2 (v2.10.226~237) 통합 ✓

### 2.5 이미지 (B5)

- `imageFormatPipeline.ts:196-210` — `withMetadata({ icc: 'srgb' })` — sharp 0.33+에서 **PNG ancillary chunks (tEXt, zTXt, iTXt) 제거 안 됨** (P0)
- `imageTextConsistencyChecker.ts` 전체 — **AI 생성 감지 로직 부재**, consistency score만 (P1)
- `imageUtils.ts:369-490` + `blobStore/index.ts:88-134` — SHA-256 dedup, perceptual hash는 수집 단계만 (P1)
- `processImageForUpload` (imageFormatPipeline.ts:291-377) — **호출 사이트 0건** (dead code, P2)
- `materializePublishingImages.ts:25-26` — temp 파일 정리 부재 (1000큐 시 ~4GB 누적)
- `imageTextConsistencyChecker.ts:334-343` — ALT 공백 패딩 (인공 ALT 판정 risk, P3)
- **ALT 자동 생성기 부재** — `flowGenerator.ts:1276-1375`는 alt 읽기만, 발행 alt 빈값/원본 그대로 (P0, C5 발견)

### 2.6 다중계정 격리 (B6, C6)

- `browserSessionManager.ts:74,182-184` — 계정별 chrome profile 디렉터리 격리 ✓
- `browserSessionManager.ts:169-176` — `hashAccountId` 32-bit DJB2 변형 (P1, 충돌 시 userDataDir 공유)
- `browserSessionManager.ts:208,216` — screen/webGL `seed % 4` (P1, 4계정+ 동일 클러스터)
- `browserSessionManager.ts:459-462` — `hardwareConcurrency=8`, `deviceMemory=8`, `languages=ko-KR,...`, `platform=Win32` 모두 **전 계정 상수** (P0)
- `browserSessionManager.ts:442-444` — Accept-Language 동일 + viewport 그룹화 (P2)
- `crawler/utils/proxyManager.ts:140-158` — `getProxyUrl()` 미설정 시 `null` → `browserSessionManager.ts:246`에서 **동일 공인 IP fall-through** (P0)
- `account/blogAccountManager.ts:484-497` — 계정별 proxy 선택적 필드 (`proxyHost?`)

### 2.7 Jitter (B7)

- `intervalJitter.ts:9` — `JITTER_RATIO=0.4` (factor 0.6~1.4)
- `intervalJitter.ts:28` — `Math.random` (비암호화, 시드 추측 가능)
- `botBackoff.ts:87-92` — `computeLoginStaggerDelayMs` 누적 시차 (accountIndex × 3분 + 0~7분 jitter)
- `naverBlogAutomation.ts:205` — v2.10.285 로그인 시차 호출 사이트
- **시간대별 동적 분산 부재** — `publishingStrategy.ts:279-288`의 `±15~45분` jitter와 미통합

### 2.8 Puppeteer/Stealth (B8)

- `package.json` — puppeteer-extra-plugin-stealth v2.11.2
- `browserSessionManager.ts:10-39` — 12개 evasion 모듈 활성 (모듈 진입 시 1회 로드 ✓)
- **`headless: true` 4곳** — `smartCrawler.ts:746`, `productSpecCrawler.ts:364/477/535`, `imageLibrary.ts:274`, `editorHelpers.ts:1574` (**P0**)
- **Playwright 5곳 stealth 미적용** — `crawler/utils/urlUtils.ts:48-50`, `image/imageFxGenerator.ts:989/1005/1023/1047` (**P0**)
- UA 하드코딩 — `naverBlogCrawler.ts:146` Chrome 120 (현재 Chromium 124+, 미스매치)
- `crawler/utils/browserFactory.ts:37` — Chrome 120 + stealth 미적용
- `crawler/crawlerBrowser.ts:41,310` — Chrome 131 + `--disable-gpu` + `--disable-extensions` (SwiftShader 노출 risk)
- `smartCrawler.ts:1350` — `--disable-web-security` (자동화 시그니처)
- `crawlerBrowser.ts:257-259`, `smartCrawler.ts:1333-1335` — 매 호출 시 stealth import (메모리 누수 P2)

### 2.9 행동 자동화 (C3)

- `editorHelpers.ts:784, 943, 957, 2048-2174, 2201` — `safeKeyboardType(..., { delay: 5/10/15 })` 고정 delay 광범위 (**P0**)
- `imageHelpers.ts:1550, 1606, 1822` — `page.mouse.move(x, y)` **steps 옵션 없음** (1-tick 텔레포트, **P0**)
- `imageHelpers.ts:1551-1564` — `delay(100/200/300/100)` 더블클릭 down-up 고정 타이밍 (P1)
- `naverBlogAutomation.ts:4895-4980` — hover dwell 0, 직접 좌표 클릭 (P1)
- `naverBlogAutomation.ts:4879, 4949, 2917` / `imageHelpers.ts:1525, 1788` — `scrollIntoView({ behavior: 'instant' })` (P2)
- `crawler/smartCrawler.ts:1397, productSpecCrawler.ts:150` — `page.mouse.move(500, 300)` 상수 좌표 (P2)
- `ghostCursorHelper.ts:179, 199-208` — `typeDelay=100` 기본 (실 사용자 평균 40~60ms 벗어남, P3)
- `typingUtils.ts:71`, `coupang/humanBehavior.ts:20` — Box-Muller jitter 양호 ✓ (editor/image 미적용)

### 2.10 콘텐츠 보일러 (C5)

- `contentGenerator.ts:7172-7189` — `## 1. ~ ## 4.` 헤딩 4단 고정 (**P0**)
- `contentGenerator.ts:8793` — "안녕하세요, 작성자예요!..." 고정 인사 (P0)
- `enhancer/qualityEnhancer.ts:64, 647-667` — CTA 5종 리터럴, 회전 없음 (P1)
- `engagement/commentChain.ts:144, 188` — 인사 + "꼼꼼히 살펴보겠습니다" (자체 금칙어 사용, P1)
- `agents/persona.ts:40-42` — "안녕하세요! Leadernam AI예요" 3종 고정 (P2)
- `engagement/commentResponder.ts:30` — "도움이 되셨으면 좋겠습니다 😊" (P1)
- `promptLoader.ts:516` — "여러분은 어떠세요?" 멘트 강제 (P2)
- **perplexity/burstiness/HHEM 런타임 메트릭 부재** (P1)

### 2.11 네트워크 (C2)

- `agents/trendAnalyzer.ts:143, 188, 251` — Node `fetch(news.naver.com / datalab.naver.com / entertain.naver.com)` (**P0**)
- `analytics/dynamicSerpProbe.ts:196`, `competitorAnalyzer.ts:137/185/363`, `keywordAnalyzer.ts:479/539/575/1103/1236/1283/1325` — `axios.get(search/shopping/blog.naver.com)` (**P0**)
- `engagement/commentCrawler.ts:125` — 댓글 API Node fetch (P1)
- `analytics/serpProbe.ts:179` — PostView axios fetch (P1)
- `renderer/modules/enhancedFetch.ts:29-37` — `Connection`/`Keep-Alive` 임의 헤더 → Chrome canonical 순서 파괴 (P1)
- `browserSessionManager.ts:659, 734, 964` — `page.evaluate(async()=>fetch(...))` Chrome 컨텍스트 ✓ (안전)
- `crawler/utils/proxyManager.ts:293, 317-360` — `https.request` ipify/ipinfo/naver 검증 (P2)
- **WebRTC leak 명시 차단 코드 없음** — Chrome launch args에 `--enforce-webrtc-ip-permission-check` 미확인 (P1)

---

## 3. 격차 매트릭스 — 7카테고리 × 현재 대응

| # | 보호조치 | 현재 대응 | 판정 | 우선 | 근거 |
|---|---------|----------|------|------|------|
| 1 | 로그인 챌린지 | sessionPersistence, 쿠키 복원, 로그인 시차 | **부분** | P1 | 5회 한도 무가드, 디바이스 변동 OTP 미대응 |
| 2 | 발행 빈도 | postLimitManager, jitter, smartScheduler | **부분** | **P0** | 다계정 카운터 무력, hourly 경계 버그, 1시간 텀 미준수(현 3분 floor) |
| 3 | IP 차단 | proxy 선택적 | **N (미대응)** | **P0** | proxy null fallthrough, WebRTC leak 미차단 |
| 4 | Fingerprint (디바이스+TLS) | stealth plugin 12 evasion | **부분** | **P0** | 전 계정 동일 hardwareConcurrency/deviceMemory, JA4/H2 미대응, headless:true 4곳 |
| 5 | 이미지 (AuthGR) | authgrDefense, imageTextConsistencyChecker | **부분** | P1 | EXIF PNG chunks 미제거, AI 생성 감지 없음, ALT 자동생성 부재 |
| 6 | 콘텐츠 (QUMA-VL) | authgrDefense, PlatitudeDetector v2 | **부분** | **P0** | 헤딩 4단 고정, 한국어 perplexity 미측정, KatFishNet 신호 가드 부재 |
| 7 | 행동 패턴 | typingUtils Box-Muller (일부) | **N (편차 큼)** | **P0** | editor/image 고정 delay, mouse 텔레포트, dwell 0 |

---

## 4. 참고 라이브러리/도구

| 도구 | 용도 | 출처 |
|------|------|------|
| CreepJS | fingerprint 정합성 테스트 (탐지율 80% 기준) | https://abrahamjuliot.github.io/creepjs/ |
| BotD | 클라이언트 봇 탐지 (99.5%) | https://github.com/fingerprintjs/BotD |
| Scrapfly Audio | Audio context fingerprint 테스트 | https://scrapfly.io/web-scraping-tools/audio-fingerprint |
| curl-impersonate | Chrome TLS handshake 흉내 (JA4 우회) | https://github.com/lwthiker/curl-impersonate |
| node-libcurl-ja3 | Node에서 JA3/JA4 모방 | https://github.com/andrewmackrodt/node-libcurl-ja3 |
| undici | Node native HTTP/2 (header 순서 차이) | — |
| ghost-cursor | Bezier 마우스 궤적 (시그니처화 risk) | https://github.com/Xetera/ghost-cursor |
| IsHumanCadence | 무캡차 타이핑 분석 (HN 2026-02) | https://news.ycombinator.com/item?id=46940197 |
| KatFishNet | 한국어 LLM 글 SOTA detector | https://github.com/Shinwoo-Park/katfishnet |
| IPQS / AbuseIPDB | IP 평판 사전 체크 | https://www.ipqualityscore.com / https://docs.abuseipdb.com |
| residential proxy 시장 | Bright Data $2.5~4/GB, IPRoyal $1.75/GB, Oxylabs $2.5~6/GB | https://proxy-pricing.io/brightdata-pricing |

---

## 5. 공개 사례 / 트렌드

- **행동 신호 ≥ 기술 fingerprint 추세** (DataDome/Imperva 2026) — stealth만으로 불충분 ([Scrapfly DataDome](https://scrapfly.io/blog/posts/how-to-bypass-datadome-anti-scraping), [browser-use](https://browser-use.com/posts/bot-detection))
- **Cloudflare H2 fingerprint 도입 (2023)** — 파서 공격 67% 감소
- **JA4 등장 (FoxIO, 2023)** — JA3 randomization 무력화. cipher/extension 정렬 후 해시
- **GPT-4 raw 글 0.15~0.20 burstiness** — humanizer 통과 시 어떤 detector도 안정적 검출 불가
- **KatFishNet (ACL 2025)** — 한국어 detector 표준 신호 (POS n-gram, 공백/쉼표 분포)
- **네이버 2026 검색 로직 개편** — AI/광고 블로그 저품질 판정 강화 ([나무위키 저품질](https://namu.wiki/w/%EB%B8%94%EB%A1%9C%EA%B7%B8%20%EC%A0%80%ED%92%88%EC%A7%88))

---

## 6. 의존성 그래프 (팀 결과 통합)

```
A1 (네이버 2026 변화) ─┬─→ §1.1, §1.5, §1.6
A2 (캡차)             ─┴─→ §1.1 ──→ B3(세션) ──→ §2.3
A3 (fingerprint)      ───→ §1.4 ──→ B8(stealth) + C1 ──→ §2.6 + §2.8
A4 (IP)               ───→ §1.3 ──→ C2(네트워크) + C6(linkage) ──→ §2.11 + §2.6
A5 (행동)             ───→ §1.7 ──→ C3(자동화) ──→ §2.9
A6 (콘텐츠 detection) ───→ §1.5, §1.6 ──→ B4(authgr) + B5(images) + C5 ──→ §2.4, §2.5, §2.10
A7 (TLS/H2)           ───→ §1.4 ──→ C2(네트워크) ──→ §2.11
A8 (rate-limit)       ───→ §1.2 ──→ B2(frequency) + C4(rate risk) ──→ §2.2
```

`/research.md` 작성일: 2026-05-24. 자료 cutoff: A1~A8 보고 시점.
