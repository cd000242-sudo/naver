# Phase 1 종합 분석 보고서 — Better Life Naver v2.7.27

**작성일:** 2026-04-28 / **검진팀:** architect, perf-engineer, security-auditor, explorer (Opus 4명, 병렬)

---

## 0. 한 줄 결론

**보안 CRITICAL 3건이 우선이며, 그중 2건은 이번 세션에서 코드/설정 패치 완료. 1건(키 회수)만 사용자 행동 대기.** 그 외 응답성·아키텍처 부채는 P0~P3 로드맵으로 관리 가능. 앱 전반은 풍부한 기능에 비해 god-file·테스트 비율(3.7%)·레이어링 위반에서 부채가 큼.

---

## 1. 검진 결과 4영역 통합

### 1.1 코드베이스 규모 (explorer)

| 항목 | 값 |
|---|---|
| `src/` TS 파일 | 415개 |
| 총 LOC | 209,094줄 |
| 300줄 초과 파일 | 148개 (35.7%) |
| 800줄 초과 god-file | 50개 |
| 10K줄 초과 | 1개 (`contentGenerator.ts`) |
| 5K줄 초과 | 7개 |
| 테스트 파일 | 52개, 7,777 LOC (커버리지 3.7%) |
| `main.ts` IPC 핸들러 | 105개 (분리 진행 중인데 절반 잔류) |
| `preload.ts` | 1,051줄, contextBridge 노출 다수 |

### 1.2 아키텍처 (architect)

- **god-file 5개 합산 47,618줄** — 평균 31배 룰 위반 (`contentGenerator`/`main`/`naverBlogAutomation`/`renderer`/`sourceAssembler`)
- **IPC 분산 미완** — main.ts 105개 + main/ipc/ 161개 동시 존재. 이중 등록 silent regression 위험
- **레이어링 역참조 5건** — image/crawler/services가 main 측 서비스를 import (헥사고날 위반)
- **renderer ↔ Node 강결합** — type-only지만 build 그래프상 도메인 모델 변경이 UI에 직접 전파
- **신규 runtime/diagnostics 4모듈은 설계 OK** — 다만 `runtimeStats.ts`의 경로 하드코딩만 개선 권고

### 1.3 성능 (perf-engineer)

| 위험 | 위치 | 효과 |
|---|---|---|
| Adaptive Limiter 미적용 | 발행/이미지/글생성 진입점 3곳 | **H** (9줄 추가만으로 자가 조절) |
| 동기 fs I/O 219회 | main.ts 23회, imageHandlers.ts 13회 등 | **H** (IPC 응답 80→5ms) |
| Base64 디코딩 메인 스레드 | 이미지 12파일 (gpt-image-2 1.18MB) | **H** (worker 분리 시 freeze 50%↓) |
| 큰 JSON.parse | 15파일 20회 (LLM 응답 등) | **M** |
| 이미지 캐시 동기 스캔 | imageHandlers.ts L626-660 | **M** |

### 1.4 보안 (security-auditor)

| ID | 심각도 | 결함 | 상태 |
|---|---|---|---|
| SEC-001 | 🔴 CRITICAL | `.env`가 `extraResources`로 인스톨러에 패키지 → 모든 사용자에게 OPENAI 키 평문 배포 | ✅ 패치 완료 (이번 세션) |
| SEC-002 | 🔴 CRITICAL | `.env`가 `.gitignore`에 없어 git 추적 (과거 커밋엔 빈 파일 → 노출 없음) | ✅ 패치 완료 (이번 세션) |
| SEC-003 | 🔴 CRITICAL | 채팅 노출된 OpenAI 키 2개 미회수 | ⚠️ **사용자 행동 필요** |
| SEC-004 | 🟠 HIGH | IPC 검증 / BrowserWindow 옵션 / preload 노출 / 로그 누출 미점검 | Phase 2 reviewer 위임 |

---

## 2. 우선순위 통합 로드맵 (Top 12)

| # | 우선 | 영역 | 작업 | 변경량 | 효과 |
|---|---|---|---|---|---|
| 1 | **P0 즉시** | 보안 | OpenAI 키 2개 회수 + 새 키 발급 + .env 교체 | 사용자 행동 | CRITICAL 차단 |
| 2 | **P0 즉시** | 보안 | 직전 빌드(release_final/win-unpacked/resources/.env) 점검 + 노출 빌드 회수 | 사용자 검증 | 과거 빌드 키 노출 차단 |
| 3 | **P0 1일** | 성능 | Adaptive Limiter를 발행/이미지/글생성 3곳에 통합 (9줄) | XS | 응답없음 자동 회복 |
| 4 | **P0 1주** | 아키텍처 | main.ts IPC 105개 → main/ipc/* 이주 + `registerOnce` 가드 | M | main.ts 9.6K→5.5K |
| 5 | **P1 1주** | 보안 | BrowserWindow contextIsolation/sandbox/webSecurity 점검 + 패치 | S | 렌더러 격리 강화 |
| 6 | **P1 1주** | 성능 | imageHandlers.ts 13회 동기 fs → fs.promises | S | IPC 응답 80→5ms |
| 7 | **P1 2주** | 보안 | preload.ts contextBridge 노출 표면 축소 (1051줄 → ≤500) | M | 공격 표면 축소 |
| 8 | **P1 2주** | 아키텍처 | image/crawler/services → main 역참조 5건 끊기 (Ports & Adapters) | M | 레이어링 정상화 |
| 9 | **P2 2주** | 성능 | Base64 디코딩 worker_threads 분리 | M | 이미지 직후 freeze 제거 |
| 10 | **P2 4주** | 아키텍처 | contentGenerator.ts 5분할 (10.5K → 각 ≤800) | L | 글 품질 회귀 보호 + 유지보수 |
| 11 | **P2 진행** | 테스트 | 핵심 워커 3개에 회귀 테스트 추가 (현재 커버리지 3.7%) | M | TDD 가드 |
| 12 | **P3 6주** | 아키텍처 | renderer.ts 잔여 책임 분산 (9.1K → ≤2K) | L | UI 모듈화 완성 |

---

## 3. Phase 2 (검증 3명) 진행 권고

1. **reviewer** (TRUST 5): SEC-004 미점검 영역(IPC 검증, BrowserWindow 옵션, preload 노출 표면, 로그 누출) 실제 코드 검토 + Phase 1 자동 패치 정합성 검증
2. **tester**: god-file 5개에 대한 회귀 테스트 설계 — 특히 contentGenerator(글 품질)와 naverBlogAutomation(발행) 우선
3. **frontend-specialist**: renderer.ts 9.1K줄 + modules 14개의 시각적/동작 회귀 시나리오 자동화

→ 단, 현재 에이전트들이 도구 한계로 보고서 도중 잘리는 패턴이 반복됨. **Phase 2부터는 메인 세션에서 직접 검진**하거나 `general-purpose` (모든 도구 가능) 에이전트로 대체 권고.

---

## 4. 사용자가 지금 해야 할 것 (체크리스트)

- [ ] **OpenAI 키 회수**: https://platform.openai.com/api-keys → `sk-proj-...xbkA`, `sk-proj-6GFvKgatRUu...wA` 둘 다 Revoke
- [ ] **새 키 발급** → `.env`에 작성 (이제 git/빌드 모두 격리됨)
- [ ] **직전 빌드 점검**: `release_final/win-unpacked/resources/`에 `.env` 있는지 확인. 있으면 GitHub releases에서 그 빌드 제거
- [ ] **다음 단계 결정**: Phase 2 메인 세션 직접 진행 / general-purpose 에이전트 / 일단 P0 패치(#3, #4)부터 코드 작업 — 어느 쪽으로 갈지 지시
