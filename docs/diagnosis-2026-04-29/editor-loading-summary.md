# v2.7.40 에디터 무한 로딩 회귀 진단 — 요약

**보고 증상**: `blog.naver.com/{blogId}?Redirect=Write&...` URL에서 "글을 불러오고 있습니다..." 무한 로딩.

## 회귀 원인 후보 Top 3

### 1. (가장 유력) `?Redirect=Write` URL 패턴이 에디터 URL 화이트리스트에 누락됨
`naverBlogAutomation.ts:3817-3819`의 `isEditorUrl` 판정은 `blogPostWrite` / `GoBlogWrite` / `NaverWriteEditor` 세 패턴만 인식한다. 네이버는 `https://blog.naver.com/{blogId}?Redirect=Write&...` 형태의 **중간 리다이렉트 URL**을 거쳐 에디터로 진입하는데, 이 URL은 `blog.naver.com` 도메인은 만족하지만 에디터 URL 패턴은 만족하지 못한다. 결과적으로 line 3917의 "blog 도메인이지만 에디터 아님" 분기로 빠져 `#mainFrame`을 찾지 못하면 재시도 루프에 빠진다. 네이버가 "글을 불러오고 있습니다..." 스피너를 띄우는 동안 자동화는 잘못된 분기로 들어간다.

### 2. `domcontentloaded`에 묶인 짧은 3초 정착 시간이 redirect 체인을 못 따라감
`navigateToBlogWrite()` line 3781-3787는 `waitUntil: 'domcontentloaded'` + `delay(3000)` 조합. `?Redirect=Write` URL은 클라이언트 JS가 추가 redirect를 트리거하기 때문에 domcontentloaded가 너무 빨리 풀린다. 3초 후 `page.url()`로 본 URL이 아직 redirect 진행 중이거나 "글을 불러오고 있습니다..." 화면일 가능성이 높다. 특히 v2.7.28의 Adaptive Limiter가 lag 감지 시 동시성을 떨어뜨려 네트워크/렌더링이 더 느려질 수 있다.

### 3. v2.7.28 Adaptive Limiter + EventLoopWatchdog 부하로 puppeteer 응답성 저하
v2.7.28(d78c5e68)이 `run()` 진입에 60초 acquire 가드를 둔 글로벌 limiter를 도입했다. 발행 작업 중에는 항상 슬롯을 1개 점유하지만 동시에 EventLoopWatchdog가 200ms/1s/5s 임계로 lag를 측정하며 limiter max를 자동 다운시킨다. 저사양 환경에서 이로 인해 puppeteer goto/waitForSelector가 일시적으로 멈추면 redirect 체인의 마지막 단계를 놓치고 "글을 불러오고 있습니다..." 화면에서 정착할 수 있다.

## 즉시 패치 권고

1. **셀렉터/URL 화이트리스트 보강 (P0)**: `isEditorUrl` 조건에 `Redirect=Write`(case-insensitive)를 추가. 또한 DOM에서 에디터 컨테이너(`.se-container`, `.se-main-container`, `#mainFrame`) 존재 여부를 함께 검증해 URL 표면 검사에서 빠지더라도 진입 성공으로 인정.
2. **redirect 체인 정착 대기 (P0)**: `navigateToBlogWrite()` 후 `await page.waitForFunction(() => /GoBlogWrite|blogPostWrite|NaverWriteEditor/.test(location.href) || !!document.querySelector('#mainFrame'), { timeout: 25000 })`로 중간 redirect 종료를 명시 대기. 단일 `delay(3000)`은 변동 redirect 시간을 따라가지 못함.
3. **"글을 불러오고 있습니다" 스피너 가드 (P1)**: 페이지 텍스트에 해당 문구가 보이는 동안에는 sleep + retry 폴링(최대 20초)을 추가하고 그 후에도 mainFrame이 없으면 강제 reload 한 번 시도.

🐙
