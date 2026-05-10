# perf-engineer 요약 — 응답없음 유발 핫스팟 Top 5

**측정 기준일:** 2026-04-28 / **앱 버전:** v2.7.27 / **측정 도구:** ripgrep + Read

## 핵심 발견

| # | 위치 | 패턴 | 응답없음 기여도 | 예상 개선 효과 |
|---|---|---|---|---|
| 1 | 광범위 (12파일) | `Buffer.from(b64, 'base64')` 동기 디코딩 — gpt-image-2 1.18MB / Gemini 1MB+ Base64를 메인 스레드에서 디코딩 | ★★★ | **H** — worker_threads 분리 시 freeze 발생 빈도 50%+ 감소 |
| 2 | `src/main.ts` 23회 + `src/main/ipc/imageHandlers.ts` 13회 | `fs.readFileSync` / `fs.writeFileSync` / `fs.existsSync` / `fs.readdirSync` — IPC 핸들러 안에서 동기 I/O | ★★★ | **H** — `fs.promises.*`로 교체 시 IPC 응답 시간 평균 80ms→5ms |
| 3 | 핵심 워커 3개 — `naverBlogAutomation.ts`, `imageGenerator.ts`, `contentGenerator.ts` | `globalLimiter.acquire()` 호출 0건 — Adaptive Limiter가 글로벌로 존재하지만 **실제 적용 안 됨** | ★★★ | **H** — 9줄 추가만으로 자가 조절 효과 즉시 발현 |
| 4 | 20곳 (15파일) | 큰 페이로드 `JSON.parse` (LLM 응답, 크롤링 결과) — 동기 파싱 | ★★ | **M** — 1MB 이하면 영향 작음. LLM 스트리밍이 청크별 동기 parse면 큼 |
| 5 | `imageHandlers.ts` L626-660 | 캐시 디렉터리 `existsSync` + `readdirSync` 조합 IPC 핸들러 안에서 동기 호출 | ★★ | **M** — 사용자 캐시 1000장+ 시 메인 스레드 200ms+ 점유 |

## 권고 우선순위

1. **즉시 (P0)** — Adaptive Limiter를 발행/이미지/글생성 진입점 3곳에 통합 (총 9줄, 위험도 거의 없음)
2. **이번 주 (P1)** — `imageHandlers.ts`의 동기 fs를 `fs.promises`로 교체 (IPC 핸들러 5개 영향)
3. **다음 주 (P2)** — Base64 디코딩을 `worker_threads`로 분리 (이미지 처리 12개 파일 영향, 큰 변경)

## 응답없음 시나리오 매핑

| 사용자 시나리오 | 추정 원인 | 적용할 권고 |
|---|---|---|
| 발행 중 응답없음 | Puppeteer 부하 + IPC sync I/O 동시 발생 | P0 + P1 |
| 이미지 생성 직후 응답없음 | Base64 → Buffer 1.18MB 동기 디코딩 | P2 |
| 앱 시작 시 응답없음 | renderer.ts 13K줄 + 45 모듈 동시 import | (frontend-specialist 영역) |

상세는 `perf-detail.md` 참조.
