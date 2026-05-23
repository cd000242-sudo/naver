# HANDOFF — 2026-05-24 세션 종료

> 작업 디렉터리: `c:\Users\박성현\Desktop\리더 네이버 자동화\`
> 마지막 릴리즈: **v2.10.349** (GitHub release 완료)
> 다음 세션 진입 시 본 파일이 1차 인덱스.

---

## 1. 본 세션 작업 요약 (2026-05-24 단일 세션)

### 1.1 릴리즈 3건
| 릴리즈 | commits | 빌드 | 핵심 |
|--------|---------|------|------|
| **v2.10.347** | 13 | ✅ NSIS exe 185MB | SPEC-IMAGE-MODEL-001 Phase 0~7a + SPEC-NAVER-PROTECTION-2026 docs + lint hotfix + 라벨 통합 + TOSS live key |
| **v2.10.348** | 5 | ✅ | test infra hotfix + 보안 hotfix 4건 (blob:write 검증 / backupPath / mutation 2건) |
| **v2.10.349** | 9 | ✅ | SPEC-PERF-2026 P1 Quick Win 7건 + SPEC docs 4파일 |

### 1.2 30팀 병렬 agent 2회 spawn
| 도메인 | 결과 | 보고서 |
|--------|------|--------|
| **SPEC-NAVER-PROTECTION-2026** (1차 30팀) | 5/7 카테고리 P0 (발행빈도/IP/Fingerprint/콘텐츠/행동) | `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` |
| **SPEC-PERF-2026** (2차 30팀) | P0 13건 (Quick Win 9건) | `.autopus/specs/SPEC-PERF-2026/research.md` |

### 1.3 SPEC 4파일 × 2 SPEC = 8 docs
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/` (spec/plan/acceptance/research)
- `.autopus/specs/SPEC-PERF-2026/` (spec/plan/acceptance/research)

### 1.4 v2.10.349 Quick Win 7건 적용
| # | 변경 | 위치 |
|---|------|------|
| QW1 | preload trend:alert cleanup | `preload.ts:777-781` |
| QW2 | licenseManager 5분 polling focus 게이팅 + unref | `licenseManager.ts:1386~`, `main.ts:1822~` |
| QW3 | dashboardUI 시계 visibilitychange | `dashboardUI.ts:26~` |
| QW4 | blob:read verifiedBlobs 캐시 | `blobStore/index.ts:90~` |
| QW5 | continuousQueueV2 heavy payload nullify | `continuousPublishing.ts:4653~` |
| QW6 | multiAccountManager backdrop 1초 → 30초 + visibility | `multiAccountManager.ts:4282~` |
| QW7 | flowMarathonHandlers sha256 stream pipeline | `flowMarathonHandlers.ts:309~` |

### 1.5 회귀 검증 baseline (v2.10.349 시점)
- ✅ **vitest 2098/2098 PASS** (이전 1 pre-existing licenseManagerRegression이 QW2의 `unref()` 추가로 자연 해소)
- ✅ **lint 0 errors** / 1014 warnings 유지
- ✅ **queueSnapshot 1000개 회귀 가드 7/7 PASS** (`f996e266` 회귀 가드 유지)
- ✅ **build exit 0** (NSIS exe 185MB)
- ⚠️ Electron context 의존 e2e (test:full-flow 등)는 사전 인프라 결함 — 별도 SPEC 필요

### 1.6 god file 침범 카운터 (룰 준수 확인)
| god file | v2.10.347 hunks | v2.10.348 hunks | v2.10.349 hunks | 룰 |
|---------|---------------|---------------|---------------|-----|
| renderer.ts (10,471줄) | 4 hunk (Phase 7a, 사용자 (B) 결정) | 0 | 0 | ⚠️ v2.10.347만 경계 |
| main.ts (~14K) | 1 | 1 (payload spread) | 1 (license wiring) | ✅ |
| continuousPublishing.ts (5,247줄) | 1 (라벨) | 0 | 1 (queue nullify) | ✅ |
| multiAccountManager.ts (4,888줄) | 0 | 0 | 1 (backdrop 30s) | ✅ |

---

## 2. 현재 상태 (v2.10.349 시점)

### 2.1 git
- 브랜치: `main`
- HEAD: `f40d3007 chore(release): v2.10.349`
- 최근 27 commits: 모두 push 완료
- tag: v2.10.347, v2.10.348, v2.10.349 모두 GitHub에 push

### 2.2 GitHub releases
- https://github.com/cd000242-sudo/naver/releases/tag/v2.10.347
- https://github.com/cd000242-sudo/naver/releases/tag/v2.10.348
- https://github.com/cd000242-sudo/naver/releases/tag/v2.10.349

### 2.3 미커밋 (사용자 결정 필요)
- 스크린샷 14개 PNG (`detail-*.png`, `pricing-*.png`, `live-mobile-*.png` 등) — 디버깅용으로 보임, .gitignore 추가 vs `docs/screenshots/` 이동 결정 필요

### 2.4 핵심 호환성 유지
- v2.10.301 봇감지 backoff
- v2.10.337 intervalJitter ±40%
- v2.10.285 계정별 로그인 시차
- v2.10.346 queueSnapshot immutable
- v2.10.347 SPEC-IMAGE-MODEL-001 Phase 0~7a (blob store + 마이그레이션)
- v2.10.348 보안 hotfix 4건

---

## 3. 사용자 직접 실행 필요 (다음 세션 진입 전)

### 3.1 v2.10.349 실측 검증
1. **v2.10.349 .exe 더블클릭 테스트** — `release_final/Better-Life-Naver-Setup-2.10.349.exe`
2. **Windows Task Manager 5분 idle CPU 측정** (앱 켜놓고 무작업)
3. **1시간 idle 후 RSS 비교** (앱 부팅 직후 vs 1시간 후)
4. **노트북 fan 소음 / 발열 체감 비교**
5. **단일계정 발행 CPU 측정** (1계정 큐 10개 발행 중)

### 3.2 측정 결과를 SPEC acceptance.md에 기록
- `.autopus/specs/SPEC-PERF-2026/acceptance.md` §2.2 baseline 컬럼
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/acceptance.md` §2.2 baseline 컬럼

### 3.3 다음 Phase 진입 결정
- **SPEC-PERF-2026 P2~P6**: Worker offload, IPC 최적화, 메모리 누수 차단 잔여, DOM virtual scroll, Multi-Chrome 가드
- **SPEC-NAVER-PROTECTION-2026 P1~P7**: 셀렉터+IP 인프라, fingerprint, 발행빈도, 콘텐츠, 행동, 회복

### 3.4 외부 인프라 결정
- **residential proxy 도입** (Bright Data $12.50~$60/월 또는 IPRoyal $8.75~$26.25/월) — SPEC-NAVER P1 진입 전
- **CreepJS 점수 baseline 수동 측정** — SPEC-NAVER P3 진입 전 (https://abrahamjuliot.github.io/creepjs/)
- **WebRTC leak 확인** — https://browserleaks.com/webrtc

---

## 4. 다음 세션 시작 명령어 (옵션)

### 옵션 A — SPEC-PERF-2026 P2 진입 (CPU 추가 개선)
```
HANDOFF-2026-05-24-END.md 읽고 SPEC-PERF-2026 P2 (Worker thread offload) 진입.
사용자 baseline 측정 결과 [idle CPU N%, RSS M MB] 기록 후
Fix 2.2 (sha256Worker.ts 신규) 부터 단계 진행. 매 fix 후 회귀 검증.
```

### 옵션 B — SPEC-NAVER-PROTECTION-2026 P0 baseline + P1 진입
```
HANDOFF-2026-05-24-END.md 읽고 SPEC-NAVER-PROTECTION-2026 P0 baseline
측정 결과 [트리거율 N%, 발행시간 P50 X초] 기록 후 P1 (셀렉터 remoteUpdate
활성화 + IP 인프라) 진입. residential proxy 공급자 [Bright Data/IPRoyal] 확정.
```

### 옵션 C — Quick Win 추가 (P0 잔여 6건)
```
HANDOFF-2026-05-24-END.md 읽고 SPEC-PERF-2026 P1 잔여 Quick Win 적용:
Fix 1.4 (eventLoopWatchdog suspend/resume), Fix 1.5 (라이선스 100ms
polling EventEmitter), Fix 4.3~4.5 (메모리 누수 차단 잔여), Fix 4.6
(closure 캡처). 매 fix 분할 commit + vitest + lint.
```

### 옵션 D — test 인프라 완전 복원
```
HANDOFF-2026-05-24-END.md 읽고 test 인프라 별도 SPEC 작성:
Electron context mocking (spectron 또는 @playwright/test-electron),
test:full-flow / test:login 자동화 e2e 복원. v2.10.348 hotfix는
명령어만 복구, 실행은 여전히 Electron app 부재로 실패.
```

### 옵션 E — Frontend 점검 (사용자 "광고 안하려면 웹지문" 후속)
```
HANDOFF-2026-05-24-END.md 읽고 SPEC-NAVER-PROTECTION-2026 §1.4 디바이스
fingerprint 영역만 우선 진행. Quick Win:
1. headless:true 4곳 제거 (smartCrawler/productSpecCrawler/imageLibrary/editorHelpers)
2. hardware/memory/languages 계정별 randomization (browserSessionManager.ts:459-462)
3. WebGL pool seed % 4 → seed % 16
```

---

## 5. 미해결 issue + 별도 SPEC 권장

### 5.1 P0 잔여 (v2.10.349에 미포함, ROI 높음)
- **renderer.ts addEventListener 4개 IIFE → AbortController** (`renderer.ts:541-544`) — god file 1 hunk
- **continuousPublishing addEventListener 4개 익명 화살표 → 명명 listener + cleanup** (`continuousPublishing.ts:1367,1406,1665,1696`)
- **DOMContentLoaded 645/967 중복 → 단일 init**
- **라이선스 체크 100ms × 6000회 polling → EventEmitter** (`main.ts:6518, 6587`)
- **eventLoopWatchdog suspend/resume** (`eventLoopWatchdog.ts:72-110`)

### 5.2 P0 중대 issue (별도 SPEC 권장, 큰 변경)
- **multi-Chromium 인스턴스 풀링** — 동시 활성 계정 N≤5 cap, browserSessionManager 변경
- **postListUI virtual scroll 도입** — 1000개 게시물 첫 렌더 300ms 블록 차단
- **innerHTML 전체 교체 → DocumentFragment 증분 렌더**
- **sha256/JSON.parse Worker thread offload** — workers/ 신규 모듈
- **IPC 배치/transferable 도입** — automation:syncImageManager 페이로드 ↓
- **fingerprint stable randomization** (계정별 deterministic, browserSessionManager.ts:459-462)
- **humanBehavior 모듈 신규** — 마우스 Bezier, 타이핑 분포, 스크롤 inertia (editor/image god file 영역)

### 5.3 보안 P0~P1 (전 30팀 reviewer 보고, v2.10.348 일부만 처리됨)
- `imageModelV1.ts:212` width/height 0 하드코딩 (BlobMetaInput optional 또는 sentinel 권장)
- `materializePublishingImages.ts:24-26` temp 파일 누수 (1000큐 시 4GB) — `app.on('before-quit')` cleanup hook
- `blobStore sha256Index` 프로세스 재시작 시 dedup 미작동 — Phase 8 backlog

### 5.4 사전 인프라 결함
- **test:full-flow / test:integration** — Electron `app.getPath()` 부재. spectron 또는 e2e wrapper 필요. v2.10.348 hotfix는 명령어만 복구
- **package.json scripts ↔ 실제 파일** — 일부 ts-node가 .js extension import resolve 못 함 (91개 파일에 광범위)

---

## 6. SPEC 위치 (둘 다 사용자 검토 대기)

### 6.1 SPEC-NAVER-PROTECTION-2026 (보호조치 회피)
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/spec.md` (207줄) — Goal 트리거율 <1%, 9 FR
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/plan.md` (399줄) — 8 Phase, 9~12주, 22~30 릴리즈
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/acceptance.md` (186줄) — 9 영역 50+ 메트릭
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/research.md` (267줄) — 30팀 외부+코드 매핑

### 6.2 SPEC-PERF-2026 (CPU/메모리)
- `.autopus/specs/SPEC-PERF-2026/spec.md` (~250줄) — Goal idle <5%, 8 FR
- `.autopus/specs/SPEC-PERF-2026/plan.md` (~250줄) — 7 Phase, 6주, 15~20 릴리즈
- `.autopus/specs/SPEC-PERF-2026/acceptance.md` (~150줄) — 9 영역 메트릭
- `.autopus/specs/SPEC-PERF-2026/research.md` (~500줄) — 30팀 분석 종합

### 6.3 기타 SPEC (이전 세션 작업)
- `.autopus/specs/SPEC-IMAGE-MODEL-001/` — Phase 0~7a 모두 적용 (v2.10.347 commit 됨)

---

## 7. 적용된 룰 reminder (다음 세션도 엄수)

| 룰 | 의미 | 본 세션 적용 |
|----|------|-------------|
| [[feedback_no_cascade_fix]] | god file 1릴리즈 1~3 fix, "끝판왕" 요청에도 단계 분할 | v2.10.349 god file 3개 × 각 1 hunk |
| [[feedback_regression_check_every_phase]] | git diff + vitest + lint + (god file 영역) full-flow 의무 | vitest 2098/2098 + lint 0 PASS 매 commit |
| [[feedback_no_fallback]] | silent fallback 금지, 차단형 모달 + 사용자 명시 동의 | v2.10.348 보안 hotfix는 throw 패턴 (silent 금지) |
| [[feedback_no_speculation]] | 추정/예상 결과 표기 금지, 실측만 | release notes는 baseline 대비 실측만, "X% 향상" 같은 추정 표현 금지 |
| [[feedback_release_pipeline]] | 빌드/버전업/릴리즈 7단계 + exe 파일명 하이픈 변환 | 3 릴리즈 모두 exe 하이픈 변환 + tag + gh release |

---

## 8. 핵심 명령어 모음

### 8.1 회귀 검증
```bash
npx vitest run                                                    # 2098 baseline
npx vitest run src/__tests__/multiAccountQueueSnapshot.test.ts   # queueSnapshot 7개
npm run lint                                                      # 0 errors 의무
npm run build                                                     # exit 0 의무
```

### 8.2 릴리즈 절차 (확정 패턴 — 2026-05-24 보강)

> ⚠️ **이전 절차 결함**: v2.10.337 이후 `latest.yml` 미갱신 → v2.10.346~349 자동 업데이트 모두 404. v2.10.349에서 수동 fix 적용 (`gh release upload v2.10.349 latest.yml + blockmap`). 다음 릴리즈부터 아래 절차 의무 적용.

```bash
# 1. 마지막 commit: chore(release): v2.10.X
git push origin main

# 2. 빌드 (background, 5~10분)
npm run release   # GH_TOKEN 부재로 publish는 실패해도 exe + latest.yml은 생성됨

# 3. exe 파일명 하이픈 변환 (필수)
mv "release_final/Better Life Naver Setup 2.10.X.exe" \
   "release_final/Better-Life-Naver-Setup-2.10.X.exe"

# 3-a. blockmap 파일명 하이픈 변환 (차등 업데이트용)
cp "release_final/Better Life Naver Setup 2.10.X.exe.blockmap" \
   "release_final/Better-Life-Naver-Setup-2.10.X.exe.blockmap"

# 3-b. latest.yml 갱신 (npm run release publish 실패 시 v2.10.337 stale)
#      sha512 + size를 v2.10.X 기준으로 다시 계산
node -e "const fs=require('fs'),crypto=require('crypto'); \
  const p='release_final/Better-Life-Naver-Setup-2.10.X.exe'; \
  console.log('sha512:',crypto.createHash('sha512').update(fs.readFileSync(p)).digest('base64')); \
  console.log('size:',fs.statSync(p).size);"
# 출력값으로 release_final/latest.yml 덮어쓰기:
# ----------------------------------------------------
# version: 2.10.X
# files:
#   - url: Better-Life-Naver-Setup-2.10.X.exe
#     sha512: <위에서 출력>
#     size: <위에서 출력>
# path: Better-Life-Naver-Setup-2.10.X.exe
# sha512: <위와 동일>
# releaseDate: '<UTC ISO, 예: 2026-05-23T20:45:21.000Z>'
# ----------------------------------------------------

# 4. tag + push
git tag -a v2.10.X -m "..."
git push origin v2.10.X

# 5. GitHub release + 모든 자산 업로드 (exe + blockmap + latest.yml)
gh release create v2.10.X \
  "release_final/Better-Life-Naver-Setup-2.10.X.exe" \
  "release_final/Better-Life-Naver-Setup-2.10.X.exe.blockmap" \
  "release_final/latest.yml" \
  --title "v2.10.X — ..." --notes-file /tmp/release-notes-vX.md

# 6. 자산 검증 (3개 모두 등록 의무)
gh release view v2.10.X --json assets -q '.assets[].name'
# 출력에 latest.yml + .exe + .exe.blockmap 3건 모두 있어야 정상

# 7. 자동 업데이트 검증 (HTTP 200 또는 302)
curl -sI "https://github.com/cd000242-sudo/naver/releases/download/v2.10.X/latest.yml" | head -1
```

### 8.3 30팀 병렬 spawn 패턴 (재사용 가능)
- A1~A8 researcher (planner subagent) — 외부 조사
- B1~B8 explorer (explorer subagent) — 코드 매핑
- C1~C6 perf-engineer (perf-engineer subagent) — 약점 감사
- D1~D4 planner (planner subagent) — SPEC 초안 4파일
- E1~E4 reviewer (reviewer subagent) — risk 분석

---

## 9. 권장 다음 세션 시작 순서

1. **본 파일 (`HANDOFF-2026-05-24-END.md`) 전체 읽기**
2. **MEMORY.md** 확인 (project_spec_naver_protection_2026 + 신규 project_spec_perf_2026 등록)
3. **사용자 baseline 측정 결과** 확인 (사용자 직접 측정 후)
4. **옵션 A~E 중 선택** → 진입
5. **회귀 검증 baseline (vitest 2098/2098, lint 0 errors)** 매 commit 후 확인 의무

---

## 10. 컨텍스트 정리

본 세션은 매우 길어졌습니다 ([[golden-principles]] #8 Context 50% Rule 임계). 다음 세션에서는:
- 본 핸드오프 + MEMORY.md 빠르게 인식 후 즉시 작업 진입
- baseline 측정값 → Phase 진입 결정 → 1릴리즈 1~3 fix 단계 진행
- 매 commit 직후 회귀 검증

세션 종료. 다음 세션에서 만나요. 🐙
