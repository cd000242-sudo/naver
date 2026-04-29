# v2.7.40 에디터 무한 로딩 회귀 — 상세 분석

## 1. 사용자 보고 재현

- 증상: 네이버 블로그 에디터가 `blog.naver.com/{blogId}?Redirect=Write&...` 상태에서 "글을 불러오고 있습니다..." 스피너가 무한 표시되며 자동화가 진입에 실패하거나, 진입 직후 `#mainFrame`을 찾지 못해 재시도 루프에 빠짐.
- 컨텍스트: v2.7.28(2026-04-28) Adaptive Limiter / EventLoopWatchdog 도입 이후, v2.7.29~v2.7.40에서는 `naverBlogAutomation.ts`/`automation/` 본체에 변경 없음.

## 2. 현재 진입 흐름 (코드 라인 기준)

```
run() (naverBlogAutomation.ts:8987)
 └─ globalLimiter.acquire('publish')   [v2.7.28 추가, 8990]
 └─ setupBrowser → ensureDialogHandler
 └─ loginToNaver()
 └─ navigateToBlogWrite()              [3634]
 │    ├─ shouldSkipWarmup 판정          [3677]
 │    ├─ for attempt 1..3               [3777]
 │    │   ├─ page.goto(blogWriteUrl,
 │    │   │     {waitUntil:'domcontentloaded', timeout:30000})  [3781]
 │    │   ├─ delay(3000)                [3787]
 │    │   ├─ finalUrl = page.url()      [3790]
 │    │   ├─ isEditorUrl ← /blogPostWrite|GoBlogWrite|NaverWriteEditor/.test(finalUrl)  [3817]
 │    │   ├─ isLoginRedirect 분기       [3828]
 │    │   ├─ !isBlogDomain 분기         [3899]
 │    │   └─ isBlogDomain && !isEditorUrl 분기  [3917]
 │    │        └─ #mainFrame 존재 여부만 확인 (1회)  [3919]
 │    │             ├─ 있으면 success
 │    │             └─ 없으면 attempt 재시도 (continue)
 └─ switchToMainFrame()                 [3962]
      ├─ frameHandle waitForSelector('#mainFrame', timeout:5000) × 4회  [4094]
      ├─ frame.waitForFunction(href !== about:blank, timeout:3000)  [4168]
      └─ mainFrame 사용
```

## 3. URL/셀렉터 매트릭스

| 단계 | 기대 URL | 코드의 패턴 검사 | 누락 패턴 |
|------|---------|-----------------|----------|
| 시작 | `blog.naver.com/GoBlogWrite.naver` (option default, 3636) | match O | — |
| 중간 redirect (네이버 측) | `blog.naver.com/{blogId}?Redirect=Write&...` | match X (도메인만 매치) | **`Redirect=Write` 누락** |
| 최종 에디터 | `blog.naver.com/PostWriteForm.naver?...` 또는 `blogPostWrite` | match O | — |

> **핵심**: `Redirect=Write`는 네이버가 글쓰기 진입 시 거치는 정상 중간 URL이지만 화이트리스트에 없다. domcontentloaded 시점에 이 URL이 캡처되면 코드는 "에디터 아님"으로 간주한다.

| 셀렉터 | 위치 | 사용 |
|--------|------|------|
| `#mainFrame` | naverBlogAutomation.ts:3881, 3920, 4058, 4094 | 에디터 iframe 1차 식별 |
| `iframe[name="mainFrame"]` | 3881, 3920, 4058 | DOM 보조 식별 |
| `iframe[id="mainFrame"]` | 4118 | waitForSelector 폴백 |
| `iframe.se-main-frame` | 4128 | 마지막 폴백 |
| `.se-container, .se-main-container, #write_area` | 2139 (checkLoginStatus) | 세션 검증용 — 진입 검증에는 미사용 |

> **편차**: "글을 불러오고 있습니다..." 스피너에 해당하는 셀렉터는 어디에도 코드로 검사되지 않는다. 따라서 스피너가 떠 있는 동안에도 `#mainFrame`만 있으면 success 처리되지만, 그 안의 콘텐츠 영역(`.se-section-text` 등)은 비어 있는 상태에서 다음 단계(closeDraftPopup → applyStructuredContent)가 즉시 호출되어 입력 실패가 발생한다.

## 4. 타임아웃 정책 점검

| 위치 | 동작 | 타임아웃 | 평가 |
|------|------|----------|------|
| navigateToBlogWrite goto | `domcontentloaded` | 30s | OK이나 **redirect 체인 종료를 보장 안 함** |
| navigateToBlogWrite delay | `delay(3000)` | 3s 고정 | **변동 redirect 시간을 못 따라감** |
| switchToMainFrame waitForSelector('#mainFrame') | visible | 5s 첫 시도 / 3s 후속 × 4 = 14s | 여유 있으나 1차 5s가 짧다 |
| switchToMainFrame waitForFunction(href!=about:blank) | iframe.contentFrame() | 3s | iframe 자체가 비어있는 경우엔 통과해도 본문 미준비 |
| publish 후 frame.waitForNavigation | networkidle0 | 30s | OK |
| Adaptive Limiter acquire | — | 60s | 슬롯 정체 안전망 (v2.7.28) |

## 5. 회귀 원인 후보 — 코드 근거

### Top 1. `Redirect=Write` 화이트리스트 누락 (가장 강한 근거)
```typescript
// naverBlogAutomation.ts:3817-3820
const isEditorUrl = finalUrl.includes('blogPostWrite') ||
                    finalUrl.includes('GoBlogWrite') ||
                    finalUrl.includes('NaverWriteEditor');
const isBlogDomain = finalUrl.includes('blog.naver.com');
```
`?Redirect=Write` URL은 `isBlogDomain=true`, `isEditorUrl=false`로 분류되어 line 3917 분기로 빠진다. 그 분기는 `#mainFrame` 존재 여부 1회 확인뿐이며, redirect 체인이 아직 끝나지 않은 시점에는 mainFrame iframe이 아직 DOM에 attach되지 않아 false가 반환되고 attempt 재시도된다. 재시도 시 `page.goto(blogWriteUrl)`가 다시 호출되어 매번 같은 redirect 체인을 처음부터 따라가므로 **계속 같은 중간 URL에서 정착**할 가능성이 있다.

### Top 2. `domcontentloaded` + 고정 3초 정착 시간이 redirect 체인을 따라잡지 못함
```typescript
// 3781-3787
await page.goto(blogWriteUrl, {
  waitUntil: 'domcontentloaded',
  timeout: 30000
});
await this.delay(3000);
```
네이버 글쓰기 진입은 다음 redirect 체인을 따른다:
1. `GoBlogWrite.naver` → 302
2. `blog.naver.com/{blogId}?Redirect=Write&...` → 클라이언트 JS가 SPA 라우팅
3. `PostWriteForm.naver?...` (실제 에디터) — `#mainFrame` 존재

`domcontentloaded`는 step 2 시점에서 이미 발사된다. 클라이언트 JS가 step 3로 이동시키는 데 환경에 따라 1~10초가 걸리며, `delay(3000)`은 worst-case를 못 따라간다. 특히 v2.7.28에서 Limiter가 lag로 인해 max=1까지 떨어진 상태라면 다른 발행 작업과 직렬화되어 puppeteer 컨텍스트 자체가 stall할 수 있다.

### Top 3. v2.7.28 Adaptive Limiter + Watchdog 부하로 puppeteer 응답성 저하
```typescript
// 8988-9217 run() 진입/종료에 limiter 슬롯
const release = await globalLimiter.acquire('publish');
try { ... } finally { release(); }
```
- `run()`은 60초 timeout으로 슬롯을 acquire한다(adaptiveLimiter.ts:22).
- EventLoopWatchdog는 200ms부터 lag 로그, 1s+에서 limiter `onLagDetected()`로 max를 1씩 줄이고, 5s+에서 max를 절반으로 만든다(adaptiveLimiter.ts:76-92).
- 저사양 환경(CPU 4코어/RAM 8GB 이하)은 LowSpecMode가 max를 더 낮춘다.

이 자체로 무한 로딩의 직접 원인은 아니지만 **redirect 체인 중간 단계에서 페이지가 무거울 때 microtask가 적체되어 SPA 라우팅이 stall**하는 보조 요인이 될 수 있다. 또한 redirect 처리 동안 puppeteer page.goto의 microtask가 EventLoopWatchdog와 경쟁한다.

## 6. 권장 수정 (구체 라인)

### A. 에디터 URL 화이트리스트 보강 (`naverBlogAutomation.ts:3817-3819`)
```typescript
// 변경 전
const isEditorUrl = finalUrl.includes('blogPostWrite') ||
                    finalUrl.includes('GoBlogWrite') ||
                    finalUrl.includes('NaverWriteEditor');

// 변경 후
const editorPatterns = [
  'blogPostWrite',
  'GoBlogWrite',
  'NaverWriteEditor',
  'PostWriteForm',
];
const isEditorUrl = editorPatterns.some(p => finalUrl.includes(p));
const isMidRedirect = /[?&]Redirect=Write\b/i.test(finalUrl);  // 중간 redirect 인지
```

### B. redirect 체인 정착 대기 추가 (`naverBlogAutomation.ts:3787` 직후)
```typescript
// 변경 전
await this.delay(3000);

// 변경 후
await this.delay(800);  // 짧은 안정화
await page.waitForFunction(
  () => {
    const u = location.href;
    if (/GoBlogWrite|blogPostWrite|NaverWriteEditor|PostWriteForm/.test(u)) return true;
    if (/[?&]Redirect=Write\b/i.test(u)) return false;  // 아직 중간 redirect 중
    return !!document.querySelector('#mainFrame, iframe[name="mainFrame"]');
  },
  { timeout: 25000, polling: 500 }
).catch(() => {/* 시간 초과 시 아래 분기 로직이 처리 */});
await this.delay(500);
```

### C. "글을 불러오고 있습니다" 스피너 검출 + 강제 reload 폴백 (`naverBlogAutomation.ts:3917-3937` 분기)
```typescript
else if (isBlogDomain && !isEditorUrl) {
  // 1) 에디터 frame 존재 검사 (기존)
  const hasEditorFrame = await page.evaluate(() => {
    return !!document.querySelector('#mainFrame, iframe[name="mainFrame"]');
  }).catch(() => false);

  if (hasEditorFrame) {
    // 기존 success path
  } else {
    // 2) [신규] 로딩 스피너 검출 + 폴링
    const isStillLoading = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      return text.includes('글을 불러오고 있습니다') || text.includes('불러오고 있습니다');
    }).catch(() => false);

    if (isStillLoading) {
      this.log('   ⏳ 네이버 에디터 로딩 스피너 감지 — 최대 20초 폴링 재시도...');
      const ok = await page.waitForFunction(
        () => !!document.querySelector('#mainFrame, iframe[name="mainFrame"]'),
        { timeout: 20000, polling: 500 }
      ).then(() => true).catch(() => false);

      if (ok) {
        navigationSuccess = true;
        break;
      }

      // 3) [신규] reload 1회 강제 — redirect 체인이 멈춘 케이스 복구
      this.log('   🔄 로딩 정체 — 페이지 reload 1회 시도');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await this.delay(3000);
      continue;
    }
    // 기존 재시도/throw 로직 유지
  }
}
```

### D. switchToMainFrame 1차 타임아웃 완화 (`naverBlogAutomation.ts:4094-4097`)
```typescript
// 변경 전
frameHandle = await page.waitForSelector('#mainFrame', {
  visible: true,
  timeout: attempt === 0 ? 5000 : 3000
}).catch(() => null);

// 변경 후 — 첫 시도는 redirect 정착 여유 포함
frameHandle = await page.waitForSelector('#mainFrame', {
  visible: true,
  timeout: attempt === 0 ? 12000 : 5000
}).catch(() => null);
```

## 7. 회귀 시점 추적 (git log 30일)

| commit | 날짜 | naverBlogAutomation/automation 변경 | 영향도 |
|--------|------|--------------------------------------|--------|
| 1e22970c v2.7.40 | 04-29 | postManager.ts만 (글 목록 누락 수정) | **무관** |
| c073cea9 v2.7.39 | 04-29 | LEWORD 키워드 — 자동화 무관 | 무관 |
| 5b55d718 v2.7.38 | 04-29 | Flow 로그인 후 Chrome 숨김 — 자동화 진입과 별개 | 낮음 |
| faefa801 v2.7.37 | 04-29 | continuousPublishing.ts(+52), HeadingImageSettings(-6) | 낮음 |
| f173a81a v2.7.36 | 04-29 | gpt-image-2 quality | 무관 |
| 33169744 v2.7.29 | 04-29 | editorHelpers.ts(±31) — 공정문구 가드 | **확인 필요** |
| **d78c5e68 v2.7.28** | **04-28** | **naverBlogAutomation.ts(+8) — globalLimiter.acquire/release**, adaptiveLimiter.ts/eventLoopWatchdog.ts 신규 | **유력** |
| dc768fbc v1.4.86 | 04-23 | 연속발행 이전글 중복 — 발행 후 정리, 진입 무관 | 낮음 |

> **결론**: v2.7.28에서 자동화 진입 자체에 globalLimiter가 끼어들었고 EventLoopWatchdog가 도입되었다. naverBlogAutomation.ts의 진입 분기 로직 자체는 2026-03-24~03-27 fix 이후 변경이 없으므로 회귀의 직접 원인은 코드 변경보다는 **(a) 네이버 측 URL 패턴 변화 + (b) 환경 부하**의 조합일 가능성이 높다. (a)는 패턴 화이트리스트 보강으로, (b)는 redirect 정착 대기 + 스피너 폴백으로 차단 가능.

## 8. 검증 권고 (코드 수정 후)

1. `?Redirect=Write` URL을 가진 mock 페이지로 단위 테스트 추가 (`__tests__/editorEntry.test.ts`).
2. 실제 네이버 환경에서 첫 진입(웜 캐시 없음)/연속 발행(웜 캐시) 두 경로에 대해 timing 로그 수집.
3. EventLoopWatchdog lag 로그를 발행 1회 분량 모니터링하여 max가 어디까지 떨어지는지 확인.
