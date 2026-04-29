# 회귀 패턴 상세 분석 (2026-03-30 ~ 2026-04-29)

**범위**: `git log --since="2026-03-29"` (264 commits, v1.3.9 → v2.7.40)
**작성**: 2026-04-29 / Debugger Agent (코드 수정 없음, 히스토리 분석만)

---

## 1. Commit 분류 표

| 타입 | 건수 | 비율 | 정상 기준 | 평가 |
|------|------|------|----------|------|
| fix | 149 | 56.4% | 30~40% | 과다 (1.5~2x) |
| feat | 64 | 24.2% | 30~40% | 정상 하한 |
| perf | 10 | 3.8% | 5~10% | 정상 |
| refactor | 7 | 2.7% | 5~15% | **부족** |
| ui | 4 | 1.5% | feat에 포함 가능 | — |
| test | 4 | 1.5% | 10~20% | **심각 부족** |
| chore | 10 | 3.8% | 5~10% | 정상 |
| docs | 2 | 0.8% | 3~5% | 부족 |
| 기타 (release/merge/이모지) | 14 | 5.3% | — | — |

**핵심 진단**:
- `fix:feat = 2.3:1` — 정상 범위 0.5~1.0의 **4배**. 안정성 부채(stability debt) 누적 신호.
- `test = 4건 (1.5%)` — TDD/회귀 테스트 보강이 거의 없음. v2.7.34 1건만 본격 테스트 갱신 commit.
- `refactor = 7건` — Phase 5A/B (4/3) 이후 거의 정지. 13K줄 god-file 그대로.

---

## 2. 불안정 파일 Top 10 (5회+ 수정)

| 순위 | 파일 | 수정 횟수 | 회귀 위험 | 비고 |
|------|------|----------|----------|------|
| 1 | `src/contentGenerator.ts` | **60회** | CRITICAL | 모든 콘텐츠 경로의 hub. SSR 위험. |
| 2 | `src/main.ts` | **43회** | HIGH | IPC 핸들러 등록 시점 문제 반복 |
| 3 | `src/renderer/modules/continuousPublishing.ts` | **32회** | CRITICAL | 큐/취소/멍때림 버그 root |
| 4 | `public/index.html` | 32회 | MEDIUM | UI 구조 변경 빈번 (랜덤 회귀) |
| 5 | `src/renderer/modules/fullAutoFlow.ts` | **28회** | HIGH | 풀오토 중복 생성 v1.6.5/v2.6.1/v2.7.37 |
| 6 | `src/renderer/renderer.ts` | 22회 | HIGH | 13K줄 god-file. 분해 정체 중 |
| 7 | `src/image/flowGenerator.ts` | **21회** | CRITICAL | Flow 로그인/세션 회귀 반복 |
| 8 | `src/naverBlogAutomation.ts` | 20회 | HIGH | 로그인 클릭 폴백 3중화 |
| 9 | `src/promptLoader.ts` | 18회 | MEDIUM | 슬림화·튜닝 반복. 회귀 가능 |
| 10 | `src/renderer/modules/multiAccountManager.ts` | 16회 | HIGH | skipImages 누락 4회 재수정 |

**불안정 시그널**:
- 같은 파일에서 동일 버그 패턴이 3회+ 재발: `continuousPublishing.ts` (멍때림×2, 큐 폭증×2), `flowGenerator.ts` (재로그인×3, headless×2), `multiAccountManager.ts` (skipImages×4).

---

## 3. 핫픽스 클러스터 분석

### Cluster A — 공정위 문구 (4일 4회 재수정)

| Commit | 내용 |
|--------|------|
| 33169744 (v2.7.29) | 자동 삽입 회귀 + 사용자 토글 |
| e11fd69e (v2.7.30) | default OFF로 변경 |
| 0246870e (v2.7.31) | UI 토글 정확히 반영 |
| ea8edcec (v2.7.32) | 모드별 기본값 (쇼커만 ON) |
| 9e374a3f (v2.7.35) | IPC 명시 전달 (includeFtcDisclosure) |

**진단**: 단일 boolean 토글 처리에 5회 수정. IPC payload 명시화가 v2.7.35에 와서야 도입. **단일 책임 위반** — UI 상태·기본값·IPC 직렬화·모드 분기가 한 경로에 묶여 있음.

### Cluster B — 이미지 중복 생성 (3개월 7회 재발)

| Commit | 가드 위치 |
|--------|---------|
| 66b1049d (v1.6.5) | L1914/L1943 |
| 3fddd1cd (v2.6.1) | L334/L449 (executeFullAutoFlow 초기화) |
| dd34ea87 (v2.6.6) | 나노바나나 N장 중복 |
| 1397a4d6 (v2.6.3) | Flow 중복 IPC + syncAllPreviews |
| 484593ab (v2.7.3) | 덕트테이프 빈 버퍼 검증 |
| f173a81a (v2.7.36) | gpt-image-2 quality 강제 |
| faefa801 (v2.7.37) | 발행 모달 재오픈 |

**진단**: 가드를 늘려 막는 패턴 (defensive patches). 이미지 생성 트리거의 **단일 진입점이 없음**. Issue: trigger fan-out (UI×4 + IPC×N + auto×retry).

### Cluster C — 발행 큐 / 취소 / 멍때림 (3주 5회)

| Commit | 증상 |
|--------|------|
| a54cc51f (v1.4.55) | 다중계정 대기열 멍때림 |
| 4462a469 (v1.4.61) | 연속발행 로그인 멍때림 |
| 1806a7dc (v1.4.59) | "Assignment to constant" 치명 |
| 53670724 (v2.6.9) | 큐 N배 폭증 — 단일 실행 락 + 리스너 중복 |
| 5d8ee37a (v2.7.19) | stale cancelRequested 자동 리셋 |

**진단**: 상태 머신 미정의. `running/cancelRequested/queue` 플래그가 **글로벌 mutable**로 추정. v2.6.9 단일 실행 락은 미봉책.

### Cluster D — Gemini/OpenAI 모델 ID 혼선 (16회 fix)

대표: v1.4.31 죽은 모델 ID 정리, v2.7.21 false-positive, v2.7.22 Auto-Recovery, v2.7.23 후보 확장, v2.7.24 가짜 ID 일괄 제거.

**진단**: 모델 ID가 코드 곳곳에 하드코딩. **단일 매니페스트(SSOT) 부재**. Tier 1/2 분기도 코드 분산.

### Cluster E — Flow 로그인/headless (8회 fix)

대표: v1.4.91 → v1.4.92 → v1.4.95 → v2.7.1 → v2.7.38. 매번 "1줄 더 가드 추가" 패턴.

---

## 4. Not-tested 카테고리 카탈로그

23건 fix commit이 빌드 통과만으로 릴리즈됨. 사용자 환경에서만 검증 가능한 영역:

| 카테고리 | 건수 | 대표 commit |
|---------|-----|-----------|
| 실 발행 end-to-end | 9 | v2.7.29~32, v2.7.36 |
| 실 사용자 환경 재현 | 7 | v2.6.1, v1.6.5, v2.7.20 |
| 외부 의존 (OpenAI 청구·Gemini Tier·멀티모니터) | 5 | v2.7.36, v2.7.22, v2.7.37 |
| 장기 관찰 지표 (CTR·수익·모델 정확도) | 5 | v1.8.1, v1.8.2, v2.0.0 |
| 패키징 후 exe 검증 | 3 | v2.7.18, v2.6.1 |

**격차**: vitest 882/909 (97%) — 27 skip. Skip된 테스트가 v2.7.x 신코드의 회귀 가드여야 하는데 **유예 중**.

---

## 5. 회귀 위험 Top 5 — 다음 깨질 가능성

### 1. 공정위 문구 토글 (HIGH — 1주 내 재발 가능)

- **신호**: 4일간 4회 재수정. IPC 명시화(v2.7.35)가 마지막 수정.
- **잔존 위험**: 다중계정/연속발행/풀오토 3개 모드의 **각기 다른 기본값** 정책이 코드 분산.
- **권고**: `FtcDisclosurePolicy` 단일 함수로 모드별 기본값 일원화. 30 lines 이내.

### 2. 이미지 생성 파이프라인 (CRITICAL — 다음 릴리즈 회귀 가능)

- **신호**: flowGenerator.ts 21회, nanoBananaProGenerator.ts 13회, openaiImageGenerator.ts 7회 수정. 같은 "중복 생성" 버그 7회 재발.
- **잔존 위험**: trigger fan-out. 풀오토 + 반자동 + 연속발행 각각 다른 경로로 image generation 호출.
- **권고**: `ImageGenerationDispatcher` 단일 진입점 도입. 모든 경로 강제 통과 (choke point). v1.4.69의 "Gemini Context Caching 비활성화"처럼 임시 차단 누적 중.

### 3. 발행 큐 + 취소 상태 머신 (CRITICAL — 같은 버그 재발 중)

- **신호**: v1.4.55 → v1.4.61 → v2.6.9 → v2.7.19 — 같은 "멍때림/취소 stale" 패턴 4회.
- **잔존 위험**: v2.7.19에서 "stale cancelRequested **자동** 리셋" — 근본 수정 아닌 자가치유.
- **권고**: `PublishStateMachine` 명시적 FSM 도입. 상태 (`idle | running | cancelling | cancelled | error`) 전환만 허용.

### 4. Gemini 모델 ID + Tier 매핑 (MEDIUM — 사용자 환경 의존)

- **신호**: v2.7.24 "가짜 모델 ID 일괄 제거" 자체가 grep으로 16곳 청소. 잔존 가능성.
- **잔존 위험**: 모델 ID가 prompt/config/UI 드롭다운/main IPC 4곳에 분산.
- **권고**: `src/ai/modelRegistry.ts` SSOT 도입. zod 스키마로 검증.

### 5. Flow 로그인 + Chrome 창 가시성 (MEDIUM — visible 환경 의존)

- **신호**: v1.4.91 → v1.4.92 → v2.7.1 → v2.7.38 (3중 가드). 매번 "1줄 더".
- **잔존 위험**: v2.7.38 Not-tested에 "멀티 모니터/고DPI" 명시. 사용자 환경에서 회귀 거의 확실.
- **권고**: Playwright `headless: 'new'` 모드 강제 + Chrome flag로 BrowserWindow show/hide 분리.

---

## 6. 우선순위별 권고

### P0 (이번 주 내)
1. **테스트 비율 회복**: `test:` commit 1.5% → 10%. v2.7.34처럼 회귀 테스트 갱신을 fix와 동시에.
2. **공정위 토글 통합**: 30분 작업으로 5개 commit 누적 부채 해소.

### P1 (다음 스프린트)
3. **ImageGenerationDispatcher 도입**: 7회 재발 클러스터 차단.
4. **PublishStateMachine FSM**: 4회 재발 클러스터 차단.

### P2 (분기 내)
5. **modelRegistry SSOT**: AI 엔진 16건 fix 누적 부채 해소.
6. **renderer.ts 분해 재개**: Phase 5C 정체 중 (8,809줄 잔존).

---

## 부록 — 분석 메서드

```bash
git log --since="2026-03-29" --pretty=format:"%h|%ai|%s"   # 264건
git log --since="2026-03-29" --name-only --pretty=format:  # 파일 빈도
git log --since="2026-03-29" --pretty=format:"%B" | grep "Not-tested:"  # 검증 갭
```

코드 수정 없음. 히스토리 분석만 수행.
