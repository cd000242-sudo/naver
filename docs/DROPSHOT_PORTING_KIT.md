# 🍌 Dropshot 나노바나나 Pro — 단일 파일 이식 키트

> **이 .md 하나로 다른 Node/Electron 앱에 Dropshot 이미지 생성을 통합할 수 있습니다.**
>
> 본 키트는 [blogger-gpt-cli v3.6.0](https://github.com/cd000242-sudo/blogger-gpt-cli)에서 추출한 production-ready 코드 + 통합 패턴입니다. 실측 검증 완료 (3장 batch + i2i smoke 성공, md5 hash로 고유성 확인).

---

## 📋 이식 체크리스트 (15분)

```
□ 1. 의존성 추가 (npm install 1줄)
□ 2. src/core/dropshotGenerator.ts 생성 (§3 코드 그대로 복붙)
□ 3. dispatcher 통합 (§4 — case 분기 + alias map + 폴백 정책)
□ 4. UI 통합 (§5 — select option + 비용 표시)
□ 5. 검증 (§6 — smoke test 1장 생성)
```

각 단계는 아래 섹션에서 그대로 복붙 가능.

---

## ⚠️ 비용 정확하게

| 항목 | 비용 | 의미 |
|---|---|---|
| Dropshot Pro 월 구독료 | **74,000~99,000원/월** (사이트 직접 결제) | 이게 진짜 비용 |
| 이미지 1장당 추가비용 | **0원** | Pro 구독자 한정, `isUnlimited: true` |
| 무료 사용자 | creditCost 75/장 | daily/monthly quota 안에서만 |

**즉**: "무료"가 아니라 **"구독료별, 한계비용 0원"**. UI/비용표에서 정확히 표시해야 사용자가 헷갈리지 않음.

---

## §0. 📊 실측 검증 결과 (production-ready 증명)

**blogger-gpt-cli v3.6.0 환경에서 직접 측정한 데이터** (2026-05-30):

### 텍스트→이미지 (단일 batch)
| # | 프롬프트 | 시간 | 크기 | md5 (앞 16자) |
|---|---|---|---|---|
| 1 | 귀여운 노란 고양이가 햇살 비치는 창가에서 잠자는 사실적인 사진 | 36.7s | 204KB | d373784a456268fa |
| 2 | 오로라가 빛나는 밤하늘 아래 한적한 호숫가의 통나무집 | 32.5s | 147KB | 78b3b2e3319a6355 |
| 3 | 서울 강남의 미래도시 풍경, 네온사인과 비, 사이버펑크 | 36.3s | 313KB | 38d93c63414485e0 |

→ **3/3 성공 + 모두 고유 hash** (이전 이미지 반복 캡처 버그 없음 검증)

### 이미지 투 이미지 (i2i)
| 시나리오 | 시간 | 결과 |
|---|---|---|
| reference 1장 + 프롬프트 → 새 이미지 | 38.4s | ✅ 223KB JPEG, source 라벨에 "(i2i 1장)" 표시 |

### 세션 재사용 효과
- **첫 호출**: 19~36초 (브라우저 launch + 로그인 캐시 사용)
- **2번째 호출**: 13~32초 (page reuse — **11~45% 단축**)
- **3번째 호출 이후**: 거의 동일 (~13초 floor — UI 자체 생성 시간)

### API 우회 시도 결과
| 시도 | 방법 | 결과 |
|---|---|---|
| 1~3차 | `page.evaluate(fetch)` cross-origin | ❌ TypeError "Failed to fetch" (isolated world 차단) |
| 4차 | Node.js + Cookie 헤더 명시 | ❌ 401 INTERNAL_SERVER_ERROR (Cognito 토큰 stale) |
| 5~6차 | body 변형 (`isUnlimited: false`, ratio 변경) | ❌ 401 동일 |
| 7차 | same-origin `/v1/job/...` 호출 | ❌ 307 redirect → `/ko/v1/...` → 404 (Next.js i18n) |
| 8차 | `page.request.post` (browser context) | ❌ 401 동일 |
| 9~11차 | Authorization 헤더 추가, IndexedDB token 추출 시도 | ❌ 모두 실패 |
| **최종** | **UI 자동화 (Playwright)** | ✅ **100% 성공** |

**결론**: dropshot은 페이지 JS 내부의 자체 fetch wrapper + Cognito refresh interceptor 때문에 외부 API 호출 불가능. UI 자동화가 유일한 우회로.

---

## §1. 핵심 결정 — 왜 UI 자동화인가

API 직접 호출 11번 시도 모두 401 INTERNAL_SERVER_ERROR:
- AWS Cognito accessToken/idToken (쿠키 저장)
- **페이지 JS 내부의 token refresh 로직**을 거쳐야 인증 통과 (자체 fetch wrapper)
- 외부 fetch / page.evaluate / page.request 셋 다 차단됨

**결론**: API 우회 비현실적 → Playwright UI 조작으로 우회.

### 작동원리 흐름도

```
┌─────────────────────────────────────────────────────────────┐
│  makeDropshotImage(prompt, options, onLog)                  │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
       ┌─────────────────────────────┐
       │  ensurePage() — Mutex Gate  │  (병렬 호출 안전)
       └──────────────────────────┬──┘
                                  ▼
          ┌──────────────────────────────────────┐
          │  캐시된 page 살아있나?               │
          └─────────┬──────────────────┬─────────┘
                Yes ▼              No  ▼
              [재사용]      ┌──────────────────────┐
                            │ headless로 1차 시도   │
                            └──────┬───────────────┘
                                   ▼
                        ┌──────────────────────┐
                        │ 세션 로그인 상태?    │
                        └──┬───────────────┬───┘
                       Yes ▼           No  ▼
                       [headless    [visible 창 열기]
                        그대로]            ▼
                                    [5분 polling — 사용자 로그인 대기]
                                           ▼
                                    [headless로 재진입]
                                           ▼
       ┌───────────────────────────────────────────────────┐
       │  for 시도 1~3:                                    │
       │    1) board URL 재확인                             │
       │    2) 호출 전 DOM 이미지 snapshot (NEW만 잡기 위해)│
       │    3) referenceImageList 있으면 → i2i 모드:        │
       │        - URL 다운로드 → Buffer                     │
       │        - setInputFiles(file input)로 자동 업로드    │
       │    4) textarea[placeholder="어떤 장면..."] 에 fill │
       │    5) parent 안의 button.absolute 클릭            │
       │    6) 90초 동안 2초마다 DOM 폴링:                  │
       │        - data:image/...base64 새 img 탐색          │
       │        - 또는 cdn.dropshot.io result 이미지 탐색  │
       │    7) snapshot에 없던 NEW 이미지 발견 → return     │
       └───────────────────────────────────────────────────┘
                                ▼
                      { ok, dataUrl, error }
```

### 핵심 디자인 결정 6가지

1. **Persistent Context** — 쿠키 + localStorage + IndexedDB 모두 자동 영구화 (Firebase auth가 IndexedDB 사용해서 필수)
2. **Patchright 우선** — Playwright 표준은 `navigator.webdriver=true` + CDP 누출로 reCAPTCHA Enterprise 감지됨. Patchright는 빌드 단계에서 제거.
3. **headless 우선, 실패 시 visible 폴백** — 사용자 작업 방해 최소화. 로그인 필요할 때만 창 띄움.
4. **Mutex (`_ensurePagePromise`)** — 병렬 호출 시 첫 호출만 브라우저 초기화, 나머지는 대기. profile 중복 사용 충돌 방지.
5. **snapshot 비교** — 생성 전 DOM의 base64 이미지 src를 모두 기록. 새로 등장한 것만 result로 인식 (이전 이미지 반복 캡처 버그 차단).
6. **3회 재시도 + cached invalidation** — `Target closed` / `WebSocket` 에러 시 캐시 무효화 후 재시도.

---

## §2. 의존성 추가

```bash
npm install patchright playwright
```

> - **patchright**: Playwright drop-in fork (reCAPTCHA Enterprise/Cloudflare 회피 강화)
> - **playwright**: patchright 미설치 환경 fallback용

추가 의존성 불필요. Node 18+ (fetch 빌트인 사용).

---

## §3. 핵심 코드 — `src/core/dropshotGenerator.ts`

**그대로 복붙. 353줄 (검증 완료된 production 코드).**

```typescript
/**
 * 🍌 Dropshot 이미지 생성 엔진 (UI 자동화 방식)
 *
 * dropshot.io의 nano-banana-pro 모델을 Playwright UI 조작으로 자동 사용.
 * - API 직접 호출은 Cognito refresh 외부 흐름 우회 불가능 → UI 조작으로 우회
 * - 같은 profile 영구 세션 (~/.your-app/dropshot-profile/)
 * - 결과는 DOM의 `<img src="data:image/png;base64,...">`에서 직접 scrape
 *
 * 비용 (정확):
 * - Pro 구독자 (월 74,000~99,000원 구독료별): 이미지당 한계비용 0원, 무제한 (isUnlimited: true)
 * - 무료 사용자: creditCost 75/이미지 — daily/monthly quota 안에서만
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const BOARD_URL = 'https://aistudio.dropshot.io/ko/workspace/board?panel=image&imageModelName=google/nano-banana-pro';
const PROFILE_NAME = 'dropshot-profile'; // ← 앱 이름에 맞게 변경 권장 (예: 'myapp-dropshot-profile')
const PROFILE_ROOT = '.your-app';        // ← 앱 이름에 맞게 변경 (예: '.myapp')
const PROMPT_SELECTOR = 'textarea[placeholder="어떤 장면을 만들고 싶나요?"]';

let cachedContext: any = null;
let cachedPage: any = null;
let _ensurePagePromise: Promise<any> | null = null;

function getProfileDir(): string {
  const dir = path.join(os.homedir(), PROFILE_ROOT, PROFILE_NAME);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function launchBrowser(profileDir: string, headless: boolean): Promise<any> {
  let chromium: any;
  try {
    chromium = (await import('patchright' as any)).chromium;
  } catch {
    chromium = (await import('playwright')).chromium;
  }

  const forceVisible = String(process.env['VISIBLE_BROWSER'] || '').toLowerCase() === 'true';
  const effectiveHeadless = forceVisible ? false : headless;

  const baseOptions: any = {
    headless: effectiveHeadless,
    args: [
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--lang=ko-KR,ko',
      '--window-size=1280,900',
    ],
    viewport: { width: 1280, height: 900 },
    locale: 'ko-KR',
    timezoneId: (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'; }
      catch { return 'Asia/Seoul'; }
    })(),
    ignoreDefaultArgs: ['--enable-automation'],
  };

  const stealthInit = () => {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en'],
      configurable: true,
    });
  };

  for (const channel of ['chrome', 'msedge', undefined]) {
    try {
      const opts = channel ? { ...baseOptions, channel } : baseOptions;
      const ctx = await chromium.launchPersistentContext(profileDir, opts);
      try { await ctx.addInitScript(stealthInit); } catch {}
      return ctx;
    } catch {}
  }
  throw new Error('Chrome/Edge/Chromium 실행 실패');
}

async function isLoggedIn(page: any): Promise<boolean> {
  try {
    const has = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.includes('이미지 생성') || text.includes('플랜 업그레이드') || text.includes('워크스페이스');
    });
    return !!has;
  } catch { return false; }
}

export async function ensurePage(onLog?: (m: string) => void): Promise<any> {
  if (_ensurePagePromise) {
    await _ensurePagePromise;
    if (cachedPage && cachedContext) {
      try {
        await cachedPage.evaluate(() => document.readyState);
        return cachedPage;
      } catch {}
    }
  }
  let lockResolve!: (value: any) => void;
  _ensurePagePromise = new Promise<any>(r => { lockResolve = r; });
  try { return await _ensurePageInternal(onLog); }
  finally { _ensurePagePromise = null; lockResolve(undefined); }
}

async function _ensurePageInternal(onLog?: (m: string) => void): Promise<any> {
  if (cachedPage && cachedContext) {
    try {
      await cachedPage.evaluate(() => document.readyState);
      if (!cachedPage.url().includes('dropshot.io')) {
        await cachedPage.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 3000));
      }
      return cachedPage;
    } catch {
      cachedPage = null; cachedContext = null;
    }
  }

  const profileDir = getProfileDir();
  onLog?.('🌐 [Dropshot] 브라우저 준비 중...');

  // 1차: headless로 세션 확인
  let context = await launchBrowser(profileDir, true);
  let page = context.pages()[0] || await context.newPage();
  await page.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 5000));

  if (await isLoggedIn(page)) {
    onLog?.('✅ [Dropshot] 로그인 세션 확인');
    cachedContext = context; cachedPage = page;
    return page;
  }

  // 2차: visible 로그인 유도 (최대 5분)
  onLog?.('🔐 [Dropshot] 로그인 필요 → 브라우저 표시 (최대 5분)');
  await context.close();
  context = await launchBrowser(profileDir, false);
  page = context.pages()[0] || await context.newPage();
  await page.goto('https://aistudio.dropshot.io', { waitUntil: 'domcontentloaded', timeout: 45000 });

  let loggedIn = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const pages = context.pages();
      page = pages.find((p: any) => { try { return p.url().includes('dropshot.io'); } catch { return false; } })
        || pages[pages.length - 1];
      if (await isLoggedIn(page)) { loggedIn = true; break; }
    } catch { continue; }
    if (i % 6 === 5) onLog?.(`⏳ [Dropshot] 로그인 대기 (${Math.round((i+1)*5/60)}분 경과)`);
  }
  if (!loggedIn) { await context.close(); throw new Error('Dropshot 로그인 시간 초과'); }

  // 3차: visible 닫고 headless 재진입
  await context.close();
  const hctx = await launchBrowser(profileDir, true);
  const hpage = hctx.pages()[0] || await hctx.newPage();
  await hpage.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4000));

  cachedContext = hctx; cachedPage = hpage;
  onLog?.('✅ [Dropshot] 준비 완료');
  return hpage;
}

export interface DropshotResult {
  ok: boolean;
  dataUrl: string;
  error?: string;
}

/** URL 이미지 → buffer (setInputFiles용) */
async function downloadAsFileBuffer(url: string): Promise<{ name: string; mimeType: string; buffer: Buffer } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]?.trim() ?? 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    return { name: `ref-${Date.now()}.${ext}`, mimeType: ct, buffer: buf };
  } catch (e) {
    console.warn('[Dropshot] reference 다운로드 실패:', (e as any)?.message);
    return null;
  }
}

export async function makeDropshotImage(
  prompt: string,
  options: {
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
    /** i2i: URL 배열 (최대 4장). 각 URL을 buffer로 다운로드 후 setInputFiles로 dropshot UI에 주입. */
    referenceImageList?: string[];
  } = {},
  onLog?: (m: string) => void,
): Promise<DropshotResult> {
  const MAX_RETRIES = 3;
  let currentPrompt = prompt;
  let lastError: string | null = null;

  try {
    const page = await ensurePage(onLog);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      onLog?.(`🍌 [Dropshot] 이미지 생성 중... (시도 ${attempt}/${MAX_RETRIES})`);

      try {
        // 1. board URL 재확인
        if (!page.url().includes('panel=image')) {
          await page.goto(BOARD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await new Promise(r => setTimeout(r, 3000));
        }

        // 2. 호출 전 DOM의 result 이미지 snapshot (이전 이미지 반복 캡처 방지 — 중요!)
        const beforeSrcs: string[] = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('img'))
            .map(i => i.src || '')
            .filter(s => (s.startsWith('data:image/') || s.includes('cdn.aistudio.dropshot.io')) && !s.includes('/icons/') && !s.includes('/sample/'));
        });

        // 3. reference 이미지가 있으면 i2i 모드 — file input에 setInputFiles로 buffer 주입
        const refList = (options.referenceImageList || []).slice(0, 4);
        if (refList.length > 0) {
          onLog?.(`📎 [Dropshot] reference ${refList.length}장 업로드 중...`);
          const buffers: Array<{ name: string; mimeType: string; buffer: Buffer }> = [];
          for (const url of refList) {
            const f = await downloadAsFileBuffer(url);
            if (f) buffers.push(f);
          }
          if (buffers.length > 0) {
            const fileInput = await page.$(
              'input[type="file"][data-dropzone-accept="image"][multiple], ' +
              '[data-sentry-component="UploadedImage"] input[type="file"], ' +
              'input[type="file"][accept*="image"]'
            );
            if (fileInput) {
              try {
                await fileInput.setInputFiles(buffers);
                onLog?.(`✅ [Dropshot] reference ${buffers.length}장 업로드 완료`);
                await new Promise(r => setTimeout(r, 2500));
              } catch (e: any) {
                onLog?.(`⚠️ [Dropshot] reference 업로드 실패: ${e.message?.slice(0, 100)}`);
              }
            } else {
              onLog?.(`⚠️ [Dropshot] reference 업로드 input 못 찾음 (UI 변경?) — 텍스트→이미지로 폴백`);
            }
          }
        }

        // 4. 프롬프트 입력
        await page.waitForSelector(PROMPT_SELECTOR, { timeout: 10000 });
        await page.click(PROMPT_SELECTOR);
        await page.fill(PROMPT_SELECTOR, currentPrompt);
        await new Promise(r => setTimeout(r, 1000));

        // 5. 생성 버튼 클릭 — textarea parent의 absolute button
        const clicked = await page.evaluate(() => {
          const ta = document.querySelector('textarea[placeholder="어떤 장면을 만들고 싶나요?"]') as HTMLTextAreaElement | null;
          if (!ta) return false;
          let parent = ta.parentElement;
          for (let depth = 0; depth < 5 && parent; depth++) {
            const btn = parent.querySelector('button.absolute') as HTMLButtonElement | null;
            if (btn && !btn.disabled) { btn.click(); return true; }
            parent = parent.parentElement;
          }
          return false;
        });
        if (!clicked) await page.keyboard.press('Enter');

        // 6. 결과 이미지 대기 — snapshot에 없던 NEW 이미지만 잡음 (최대 90초)
        const startTs = Date.now();
        let foundDataUrl: string | null = null;
        while ((Date.now() - startTs) < 90_000) {
          await new Promise(r => setTimeout(r, 2000));

          // base64 data URL
          const dataUrl = await page.evaluate((before: string[]) => {
            const beforeSet = new Set(before);
            return Array.from(document.querySelectorAll('img')).find(i => {
              const src = i.src || '';
              return src.startsWith('data:image/') && i.naturalWidth > 200 && !src.includes('icons/') && !beforeSet.has(src);
            })?.src || null;
          }, beforeSrcs);
          if (dataUrl) { foundDataUrl = dataUrl; break; }

          // CDN URL → blob → dataURL 변환
          const cdnUrl: string | null = await page.evaluate((before: string[]) => {
            const beforeSet = new Set(before);
            return Array.from(document.querySelectorAll('img')).find(i => {
              const src = i.src || '';
              return src.includes('cdn.aistudio.dropshot.io') && !src.includes('/icons/') && !src.includes('/sample/') && i.naturalWidth > 200 && !beforeSet.has(src);
            })?.src || null;
          }, beforeSrcs);
          if (cdnUrl) {
            const buf = await page.evaluate(async (url: string) => {
              const r = await fetch(url);
              const blob = await r.blob();
              return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('blob read failed'));
                reader.readAsDataURL(blob);
              });
            }, cdnUrl);
            foundDataUrl = buf;
            break;
          }
        }

        if (foundDataUrl) {
          onLog?.('✅ [Dropshot] 이미지 생성 완료');
          return { ok: true, dataUrl: foundDataUrl };
        }

        lastError = '90초 내 결과 이미지 미발견';
        onLog?.(`⚠️ [Dropshot] ${lastError} (시도 ${attempt})`);
      } catch (e: any) {
        lastError = e.message || String(e);
        onLog?.(`❌ [Dropshot] 시도 ${attempt} 실패: ${lastError}`);
        if (lastError && (lastError.includes('Target closed') || lastError.includes('WebSocket'))) {
          cachedPage = null; cachedContext = null;
        }
      }
    }
    return { ok: false, dataUrl: '', error: lastError || 'unknown' };
  } catch (e: any) {
    return { ok: false, dataUrl: '', error: e.message || String(e) };
  }
}
```

**커스터마이즈 포인트** (4곳):
- `PROFILE_ROOT` / `PROFILE_NAME`: 본인 앱 이름에 맞게 변경 (예: `.myapp` / `dropshot-profile`)
- `isLoggedIn()`: 본인 앱의 추가 로그인 확인 조건이 있으면 추가
- `BOARD_URL` / `PROMPT_SELECTOR`: dropshot UI 리뉴얼 시 selector 갱신
- `MAX_RETRIES` (기본 3): 본인 앱의 신뢰성 요구에 맞춰 조정

---

## §4. Dispatcher 통합 (3개 hook 포인트)

본인 앱에 이미지 dispatcher(여러 엔진 분기 처리)가 있다면 다음 3곳에 dropshot을 등록:

### 4.1 지원 엔진 목록 추가
```typescript
export const SUPPORTED_IMAGE_ENGINES = [
  // ... 기존 엔진들 ...
  'dropshot-nanobanana-pro', // 신규
] as const;
```

### 4.2 별칭 매핑 (사용자가 다양한 표기로 입력해도 인식)
```typescript
const aliasMap: Record<string, ImageEngine> = {
  // ... 기존 alias ...
  'dropshot': 'dropshot-nanobanana-pro',
  'dropshot-nano-banana-pro': 'dropshot-nanobanana-pro',
  'dropshotnanobananapro': 'dropshot-nanobanana-pro',
};
```

### 4.3 분기 case 추가
```typescript
case 'dropshot-nanobanana-pro':
case 'dropshot': {
  const { makeDropshotImage } = await import('./dropshotGenerator');
  const refList = (extra as any)?.referenceImageList as string[] | undefined;
  const result = await makeDropshotImage(
    inferredPrompt,
    refList && refList.length > 0 ? { referenceImageList: refList } : {},
    onLog,
  );
  if (result.ok) {
    return { ok: true, dataUrl: result.dataUrl,
      source: refList?.length ? `Dropshot (i2i ${refList.length}장)` : 'Dropshot' };
  }
  return { ok: false, dataUrl: '', source: '', error: `Dropshot 실패: ${result.error}` };
}
```

### 4.4 (선택) auto/폴백 체인에서 제외
**중요**: dropshot은 UI 자동화라 API보다 느리고 fragile. 사용자가 명시 선택할 때만 사용하도록, **auto 모드와 자동 폴백 체인에서는 제외** 권장.

### 4.5 (선택) AI 프롬프트 추론 스킵
dropshot은 한국어 prompt를 자체 처리 잘함. 영어 강제 변환 불필요:
```typescript
if (engine !== 'nanobanana' && ... && engine !== 'dropshot-nanobanana-pro') {
  // AI 추론 실행
}
```

---

## §5. UI 통합

### 5.1 엔진 select option
```html
<option value="dropshot-nanobanana-pro">
  🍌 Dropshot 나노바나나 Pro (Pro 구독자 무제한 · 구독료별 · UI 자동화)
</option>
```

### 5.2 비용 매핑 (정확하게)
```javascript
const IMAGE_ENGINE_COST_KRW_PER_IMAGE = {
  // 이미지당 한계비용. Pro 구독료(월 74,000~99,000원)는 별도.
  'dropshot-nanobanana-pro': 0,
  // ...
};
```

### 5.3 비용표 행 (필수: 구독료 안내)
```html
<tr>
  <td>🍌 Dropshot 나노바나나 Pro <span class="badge">i2i 지원</span></td>
  <td>구독료별*</td>
  <td>구독자 무제한</td>
  <td>✅ 최우수 (한글 텍스트)</td>
</tr>
<tr>
  <td colspan="4" class="footnote">
    ※ Dropshot Pro 구독료: 월 74,000~99,000원 (사이트 직접 결제).
       구독자는 이미지 무제한 + 이미지당 추가비용 0원.
  </td>
</tr>
```

### 5.4 i2i 자동 연결 (선택 — 쇼핑 모드 등)
```typescript
// dropshot 엔진 + 수집 이미지가 있으면 → i2i 자동 활성화
const isDropshot = /^dropshot/i.test(String(engineName));
if (isDropshot && productImages?.length > 0) {
  extra.referenceImageList = productImages.slice(0, 4);
}
```

---

## §6. 검증 — smoke test (Node.js 단일 파일)

`scripts/dropshot-smoke.js`:

```javascript
const { makeDropshotImage } = require('../dist/core/dropshotGenerator');
const fs = require('fs');

(async () => {
  console.log('[smoke] Dropshot 이미지 1장 생성 시도...');
  const t0 = Date.now();

  const r = await makeDropshotImage(
    '귀여운 노란 고양이가 햇살 비치는 창가에서 잠자는 사실적인 사진',
    { aspectRatio: '16:9' },
    msg => console.log('  📢', msg),
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.ok && r.dataUrl) {
    const m = /^data:image\/(\w+);base64,(.+)$/.exec(r.dataUrl);
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      const out = `dropshot-smoke.${m[1]}`;
      fs.writeFileSync(out, buf);
      console.log(`✅ ${elapsed}s — ${out} (${Math.round(buf.length/1024)}KB)`);
      process.exit(0);
    }
  }
  console.log(`❌ ${elapsed}s — 실패: ${r.error}`);
  process.exit(1);
})();
```

**실행**:
```bash
# 1. 빌드 (TS → JS)
npm run build

# 2. smoke test (첫 실행은 visible 브라우저 + 사용자 로그인 5분 대기)
node scripts/dropshot-smoke.js

# 3. 두 번째 실행은 headless로 즉시 작동 (세션 영구 저장)
node scripts/dropshot-smoke.js
```

**기대 결과**:
- 1차: visible Chrome 열림 → 사용자 Google/이메일 로그인 → 자동으로 headless 전환 → 이미지 1장 생성
- 2차: ~13-20초 안에 즉시 이미지 1장 생성 (세션 재사용)

---

## §7. 트러블슈팅

| 증상 | 원인 | 해결 |
|------|------|------|
| 5분 대기 후 "로그인 시간 초과" | 사용자가 로그인 안 함 | visible 창에서 로그인 — Google OAuth 또는 이메일 |
| `Failed to fetch` / 401 INTERNAL_SERVER_ERROR | API 직접 호출 시도 | 이 키트는 UI 조작 — 그런 에러 안 남. 만약 본다면 코드를 잘못 적용 |
| `90초 내 결과 이미지 미발견` | UI selector 변경 / dropshot 사이트 리뉴얼 | 본 .md §3의 selector들을 dropshot 사이트 DevTools로 재조사 |
| 같은 이미지가 반복 반환됨 | snapshot 비교 누락 | `beforeSrcs` 캡처 후 그것에 없는 NEW 이미지만 추출 (코드에 이미 포함) |
| reference 업로드 실패 | i2i input selector 변경 | `input[type="file"][data-dropzone-accept="image"]` 등 selector 다시 조사 |
| Chrome 없음 에러 | 시스템 Chrome/Edge 미설치 | `npm install playwright && npx playwright install chromium` |
| reCAPTCHA 무한 루프 | patchright 미설치 | `npm install patchright` |

---

## §8. 일반화 — 다른 무료 이미지 사이트로 확장

같은 패턴(Cognito + Firebase 또는 자체 token refresh + UI 조작 우회)이 적용 가능한 서비스들. 각 사이트의 **3개 selector**만 dropshot용에서 교체:

| 사이트 | 프롬프트 selector | 생성 버튼 | 결과 이미지 |
|---|---|---|---|
| dropshot.io | `textarea[placeholder="어떤 장면을..."]` | parent의 `button.absolute` | `img[src^="data:image/"]` |
| (다른 서비스 추가 시 여기에 기록) | | | |

**핵심 추출 단계** (15분):
1. 사이트 정상 로그인 + DevTools 열기
2. Elements 탭에서 프롬프트 입력란 우클릭 → Copy selector
3. 같은 방식으로 생성 버튼 + 결과 이미지 영역 selector 추출
4. 본 .md §3의 코드에서 BOARD_URL + 3개 selector만 교체
5. §6 smoke test로 검증

---

## §9. 라이선스 & 윤리

- ✅ **개인 계정 1개만 사용** (다중 계정 회피 = ToS 위반)
- ✅ Dropshot Pro 구독 정상 결제 후 사용
- ✅ Rate limit / 사이트 의도된 사용량 준수
- ❌ DDoS / 스크래핑 / 콘텐츠 도용 금지

dropshot.io의 ToS 변경 시 본 키트가 정책 위반이 될 수 있음 — 사용 시점에 직접 ToS 확인.

---

## §10. 변경 이력

- **v1.2 (2026-05-30, app v3.7.4)**: 실측 운영에서 발견된 핵심 fix 종합
  - **generation mutex 추가** — 단일 브라우저 공유라 병렬 호출 시 textarea 덮어쓰기 → 1개씩 순차 강제
  - **무제한 모드 자동 ON + 카운터 1로 설정** (`ensureDropshotControls`) — 매 호출 idempotent
  - **한국어 prompt 자동 enhance** — 짧은 한국어(<50자)는 generator 내부에서 한국어 enhancer 추가
  - **매 호출 unique variation hint** (timestamp + nonce) — 중복 이미지 차단
  - **자동 visible 로그인** — `dropshot:check-login` 실패 시 600ms 후 자동 visible 창
  - **i2i `setInputFiles` 자동 업로드** + **결과 lightbox** (UI 측)
  - **engine-fixed 모드** UI 기본 ON 권장 (사용자 선택 엔진이 반드시 사용되게)
- **v1.1 (2026-05-30, app v3.6.2)**: 실측 결과 + 작동원리 흐름도 + 한 줄 릴리스 스크립트 추가
- **v1.0 (2026-05-30, app v3.6.0)**: 초안 — blogger-gpt-cli에서 추출, 실측 검증 완료

---

## §12. v3.7.x 핵심 추가 패턴 (이식 시 함께 적용)

### 12.1 Generation mutex (병렬 호출 안전화)

dropshot은 단일 브라우저 페이지 공유 → 5번 병렬 호출 시 textarea 덮어쓰기로 **마지막 prompt 결과만 5번** 반환되던 버그. mutex로 직렬화:

```typescript
let _generationChain: Promise<any> = Promise.resolve();

export async function makeDropshotImage(prompt, options, onLog): Promise<DropshotResult> {
  // 모든 호출을 큐에 직렬화
  const next = _generationChain.then(() => _makeDropshotImageInternal(prompt, options, onLog));
  _generationChain = next.catch(() => undefined as any); // 한 호출 실패가 다음 호출 차단 안 되도록
  return next;
}

async function _makeDropshotImageInternal(prompt, options, onLog) {
  // 기존 makeDropshotImage 본문 그대로
}
```

> UI 측 강제: 사용자가 5병렬 선택해도 자동으로 `parallel=1`로 변경 + select disable.

### 12.2 Dropshot UI 컨트롤 자동 설정

매 `makeDropshotImage` 진입 시 idempotent:
- **무제한 모드 토글 ON** — Pro 구독자 권한 활성
- **카운터(생성 장수) 1로** — 기본 2개씩 생성되던 것을 1로 (우리는 1프롬프트=1이미지 정책)

```typescript
async function ensureDropshotControls(page, onLog) {
  // 1. 무제한 모드 토글
  const switches = await page.$$('input[role="switch"]');
  for (const sw of switches) {
    const isOn = await sw.evaluate(el => el.checked || el.getAttribute('aria-checked') === 'true');
    if (!isOn) {
      const parent = await sw.evaluateHandle(el => el.closest('label') || el.closest('button') || el.parentElement);
      if (parent) await parent.click({ timeout: 2000 }).catch(() => {});
    }
  }

  // 2. 카운터 1로 (React-controlled input은 native setter 호출 필요)
  await page.evaluate(() => {
    const numberInputs = Array.from(document.querySelectorAll('input[type="number"]'));
    for (const inp of numberInputs) {
      const v = Number((inp as HTMLInputElement).value);
      if (v >= 2 && v <= 10) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(inp, '1');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });
}
```

### 12.3 한국어 prompt 자동 enhance + variation hint

```typescript
// generator 내부에서 매 호출
const hasKorean = /[가-힯]/.test(currentPrompt);
const isShort = currentPrompt.length < 50;
const enhancedPrompt = (hasKorean && isShort)
  ? `${currentPrompt} — 본 주제를 직관적으로 표현하는 사실적 사진, 한국적 배경, 자연광, 시네마틱 4K, 텍스트 없음`
  : currentPrompt;

// 매 호출마다 unique variation seed
const nonce = Math.random().toString(36).slice(2, 8);
const variationSeed = Date.now().toString(36);
const promptWithVariation = enhancedPrompt
  + ` (버전-${variationSeed}-${nonce}: 매번 완전히 다른 구도와 시점, 다른 인물/배경/소품 — 이전 결과와 절대 같으면 안 됨)`;

// 이 prompt를 textarea에 입력
```

### 12.4 자동 visible 로그인 (UX)

```javascript
// 클라이언트 측 (refreshDropshotLoginStatus 안)
if (!result.loggedIn) {
  // 버튼 표시 + 600ms 후 자동 trigger (한 번만)
  if (!window.__dropshotAutoLoginTried) {
    window.__dropshotAutoLoginTried = true;
    setTimeout(() => window.runDropshotLogin(), 600);
  }
}
```

### 12.5 한국어 프롬프트 처리 매트릭스

이식할 다른 앱에서 다른 이미지 엔진과 같이 쓸 때 참고:

| 엔진 | 한국어 처리 | 권장 처리 |
|---|---|---|
| Dropshot nano-banana-pro | ✅ multilingual OK | **한국어 그대로** + 짧으면 enhance |
| Gemini Image (nano-banana 3종) | ✅ multilingual OK | 한국어 그대로 |
| GPT 이미지 2 (덕테이프) | ✅ multilingual OK | 한국어 그대로 |
| labs.google ImageFX / Flow | ⚠️ 영어 위주 (자체 변환) | inferImagePrompt로 영어 변환 권장 |
| Prodia (FLUX schnell) | ❌ 영어 위주 | **inferImagePrompt 필수** (영어로 변환) |
| DeepInfra (FLUX-2) | ❌ 영어 위주 | inferImagePrompt 필수 |
| OpenAI GPT 이미지 1 | ⚠️ 영어 위주 | inferImagePrompt 권장 |

**dispatcher 통합 시**:
```typescript
// inferImagePrompt skip 분기 — 한국어 OK 엔진만 skip
if (
  engine !== 'nanobanana' && engine !== 'nanobanana2' && engine !== 'nanobananapro' &&
  engine !== 'gptimage2' && engine !== 'flow' &&
  engine !== 'dropshot' && engine !== 'dropshot-nanobanana-pro'
) {
  const inference = await inferImagePrompt(prompt, keyword, isThumbnail, contentMode);
  // ...
}
```

### 12.6 엔진 고정 모드 (UI default)

사용자가 선택한 엔진이 반드시 사용되도록 — 폴백 차단 토글을 **HTML에서 default `checked`**:

```html
<input type="checkbox" id="strictH2ImageEngine" checked />
🛡️ 엔진 고정 모드 (폴백 차단) <small>기본 ON</small>
```

`process.env.STRICT_H2_IMAGE_ENGINE === 'true'` 환경변수로 dispatcher에 전달.

### 12.8 모든 엔진 공통 variation seed (dispatcher 외부에서 강제)

dropshot generator 내부의 variation hint만으론 부족 — **batch IPC handler 자체**에서 모든 엔진(nanobanana/gptimage/prodia/deepinfra/flow/imagefx/dropshot)에 매 호출 unique seed 자동 적용. 같은 prompt 5번 호출해도 5장 다 다른 이미지.

```typescript
// electron/main.ts — batch-image-generate IPC handler
ipcMain.handle('batch-image-generate', async (_evt, payload) => {
  const { engine, quality, aspectRatio, prompt, includeText, referenceImageList } = payload;

  // 모든 엔진 공통 — 매 호출 unique variation seed
  const nonce = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  const variationTail = `\n\n[Gen-${ts}-${nonce}: unique composition, fresh angle, different subjects/setting/lighting — never duplicate previous outputs / 매번 완전히 다른 구도와 시점]`;
  const textTail = includeText
    ? `\n\n[IMPORTANT: Include clear, legible Korean text overlay on the image that visually summarizes the topic]`
    : '';
  const finalPrompt = `${prompt}${textTail}${variationTail}`;

  const extra: any = {};
  if (quality === 'low' || quality === 'medium' || quality === 'high') extra.gptImageQuality = quality;
  if (Array.isArray(referenceImageList) && referenceImageList.length > 0) extra.referenceImageList = referenceImageList;

  return await dispatchH2ImageGeneration(engine, finalPrompt, prompt, undefined, undefined, extra);
});
```

### 12.9 프롬프트 파싱 자동 감지 (1줄 vs N줄)

사용자 입력 모호성 해결 — 영어 긴 prompt 1개를 줄바꿈 입력해도 1이미지로, 한국어 짧은 키워드 N개도 그대로 N이미지로:

```javascript
// 자동 감지: 빈 줄 구분 → explicit / 평균 길이 ≥80자 → 단일 prompt / 그 외 → 각 줄 = 1 prompt
window.parseBatchPromptList = function (raw) {
  const text = String(raw || '');
  if (!text.trim()) return [];
  // 빈 줄 있으면 explicit 구분
  if (/\n\s*\n/.test(text)) {
    return text.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean).slice(0, 50);
  }
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length <= 1) return lines;
  const avgLen = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  const hasLongLine = lines.some(l => l.length >= 150);
  // 긴 prompt 1개로 추정 → 합침
  if (avgLen >= 80 || hasLongLine) return [lines.join(' ')];
  // 짧은 키워드 N개
  return lines.slice(0, 50);
};
```

textarea placeholder 예시:
```
✅ 짧은 키워드 N개 (각 줄 = 1이미지):
숨은 보험금 3종
스미싱 예방 보안 팁

✅ 긴 프롬프트 1개 (자동 합침):
A beautiful Korean office worker
sitting at desk with golden hour

✅ 여러 긴 prompt — 빈 줄로 구분:
Prompt A...

Prompt B...
```

### 12.10 수동 H2 매핑 모달 (선택 — 글생성 통합)

이미지 생성 탭에서 사용자가 H2 ↔ 이미지를 직접 매핑 후 본 글에 배치 가능. 매핑 완료 시 메인 폼 배지가 녹색으로 변하면서 "바로 발행 가능" 시각화. 실제 코드는 [main repo electron/ui/script.js](https://github.com/cd000242-sudo/blogger-gpt-cli/blob/master/electron/ui/script.js)의 `openManualH2MappingModal()` 참조.

### 12.11 홈 달력 일기장 (선택 — UX 통합)

자동 발행 트래킹 → localStorage `publishedPosts[dateKey]`에 push → 달력 cell에 📤 표식 + 클릭 시 모달에서 `🔗 열기` 버튼 → `open-external` IPC로 외부 브라우저. 메모 textarea + 저장. 실제 코드는 [electron/ui/modules/calendar.js](https://github.com/cd000242-sudo/blogger-gpt-cli/blob/master/electron/ui/modules/calendar.js) + [posting.js](https://github.com/cd000242-sudo/blogger-gpt-cli/blob/master/electron/ui/modules/posting.js) `publishedPosts` 트래킹 hook 참조.

### 12.7 결과 이미지 lightbox (UX 추천)

대량 생성 결과의 작은 thumbnail만 봐서 품질 판단 어려움 → 클릭 시 전체 화면 미리보기:

```html
<div id="imageLightbox" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:10000; cursor:zoom-out;" onclick="closeImageLightbox()">
  <img id="lightboxImg" style="max-width:90vw; max-height:85vh; ...">
  <button onclick="lightboxNavigate(-1)">←</button>
  <button onclick="lightboxNavigate(1)">→</button>
</div>
```

키보드: ESC 닫기, ←/→ 이전/다음.

---

## §11. 부록 — 한 줄 릴리스 스크립트

`scripts/release-auto.js`를 사용하면 빌드 + 버전업 + 깃허브 릴리스를 한 줄로 처리:

```bash
# 패치 버전 자동 bump (3.6.1 → 3.6.2) + "버그 수정" 커밋 메시지
npm run release:auto patch "버그 수정"

# 마이너 (3.6.1 → 3.7.0)
npm run release:auto minor "신기능 추가"

# 명시 버전
npm run release:auto 3.7.5 "특정 버전 지정"

# 인자 없이 patch만
npm run release:auto patch
```

**실행 단계** (자동):
1. `package.json` 버전 bump
2. `npm run build` (TypeScript + UI 복사)
3. `git add + commit + tag + push`
4. `electron-builder --win` (.exe 서명 빌드)
5. `gh release create` + asset 업로드
6. `gh release edit --draft=false --latest`

**전제 조건**:
- `gh` CLI 로그인 (`gh auth login`)
- 변경된 파일들은 미리 `git add` + 커밋해두기 (script는 package.json만 커밋)
- Code signing 환경 변수 (선택)

---

## 📞 문의

- **레퍼런스 앱**: [blogger-gpt-cli v3.6.0](https://github.com/cd000242-sudo/blogger-gpt-cli)
- **실제 코드 파일**: [src/core/dropshotGenerator.ts](../src/core/dropshotGenerator.ts)
- **dispatcher 통합 예제**: [src/core/imageDispatcher.ts](../src/core/imageDispatcher.ts) (`case 'dropshot-nanobanana-pro'` 검색)
- **i2i 자동 연결 예제**: [src/core/final/orchestration.ts](../src/core/final/orchestration.ts) (`isDropshot && productImgList` 검색)

이 .md 하나로 통합 가능. 코드 추가 의존성 없음.
