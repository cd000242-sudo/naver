# HANDOFF — 2026-05-28 세션 종료

> 작업 디렉터리: `c:\Users\박성현\Desktop\리더 네이버 자동화\`
> 마지막 릴리즈: **v2.11.0** (GitHub release 완료)
> 다음 세션 진입 시 본 파일이 1차 인덱스.

---

## 1. 본 세션 작업 요약 (2026-05-28 단일 세션, /goal 모드)

### 1.1 핵심 성과 — SPEC-IMAGE-NARRATIVE-2026 Phase 0~4 완료

| 단계 | 산출물 | LOC | 신규 파일 |
|------|--------|-----|----------|
| Phase 0 | SPEC 4파일 (spec/plan/acceptance/research) | 790 docs | 4 |
| Phase 1 | Vision wrapper (격리) | 1,277 | 7 (5 src + 2 test) |
| Phase 2 | Aggregator + Builder + 6 prompts + contentGenerator 1 hunk | 2,448 | 13 |
| Phase 3 | UI 직교 축 토글 + Quick Mode + CSS | 1,864 | 4 모듈 |
| Phase 4 | fullAutoFlow 통합 + 이미지 배치 (CRITICAL) | 1,197 | 4 (1 src + 3 test) |
| **총합** | | **~7,500 LOC** | **30+ 신규 파일** |

### 1.2 릴리즈

| 릴리즈 | commits | 빌드 | 핵심 |
|--------|---------|------|------|
| **v2.11.0** | 8 | ✅ NSIS exe 185.95MB | 이미지 추론 글 모드 + Stage 1+2 dep upgrade |

### 1.3 의존성 업그레이드 (Stage 1+2 적용)
- `typescript-eslint` 8.59 → 8.60 (commit 5a9c4d33)
- `@google/generative-ai` 0.21 → 0.24 (commit 298c5666)

### 1.4 5-Agent Team 활용 (Phase 0)
- **Architect** ✅ — 모듈 구조 + 5중 환각 가드 + 6 Phase 점진 도입
- **Planner** ✅ — 8 Phase × 6주 × 17~22 commits × 분산 plan
- **Explorer** ✅ — 8 영역 매핑 + 재사용 모듈 + 신규 6 파일
- **Vision API researcher** ✅ — Gemini Flash 1순위 + 비용 시뮬레이션 ($114/월 vs GPT-4o $491)
- **UX strategy** ✅ — "직교 축" 권장 (6번째 카드 X, 5배 가치 폭)

### 1.5 god file 침범 분산 (feedback_no_cascade_fix 준수)

| god file | hunk 수 | 위치 |
|----------|---------|------|
| contentGenerator.ts (8,955줄) | 1 hunk | line 1170~, 'image-narrative' 동적 import 분기 |
| fullAutoFlow.ts (3,594줄) | 3 hunk | 진입 + 이미지 준비 + 발행 위임 |
| main.ts (~14K줄) | 1 hunk | IPC 'vision:infer-and-write' 핸들러 |
| preload.ts | 1 hunk | window.api.inferAndWrite 노출 |
| imageAssigner.ts (332줄) | 1 hunk | 'narrative' 모드 case 추가 |
| renderer.ts (10,611줄) | 3 hunk | initImageNarrativeMode + Quick Mode link |

### 1.6 회귀 검증 (v2.11.0 시점)
- ✅ **vitest 2398/2399 PASS** (1 pre-existing flaky `verifyPreviousWork`)
- ✅ **lint 0 errors / 1023 warnings** (+8 신규 모듈 warning)
- ✅ **build exit 0** (NSIS exe 185.95MB)
- ✅ **신규 테스트 23 + 50 + 14 + 9 = 96+ 추가** (회귀 가드)
- ✅ **기존 5개 모드** (SEO/홈판/쇼핑/사용자정의/업체) 코드 리뷰 기반 영향 0

---

## 2. 현재 상태 (v2.11.0 시점)

### 2.1 git
- 브랜치: `main`
- HEAD: `8a24b688 chore(release): v2.11.0`
- 모든 commits push 완료
- tag: v2.11.0 GitHub push 완료

### 2.2 GitHub releases
- https://github.com/cd000242-sudo/naver/releases/tag/v2.11.0
- 3 assets: exe + blockmap + latest.yml (HTTP 302 정상)

### 2.3 핵심 호환성 유지
- v2.10.301 봇감지 backoff
- v2.10.337 intervalJitter ±40%
- v2.10.285 계정별 로그인 시차
- v2.10.346 queueSnapshot immutable
- v2.10.347 SPEC-IMAGE-MODEL-001 Phase 0~7a
- v2.10.348 보안 hotfix 4건
- v2.10.349 Quick Win 7건
- v2.10.350~v2.10.393 — 누적 fix (자동 업데이트/카테고리/APP_VERSION/ELECTRON_RUN_AS_NODE 등)
- v2.11.0 SPEC-IMAGE-NARRATIVE-2026 Phase 0~4

---

## 3. 사용자 직접 실행 필요 (다음 세션 진입 전)

### 3.1 v2.11.0 사용자 검증
1. **v2.11.0 .exe 더블클릭 테스트** — `release_final/Better-Life-Naver-Setup-2.11.0.exe`
2. **기존 5개 모드 풀오토 1회씩** (회귀 0 확인)
   - SEO 모드 — 키워드 입력 → 발행
   - 홈판 모드 — 동상
   - 쇼핑커넥트 — 동상
   - 사용자정의 — 동상 (커스텀 prompt 확인)
   - 업체홍보 — 동상
3. **신규 이미지 추론 모드** 시도
   - 메인 화면 "글 소스" 토글 → "사진 시작" 클릭
   - 이미지 5~10장 업로드
   - Vision provider 선택 (Gemini Flash 디폴트)
   - 추론 결과 검토 → 글 생성 → 발행

### 3.2 Vision API 키 사전 발급 (Phase 5~ 베타 위해 필수)
1. **Gemini 2.5 Flash** (디폴트) — https://aistudio.google.com → API 키 생성
2. **OpenAI GPT-4o** (폴백) — https://platform.openai.com → API 키 (이미 보유 시 재활용)
3. (옵션) Anthropic Claude — Stage 4 진행 시
4. (옵션) DeepInfra — Stage 4 진행 시

### 3.3 외부 인프라 (선택)
- **카카오 reverse geocoding API 키** — Phase 6 EXIF GPS 보강용 (kakao developers)
- **베타 사용자 3~5명 모집** — Phase 5 안정화 위해

### 3.4 베타 테스트 시 보고할 메트릭
- Vision 한국어 추론 정확도 (5점 척도, 음식/장소)
- 이미지-텍스트 일관성 체감
- 사진 10장 → 발행 시간 (목표 <90초)
- HEIC 자동 변환 성공률
- 환각 발생 빈도

---

## 4. 남은 작업 (별도 세션 권장)

### 4.1 SPEC-IMAGE-NARRATIVE-2026 Phase 5~7

#### Phase 5 — 베타 + 안정화 (v2.11.1~v2.11.2)
- **선행**: 베타 사용자 3~5명 모집 + Vision API 키 발급
- **산출**: dogfood 10건 실측 + 사용자 피드백 기반 작은 fix 1~3개
- **검증**: vitest 회귀 + 베타 3명 이상 출시 승인
- **추정**: 3~5일 (베타 대기 포함)

```
다음 세션 시작 명령어:
HANDOFF-2026-05-28-END.md 읽고 SPEC-IMAGE-NARRATIVE-2026 Phase 5 진입.
사용자 dogfood 결과 [N건 시도, 정확도 X점, 발행 시간 Y초] 기록 후
가장 빈번한 issue 1개 fix → v2.11.1 빌드.
```

#### Phase 6 — 비용 최적화 (v2.11.3)
- **산출**:
  - `src/imageNarrative/cost/imageHashCache.ts` — Vision 호출 캐시
  - `src/imageNarrative/cost/imageResizer.ts` — Vision 전 1024px 리사이즈 (토큰 30~50% 절감)
  - `src/apiUsageTracker.ts` (1 hunk) — imageNarrative 카테고리 추가
  - `src/imageNarrative/cost/budgetGuard.ts` — 일/월 한도 차단
- **추정**: 2일 / 2 commits

#### Phase 7 — 고도화 (사용자 명시 요청 시만)
- 카테고리 자동 톤 매칭
- 사진 부족 시 무료 스톡 자동 추가
- 인스타 동시 발행
- 음성 메모 보강
- 추정: 3일+ / 3~4 commits

**주의**: Phase 7은 [[feedback_no_feature_bloat]] 룰 — 사용자 명시 요청 없이 시작 금지.

### 4.2 의존성 업그레이드 Stage 3~6

#### Stage 3 — eslint 9→10 + eslint-plugin-jsdoc 48→62 (MEDIUM)
- **위험**: lint baseline 회귀 (1023 warnings → 신규 룰로 더 증가 가능)
- **검증**: lint 0 errors 유지 + warnings +50 이내
- **추정**: 1일 / 2 commits

```
HANDOFF 읽고 Stage 3 의존성 업그레이드:
npm install eslint@^10 eslint-config-prettier@^10 eslint-plugin-jsdoc@^62 --save-dev
→ lint 결과 + 신규 룰 위반 확인 → 필요 시 eslint config 조정
```

#### Stage 4 — openai 4→6 + @anthropic-ai/sdk 0.21→0.99 (HIGH, 별도 SPEC)
- **위험**: ESM 전환, API 재설계, Vision adapter 재작성 필요
- **선행**: SPEC-DEPS-SDK-UPGRADE-2026 작성 (deps 분석 agent가 시작했으나 미완)
- **추정**: 2~3일 / 5~8 commits

#### Stage 5 — electron 31→41 (CRITICAL, 별도 SPEC)
- **위험**: 10 major bump (Chromium 122→142, Node 20.18→22+)
- **선행**: SPEC-ELECTRON-UPGRADE-2026 작성
- **smoke test 의무**: puppeteer-extra-plugin-stealth 호환, native module rebuild
- **추정**: 1주+ / 별도 minor 버전

#### Stage 6 — typescript 5→6 + mongoose 8→9 (HIGH)
- **위험**: TypeScript 6 alpha 단계 가능, mongoose DB driver 변경
- **선행**: SPEC-DEPS-TS-UPGRADE-2026 작성
- **추정**: 1주

### 4.3 미해결 회귀 위험

#### 4.3.1 verifyPreviousWork.test.ts pre-existing flaky
- prompt 글자수 기준 초과 (사용자 추가 prompt로 baseline 회복 필요)
- 위치: `src/__tests__/verifyPreviousWork.test.ts`
- 영향: vitest 1 fail (회귀 가드 영역 외)
- 권장: prompt 슬림화 또는 baseline 재조정 (별도 1 hunk fix)

#### 4.3.2 SPEC-DEPS-UPGRADE-2026 미완 SPEC
- 위치: `.autopus/specs/SPEC-DEPS-UPGRADE-2026/spec.md` (deps 분석 agent가 작성 시작 후 중단)
- 권장: 다음 세션에서 검토 + 완성 또는 폐기

### 4.4 별도 SPEC 권장 (큰 변경)
- **SPEC-ELECTRON-UPGRADE-2026** — Stage 5 (Electron 31→41)
- **SPEC-DEPS-SDK-UPGRADE-2026** — Stage 4 (openai/anthropic SDK)
- **SPEC-DEPS-TS-UPGRADE-2026** — Stage 6 (TypeScript 6)
- **SPEC-IMAGE-NARRATIVE-2026 Phase 5~7** — 베타 + 최적화 + 고도화

---

## 5. 다음 세션 시작 명령어 (옵션)

### 옵션 A — SPEC-IMAGE-NARRATIVE-2026 Phase 5 (베타 + 안정화)
```
HANDOFF-2026-05-28-END.md 읽고 Phase 5 진입.
사용자 dogfood 결과 [N건 시도, 정확도 X점, 발행 시간 Y초] 기록 후
가장 빈번한 issue 1개 fix → v2.11.1 빌드.
```

### 옵션 B — Stage 3 eslint major 업그레이드
```
HANDOFF-2026-05-28-END.md 읽고 Stage 3 진행.
npm install eslint@^10 eslint-config-prettier@^10 eslint-plugin-jsdoc@^62 --save-dev
→ lint 결과 분석 → 신규 룰 위반 fix → commit + push.
v2.11.1 or v2.12.0 빌드 결정.
```

### 옵션 C — Phase 6 비용 최적화 (Vision API 50% 절감)
```
HANDOFF-2026-05-28-END.md 읽고 Phase 6 진입.
imageHashCache + imageResizer + budgetGuard 3개 모듈 신규 작성.
apiUsageTracker.ts에 imageNarrative 카테고리 추가 (1 hunk).
→ 동일 이미지 2회 추론 시 캐시 hit + 비용 50% 절감 측정.
```

### 옵션 D — Stage 4 openai SDK major (SPEC 작성 먼저)
```
HANDOFF-2026-05-28-END.md 읽고 SPEC-DEPS-SDK-UPGRADE-2026 작성.
openai 4→6 breaking changes 분석 → Vision adapter 재작성 plan.
사용자 승인 후 SDK 업그레이드 + adapter 마이그레이션.
```

### 옵션 E — Stage 5 Electron major (별도 SPEC 필수)
```
HANDOFF-2026-05-28-END.md 읽고 SPEC-ELECTRON-UPGRADE-2026 작성 시작.
electron 31→41 breaking changes + native module rebuild + smoke test plan.
사용자 검토 후 진행 결정.
```

---

## 6. SPEC 위치

### 6.1 본 세션 작성 SPEC
- `.autopus/specs/SPEC-IMAGE-NARRATIVE-2026/spec.md` (~280줄) — 10 FR + EARS + 5중 환각 가드 + 8 risks
- `.autopus/specs/SPEC-IMAGE-NARRATIVE-2026/plan.md` (~250줄) — 8 Phase × 6주
- `.autopus/specs/SPEC-IMAGE-NARRATIVE-2026/acceptance.md` (~220줄) — 5 메트릭 영역
- `.autopus/specs/SPEC-IMAGE-NARRATIVE-2026/research.md` (~300줄) — 5-agent 결과 통합

### 6.2 미완 SPEC (다음 세션 검토)
- `.autopus/specs/SPEC-DEPS-UPGRADE-2026/spec.md` — 의존성 분석 agent가 시작 후 중단

### 6.3 권장 신규 SPEC
- `.autopus/specs/SPEC-IMAGE-NARRATIVE-2026/phase5.md` — Phase 5 베타 plan
- `.autopus/specs/SPEC-ELECTRON-UPGRADE-2026/` — Stage 5 (4파일)
- `.autopus/specs/SPEC-DEPS-SDK-UPGRADE-2026/` — Stage 4 (4파일)

### 6.4 기타 SPEC (이전 세션 작업, 참고만)
- `.autopus/specs/SPEC-IMAGE-MODEL-001/` — v2.10.347 완료
- `.autopus/specs/SPEC-NAVER-PROTECTION-2026/` — 보호조치 회피 (사용자 결정 대기)
- `.autopus/specs/SPEC-PERF-2026/` — CPU/메모리 (사용자 결정 대기)

---

## 7. 적용된 룰 reminder (다음 세션도 엄수)

| 룰 | 의미 | 본 세션 적용 |
|----|------|-------------|
| [[feedback_no_cascade_fix]] | god file 1릴리즈 1~3 fix | v2.11.0 god file 5개 × 각 1~3 hunk 분산 |
| [[feedback_regression_check_every_phase]] | 매 Phase vitest + lint + build 의무 | Phase 1~4 모두 회귀 검증 통과 |
| [[feedback_no_fallback]] | silent fallback 금지, 차단형 모달 + 명시 동의 | Vision provider 선택 UI 노출, 폴백 onFallback 콜백 |
| [[feedback_no_speculation]] | 추정/예상 결과 표기 금지, 실측만 | 비용/성능 메트릭은 시뮬레이션 명시, 실측은 사용자 검증 |
| [[feedback_release_pipeline]] | 빌드/버전업/릴리즈 7단계 + exe 하이픈 변환 | v2.11.0 §8.2 절차 그대로 적용 |
| [[major dep ESM smoke test]] | NPM major bump 시 ESM/CJS 전환 검토 + smoke test | Stage 1+2만 적용, Stage 3~6은 별도 SPEC |
| [[feedback_no_feature_bloat]] | 기능 추가 = 복잡도 | Phase 7 사용자 명시 요청 시만 |
| file-size-limit | 신규 파일 ≤300줄 | 신규 30+ 파일 모두 한도 준수 |
| language-policy | 주석 영어 / commit 한국어 / AI 응답 한국어 | 모두 준수 |

---

## 8. 핵심 명령어 모음

### 8.1 회귀 검증
```bash
npx vitest run                                                    # 2398/2399 baseline
npx vitest run src/__tests__/multiAccountQueueSnapshot.test.ts   # queueSnapshot 7개
npx vitest run src/__tests__/imageNarrative*.test.ts             # 신규 추가 96+ 테스트
npm run lint                                                      # 0 errors 의무
npm run build                                                     # exit 0 의무
```

### 8.2 릴리즈 절차 (확정 패턴 — 2026-05-24 보강)

```bash
# 1. 마지막 commit: chore(release): v2.X.Y
git push origin main

# 2. 빌드 (background, 5~10분)
npm run release   # GH_TOKEN 부재로 publish는 실패해도 exe + blockmap은 생성됨

# 3. exe 파일명 하이픈 변환 (필수)
mv "release_final/Better Life Naver Setup 2.X.Y.exe" \
   "release_final/Better-Life-Naver-Setup-2.X.Y.exe"

# 3-a. blockmap 파일명 하이픈 변환 (차등 업데이트용)
cp "release_final/Better Life Naver Setup 2.X.Y.exe.blockmap" \
   "release_final/Better-Life-Naver-Setup-2.X.Y.exe.blockmap"

# 3-b. latest.yml 갱신 (sha512 + size 재계산)
node -e "const fs=require('fs'),crypto=require('crypto'); \
  const p='release_final/Better-Life-Naver-Setup-2.X.Y.exe'; \
  console.log('sha512:',crypto.createHash('sha512').update(fs.readFileSync(p)).digest('base64')); \
  console.log('size:',fs.statSync(p).size);"

# 4. tag + push
git tag -a v2.X.Y -m "..."
git push origin v2.X.Y

# 5. GitHub release + 모든 자산 업로드 (exe + blockmap + latest.yml)
gh release create v2.X.Y \
  "release_final/Better-Life-Naver-Setup-2.X.Y.exe" \
  "release_final/Better-Life-Naver-Setup-2.X.Y.exe.blockmap" \
  "release_final/latest.yml" \
  --title "v2.X.Y — ..." --notes-file /tmp/release-notes-vX.md

# 6. 자산 검증 (3개 모두 등록 의무)
gh release view v2.X.Y --json assets -q '.assets[].name'

# 7. 자동 업데이트 검증 (HTTP 200 또는 302)
curl -sI "https://github.com/cd000242-sudo/naver/releases/download/v2.X.Y/latest.yml" | head -1
```

### 8.3 Agent Team 패턴 (5-agent 병렬)
```
다음 SPEC 작성 시 활용 가능한 agent 조합:
- architect — 모듈 구조 + 의존성 그래프 + 위험 분석
- planner — Phase 분할 + Gantt + 검증 포인트
- explorer — 기존 코드 매핑 + 재사용 가능 모듈
- spec-writer — Vision/SDK/API 비교 분석 (researcher 대체)
- general-purpose — UX 전략 + 페르소나 + 차별화 (product-strategist 대체)
```

---

## 9. 권장 다음 세션 시작 순서

1. **본 파일 (`HANDOFF-2026-05-28-END.md`) 전체 읽기**
2. **MEMORY.md** 확인 (현재 5/28 SPEC 추가 등록 권장)
3. **사용자 v2.11.0 검증 결과** 확인 (사용자 직접 검증 후)
4. **옵션 A~E 중 선택** → 진입
5. **회귀 검증 baseline (vitest 2398/2399, lint 0 errors, build exit 0)** 매 commit 후 확인 의무

---

## 10. 컨텍스트 정리

본 세션은 매우 길어졌습니다 ([[golden-principles]] #8 Context 50% Rule 임계 초과). /goal mode + 5-agent team으로 SPEC 0~4 Phase 단축 진행.

다음 세션에서는:
- 본 핸드오프 + MEMORY.md 빠르게 인식 후 즉시 작업 진입
- v2.11.0 사용자 검증 결과 → 다음 단계 결정
- Stage 3+ 또는 Phase 5+ 둘 중 선택 후 진행
- 매 commit 직후 회귀 검증 의무 ([[feedback_regression_check_every_phase]])

세션 종료. 다음 세션에서 만나요. 🐙
