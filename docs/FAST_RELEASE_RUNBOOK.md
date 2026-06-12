# Fast Reliable Release Runbook

Better Life Naver를 가장 빠르고 확실하게 버전업, 커밋, 빌드, GitHub Release, macOS 자산 업로드까지 끝내는 절차입니다.

## 원칙

- 릴리스 단위는 `vX.Y.Z` 태그다. 태그 푸시가 Windows Release workflow와 macOS build workflow를 트리거한다.
- `git add .` 금지. 릴리스에 포함할 파일만 정확히 스테이징한다.
- `main`이 `origin/main`과 diverged 상태여도 릴리스 태그는 만들 수 있다. 이때 `pull`, `rebase`, `reset`을 릴리스 도중 섞지 않는다.
- Windows 설치 파일은 `npm run release:full`이 빌드하고 GitHub Release에 업로드한다.
- macOS DMG/ZIP은 `.github/workflows/mac-release.yml`이 GitHub macOS runner에서 빌드하고 같은 Release에 업로드한다.
- macOS 서명 시크릿 `MAC_CSC_LINK`가 없으면 unsigned 빌드가 올라간다. 설치 시 Gatekeeper 경고가 뜰 수 있다.

## 사전 확인

PowerShell에서 프로젝트 루트에서 실행한다.

```powershell
$ErrorActionPreference = "Stop"
$Repo = "cd000242-sudo/naver"

git status --short --branch
git remote -v
node -v
npm -v
gh --version
```

GitHub 업로드 토큰이 있어야 한다.

```powershell
if (Test-Path .env.release) {
  Select-String -Path .env.release -Pattern '^GH_TOKEN='
} else {
  $env:GH_TOKEN
}
```

## 가장 빠른 표준 절차

### 1. 다음 버전 계산

```powershell
$Current = node -p "require('./package.json').version"
$Parts = $Current.Split('.') | ForEach-Object { [int]$_ }
$Version = "$($Parts[0]).$($Parts[1]).$($Parts[2] + 1)"
$Tag = "v$Version"
"Current=$Current Next=$Version Tag=$Tag"
```

원격 태그 충돌을 먼저 막는다.

```powershell
git ls-remote --tags origin $Tag
```

출력이 있으면 이미 존재하는 태그다. 그 버전으로 릴리스하지 말고 다음 patch 버전을 쓴다.

### 2. 버전 파일 업데이트

```powershell
$env:RELEASE_VERSION = $Version
node -e "const fs=require('fs'); const version=process.env.RELEASE_VERSION; for (const file of ['package.json','package-lock.json']) { const json=JSON.parse(fs.readFileSync(file,'utf8')); json.version=version; if (file==='package-lock.json' && json.packages && json.packages['']) json.packages[''].version=version; fs.writeFileSync(file, JSON.stringify(json,null,2)+'\n'); }"
```

이 방식은 작업트리가 지저분해도 실패하지 않고 `package.json`, `package-lock.json`, `package-lock.json`의 루트 패키지 버전만 바꾼다. `npm version`은 git working tree가 clean이 아니면 실패할 수 있으므로 릴리스 자동화에는 쓰지 않는다.

### 3. 필요한 테스트와 빌드

빠른 회귀 테스트가 있으면 먼저 특정 테스트를 돌린다.

```powershell
npm test -- src/__tests__/categoryModalBackdropGuard.test.ts
```

그 다음 릴리스 빌드를 확인한다.

```powershell
npm run build
```

### 4. 변경 파일 검토

```powershell
git diff --check
git diff -- package.json package-lock.json public/index.html src/__tests__
```

비밀값이 들어가지 않았는지 확인한다.

```powershell
Select-String -Path package.json,package-lock.json,public\index.html,src\__tests__\*.ts `
  -Pattern 'ghp_|github_pat_|sk-|AKIA|BEGIN PRIVATE KEY|client_secret|api[_-]?key' `
  -CaseSensitive:$false
```

기존 HTML의 입력 필드나 placeholder가 잡힐 수 있다. 새로 추가한 실제 토큰이 아니면 괜찮다.

### 5. 정확한 파일만 스테이징

릴리스에 포함할 파일만 넣는다. 예시는 카테고리 모달 수정 릴리스 기준이다.

```powershell
git add package.json package-lock.json public/index.html src/__tests__/categoryModalBackdropGuard.test.ts
git diff --cached --stat
git diff --cached --name-only
```

예상 밖 파일이 보이면 커밋하지 않는다.

```powershell
git restore --staged <file>
```

### 6. 커밋과 태그

```powershell
git commit -m "v$Version release"
git tag $Tag
```

이미 같은 태그가 로컬에 있으면 중단하고 확인한다.

```powershell
git tag --list $Tag
git show --stat --oneline --decorate HEAD
```

### 7. Windows 빌드와 GitHub Release 업로드

```powershell
npm run release:full
```

성공 기준:

- TypeScript build 성공
- Electron Builder 성공
- `latest.yml` SHA512 동기화 성공
- GitHub Release upload 성공
- fresh-fetch 검증에서 `latest.yml`, `.exe`, `.exe.blockmap` 확인
- Latest pointer가 방금 만든 태그로 확인

### 8. macOS Actions 완료 대기

태그 푸시가 macOS workflow를 자동 실행한다. 실행 ID를 찾아서 완료까지 기다린다.

```powershell
$MacRun = gh run list `
  --repo $Repo `
  --workflow "Build macOS Universal Release" `
  --branch $Tag `
  --limit 1 `
  --json databaseId `
  --jq '.[0].databaseId'

gh run watch $MacRun --repo $Repo --exit-status
```

성공 기준:

- `Build and publish macOS universal release` 성공
- `Upload macOS assets to GitHub Release` 성공
- `Upload macOS artifacts` 성공

### 9. 링크 전부 수집

```powershell
gh release view $Tag --repo $Repo --json url,tagName,name,assets,publishedAt,targetCommitish
gh run list --repo $Repo --limit 5 --json databaseId,workflowName,status,conclusion,headBranch,headSha,url
git ls-remote --tags origin $Tag
```

사람에게 줄 다운로드 링크만 뽑으려면:

```powershell
gh release view $Tag --repo $Repo --json url,assets `
  --jq '.url, (.assets[] | "- [" + .name + "](" + .url + ")")'
```

## 릴리즈 전 라이브 하네스 게이트 (SPEC-STABILITY-2026 6.5)

에디터 자동화(richTextPaste/꼬리 타이핑)를 건드린 릴리즈는 태그 푸시 전에 라이브 하네스를 1회 돌린다. 발행하지 않고 실제 네이버 에디터에서 본문 붙여넣기 + 꼬리(구분선/이전글 카드/해시태그)를 검증한다. 로그인 프로필이 재사용되므로 2회차부터는 약 1분 걸린다.

```powershell
npm run build
npm run harness:tail            # 풀오토 프리셋 (기본)
npm run harness:tail continuous # 연속발행 프리셋
npm run harness:tail multi      # 다중계정 프리셋
```

- 판정: 콘솔에 `🎉 TAIL-TEST: ALL PASS`가 떠야 통과. 일부 FAIL이면 `tmp/tail-typing-live-test/result.png` 스크린샷으로 원인 확인.
- 최초 1회만 열린 창에서 네이버 로그인 필요 (앱 세션 쿠키가 있으면 자동 주입).
- 에디터 자동화를 안 건드린 릴리즈는 생략 가능.

## 최종 성공 체크리스트

- (에디터 자동화 변경 시) `npm run harness:tail` → `TAIL-TEST: ALL PASS`.
- `package.json` 버전과 태그 버전이 같다.
- `package-lock.json` 루트 버전도 같다.
- 릴리스 커밋이 존재한다.
- 원격 태그가 릴리스 커밋을 가리킨다.
- Release 페이지가 존재한다.
- Windows 자산이 있다.
  - `Better-Life-Naver-Setup-X.Y.Z.exe`
  - `Better-Life-Naver-Setup-X.Y.Z.exe.blockmap`
  - `latest.yml`
- macOS 자산이 있다.
  - `Better-Life-Naver-X.Y.Z-arm64.dmg`
  - `Better-Life-Naver-X.Y.Z-arm64.zip`
  - `Better-Life-Naver-X.Y.Z-x64.dmg`
  - `Better-Life-Naver-X.Y.Z-x64.zip`
  - `latest-mac.yml`
- Release workflow 성공.
- Build macOS Universal Release workflow 성공.

## 가장 흔한 실패와 즉시 복구

### `git fetch --tags`가 would clobber existing tag로 실패

전체 태그 fetch를 하지 말고 필요한 것만 확인한다.

```powershell
git fetch origin main --no-tags
git ls-remote --tags origin $Tag
```

### `main...origin/main [ahead N, behind M]`

릴리스 도중에는 병합하지 않는다. 태그 릴리스만 끝낸다. `npm run release:full`의 `main` push가 실패해도 태그와 Release 업로드가 성공하면 릴리스는 살아 있다. 릴리스 후 별도 작업으로 main divergence를 정리한다.

### `MAC_CSC_LINK is not set`

macOS unsigned 자산이 업로드된다. 고객 자동 업데이트와 Gatekeeper 경험이 중요하면 GitHub secrets에 서명 정보를 넣고 태그를 새 버전으로 다시 릴리스한다.

필요한 secrets:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

### 빌드 후 민감정보 복원 경고

`release:full`은 `reset-config-for-pack.js` 후 `restore-after-pack.js`를 실행한다. 실패했으면 즉시 복원한다.

```powershell
node scripts/restore-after-pack.js
git status --short
```

### GitHub CLI가 인증 설정을 못 읽음

`.env.release`의 `GH_TOKEN`은 `scripts/upload-release.js`가 직접 읽는다. 링크 조회용 `gh`만 막힌 경우 릴리스 자체는 `npm run release:full`로 계속 가능하다.

## 한 번에 붙여넣는 운영용 템플릿

아래는 patch 버전 하나 올리는 기본 템플릿이다. `git add` 줄은 반드시 이번 작업 파일에 맞게 수정한다.

```powershell
$ErrorActionPreference = "Stop"
$Repo = "cd000242-sudo/naver"
$Current = node -p "require('./package.json').version"
$Parts = $Current.Split('.') | ForEach-Object { [int]$_ }
$Version = "$($Parts[0]).$($Parts[1]).$($Parts[2] + 1)"
$Tag = "v$Version"

git ls-remote --tags origin $Tag
$env:RELEASE_VERSION = $Version
node -e "const fs=require('fs'); const version=process.env.RELEASE_VERSION; for (const file of ['package.json','package-lock.json']) { const json=JSON.parse(fs.readFileSync(file,'utf8')); json.version=version; if (file==='package-lock.json' && json.packages && json.packages['']) json.packages[''].version=version; fs.writeFileSync(file, JSON.stringify(json,null,2)+'\n'); }"

npm test -- src/__tests__/categoryModalBackdropGuard.test.ts
npm run build
git diff --check

git add package.json package-lock.json public/index.html src/__tests__/categoryModalBackdropGuard.test.ts
git diff --cached --stat
git commit -m "v$Version release"
git tag $Tag

npm run release:full

$MacRun = gh run list --repo $Repo --workflow "Build macOS Universal Release" --branch $Tag --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $MacRun --repo $Repo --exit-status

gh release view $Tag --repo $Repo --json url,assets --jq '.url, (.assets[] | "- [" + .name + "](" + .url + ")")'
git ls-remote --tags origin $Tag
```
