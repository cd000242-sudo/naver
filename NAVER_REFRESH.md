# NAVER_REFRESH — 격변 대응 통합 워크플로우

> **트리거 키워드** (자연어 + 슬래시 모두 인식):
> - "네이버 리프레시" / "네이버 업데이트" / "네이버 격변 대응"
> - "API 키 / MCP / 셀렉터 다 점검" / "전체 헬스 진단"
> - `/refresh-naver` / `/naver-refresh`
>
> **목적**: 네이버 UI 셀렉터, API 키 12종, MCP 서버, 자동화 라이브러리 의존성이 격변하는 상황에서
> 한 줄 명령으로 전체 헬스 진단 → 자동 fix → 사용자 동의 후 릴리즈.

---

## 절대 원칙 (위반 금지)

1. **빈 버전업 릴리즈 0건** — 코드 변경 0건이면 빌드/릴리즈 절대 진행 금지. 사용자 명시 동의 있어도 거부 + 이유 설명.
2. **silent fallback 0건** ([[feedback_no_fallback]]) — API 키 실패/모델 실패 시 차단형 모달 + 사용자 명시 동의로 처리. 다른 모델 자동 대체 금지.
3. **god file 1릴리즈 1~3 hunks** ([[feedback_no_cascade_fix]]) — 한 릴리즈에 god file (contentGenerator/renderer/naverBlogAutomation/main) 변경은 1~3 hunks 한도.
4. **매 commit 후 회귀 검증** ([[feedback_regression_check_every_phase]]) — vitest + tsc + lint 통과 의무.
5. **사용자 동의 필요 작업 자동 진행 금지** — Phase 7~9 (commit/upgrade/release) 는 사용자 명시 OK 후 진행.
6. **추정/예상 결과 금지** ([[feedback_no_speculation]]) — "성능 X% 향상" 같은 추정 0건. 실측 명시만.

---

## Phase 0~6 (자동 진행 OK, 사용자 동의 불필요)

### Phase 0 — 인식 (Recognition)

```bash
# git 상태
git log --oneline -10
git status --short | head -20

# 최근 릴리즈 + 태그
gh release list --limit 5

# 회귀 가드 baseline 측정
npx vitest run 2>&1 | tail -10   # 기대: 전체 PASS
npx tsc --noEmit; echo "TSC=$?" # 기대: exit 0
```

**산출**: 현재 HEAD commit / vitest 통과 수 / 최근 릴리즈 / 미커밋 변경 목록

---

### Phase 1 — 셀렉터 헬스 (Selector Health)

네이버 UI 변경은 가장 빈번한 격변 원인. `src/automation/selectors/` 가 중앙 레지스트리.

```bash
# 셀렉터 모듈 인벤토리
ls src/automation/selectors/   # 11개 파일 예상 (login/editor/publish/image/cta/place/flow/shopping/topBlogger + index/remoteUpdate/utils/types)

# 원격 셀렉터 패치 마지막 동기화 시점
git log --oneline -5 -- src/automation/selectors/

# 텔레메트리 — 최근 셀렉터 실패 로그
grep -r "SELECTOR_NOT_FOUND\|selector failed\|TimeoutError" .autopus/logs/ 2>/dev/null | tail -20
```

**자동 fix 가능 영역**:
- 원격 셀렉터 매니페스트 (`remoteUpdate.ts`) 가 신규 패치 명시했으면 selectors/*.ts 갱신 (텔레메트리 기반)
- 안전: 원격 매니페스트가 검증한 셀렉터만 자동 반영. 추정 패치 0.

**사용자 동의 필요 영역**:
- 신규 셀렉터 fallback 추가 (god file 영향 가능)
- 셀렉터 strategy 변경 (XPath ↔ CSS)

---

### Phase 2 — API 키 형식 검증 (API Key Format Check, 비용 0)

**실제 API 호출 절대 금지** — 모든 키마다 비용 발생.

```bash
# .env 검증 (마스킹된 형식만 출력, 키 값 노출 X)
node -e "
const fs = require('fs');
const env = fs.existsSync('.env') ? fs.readFileSync('.env','utf-8') : '';
const lines = env.split('\n').filter(l => l.includes('='));
const keys = lines.map(l => {
  const [k, ...vs] = l.split('=');
  const v = vs.join('=').trim();
  return { key: k, format: v.length === 0 ? 'EMPTY' : v.length < 20 ? 'TOO_SHORT' : 'OK', length: v.length };
});
console.log(JSON.stringify(keys, null, 2));
"

# settings.json 암호화 상태 (M1 P3 활성화 후 enc:v1: 접두사 의무)
node -e "
const fs = require('fs'), path = require('path');
const userDataDir = require('os').homedir() + '/AppData/Roaming/better-life-naver';
const settingsPath = path.join(userDataDir, 'settings.json');
if (!fs.existsSync(settingsPath)) { console.log('settings.json 없음'); return; }
const cfg = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
const SENSITIVE = ['geminiApiKey','openaiApiKey','claudeApiKey','perplexityApiKey','naverClientSecret','savedNaverPassword','savedLicensePassword'];
for (const k of SENSITIVE) {
  const v = cfg[k];
  if (!v) { console.log(\`\${k}: EMPTY\`); continue; }
  console.log(\`\${k}: \${v.startsWith('enc:v1:') ? '🔐 ENCRYPTED' : '⚠️ PLAINTEXT'} (len=\${v.length})\`);
}
"
```

**자동 진행 OK**:
- 형식 검증 (길이/접두사) — 비용 0
- 평문 키 발견 시 다음 saveConfig에서 자동 마이그레이션 (M1 P3 이미 활성)

**사용자 동의 필요**:
- 키 재발급 (사용자가 직접 콘솔/포털에서)
- 신규 provider 추가 (.env / configManager 변경)

---

### Phase 3 — MCP 서버 헬스 (MCP Health, Claude Code 개발용)

```bash
# .mcp.json 인벤토리
cat .mcp.json | head -50

# MCP 서버 ping (timeout 5초 / 서버, 응답만 확인)
# (Bash로 직접 실행 불가 — Claude Code MCP 호출은 도구로만 가능)
# 대신 npx 명령으로 각 서버 패키지 버전만 확인 (네트워크 호출 X)
for pkg in @upstash/context7-mcp @modelcontextprotocol/server-github @modelcontextprotocol/server-memory @modelcontextprotocol/server-playwright; do
  echo "=== $pkg ==="
  npm view $pkg version 2>&1 | head -1
done
```

**자동 fix 가능**:
- `.mcp.json` 의 핀된 버전이 npm latest 와 비교해서 minor/patch만 뒤떨어진 경우 → 버전 bump 제안 (수정은 사용자 동의 후)

**사용자 동의 필요**:
- MCP 서버 신규 추가/제거
- breaking change 가능한 major bump
- 본 Electron 앱 내부 MCP 클라이언트 통합 (M4 P2 — 사용자 명시 요청 시만)

---

### Phase 4 — 의존성 헬스 진단 (Dep Diagnosis, install 0)

```bash
# 핵심 dep 버전 + outdated 진단 (install 절대 X)
npm outdated puppeteer puppeteer-extra puppeteer-extra-plugin-stealth playwright playwright-extra @playwright/test 2>&1 | head -20
npm outdated electron @anthropic-ai/sdk openai @google/generative-ai 2>&1 | head -20

# Stage 분류 (이전 SPEC-DEPS-UPGRADE-2026 기준)
# Stage 1+2 (적용 완료): typescript-eslint, @google/generative-ai
# Stage 3 (MEDIUM): eslint 9→10, eslint-plugin-jsdoc 48→62
# Stage 4 (HIGH): openai 4→6, @anthropic-ai/sdk 0.21→0.99 — 별도 SPEC 필요
# Stage 5 (CRITICAL): electron 31→41 — 별도 SPEC + smoke test 필수
# Stage 6 (HIGH): typescript 5→6, mongoose 8→9 — 별도 SPEC 필요
```

**자동 진행 0** — 의존성 변경은 항상 사용자 동의 + 별도 SPEC 후 진행. major bump는 ESM smoke test 의무 ([[major_dep_smoke_test]]).

---

### Phase 5 — 회귀 검증 (Regression Guard)

```bash
npx vitest run 2>&1 | tail -10       # baseline 2434/2434 PASS (2026-05-28 시점)
npx tsc --noEmit; echo "TSC=$?"      # exit 0 의무
npm run lint 2>&1 | tail -5          # 0 errors / 1023 warnings baseline
```

**진단 출력**: 통과/실패 수 + 신규 회귀 여부 + flaky 후보 (full suite ↔ isolation 비교)

---

### Phase 6 — 진단 리포트 출력

위 Phase 0~5 결과를 다음 형식으로 사용자에게 출력:

```markdown
## 🩺 NAVER_REFRESH 진단 리포트 (YYYY-MM-DD HH:MM)

### Phase 0 인식
- HEAD: <commit hash>
- 최근 릴리즈: vX.Y.Z
- 미커밋 변경: N개 파일

### Phase 1 셀렉터
- 11개 모듈 / 마지막 갱신 N일 전
- 원격 패치 후보: N건
- 텔레메트리 실패: N건

### Phase 2 API 키
- .env: N개 키 (OK X건, EMPTY Y건)
- settings.json: ENCRYPTED X / PLAINTEXT Y

### Phase 3 MCP
- 6 서버 / outdated N개

### Phase 4 의존성
- Stage 3~6 후보 명시 (자동 진행 X)

### Phase 5 회귀
- vitest A/B PASS
- tsc exit 0
- lint 0 errors / N warnings

### 권장 다음 단계 (사용자 동의 필요)
- [ ] X
- [ ] Y
```

---

## Phase 7~9 (사용자 명시 동의 후 진행)

### Phase 7 — fix commit

진단 결과 명백한 fix가 있을 때만 진행. god file 룰 준수:

- 1릴리즈 god file 1~3 hunks 한도
- 회귀 cascade 절대 금지 ([[feedback_no_cascade_fix]])
- "완벽하게" 요청에도 단계 분할
- Lore 형식 commit message + 🐙 Autopus sign-off

### Phase 8 — 의존성 업그레이드

Stage 3 이상은 모두 별도 SPEC 작성 후 진행:
- `.autopus/specs/SPEC-DEPS-UPGRADE-XXXX/spec.md` 작성
- 사용자 검토 + 명시 OK
- ESM smoke test (puppeteer 25 회귀 사례 [[major_dep_smoke_test]])
- npm install 후 vitest 회귀 즉시 검증

### Phase 9 — 빌드 + GitHub 릴리즈

**진입 조건**: Phase 7에서 코드 변경 commit이 1건 이상 발생. 그렇지 않으면 거부 + 이유 설명 ("코드 변경 0건 → 빈 버전업 0").

릴리즈 절차 (HANDOFF §8.2 확정 패턴):

```bash
# 1. package.json bump (patch: 2.X.Y → 2.X.(Y+1))
# 2. RELEASE_NOTES_v2.X.Y.md 작성 (실측 변경만, 추정 0)
# 3. git add + commit + push origin main
# 4. npm run release   # 5~10분 background. GH_TOKEN 부재로 publish 실패해도 exe + blockmap 생성됨
# 5. exe + blockmap 하이픈 변환 (필수)
mv "release_final/Better Life Naver Setup X.Y.Z.exe" \
   "release_final/Better-Life-Naver-Setup-X.Y.Z.exe"
cp "release_final/Better Life Naver Setup X.Y.Z.exe.blockmap" \
   "release_final/Better-Life-Naver-Setup-X.Y.Z.exe.blockmap"
# 6. latest.yml 갱신 (sha512 + size 재계산)
node -e "const fs=require('fs'),c=require('crypto'); const p='release_final/Better-Life-Naver-Setup-X.Y.Z.exe'; console.log('sha512:',c.createHash('sha512').update(fs.readFileSync(p)).digest('base64')); console.log('size:',fs.statSync(p).size);"
# 7. git tag + push
git tag -a vX.Y.Z -m "..."
git push origin vX.Y.Z
# 8. gh release create (3 assets 의무)
gh release create vX.Y.Z \
  "release_final/Better-Life-Naver-Setup-X.Y.Z.exe" \
  "release_final/Better-Life-Naver-Setup-X.Y.Z.exe.blockmap" \
  "release_final/latest.yml" \
  --title "..." --notes-file "RELEASE_NOTES_vX.Y.Z.md"
# 9. 검증
gh release view vX.Y.Z --json assets -q '.assets[].name'   # 3 assets 출력 의무
curl -sI "https://github.com/cd000242-sudo/naver/releases/download/vX.Y.Z/latest.yml" | head -1   # HTTP 302
```

---

## 트리거 시 AI 행동 (요약)

사용자 명령 인식 → 즉시 다음 흐름:

1. **즉시 Phase 0~5 실행** (사용자 동의 불필요, 진단만 — 비용 0)
2. **Phase 6 진단 리포트 출력** (markdown 표 형식)
3. **권장 다음 단계를 사용자에게 제시 + 동의 요청** (AskUserQuestion 도구로 옵션 선택)
4. **사용자 OK 후 Phase 7~9 진행** (코드 변경 0건이면 9 자동 거부)

---

## Anti-pattern (절대 금지)

- ❌ "전체 자동" 요청 받았다고 빈 버전업 릴리즈 진행
- ❌ API 키 실패 시 다른 provider 자동 폴백 (사용자 의도 보호)
- ❌ 셀렉터 변경 후 회귀 검증 스킵
- ❌ god file에 한 commit으로 5+ hunks 변경
- ❌ "성능 향상 X%" 같은 추정 결과 표기
- ❌ MCP/dep upgrade를 SPEC 없이 진행
- ❌ 사용자 dogfood 없이 베타 → 정식 release

---

## 다음 세션 진입 시 인식 명령어

```
NAVER_REFRESH.md 읽고 본 워크플로우에 따라 Phase 0~5 진단 실행 후 리포트 출력.
```

또는 단순:

```
네이버 리프레시
```

🐙 Autopus — SPEC-MIGRATION-2026 기반
