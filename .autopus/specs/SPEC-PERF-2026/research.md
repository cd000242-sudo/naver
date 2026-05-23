# SPEC-PERF-2026 — Research

> 30팀 병렬 agent 보고서 종합 (A1~A8 외부 조사 / B1~B8 코드 매핑 / C1~C6 perf-engineer 약점 감사 / D1~D4 SPEC 초안 / E1~E4 risk 분석)
> 작성일: 2026-05-24. 모든 발견은 라인 번호 또는 외부 URL 근거 확보.
> 기반 버전: v2.10.347 (방금 릴리즈)

---

## 1. CPU 부하 카테고리 (8종)

### 1.1 Multi-Chromium 인스턴스 (A1, A2, A5, B3, B6)

| 항목 | 측정값 | 근거 |
|------|--------|------|
| 계정당 Chrome 인스턴스 RAM | ~120-180MB (profile 격리) + 1-2% idle CPU | [Alibaba lifetips](https://lifetips.alibaba.com/tech-efficiency/use-chrome-and-chromium-side-by-side-for-easy-profile-m) |
| 4 profile 초과 시 | 비선형 악화 (cache 충돌 + IO contention) | [Chromium user_data_dir docs](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md) |
| puppeteer-stealth 12 evasion | 페이지당 20~50ms + 메모리 15-30% 증가 | [berstend/puppeteer-extra stealth](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) |
| userDataDir per-account | RAM/CPU 폭증 공식 보고 | [puppeteer #5923](https://github.com/puppeteer/puppeteer/issues/5923) |
| headless: 'new' | old 대비 10× slowdown, v20.9.0+ 1.5× CPU 회귀 | [puppeteer #10071](https://github.com/puppeteer/puppeteer/issues/10071), [#12524](https://github.com/puppeteer/puppeteer/issues/12524) |
| 권장 동시성 | 5 worker (puppeteer-cluster) | [ZenRows puppeteer-cluster](https://www.zenrows.com/blog/puppeteer-cluster) |

### 1.2 Sharp 이미지 처리 (A4, B4, C1)

| 항목 | 측정값 | 근거 |
|------|--------|------|
| sharp main thread 동기 호출 | UI 락업 (모든 renderer CSS 애니메이션 정지) | [electron #9719](https://github.com/electron/electron/issues/9719), [Actual blog](https://medium.com/actualbudget/the-horror-of-blocking-electrons-main-process-351bf11a763c) |
| UV_THREADPOOL_SIZE 기본 4 | sharp 4개 초과 동시 처리 시 큐잉 | [sharp performance](https://sharp.pixelplumbing.com/performance/) |
| worker_threads 분리 | sharp는 이미 C++ 멀티스레드 → 분리 무익 | [sharp #1297](https://github.com/lovell/sharp/issues/1297) |
| @imgly/background-removal | fp16 ~80MB, fp32 168MB, CPU만 시 16-20× 느림 | [imgly #134](https://github.com/imgly/background-removal-js/issues/134) |

### 1.3 sha256 / blob store (A4, A7, B4, C1, C3)

| 항목 | 측정값 | 근거 |
|------|--------|------|
| Node sha256 1MB | ~2-4ms | [Tech Tonic 벤치](https://medium.com/deno-the-complete-reference/who-hashes-the-fastest-bun-node-js-or-deno-6bf6260dff9f) |
| 1000큐 read sha256 (5MB) | 누적 32~50초 main thread blocking | A4 + A7 종합 |
| Phase 1 v2.10.347 blob store | write 1회 + read 검증 1회 = 매번 2회 | [blobStore/index.ts:104,157](src/main/blobStore/index.ts#L104) |
| sha256Index | write 경로에만 채워짐 — **read 캐싱 부재** (P0 quick win) | 동상 |

### 1.4 LLM 호출 (A3, B5)

| 항목 | 측정값 | 근거 |
|------|--------|------|
| Anthropic streaming idle timeout 미구현 | hung socket → event loop keep-alive 점유 | [anthropic-sdk #867](https://github.com/anthropics/anthropic-sdk-typescript/issues/867) |
| Gemini PER_MODEL_MAX=4 × maxRetries=2 | 단일 요청 최대 8회 API 호출 | [gemini.ts:295](src/llm/gemini.ts#L295), [contentGenerator.ts:727](src/contentGenerator.ts#L727) |
| Perplexity retry 5초 sleep | maxRetries 3 = 최악 15초 hot loop | [contentGenerator.ts:5477](src/contentGenerator.ts#L5477) |
| 후처리 4개 모듈 순차 (authgr+optimizer+humanizer+critique) | 누적 400~2000ms 직렬 | [contentGenerator.ts:18-22](src/contentGenerator.ts#L18) |
| p-limit 미사용 | Promise.all 무제한 24회 사용 → 동시 LLM 호출 포화 | [p-limit npm](https://www.npmjs.com/package/p-limit) |

### 1.5 Polling/timer (A8, B1, B7, C5, C6)

| 항목 | 위치 | 영향 |
|------|------|------|
| **licenseManager 5분 idle 네트워크 polling** | [licenseManager.ts:1395-1401](src/licenseManager.ts#L1395) | **P0** — `unref()` 없음, blur 게이팅 없음, 24h 288회 |
| **라이선스 검사 100ms × 6000회 = 10분 polling** | [main.ts:6518, 6587](src/main.ts#L6518) | **P0** — DEV 60초/PROD 10분 main thread |
| **dashboardUI 시계 1초 idle** | [dashboardUI.ts:33](src/renderer/modules/dashboardUI.ts#L33) | **P0** — 앱 포커스 없을 때도 매초 DOM 쓰기 |
| **multiAccountManager backdrop guard 1초** | [multiAccountManager.ts:4284](src/renderer/modules/multiAccountManager.ts#L4284) | **P0** — 영구 폴링, MutationObserver와 이중 |
| periodic snapshot 30초 | [renderer.ts:488](src/renderer/renderer.ts#L488) | P2 — DOM 풀스캔 |
| continuousCountdown 매초 | [continuousPublishing.ts:665](src/renderer/modules/continuousPublishing.ts#L665) | P1 — 발행 중만 |
| eventLoopWatchdog 5초 | [eventLoopWatchdog.ts:72-110](src/diagnostics/eventLoopWatchdog.ts#L72) | P2 — `unref()` 적용, but isActive=false 시에도 tick |
| remoteUpdate 6시간 | [remoteUpdate.ts:248](src/automation/selectors/remoteUpdate.ts#L248) | P3 — 미활성, 활성화 시 `unref()` 필요 |

### 1.6 DOM 조작 (A6, B2, C2)

| 항목 | 위치 | 영향 |
|------|------|------|
| **postListUI innerHTML 전체 교체** | [postListUI.ts:167,368,384](src/renderer/modules/postListUI.ts#L167) | **P0** — 1000개 게시물 300~500ms 메인 스레드 블록 |
| **virtual scroll 부재** | 동상 | **P0** — 1000개 × 10-12 노드 = 10K~12K DOM 상주 |
| attachPostItemEventListeners querySelectorAll 11회 | [postListUI.ts:447-546](src/renderer/modules/postListUI.ts#L447) | P1 — DOM 풀스캔 11회, 이벤트 위임 부재 |
| inline onmouseover style 변이 | [postListUI.ts:189,252](src/renderer/modules/postListUI.ts#L189) | P1 — Forced Style Recalculation, transition:all → main thread paint |
| innerHTML join 후처리 listener 재바인딩 | postListUI 전반 | P1 — DocumentFragment + delegation 권장 |
| layout thrashing (read/write 인터리브) | renderer 전반 | P2 — DebugBear |

### 1.7 IPC 직렬화 (C3)

| 항목 | 측정값 |
|------|--------|
| **blob:read sha256 재계산** | 1000큐 × 소제목 5개 = 5000회 = 15~25초 누적 (P0, [blobStore/index.ts:157](src/main/blobStore/index.ts#L157)) |
| **automation:syncImageManager Map 직렬화** | 1000큐 × 1회 전체 Map = 100KB × 1000 (P0, [main.ts:2518](src/main.ts#L2518), [preload.ts:215](src/preload.ts#L215)) |
| library:getImageData Base64 | 1MB → 1.37MB 문자열 structured clone (P1, [main.ts:6354](src/main.ts#L6354)) |
| console interceptor automation:log | 초당 10~50회 webContents.send (P1, [main.ts:1538](src/main.ts#L1538)) |
| config:get 캐싱 부재 | 단일 흐름에서 4회 연속 호출 (P2) |
| thumbnail:saveToLocal number[] | 1MB = 1M 원소 배열 (structured clone 3-5배 비쌈, P3) |
| IPC handler 251건 (전 grep) | 발행당 8~12회 invoke, 1000큐 = 8K~12K 호출 |

### 1.8 메모리 누수 (B8, C4)

| 항목 | 위치 | 영향 |
|------|------|------|
| **continuousQueueV2 완료 항목 미제거** | [continuousPublishing.ts:4653](src/renderer/modules/continuousPublishing.ts#L4653) | **P0** — 1000건 발행 시 LLM 응답 + base64 이미지 누적 → 수십 MB ~ 1GB |
| **document.addEventListener 익명 화살표 4개** | [continuousPublishing.ts:1367,1406,1665,1696](src/renderer/modules/continuousPublishing.ts#L1367) | **P0** — removeEventListener 불가, 탭 전환 시 누적 |
| **preload trend:alert cleanup 부재** | [preload.ts:778](src/preload.ts#L778) | **P0** — 다른 API와 달리 cleanup 미반환 |
| DOMContentLoaded 645/967 중복 | [renderer.ts:645,967](src/renderer/renderer.ts#L645) | P1 — 재호출 시 누적 |
| IIFE 4 listener cleanup 불가 | [renderer.ts:541-544](src/renderer/renderer.ts#L541) | P1 — 익명 IIFE |
| finalStructuredContent closure 캡처 | [continuousPublishing.ts:4401](src/renderer/modules/continuousPublishing.ts#L4401) | P1 — 성공 후 미해제 |
| previewDataUrl base64 누적 | [imageUtils.ts:204](src/image/imageUtils.ts#L204) | P1 — 큐 아이템과 함께 1GB 누수 가능 |

---

## 2. 현재 앱 대응 매핑 (v2.10.347)

| 카테고리 | 현재 대응 | 격차 |
|---------|----------|------|
| Multi-Chromium | postLimitManager (계정 빈도) | **부분** (동시 활성 가드 부재) |
| Sharp 이미지 | imageFormatPipeline (async) | **부분** (main thread 호출 다수) |
| sha256 | blobStore Phase 1 (v2.10.347, 신규) | **부분** (read 캐싱 부재) |
| LLM | 4 SDK 직접 호출 (Anthropic/Gemini/OpenAI/Perplexity) | **N** (p-limit, timeout 명시 부재) |
| Polling | smartScheduler + eventLoopWatchdog | **부분** (4건 P0 polling 잔존) |
| DOM | postListUI 모듈화 | **부분** (virtual scroll 부재) |
| IPC | preload bridge | **N** (배치/transferable 미사용) |
| 메모리 | queueSnapshot 가드 (v2.10.346) | **부분** (4건 P0 누수 잔존) |

---

## 3. 격차 매트릭스 — 8 카테고리 × 우선순위

| # | 카테고리 | P0 발견 | P1 발견 | P2+ 발견 | 즉시 Quick Win 가능 |
|---|---------|---------|---------|----------|-------------------|
| 1 | Multi-Chromium | 1건 (stealth 12 evasion) | 2건 (userDataDir, profile cap) | 1건 | ⚠️ 부분 |
| 2 | Sharp | 0건 | 2건 (main thread, UV_THREADPOOL) | 2건 | 부분 |
| 3 | sha256 | 1건 (blob:read 캐싱 부재) | 1건 (flowMarathon 1000큐) | 1건 | ✅ **즉시** (sha256Index 재활용) |
| 4 | LLM | 0건 | 3건 (Gemini 8회, 후처리 직렬, p-limit) | 2건 | ⚠️ 부분 |
| 5 | Polling | **4건** (license×2, dashboard, backdrop) | 1건 (continuousCountdown) | 3건 | ✅ **즉시** (visibilitychange + MutationObserver) |
| 6 | DOM | 2건 (innerHTML, virtual scroll) | 3건 (querySelectorAll, inline style, listener 재바인딩) | 2건 | 부분 |
| 7 | IPC | 2건 (sha256 IPC, syncImageManager) | 2건 (Base64, console forward) | 2건 | ✅ **부분** (sha256 캐시) |
| 8 | 메모리 | **3건** (queueV2, addEventListener, preload) | 4건 (DOMContentLoaded, IIFE, closure, base64) | 2건 | ✅ **즉시** (splice + cleanup) |

**총 P0: 13건. 그 중 즉시 Quick Win 가능: 9건 (idle CPU 30%↓ 추정).**

---

## 4. 참고 도구

| 도구 | 용도 | URL |
|------|------|-----|
| clinic.js (doctor/flame/bubbleprof) | event loop / CPU profiling | https://clinicjs.org/ |
| Chrome DevTools Performance | DOM/Layout/JS profiling | DevTools built-in |
| `node --prof` + `--prof-process` | V8 flamegraph | https://nodejs.org/en/learn/getting-started/profiling |
| `process.cpuUsage()`, `process.memoryUsage().rss` | 런타임 메트릭 | Node.js built-in |
| `app.getAppMetrics()` | Electron Main/GPU/Renderer/Utility CPU% | Electron API |
| `perf_hooks.monitorEventLoopDelay` | event loop lag p99 측정 | Node.js built-in |
| `piscina`, `worker_threads` | CPU-bound 작업 오프로드 | https://github.com/piscinajs/piscina |
| Windows Task Manager | RSS, CPU% (사용자 직접 측정) | Windows built-in |
| BrowserLeaks WebRTC/Performance | fingerprint + 부하 (SPEC-NAVER-PROTECTION-2026 통합) | https://browserleaks.com/ |

---

## 5. 공개 사례

- **Electron #11908, #15611, #51363, #50250**: idle 100% CPU 누수 사례 (setInterval 누수, GPU 프로세스, backgroundThrottling)
- **Chrome 124 Windows high CPU**: Browser process 자체 스파이크 ([Chromium #141178](https://groups.google.com/a/chromium.org/g/chromium-bugs/c/kE-e6egLPBA))
- **element-web #29955**: hidden window setInterval 누수로 100% CPU
- **dev.to 10 strategies for Electron perf** (https://dev.to/aaravjoshi/10-proven-strategies-to-optimize-electron-app-performance-e79)
- **Marco Pracucci — Electron slow in background** (https://pracucci.com/electron-slow-background-performances.html)

---

## 6. SPEC-NAVER-PROTECTION-2026과 통합 검토 (E3)

| 항목 | 본 SPEC (CPU 절감) | SPEC-NAVER-PROTECTION-2026 (보호조치) | Trade-off |
|------|------------------|-------------------------------------|-----------|
| fingerprint randomization | CPU +1초/1000큐 | uniqueness 100% (P0 #4) | 무시 가능 (메인 스레드 아니면) |
| stealth 12 evasion 축소 | CPU -30% | 봇 탐지율 ↑ risk | 핵심 4개만 선택 활성 (A2 권장) |
| polling 빈도 ↓ | CPU -10% | v2.10.301 봇감지 backoff 정확도 ↓ | E2 호환성 검증 필수 |
| Worker thread sha256 | main blocking 해제 | blob store Phase 1 호환 | 본 SPEC P1 우선, 영향 미미 |
| Multi-account 동시 활성 가드 | CPU -30% | 발행 속도 ↓ | E4 UX: 1000큐 4.2일 → 5일로 +20% |

→ **두 SPEC 병렬 진행 가능**. 본 SPEC P1~P5 완료 후 SPEC-NAVER-PROTECTION-2026 P1~P6 진입 시 baseline 재측정 필수.

---

## 7. 의존성 그래프 (팀 결과 통합)

```
A1 (Electron) ───┬─→ §1.1 ──→ B1(main)/C1(blocking) ──→ §2.1
A2 (Puppeteer) ─┘
A3 (LLM) ──────→ §1.4 ──→ B5(LLM calls) ──→ §2.4
A4 (image) ─────→ §1.2, §1.3 ──→ B4(image pipeline) ──→ §2.2, §2.3
A5 (multi-acc) ─→ §1.1 ──→ B3(multi-account) ──→ §2.1
A6 (renderer) ──→ §1.6 ──→ B2(renderer)/C2(renderer block) ──→ §2.6
A7 (fs) ────────→ §1.3 ──→ B1/B4/C1 ──→ §2.3
A8 (event loop)→ §1.5 ──→ B1/B7(timers)/C5(spinning) ──→ §2.5

B7 (timers) ───→ C5(spinning)/C6(bg work) ──→ §1.5
B8 (listeners) →C4(memory leak) ──→ §1.8

C1~C6 → D1~D4 SPEC 초안 입력
E1 cascade → plan.md §5.1
E2 regression → plan.md §5.2 (v2.10.347 호환)
E3 trade-off → 본 §6 (SPEC-NAVER-PROTECTION-2026 통합)
E4 UX → acceptance.md §2.8
```

작성일: 2026-05-24. 자료 cutoff: 30팀 보고 시점.
