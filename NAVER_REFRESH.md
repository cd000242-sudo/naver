# NAVER_REFRESH — 격변 대응 메모

네이버 UI는 한 달에도 몇 번씩 셀렉터가 바뀌고, API 키는 12종에 MCP 6서버, dep는 stage 5단계까지 밀려있다. 한 줄 명령으로 다 점검하고 fix까지 가져가는 흐름을 한 곳에 모아둠. 다음에 또 까먹지 말자고.

트리거는 자연어든 슬래시든 둘 다 받음. "네이버 리프레시", "네이버 업데이트", "API 키/MCP/셀렉터 점검", "/refresh-naver", "/naver-refresh".

근데 이 키워드만으로는 범위가 너무 넓다. "셀렉터만" 의도일 수도 있는데 풀체크 돌리면 시간 낭비. 그래서 sub-command 자연어 매핑을 따로 둠 (아래 "범위 좁히기" 절).

## 일단 결론부터

순서는 진단 → fix → 빌드/dogfood → 릴리즈. 진단은 비용 0이라 막 돌려도 되고, fix부터는 한 cycle에 hunk 하나 + 회귀 검증 한 번. 빈 버전업 릴리즈는 사용자가 명시 OK 해도 거부한다. 저번에 v2.11.2 직후 v2.11.3 요청 받았다가 동일 exe 올릴 뻔한 적 있어서 룰 박아둠.

## 전체 흐름

크게 네 덩어리. 진단 (P0~P3) / fix cycle (P4~P6) / dogfood (P7~P9) / release (P10).

진단 덩어리는 비용 0이라 자동으로 돌린다. git log 보고, 셀렉터/키/MCP/dep outdated 점검하고, vitest+tsc+lint baseline 측정하고, 짧게 리포트 출력하면 끝. 5분 안쪽.

진단 끝나면 사용자한테 옵션 던진다 (Gate A). 전체로 갈지, 부분만 갈지, 그냥 끝낼지. 모호하면 그냥 "진단만"이 기본값이고 거기서 멈춤. 사용자 무응답이면 추측해서 가지 말 것.

fix cycle은 한 cycle에 hunk 하나만 처리한다. 셀렉터 자동 패치(P4), 평문 키 잔존분 암호화(P5), Stage 3 이상 dep 업그레이드(P6) 중 하나. 묶어서 처리하면 안 됨 — god file에 한 번에 5+ hunks 박았다가 vitest 270개 터진 적 있다.

각 fix 끝나면 Gate B를 통과해야 한다. vitest 통과 수가 줄어들면 안 되고, tsc는 깨끗하게 통과, lint warning이 늘면 안 되고, diff는 짧아야 한다 (god file은 hunk 3개 한도). 하나라도 어긋나면 즉시 revert. "조금만 더 손보면 통과할 것 같은데" 같은 생각하지 말 것.

dogfood는 vitest 통과 = 회귀 검증으로 등치하지 않기 위해 박은 게이트다. 사용자가 실제 .exe를 더블클릭해서 6모드 (SEO/홈피드/제휴/업체/사용자정의/이미지 추론) 풀오토 한 번씩 돌리고, 아래 템플릿 채워서 답장한다. FAIL 1건이라도 잡히면 P10 차단하고 새 fix cycle로 돌아간다.

release는 진입 조건 두 개를 동시에 만족해야 한다. fix cycle에서 코드 변경 commit이 최소 1건이고, dogfood 6모드가 PASS 또는 면제 케이스. 변경 origin이 문서/SPEC/CLAUDE.md 단독이면 사용자가 동의해도 거부한다. 이유 설명하고 끝낸다.

## 범위 좁히기

트리거에 다음 단어가 같이 들어오면 해당 sub만 돌린다.

"셀렉터만" 또는 "selectors" — 진단 → 셀렉터 리포트 → 사용자 OK → P4 → Gate B. 5분쯤.

"키만" 또는 "api 키 점검" — 진단 → 키 리포트 → 사용자 OK → P5. 5분쯤.

"MCP 점검" — MCP 인벤토리만. 4분쯤.

"의존성 진단" 또는 "dep" — npm outdated만. 4분쯤.

"회귀만" — vitest+tsc+lint만. 2분쯤.

"진단만" — P0~P3 전부, fix는 안 함. 5분쯤. 이게 기본값.

"전체" / "리프레시" / "격변 대응" — 진단 풀체크 + 후속 옵션 제시. 5분 + 사용자 선택.

"릴리즈까지" — P0부터 P10까지 풀 cycle. 변경 0건이면 P10에서 자동 거부. 1시간 이상.

모호하면 무조건 "진단만"으로 시작. 추가 범위는 Gate A에서 한 번 묻고 가는 게 안전하다.

## P0 — 인식

```bash
git log --oneline -10
git status --short | head -20
gh release list --limit 5
```

뭘 알고 싶냐: 마지막 commit, 미커밋 파일 목록, 최근 릴리즈 태그. 셋이면 충분.

## P1 — 진단 4종

### 셀렉터

핵심은 `src/automation/selectors/` 11개 모듈과 `remoteUpdate.ts` 원격 매니페스트.

근거: 셀렉터 실패는 메모리 버퍼에만 쌓인다 (`selectorUtils.ts:9`의 `failureReports`, 최대 100건). 디스크 동기화 없음. `reportFailureTelemetry(endpoint)` (`remoteUpdate.ts:263-300`)가 서버에 POST하고 `clearFailureReports()` 호출. 운영 대시보드 (`operationsDashboard.ts:74-102`)도 메모리 메트릭만.

그래서 P1 셀렉터 진단은 디스크 grep으로 뽑을 게 없다. 대신 git log로 최근 갱신 시점 본다.

```bash
git log --oneline -5 -- src/automation/selectors/
git diff HEAD~10 HEAD -- src/automation/selectors/ | head -50
```

런타임 실패 텔레메트리를 보고 싶으면 실행 중인 앱에서 `operationsDashboard` IPC 호출해야 함. 다음 세션에서 별도 작업.

### API 키 형식 (비용 0)

실제 호출하면 12종 × 비용. 형식만 검증한다.

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

settings.json 암호화 여부 확인은 Windows / macOS 둘 다 챙겨야 한다. Windows는 `%APPDATA%\Better Life Naver\settings.json`, macOS는 `~/Library/Application Support/Better Life Naver/settings.json` (출처: `scripts/reset-config-for-pack.js:15-19`). 다중 계정 파일 패턴은 `settings_{userId_sanitized}.json` (`configManager.ts:276`). 마스터 settings.json 외에 `settings_*.json`도 다 봐야 한다 — 계정마다 키 분기되니까.

각 settings 파일의 SENSITIVE 필드가 `enc:v1:` 접두사를 달고 있으면 OK. 평문이면 다음 saveConfig 때 M1 P3가 자동 마이그레이션 (commit fb28b007).

### MCP

```bash
cat .mcp.json | head -50
```

근거: `.mcp.json` 6서버 (context7 / exa / github / memory / playwright / sequential-thinking). 이 Electron 앱에는 `@modelcontextprotocol/sdk` 의존성 없음 (package.json 확인). MCP는 Claude Code 개발 세션 전용.

MCP "헬스 체크" 라고 npm registry latest 비교하는 거 솔직히 의미 없다. 실제 서버 동작은 stdin/stdout JSON-RPC라 Claude Code 내부에서만 알 수 있다. P1 MCP는 그냥 인벤토리만 출력하고 끝. 진짜 동작 확인은 다음 세션에서 도구 호출 시도해보는 것밖에 없다.

### 의존성 outdated (install 0)

```bash
npm outdated puppeteer puppeteer-extra puppeteer-extra-plugin-stealth playwright playwright-extra @playwright/test 2>&1 | head
npm outdated electron @anthropic-ai/sdk openai @google/generative-ai 2>&1 | head
```

Stage 표 외워둘 것.

- Stage 1+2 — 적용 완료 (typescript-eslint, @google/generative-ai)
- Stage 3 — eslint 9→10, jsdoc 48→62. MEDIUM, 하루
- Stage 4 — openai 4→6, @anthropic-ai/sdk 0.21→0.99. HIGH, 별도 SPEC 필수
- Stage 5 — electron 31→41. CRITICAL, SPEC + smoke test 의무
- Stage 6 — typescript 5→6, mongoose 8→9. HIGH, 별도 SPEC

Stage 4 이상은 P1에서 진단만 한다. P6 fix는 SPEC 작성 후 사용자 OK 받고 나서. major bump에 ESM smoke test 안 돌리면 puppeteer 25 회귀 같은 거 또 터진다.

## P2 — baseline

```bash
npx vitest run 2>&1 | tail -10
npx tsc --noEmit; echo "TSC=$?"
npm run lint 2>&1 | tail -5
```

2026-05-28 baseline은 vitest 2434/2434 PASS (171 files, duration 10초쯤), tsc exit 0, eslint 0 errors / 1020 warnings (41 auto-fixable).

flaky test 인식하고 가야 한다. timing-sensitive 패턴 쓰는 파일 8건: `licenseManagerRegression.test.ts` (오프라인 체크 + await), `configManagerRegression.test.ts` (fs + EBUSY retry), `cohortWiringGuard.test.ts`, `exposurePollerGuard.test.ts`, `userDataMigrationRegression.test.ts`, `base64Async.test.ts`, `chainCache.test.ts` (30ms TTL — 빡빡함), `sessionKeepaliveV2.test.ts`.

이 중 하나가 fail로 잡히면 단정하지 말고 isolation 재실행 한 번 해본다.

```bash
npx vitest run src/__tests__/<해당파일>.test.ts
```

isolation에서 PASS면 flaky로 처리하고 baseline은 그대로 둔다. 잘못 알람 떴다고 워크플로우 중단하지 말 것.

## P3 — 리포트 + Gate A

P0~P2 결과를 짧게 출력한다. 표 안에 표 같은 거 만들지 말고 단락 + 코드블록.

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

여기서 사용자한테 자연어로 묻는다. AskUserQuestion 강요하지 말 것. 선택지가 2개 이상으로 명확하게 갈리는 경우만 AskUserQuestion 쓴다. 단일 yes/no면 자연어 대기. 한 번 거부당하면 다음부터는 자연어로만 진행.

사용자가 무응답이면 거기서 끝. 추측해서 다음 액션 가지 말 것.

## P4~P6 — fix cycle (Gate B)

fix 하나에 commit 하나, Gate B 한 번. 절대 묶지 말 것.

### P4 셀렉터 fix

원격 매니페스트가 검증한 셀렉터만 staged 상태로 반영. 자동 commit은 금지. P3 리포트에 "원격 매니페스트 N건 staged"로 표기하고, 사용자가 명시 OK 해야 commit으로 넘어간다.

이유: 자동 commit이 되면 동의 게이트가 우회된다. 원격 매니페스트 자체는 사용자 클라이언트 런타임에 실시간 적용되니까 (remoteUpdate.ts), 릴리즈 지연으로 인한 사용자 다운타임은 제한적이다.

### P5 키 암호화

M1 P3 (commit fb28b007) 이미 활성. P5는 그 이후에도 평문 잔존하는 케이스만 본다.

마이그레이션 1회 후엔 새 saveConfig에서 `enc:v1:` 접두사 자동 처리. 별도 PC에서 decrypt 실패하면 UI 모달 띄워야 하는데 (M1 P4) 그건 후속 commit. Documents/_safe 미러는 파일 복사 방식이라 자동으로 암호화본 미러된다.

### P6 dep 업그레이드

Stage 3 이상은 전부 SPEC 선결. install 직전에 브랜치 분리하고 즉시 회귀 확인.

```bash
git checkout -b dep/stageN-{lib}-{old}-to-{new}
npm install <lib>@<new> --save-dev
npx vitest run
```

ESM 전환 가능성 있는 lib (puppeteer 25 같은 거) 는 runtime smoke test 의무. unit test만으로 안전 보증 안 됨.

### Gate B 통과 조건

vitest 통과 수가 줄어들면 안 되고, tsc는 깨끗하게 통과, lint warning이 늘면 안 되고, diff는 30줄 안쪽이어야 한다. god file은 hunk 3개 한도.

하나라도 어긋나면 즉시 revert. 한 번에 한 hunk만.

## P7~P9 — dogfood (Gate C)

여기가 진짜 핵심이다. vitest 통과 = 회귀 검증으로 등치하는 가정 버릴 것.

### P7 pack-local

```bash
npm run release
```

5~10분. GH_TOKEN 없으면 publish 실패해도 `release_final/Better Life Naver Setup X.Y.Z.exe`랑 `.exe.blockmap`은 생성됨. 그게 정상.

### P8 exe-install (사용자가 직접)

사용자한테 넘기는 부분. 다음 정확히 안내한다.

1. `release_final/Better Life Naver Setup X.Y.Z.exe` 하이픈 변환 후 더블클릭
2. 6모드 풀오토 한 건씩
   - SEO (`probeSerp({ mode: 'seo' })`)
   - 홈피드 (`probeSerp({ mode: 'homefeed' })`)
   - 제휴 (`probeSerp({ mode: 'affiliate' })`)
   - 업체 (`probeSerp({ mode: 'business' })`)
   - 사용자정의 (`probeSerp({ mode: 'custom' })`)
   - 이미지 추론 (v2.11.0 SPEC-IMAGE-NARRATIVE)
3. 산출물 위치
   - 생성된 글 JSON: `userData/published-posts/`
   - 발행 로그: operationsDashboard 메트릭 (메모리. UI에서 확인)
   - 스크린샷: `userData/screenshots/` (debugDump 활성 시)

### P9 smoke-report 템플릿

사용자가 답장으로 채워서 보낸다.

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

자연어로 답해도 받지만 6필드 다 비어있으면 P10 차단. 부분만 채워져도 FAIL 1건이면 차단 룰은 그대로.

### dogfood 면제

P4 셀렉터 단독, P5 키 암호화 단독은 면제 가능. 이유: 셀렉터/prompts/키 암호화는 god file 영역 미진입 + 자동화 플로우 본질 미변경. 면제 판정은 사용자 명시 동의 필요 (자동 면제 안 됨).

god file (contentGenerator / renderer / naverBlogAutomation / main / fullAutoFlow) 변경 commit이 하나라도 섞이면 dogfood 의무.

## P10 — release (사용자 명시 OK)

진입 조건 둘 다 만족.

- P4~P6에서 코드 변경 commit이 1건 이상이고, 변경 origin이 `src/` 또는 `src/prompts/` 또는 `src/automation/selectors/` 또는 `package.json+lock` 중 하나
- P9 6모드 PASS 또는 면제 케이스

거부 케이스. 변경 origin이 `RELEASE_NOTES_*.md`, `*.md` 문서, `.autopus/specs/`, `CLAUDE.md` 단독이면 사용자 체감 변화가 0이라 빈 버전업 = 거부. 사용자가 동의해도 거부한다. 이유 설명하고 끝낸다.

릴리즈 절차는 확정 패턴.

```bash
# 1. package.json bump (patch)
# 2. RELEASE_NOTES_v2.X.Y.md (실측만, 추정 박지 말 것)
# 3. git commit + push origin main
# 4. npm run release (background, 5~10분)
# 5. exe + blockmap 하이픈 변환
mv "release_final/Better Life Naver Setup X.Y.Z.exe" \
   "release_final/Better-Life-Naver-Setup-X.Y.Z.exe"
cp "release_final/Better Life Naver Setup X.Y.Z.exe.blockmap" \
   "release_final/Better-Life-Naver-Setup-X.Y.Z.exe.blockmap"
# 6. latest.yml 갱신 (sha512 + size 재계산, releaseDate는 무조건 new Date().toISOString())
node -e "const fs=require('fs'),c=require('crypto');const p='release_final/Better-Life-Naver-Setup-X.Y.Z.exe';console.log('sha512:',c.createHash('sha512').update(fs.readFileSync(p)).digest('base64'));console.log('size:',fs.statSync(p).size);console.log('releaseDate:',new Date().toISOString());"
# 7. tag + push
git tag -a vX.Y.Z -m "..."
git push origin vX.Y.Z
# 8. gh release create (3 assets)
gh release create vX.Y.Z \
  "release_final/Better-Life-Naver-Setup-X.Y.Z.exe" \
  "release_final/Better-Life-Naver-Setup-X.Y.Z.exe.blockmap" \
  "release_final/latest.yml" \
  --title "..." --notes-file "RELEASE_NOTES_vX.Y.Z.md"
# 9. 검증
gh release view vX.Y.Z --json assets -q '.assets[].name'
curl -sI "https://github.com/cd000242-sudo/naver/releases/download/vX.Y.Z/latest.yml" | head -1
```

`releaseDate`는 무조건 `new Date().toISOString()`으로 계산할 것. v2.11.2 때 '2026-05-28T13:30:00.000Z' 같은 추측 시각 박았다가 자동 업데이트 시각 비교 로직에서 어긋날 뻔했다.

## 안 하는 것들

API 키 실제 호출. 비용 나온다.

god file에 한 commit으로 5개 이상 hunks. 저번에 vitest 270개 터졌다.

silent fallback (다른 모델 자동 대체). 사용자 의도 보호 못 한다.

빈 버전업 릴리즈. 사용자가 동의해도 거부 — 동일 exe를 새 버전 번호로 다시 올리면 사용자 PC에 자동 업데이트만 한 번 더 발생한다.

P4~P6 fix를 한 cycle 안에 묶기. hunk 하나 = commit 하나 = Gate B 한 번.

성능 향상 추정치 RELEASE_NOTES에 박기. 실측만 적는다.

사용자 무응답일 때 추측해서 다음 액션 진행. 보류한다.

## v2.11.2 자체 결함 (반성)

이 파일 정리하면서 직전 세션 결함도 같이 본다.

decryptConfigOnLoad / migrateConfigToEncrypted 통합 후 신규 unit test 0건. M1 P4 cycle에서 보강 의무.

v2.11.2 dogfood 없이 릴리즈한 거. SPEC R2 위반이다. 이 워크플로우 도입 전이라 어쩔 수 없었지만 다음 세션에서 사용자한테 dogfood 받고 결과에 따라 v2.11.3 hotfix 판단.

configManager 4 hunks (god 한도 3). 진짜 분리 가능했는데 "1 통합 변경" 논리로 회피한 거다. 다음에는 import + loadConfig decrypt를 한 commit으로, saveConfig encrypt + backsync를 다른 commit으로 쪼갠다.

M3 P2에서 `window.confirm()` 쓴 거. sandbox=true + CSP 정책이랑 충돌 가능. toastManager 패턴으로 교체 필요. M3 P3 cycle에 묶어서.

## 다음 세션 진입할 때

그냥 "네이버 리프레시" 치면 됨. 또는 좀 더 명확히 "NAVER_REFRESH.md 읽고 P0~P3 진단만 돌려줘. 후속은 보고 받고 결정."

부분만 보고 싶으면 "네이버 리프레시 셀렉터만" 또는 "네이버 리프레시 회귀만".

전체 cycle 한 번에 가고 싶으면 "네이버 리프레시 릴리즈까지". 마지막 옵션은 코드 변경 0건이면 P10 진입 자체가 거부된다. 그게 정상.
