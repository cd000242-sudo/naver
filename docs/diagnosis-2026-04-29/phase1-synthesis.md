# Phase 1 종합 분석 — Better Life Naver v2.7.40 (2026-04-29)

**진단팀:** debugger / general-purpose × 2 / architect / perf-engineer (Opus 5명, 병렬)
**산출 상태:** 3개 summary 완성 (regression / error-msg / automation), 2개(editor-loading, perf-v2) 도구 한계로 미완 — 메인 세션이 추가 진단

---

## 0. 한 줄 결론

**코드는 동작하지만 부채가 누적되어 같은 결함이 4~7회 재발하는 패턴.** 30일 264 commit + fix:feat 2.3:1 + 1,644개 사용자-노출 메시지 + 9,227줄 god-file. **God-file 분해 + SSOT 통합 + FSM 설계가 진짜 안정화 경로.**

---

## 1. 정량 진단 통합

### 1.1 회귀 (debugger)

| 지표 | 값 | 정상 | 평가 |
|---|---|---|---|
| 30일 commit | 264 | — | 매우 높음 |
| fix : feat | **2.3:1** | 0.5~1.0 | 4배 초과 |
| test commit 비율 | **1.5%** | 10~20% | 10배 부족 |
| Not-tested 출시 | 23건 | 0 | 검증 갭 |

### 1.2 에러 메시지 (general-purpose 2)

| 지표 | 값 |
|---|---|
| `throw new Error(...)` | **494건 / 79파일** |
| `appendLog(...)` 사용자 노출 | **867건 / 33파일** |
| `toastManager.error/warning` | **283건 / 26파일** |
| **합계** | **1,644개 메시지** |

### 1.3 워크플로우 (architect)

| 항목 | 상태 |
|---|---|
| god-file `naverBlogAutomation.ts` | 9,227줄 / 41 메서드 |
| `run()` 메서드 | 10단계 인라인 (setup~cleanup) |
| 타임아웃 정책 | 1s/2s/3s/5s/8s/10s 6단계 산발 분포 |
| Critical-path 멱등성 | ❌ 7단계 직선, 체크포인트/롤백 없음 |
| 모듈 경계 | helpers가 `self: any`로 부모 인스턴스 통째 받음 (가짜 분리) |
| `errorRecovery` 사용 | import만 되고 실사용 미미 |

---

## 2. 근본 원인 통합 — 같은 결함이 4~7회 재발하는 이유

### 핫픽스 집중 클러스터 5개 (debugger 식별)

| # | 영역 | 재발 횟수 | 근본 원인 |
|---|---|---|---|
| 1 | 이미지 생성 중복 | 7회 (flow 21·nano 13) | 단일 진입점 부재 |
| 2 | AI 모델 ID 관리 | 16회 분산 | **SSOT 부재** (modelRegistry 없음) |
| 3 | 발행 큐/취소 | 4회 (1.4.55→2.7.19) | **FSM 미설계** |
| 4 | 공정위 토글 | 4회 (2.7.29~32) | **IPC 분산** |
| 5 | Flow 로그인/headless | 3중 가드 누적 | 환경 분기 누적 |

### 잡다한 에러 — 가장 자주 노출되는 결함 Top 10 (general 2 식별)

1. `FLOW_*` 영문 코드 (11곳)
2. `알 수 없는 오류 / 원인 불명` 폴백 (40+곳)
3. `발행이 완료되지 않았습니다` 중복 메시지 (5곳)
4. `AdsPower …` 기술용어 (11+곳)
5. `HTTP ${status}` 그대로 (8곳)
6. `Access Denied` 영문 (smartCrawler 6곳)
7. `appendMetric: postId is required` 영문 jargon
8. `브라우저 페이지가 초기화되지 않았습니다` 내부 상태 (8+곳)
9. `Invalid JSONP response format`, `ENOENT` 라이브러리 원문
10. `이미지 ${timeoutMs/1000}초 초과` 원인/해결책 없음

---

## 3. 사용자 보고 즉시 진단 — 에디터 무한로딩

### 사용자 보고
스크린샷: `blog.naver.com/dably12287Redirect=...` URL에서 "글을 불러오고 있습니다..." 무한 로딩.

### 메인 세션 코드 점검 결과
- `Redirect=` 파라미터 처리 코드: **0건** (전체 src에 없음)
- 자동화는 `GoBlogWrite.naver` 진입 후 iframe `#mainFrame`을 30초 대기. 그 후 .catch(() => undefined) 패턴으로 silent 흡수
- 즉 **redirect 후 다른 URL에 안착해도 자동화는 그대로 진행 → 무한 멍때림**

### 추정 시나리오
1. 로그인 직후 cookies 일부 만료 또는 누락
2. `GoBlogWrite.naver` 진입 → 네이버가 사용자 블로그 홈(`/{naverId}Redirect=...`)으로 redirect
3. 페이지에 `#mainFrame` (에디터) 없음 → waitForSelector 30초 → silent fail (.catch 패턴)
4. 다음 단계 진행 시도 → 또 실패 → 사용자에게 모호한 "발행이 완료되지 않았습니다"

### 즉시 패치 권고
- `run()` 진입 후 URL 검사 추가: `Redirect=` 파라미터 또는 에디터 외 페이지면 명시적 재시도/에러 throw
- `iframe#mainFrame` 대기 후 frame.url() 검증 (write 페이지인지 확인)
- silent `.catch(() => undefined)` 패턴 → 명시 에러 보고로 전환

---

## 4. 우선순위 통합 로드맵 (Top 12)

| # | 우선 | 영역 | 작업 | 변경량 | 효과 |
|---|---|---|---|---|---|
| 1 | **P0 즉시** | 발행 회귀 | 에디터 redirect 검증 + `#mainFrame` 안착 검사 | XS | 사용자 보고 직접 해결 |
| 2 | P0 1주 | 메시지 친화 | 에러 메시지 Top 10 한국어/원인/해결책 추가 | M | 사용자 체감 즉시 |
| 3 | P0 1주 | 회귀 가드 | 27 skip 테스트 + e2e 발행 1개 추가 | M | 추가 회귀 차단 |
| 4 | P1 2주 | SSOT | `modelRegistry.ts` 신규 — Gemini/OpenAI/Claude 모델 ID 단일화 | M | 16회 분산 fix 영구 차단 |
| 5 | P1 2주 | TimeoutPolicy | `automation/TimeoutPolicy.ts` 단일 모듈 | S | 6단계 산발 → 1정책 |
| 6 | P1 2주 | helpers 경계 | `self: any` → `AutomationContext` ports 주입 | M | 모듈 경계 누수 차단 |
| 7 | P2 3주 | FSM 설계 | 발행/취소 상태머신 — 4회 재발 패턴 종결 | L | 큐/취소 불안정 영구 차단 |
| 8 | P2 4주 | god-file 분해 | naverBlogAutomation 9.2K → 7 phase × ≤700줄 | L | 회귀 표면적 ↓ |
| 9 | P2 4주 | god-file 분해 | contentGenerator 10.5K → 5분할 | L | LLM 분기 안정 |
| 10 | P3 6주 | renderer 분해 | renderer.ts 9.1K → ≤2K | L | UI 모듈화 완성 |
| 11 | P3 6주 | error 일원화 | `errorCodes.ts` SSOT + 한국어 매핑 테이블 | M | 1,644 메시지 통일 |
| 12 | P3 진행 | 부채 차단 | 매주 fix:feat 비율 모니터링 + 임계 초과 시 feat 제동 | XS | 운영 정책 |

---

## 5. 미완 영역 (도구 한계로 잘림)

| 에이전트 | 미완 산출물 | 메인 세션 보강 |
|---|---|---|
| general-purpose 1 (editor-loading) | summary + detail | ✅ 메인 세션이 위 §3에서 직접 진단 + 패치 권고 작성 |
| general-purpose 2 (error-msg) | detail 미작성 | ⚠️ summary는 충분, detail은 다음 라운드 |
| architect | detail 미작성 | ⚠️ summary는 충분, detail은 다음 라운드 |
| perf-engineer | summary + detail | ⚠️ v2.7.27 진단(`docs/diagnosis-2026-04-28/perf-detail.md`) 그대로 활용 — 그 이후 변경 없음 |

---

## 6. Phase 2 (검증 3명) 진행 권고

미완 영역과 큰 god-file 분해 권고가 누적되어 Phase 2는 다음으로 좁힘:
1. **reviewer**: §4의 P0 권고 #1·#2가 안전하게 수정 가능한지 사전 검토
2. **security-auditor**: Phase 1 미점검 영역 (preload 노출 표면 1,051줄, BrowserWindow 옵션)
3. **frontend-specialist**: 에러 모달 가독성 + Top 10 메시지 사용자 친화 검증

---

## 7. 사용자 즉시 행동

- [ ] 다음 발행 시도 시 콘솔 로그 캡처 → 에디터 redirect 후 멈춘 단계 식별 (메인 세션이 §3 패치 적용 후)
- [ ] OpenAI 키 2개 회수 (이전 라운드 잔여)
- [ ] Anthropic Console에서 Sonnet/Opus plan 확인 (이전 라운드 잔여)
