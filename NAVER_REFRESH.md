# NAVER_REFRESH — 격변 대응 메모

네이버 UI는 한 달에도 몇 번씩 셀렉터가 바뀌고, API 키는 12종에 MCP 6서버, dep는 stage 5단계까지 밀려있다. 한 줄 명령으로 다 점검하고 fix까지 가져가는 흐름을 한 곳에 모아둠. 다음에 또 까먹지 말자고.

트리거는 이중 인식. 자연어든 슬래시든 둘 다 받음.

- "네이버 리프레시" / "네이버 업데이트" / "네이버 격변 대응"
- "전체 헬스 진단" / "API 키 / MCP / 셀렉터 점검"
- `/refresh-naver`, `/naver-refresh`

근데 트리거 키워드만으로는 범위가 너무 넓다. 사용자가 "셀렉터만" 의도일 수도 있는데 풀체크 돌리면 시간 낭비. 그래서 sub-command 자연어 매핑을 따로 둠 (아래 "범위 좁히기" 참조).

---

## 일단 결론부터

순서는 진단 → fix → 빌드/dogfood → 릴리즈. 진단은 비용 0이라 막 돌려도 되고, fix부터는 한 cycle = 1 hunk + 회귀 검증. 빈 버전업 릴리즈는 사용자가 명시 OK 해도 거부. 저번에 v2.11.2 직후 v2.11.3 요청 받았다가 동일 exe 올릴 뻔한 적 있음 — 그래서 룰 박아둠.

---

## Phase 표

```
─ P0~P3: READ-ONLY, 자동 진행, 비용 0 ───────────────────────────
P0  인식          git log + tag + HEAD + 미커밋                       30초
P1  진단          셀렉터 / 키 / MCP / dep outdated                    3분
P2  baseline      vitest + tsc + lint                                 2분
P3  리포트        표 출력 + 범위 옵션 사용자에게 제시                  10초

  ↓ Gate A — 사용자 옵션 선택 (전체 / 부분 5종 / 종료)

─ P4~P6: CODE-CHANGE, fix 1건당 review 1회 + 회귀 1회 ──────────
P4  selector-fix  remoteUpdate 매니페스트 검증분만 staged 적용         fix 1건/cycle
P5  key-encrypt   M1 P3 평문 → enc:v1: 보강 (이미 활성, 잔존만)        fix 1건/cycle
P6  dep-upgrade   Stage 3~6, SPEC 선결 필수                            stage 1개/cycle

  ↓ Gate B — vitest delta 0 + tsc exit 0 + lint warning delta ≤0
              실패 시 즉시 revert. cascade 절대 금지.

─ P7~P9: DOGFOOD, 사용자가 실제 .exe 더블클릭 ──────────────────
P7  pack-local    npm run release (GH_TOKEN 없어서 publish는 실패해도 exe는 나옴)  7분
P8  exe-install   사용자가 더블클릭 + 6모드 풀오토 1건씩                20분
P9  smoke-report  사용자가 아래 템플릿 채워서 답장                       5분

  ↓ Gate C — 6모드 PASS 또는 SKIP. FAIL 1건이라도 = P10 차단.

─ P10: PUBLISH ──────────────────────────────────────────────
P10 release       package bump + tag + gh release create 3 assets        5분
                  진입 조건: P4~P6에서 commit ≥1 AND P9 6모드 PASS
                  진입 거부 케이스: 변경 origin이 문서/SPEC/CLAUDE.md 단독
```

전체 한 cycle은 P4~P10 한 바퀴. 두 가지 fix를 묶어서 한 commit으로 처리하지 말 것 — god file에 한 번에 5+ hunks 박혔다가 vitest 270개 터진 적 있음.

---

## 범위 좁히기 (sub-command 자연어 매핑)

트리거 키워드에 다음 단어가 같이 들어오면 해당 sub만 실행:

| 사용자가 이렇게 말하면 | 실행 Phase | 보통 시간 |
|---|---|---|
| "셀렉터만" / "selectors" | P0 → P1 → P3 → Gate A → P4 → Gate B | 5분 |
| "키만" / "api 키 점검" | P0 → P2(선택) → P3 → Gate A → P5 | 5분 |
| "MCP 점검" | P0 → P1(MCP 한정) → P3 | 4분 |
| "의존성 진단" / "dep" | P0 → P1(dep 한정) → P3 | 4분 |
| "회귀만" | P2 단독 | 2분 |
| "진단만" | P0 → P3 (fix 0) | 5분 |
| "전체" / "리프레시" / "격변 대응" | P0 → P3 full + 후속 옵션 제시 | 5분 + 사용자 선택 |
| "릴리즈까지" | P0 → P10 전체 (단 변경 0건이면 P10 거부) | 1시간+ |

범위 모호하면 기본은 "진단만" (P0~P3). 추가 범위는 Gate A에서 사용자에게 1회 묻고 가는 게 안전. 추정 진행 0.

---

## P0 — 인식

```bash
git log --oneline -10
git status --short | head -20
gh release list --limit 5
```

뭘 알고 싶냐: 마지막 commit, 미커밋 파일 목록, 최근 릴리즈 태그. 3가지면 충분.

---

## P1 — 진단 4종

### 셀렉터

여기 핵심은 `src/automation/selectors/` 11개 모듈 + `remoteUpdate.ts` 원격 매니페스트.

확인된 사실 (5/28 기준):
- 셀렉터 실패는 메모리 버퍼에만 쌓임 (`selectorUtils.ts:9`, `failureReports: SelectorFailureReport[] = []`, max 100건)
- 디스크 동기화 없음. `reportFailureTelemetry(endpoint)` (`remoteUpdate.ts:263-300`) 가 서버에 POST 후 `clearFailureReports()`
- 운영 대시보드 (`operationsDashboard.ts:74-102`) 도 메모리 메트릭만

따라서 P1 셀렉터 진단은 디스크 grep으로 뽑을 게 없다. 대신:

```bash
git log --oneline -5 -- src/automation/selectors/   # 최근 갱신 시점
git diff HEAD~10 HEAD -- src/automation/selectors/ | head -50   # 최근 변경 hunks
```

런타임 실패 텔레메트리를 보고 싶으면 실행 중인 앱에서 `operationsDashboard` IPC 호출해야 함 — 다음 세션에서 별도 작업.

### API 키 형식 (비용 0)

실제 호출하면 12종 × 비용 발생. 형식만 검증.

```bash
node -e "
const fs = require('fs');
if (!fs.existsSync('.env')) { console.log('.env 없음'); process.exit(0); }
const env = fs.readFileSync('.env','utf-8').split('\n').filter(l => l.includes('='));
for (const l of env) {
  const [k, ...vs] = l.split('=');
  const v = vs.join('=').trim();
  console.log(k.padEnd(30), v.length === 0 ? 'EMPTY' : v.length < 20 ? 'TOO_SHORT' : 'OK(' + v.length + ')');
}
"
```

settings.json 암호화 여부 확인은 Windows / macOS 둘 다 챙겨야 한다 (CLAUDE.md cross-platform):

```bash
# Windows: %APPDATA%\Better Life Naver\settings.json
# macOS  : ~/Library/Application Support/Better Life Naver/settings.json
# 출처: scripts/reset-config-for-pack.js:15-19

# 다중 계정 파일 패턴: settings_{userId_sanitized}.json
# 출처: configManager.ts:276
# 마스터 settings.json 외에 settings_*.json 도 다 봐야 한다 — 계정마다 키 분기
```

확인할 거: 각 settings_*.json 의 SENSITIVE 필드가 `enc:v1:` 접두사를 달고 있는가. 평문이면 다음 saveConfig 때 M1 P3 가 자동 마이그레이션 (commit fb28b007).

### MCP

```bash
cat .mcp.json | head -50
```

확인된 사실: `.mcp.json` 6서버 (context7 / exa / github / memory / playwright / sequential-thinking). 본 Electron 앱에는 `@modelcontextprotocol/sdk` 의존성 없음 (package.json 확인). MCP는 Claude Code 개발 세션 전용.

MCP "헬스 체크" 라고 npm registry latest 비교하는 거 솔직히 의미 없다. 실제 서버 동작은 stdin/stdout JSON-RPC로 Claude Code 내부에서만 알 수 있음. P1 MCP는 그냥 인벤토리만 출력하고 끝. 진짜 동작 확인은 사용자가 다음 세션에서 도구 호출 시도해보는 것밖에 없다.

### 의존성 outdated (install 0)

```bash
npm outdated puppeteer puppeteer-extra puppeteer-extra-plugin-stealth playwright playwright-extra @playwright/test 2>&1 | head
npm outdated electron @anthropic-ai/sdk openai @google/generative-ai 2>&1 | head
```

Stage 표 (이전 SPEC 기준, 외워둘 것):

- Stage 1+2: 적용 완료 (typescript-eslint, @google/generative-ai)
- Stage 3: eslint 9→10, jsdoc 48→62 — MEDIUM, 1일
- Stage 4: openai 4→6, @anthropic-ai/sdk 0.21→0.99 — HIGH, 별도 SPEC 필수
- Stage 5: electron 31→41 — CRITICAL, SPEC + smoke test 의무
- Stage 6: typescript 5→6, mongoose 8→9 — HIGH, 별도 SPEC

Stage 4+ 는 P1에서 진단만, P6 fix는 SPEC 작성 후 사용자 OK 받고 나서. major bump는 ESM smoke test 안 돌리면 puppeteer 25 회귀 같은 거 또 터진다.

---

## P2 — baseline

```bash
npx vitest run 2>&1 | tail -10
npx tsc --noEmit; echo "TSC=$?"
npm run lint 2>&1 | tail -5
```

2026-05-28 baseline: vitest 2434/2434 PASS (171 files, duration ~10s), tsc exit 0, eslint 0 errors / 1020 warnings (41 auto-fixable).

flaky test 인식하고 가야 한다. timing-sensitive 패턴 쓰는 파일 8건 발견됨:

- `licenseManagerRegression.test.ts` (오프라인 체크 + await)
- `configManagerRegression.test.ts` (fs + EBUSY retry)
- `cohortWiringGuard.test.ts`
- `exposurePollerGuard.test.ts`
- `userDataMigrationRegression.test.ts`
- `base64Async.test.ts`
- `chainCache.test.ts` (30ms TTL — 빡빡함)
- `sessionKeepaliveV2.test.ts`

위 8건 중 하나가 fail로 잡히면 단정하지 말고 isolation 재실행 한 번 해본다:

```bash
npx vitest run src/__tests__/<해당파일>.test.ts
```

isolation에서 PASS면 flaky로 처리하고 baseline은 그대로 둔다. 거짓 양성으로 워크플로우 중단하지 말 것.

---

## P3 — 리포트 + Gate A

P0~P2 결과를 짧게 출력. 표 안에 표 같은 거 만들지 말고 짧은 단락 + 코드블록.

```
[NAVER_REFRESH 진단 2026-XX-XX HH:MM]

HEAD       <commit>
최근 릴리즈 vX.Y.Z (N일 전)
미커밋     N개 파일

셀렉터     11개 모듈, 최근 갱신 N일 전. 원격 매니페스트 미반영 X건.
API 키     .env N개 (OK X / EMPTY Y), settings.json 암호화 X/Y
MCP        6서버 (인벤토리만). 실 동작은 도구 호출 후 확인.
dep        Stage 3 후보 N개, Stage 4 후보 M개 (SPEC 필요)
회귀       vitest A/B PASS, tsc 0, lint 0 errors / N warnings

권장 다음:
  1. selectors 원격 매니페스트 X건 적용 → P4
  2. Stage 3 eslint major → P6
  3. 진단만 종료 (변경 없음)
```

여기서 사용자에게 자연어로 묻는다. AskUserQuestion 강요 X — 선택지가 2개 이상으로 명확하게 갈리는 경우만 AskUserQuestion 쓴다 (architect 권고). 단일 yes/no면 자연어 대기.

사용자가 무응답이면 절대 추정 진행 0. 거기서 끝.

---

## P4~P6 — fix cycle (Gate B)

fix 1건 = commit 1건 = Gate B 1회. 절대 묶지 말 것. cascade 금지.

### P4 selector-fix

원격 매니페스트가 검증한 셀렉터만 staged 상태로 반영. **자동 commit 금지**. Phase 3 리포트에 "원격 매니페스트 N건 staged" 로 표기하고, 사용자가 Phase 7에서 명시 OK 해야 commit.

이유: 자동 commit이 되면 동의 게이트 우회됨. 원격 매니페스트 자체는 사용자 클라이언트 런타임에 실시간 적용되니까 (remoteUpdate.ts), 릴리즈 지연으로 인한 사용자 다운타임은 제한적.

### P5 key-encrypt

M1 P3 (commit fb28b007) 이미 활성. P5는 fb28b007 이후에도 평문 잔존하는 케이스만 대상.

- 마이그레이션 1회 후 새 saveConfig에서 enc:v1: 접두사 자동 처리
- 별도 PC에서 decrypt 실패 → UI 모달 (이건 M1 P4, 후속 commit)
- Documents/_safe 미러는 파일 복사이므로 자동으로 암호화본 미러됨

### P6 dep-upgrade

Stage 3 이상은 전부 SPEC 선결. install 직전에:

```bash
git checkout -b dep/stageN-{lib}-{old}-to-{new}
npm install <lib>@<new> --save-dev
npx vitest run  # 즉시 회귀 확인
```

ESM 전환 가능성 있는 lib (puppeteer 25 같은 거) 는 runtime smoke test 의무. 단 unit test만으로 안전 보증 X.

### Gate B 통과 조건

- vitest 통과 수 delta = 0 (회귀 0)
- tsc --noEmit exit 0
- lint warning delta ≤ 0 (신규 warning 0)
- diff 30줄 이내 (god file 1~3 hunks 한도)

하나라도 실패면 즉시 revert. "조금만 더 손보면 통과할 것 같은데" 같은 생각 금지. 한 번에 한 hunk.

---

## P7~P9 — dogfood (Gate C)

여기가 본 워크플로우의 핵심 게이트. vitest 통과 = 회귀 검증 등치 가정 버릴 것.

### P7 pack-local

```bash
npm run release
```

5~10분. GH_TOKEN 없으면 publish 실패해도 `release_final/Better Life Naver Setup X.Y.Z.exe` + `.exe.blockmap` 은 생성됨. 그게 정상 동작.

### P8 exe-install (사용자가 직접)

사용자한테 넘기는 부분. 다음 정확히 안내:

1. `release_final/Better Life Naver Setup X.Y.Z.exe` → 하이픈 변환 후 더블클릭
2. 6모드 풀오토 1건씩
   - SEO (`probeSerp({ mode: 'seo' })`)
   - 홈피드 (`probeSerp({ mode: 'homefeed' })`)
   - 제휴 (`probeSerp({ mode: 'affiliate' })`)
   - 업체 (`probeSerp({ mode: 'business' })`)
   - 사용자정의 (`probeSerp({ mode: 'custom' })`)
   - 이미지 추론 (신규 v2.11.0 SPEC-IMAGE-NARRATIVE)
3. 산출물 위치:
   - 생성된 글 JSON: `userData/published-posts/`
   - 발행 로그: operationsDashboard 메트릭 (메모리 — 사용자가 UI에서 확인)
   - 스크린샷: `userData/screenshots/` (debugDump 활성 시)

### P9 smoke-report 템플릿

사용자가 답장으로 채워서 보낸다:

```
DOGFOOD vX.Y.Z — YYYY-MM-DD
exe   : Better-Life-Naver-Setup-X.Y.Z.exe   size: ___MB
환경  : Win11 / userData ___MB

[ ] SEO         PASS/FAIL/SKIP    log:
[ ] 홈피드      PASS/FAIL/SKIP    log:
[ ] 제휴        PASS/FAIL/SKIP    log:
[ ] 업체        PASS/FAIL/SKIP    log:
[ ] 사용자정의  PASS/FAIL/SKIP    log:
[ ] 이미지 추론 PASS/FAIL/SKIP    log:

회귀 (이전 vX.Y.(Z-1) 대비 신규 실패 건수): ___
신규 오류 메시지 (원문):
다음 cycle 권장 fix 위치:
```

자연어로 답해도 받지만 위 6필드 다 비어있으면 P10 차단. 부분만 채워져도 "FAIL 1건 = 차단" 룰은 그대로.

### dogfood 면제 케이스

P4 selector-fix 단독 + P5 key-encrypt 단독은 면제 가능. 이유: selectors/prompts/key-encrypt 는 god file 영역 미진입 + 자동화 플로우 본질 미변경. 면제 판정은 사용자 명시 동의 필요 (자동 면제 X).

god file (contentGenerator / renderer / naverBlogAutomation / main / fullAutoFlow) 변경 commit이 1건이라도 섞이면 dogfood 의무.

---

## P10 — release (사용자 명시 OK)

진입 조건 (둘 다 만족):

1. P4~P6에서 코드 변경 commit ≥ 1건 (변경 origin이 src/ 또는 prompts/ 또는 selectors/ 또는 package.json+lock)
2. P9 6모드 PASS 또는 면제 케이스

진입 거부 케이스:

- 변경 origin이 `RELEASE_NOTES_*.md`, `*.md` 문서, `.autopus/specs/`, `CLAUDE.md` 단독 → 사용자 체감 변화 0 = 빈 버전업 = 거부
- 사용자가 동의해도 거부. 이유 설명하고 끝낸다.

릴리즈 절차 (확정 패턴):

```bash
# 1. package.json bump (patch)
# 2. RELEASE_NOTES_v2.X.Y.md (실측만, 추정 0)
# 3. git commit + push origin main
# 4. npm run release (background, 5~10분)
# 5. exe + blockmap 하이픈 변환
mv "release_final/Better Life Naver Setup X.Y.Z.exe" \
   "release_final/Better-Life-Naver-Setup-X.Y.Z.exe"
cp "release_final/Better Life Naver Setup X.Y.Z.exe.blockmap" \
   "release_final/Better-Life-Naver-Setup-X.Y.Z.exe.blockmap"
# 6. latest.yml 갱신 (sha512 + size 재계산)
node -e "const fs=require('fs'),c=require('crypto');const p='release_final/Better-Life-Naver-Setup-X.Y.Z.exe';console.log('sha512:',c.createHash('sha512').update(fs.readFileSync(p)).digest('base64'));console.log('size:',fs.statSync(p).size);console.log('releaseDate:',new Date().toISOString());"
# 7. tag + push
git tag -a vX.Y.Z -m "..."
git push origin vX.Y.Z
# 8. gh release create (3 assets 의무)
gh release create vX.Y.Z \
  "release_final/Better-Life-Naver-Setup-X.Y.Z.exe" \
  "release_final/Better-Life-Naver-Setup-X.Y.Z.exe.blockmap" \
  "release_final/latest.yml" \
  --title "..." --notes-file "RELEASE_NOTES_vX.Y.Z.md"
# 9. 검증
gh release view vX.Y.Z --json assets -q '.assets[].name'
curl -sI "https://github.com/cd000242-sudo/naver/releases/download/vX.Y.Z/latest.yml" | head -1
```

`releaseDate` 는 무조건 `new Date().toISOString()` 으로 계산할 것. v2.11.2 때 '2026-05-28T13:30:00.000Z' 같은 추측 시각 박았다가 자동 업데이트 시각 비교 로직에서 어긋날 뻔.

---

## 안 하는 것들

API 키 실제 호출. 비용 나옴.

god file에 한 commit으로 5+ hunks. 저번에 270개 vitest 터졌음.

silent fallback (다른 모델 자동 대체). 사용자 의도 보호 못 함.

빈 버전업 릴리즈. 사용자가 동의해도 거부 — 동일 exe 새 버전 번호로 다시 올리면 자동 업데이트만 한 번 더 발생.

P4~P6 fix 한 cycle 내 묶기. 1 hunk = 1 commit = Gate B 1회.

성능 향상 추정치 RELEASE_NOTES에 박기. 실측만.

추정으로 다음 액션 진행. 사용자 무응답 = 보류.

---

## v2.11.2 자체 결함 (반성)

이 파일 정리하면서 직전 세션 자체 결함도 같이 본다:

- decryptConfigOnLoad / migrateConfigToEncrypted 통합 후 신규 unit test 0건. M1 P4 cycle에서 보강 의무
- v2.11.2 dogfood 없이 릴리즈. SPEC R2 위반. 본 워크플로우 도입 전이라 어쩔 수 없었지만 다음 세션에서 사용자한테 dogfood 받고 결과에 따라 v2.11.3 hotfix 판단
- configManager 4 hunks (god 한도 3). 진짜 분리 가능했는데 "1 통합 변경" 논리로 회피. 다음에는 import + loadConfig decrypt 1 commit, saveConfig encrypt + backsync 1 commit으로 쪼갠다
- M3 P2 `window.confirm()` — sandbox=true / CSP 와 충돌 가능. toastManager 패턴으로 교체 필요. M3 P3 cycle에 묶어서

---

## 다음 세션 진입할 때

그냥 "네이버 리프레시" 치면 됨. 또는 좀 더 명확히:

```
NAVER_REFRESH.md 읽고 P0~P3 진단만 돌려줘. 후속은 보고 받고 결정.
```

부분만 보고 싶으면:

```
네이버 리프레시 셀렉터만
네이버 리프레시 회귀만
```

전체 cycle 한 번에 갔으면 좋겠으면:

```
네이버 리프레시 릴리즈까지
```

마지막 옵션은 코드 변경 0건이면 P10 진입 자체가 거부됨. 그게 정상.
