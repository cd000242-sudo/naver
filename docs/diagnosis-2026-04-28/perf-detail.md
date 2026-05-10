# perf-engineer 상세 보고서

**측정일:** 2026-04-28 / **앱:** Better Life Naver v2.7.27

## 1. 메인 스레드 동기 I/O 핫스팟

| 파일 | Sync 호출 횟수 | 위험 위치 (대표) |
|---|---|---|
| `src/main.ts` | 23 | L13 startup log, L382 debug log, L1836·L1884·L2023 LEWORD 버전, L4930·L4941 GIF 변환 |
| `src/main/ipc/imageHandlers.ts` | 13 | L73-96 캐시 디렉터리 스캔, L626-660 번들 이미지 검색, L909·L946·L996·L1091 |
| `src/image/imageFxGenerator.ts` | 17 | (별도 점검 필요 — 17회는 상위) |
| `src/main/ipc/systemHandlers.ts` | 12 | (별도 점검 필요) |
| `src/__tests__/verifyPreviousWork.test.ts` | 12 | (테스트 파일, 영향 없음) |

**총 219회** sync I/O — 전체 50개 파일에 분포.

### 권고
- **P1**: `src/main/ipc/imageHandlers.ts`의 13회를 `fs.promises.{access,readdir,readFile,writeFile}`로 우선 교체. IPC 핸들러는 메인 메시지 큐를 직접 막으므로 효과가 크다.
- **P2**: `src/main.ts`의 23회 중 startup-only(L13, L382)는 그대로 둬도 되나, runtime에서 호출되는 LEWORD 버전 동기 R/W는 비동기로 교체.

## 2. Base64 디코딩 (worker 분리 후보)

| 파일 | 용도 |
|---|---|
| `src/image/nanoBananaProGenerator.ts` | Gemini 응답 Base64 (1MB+) |
| `src/image/openaiImageGenerator.ts` | gpt-image-2 응답 Base64 (1.18MB) |
| `src/main/services/BlogExecutor.ts` | (이미지 후처리) |
| `src/main/ipc/imageHandlers.ts` | (이미지 IPC) |
| `src/image/imageFxGenerator.ts` | (ImageFX 응답) |
| `src/image/deepinfraGenerator.ts` | (DeepInfra 응답) |
| `src/automation/imageHelpers.ts` | (자동화 이미지 디코딩) |

총 **12개 파일**에서 Base64→Buffer 변환. 전부 메인 스레드.

### 권고
- **P2 worker_threads**: `src/runtime/imageDecoderWorker.ts` 신규 → Base64 디코딩 + Sharp 후처리(EXIF 제거, 리사이즈)를 모두 워커에서 수행. 메인 스레드는 결과 Buffer만 받음.
- 효과: 1.18MB Base64 디코딩이 메인 스레드 ~120ms 점유 → 워커 분리 시 0ms.

## 3. JSON.parse 핫스팟

총 20회 (15파일). 대부분 작은 페이로드(설정·캐시) — **응답없음 직접 원인 가능성 낮음**.

주의 대상:
- `src/contentGenerator.ts` (3회) — LLM 응답 파싱. 응답 토큰 8K+면 부담 있음
- `src/gemini.ts` (2회) — Gemini 응답 파싱
- `src/crawler/productSpecCrawler.ts` (2회) — 크롤링 결과 (상품 페이지 큰 HTML)

### 권고
- **P2**: LLM 응답 파싱은 그대로 둬도 OK (수십 KB 정도). 단, 스트리밍 청크별 동기 parse가 발생하면 `setImmediate` 양보 추가.

## 4. Adaptive Limiter 통합 권고 (P0, 즉시)

`globalLimiter.acquire()`를 호출하는 파일은 현재 **0개**. 적용 권고 위치:

```typescript
// src/naverBlogAutomation.ts — runOnce 진입점 직전
import { globalLimiter } from './runtime/adaptiveLimiter.js';
async run(opts: RunOptions) {
  const release = await globalLimiter.acquire('publish');
  try {
    return await this.runImpl(opts);
  } finally {
    release();
  }
}

// src/imageGenerator.ts — generateImages 진입점
import { globalLimiter } from './runtime/adaptiveLimiter.js';
export async function generateImages(opts: GenerateImagesOptions) {
  const release = await globalLimiter.acquire('image');
  try {
    return await generateImagesImpl(opts);
  } finally {
    release();
  }
}

// src/contentGenerator.ts — generateStructuredContent 진입점
import { globalLimiter } from './runtime/adaptiveLimiter.js';
export async function generateStructuredContent(...) {
  const release = await globalLimiter.acquire('content');
  try {
    return await generateStructuredContentImpl(...);
  } finally {
    release();
  }
}
```

**총 9줄. 위험도: 거의 없음.** 응답없음 발생 시 자동으로 동시성 다운, 회복 시 다시 업.

## 5. 미점검 영역

- Sharp 동기 호출 패턴 (5파일 후보) — `imageFormatPipeline.ts` 등에서 `.toBufferSync` 같은 동기 호출 여부
- Puppeteer/Playwright 동시 인스턴스 수 (현재 코드에 동시성 가드 있는지)
- 스케줄러 setInterval 누적 (`src/scheduler/`)

→ Phase 2 또는 별도 보강에서 점검 권고.

## 6. 우선순위 로드맵

| 우선 | 작업 | 변경량 | 예상 효과 |
|---|---|---|---|
| **P0** | Adaptive Limiter 통합 (3파일 9줄) | XS | 응답없음 회복 자동화 |
| **P1** | imageHandlers.ts 동기 fs → fs.promises | S | IPC 응답시간 80→5ms |
| **P2** | Base64 디코딩 worker_threads 분리 | M | 이미지 직후 freeze 제거 |
| **P3** | 12개 이미지 파일 일괄 정리 | L | 장기 유지보수성 |
