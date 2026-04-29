# 사용자 노출 에러 메시지 점검 요약 (v2.7.40)

조사 일자: 2026-04-29
조사 범위: `src/` 268+ 파일 — `throw new Error`, `appendLog`, `toastManager.error/warning`, `mainWindow.webContents.send('log-message')`

## 전체 통계

- `throw new Error(...)`: **494건 / 79개 파일**
- `appendLog(...)`: **867건 / 33개 파일** (renderer.ts 117건, continuousPublishing.ts 93건, fullAutoFlow.ts 160건 등 집중)
- `toastManager.error/warning(...)`: **283건 / 26개 파일**
- 총 **1,644건**의 사용자-노출 또는 잠재 노출 메시지

## 카테고리별 분포 (대략치)

| 카테고리 | 파일 / 메시지 수 | 주요 결함 |
|---|---|---|
| 이미지 생성(이미지FX/Flow/Gemini/Leonardo/DeepInfra/OpenAI) | 9파일 / ~150 | 영문 코드(FLOW_*, HTTP_*) 노출, AdsPower 기술용어 직접 노출 |
| 발행/네이버 자동화 | 3파일 / ~120 | 동일/유사 메시지 중복(60+) — `발행이 완료되지 않았습니다` 등이 5곳 |
| 글 생성(AI 엔진) | 3파일 / ~100 | "원인 불명", "빈 응답", "품질 기준 미달" 등 모호 메시지 |
| Anthropic/OpenAI/Gemini/Perplexity | 4파일 / ~80 | 키 미설정 메시지는 양호. 단 "모델 사용 불가", "마지막 오류: …" 그대로 노출 |
| 네트워크/크롤러 | 7파일 / ~80 | `HTTP ${status}`, `Access Denied`, `ENOENT` 그대로 노출 |
| 라이선스/예약/스케줄 | 4파일 / ~30 | 양호한 한글이지만 원인이 추상적 |
| 분석(metrics/flag) | 2파일 / ~10 | 영문 그대로(`appendMetric: postId is required`) — 내부용이지만 throw |
| 기타(유틸/도메인) | ~50파일 / ~70 | `Required element #${id} not found`, `Invalid state` 등 영문 |

## 가장 자주 노출될 가능성 높은 결함 Top 10

1. **`FLOW_*` 영문 코드 노출** (`src/image/flowGenerator.ts` 11곳) — `FLOW_LOGIN_TIMEOUT:`, `FLOW_SESSION_LOST:` 등 사용자에게 의미 없는 토큰이 그대로 표시
2. **`알 수 없는 오류 / 원인 불명` 폴백** (40+곳) — 로그 분석을 사용자에게 떠넘김
3. **`발행이 완료되지 않았습니다` 중복** (publishHelpers/naverBlogAutomation 양쪽 중복으로 5곳) — 같은 문구·다른 원인
4. **`AdsPower …`** 기술용어 11+곳 — 일반 사용자는 무엇인지 모름
5. **`HTTP ${status}` 그대로** (8곳) — `HTTP 407`, `HTTP 429` 등 코드만 보여줌
6. **`Access Denied` 영문** (smartCrawler 6곳) — 한국어로 "접근 차단"이라고 전혀 안내 안됨
7. **`appendMetric: postId is required` 등 영문 jargon** (postMetricsStore, featureFlagTracker)
8. **`brower 페이지가 초기화되지 않았습니다` 계열** (8+곳) — 사용자가 할 일이 없는 내부 상태 메시지
9. **`Invalid JSONP response format`, `ENOENT`** 등 라이브러리 원문 — engagement, licenseFallback
10. **`이미지 ${timeoutMs/1000}초 초과` 단독 노출** — 원인/해결책 없이 결과만 표시

## 핵심 패턴

- **에러 코드 누수**: `FLOW_*`, `NAVER_ALL_KEYS_FAILED`, `HTTP_*` — 디버그 prefix가 사용자 화면까지 도달
- **이중/삼중 중복**: publishHelpers.ts와 naverBlogAutomation.ts가 거의 동일한 `throw new Error('발행…')` 60+ 케이스 보유
- **저품질 폴백**: `lastError?.message || '알 수 없는 오류'` 패턴이 25+곳
- **이모지 일관성 부재**: ❌/⚠️/💡 혼재, 일부는 prefix 없음

자세한 카탈로그는 `error-msg-detail.md` 참조.
