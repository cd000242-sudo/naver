---
description: 버전업 → 빌드 → GitHub 릴리즈 업로드 한번에 수행
---

# 릴리즈 워크플로우

> **예상 소요**: ~12분 (빌드 7분 + 업로드 4분 + 검증 1분)

## 사전 조건

- `.env.release` 파일에 `GH_TOKEN` 저장됨 (최초 1회 설정, 이후 자동 로드)
- 토큰 갱신 필요 시: `.env.release` 파일의 `GH_TOKEN=...` 값만 수정

## 실행 단계

### Step 1: 버전 범프

에이전트가 `package.json`의 `version` 필드를 원하는 버전으로 변경합니다.

### Step 2: 릴리즈 실행

// turbo
```powershell
npm run release:full
```

> ⚠️ `$env:GH_TOKEN` 수동 설정 불필요! `.env.release` 파일에서 자동 로드됨.

이 단일 명령이 아래를 자동 수행:
1. `npm run build` (tsc 컴파일)
2. `reset-config-for-pack.js` (민감 정보 제거)
3. `electron-builder --win nsis` (Setup.exe 생성)
4. `restore-after-pack.js` (민감 정보 복원)
5. `fix-latest-yml.js` (latest.yml SHA512 재계산 + 버전 동기화)
6. `upload-release.js` (git push → 릴리즈 생성 → 에셋 업로드 → 검증)

### Step 3: 결과 확인

스크립트 출력에서 아래 검증 항목 확인:
- ✅ latest.yml version 일치
- ✅ Setup.exe 업로드 size 일치
- ✅ latest.yml 업로드 완료
- ✅ GitHub 릴리즈 URL 출력

## 토큰 관리

| 파일 | 역할 |
|------|------|
| `.env.release` | `GH_TOKEN=ghp_...` 저장 (gitignore됨) |
| `upload-release.js` | 환경변수 → `.env.release` 순서로 자동 탐색 |

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| `GH_TOKEN 미설정` | `.env.release` 파일 없음 | 프로젝트 루트에 `.env.release` 생성, `GH_TOKEN=...` 작성 |
| `Setup 파일 없음` | 빌드 실패 | 빌드 로그 확인 |
| `Upload 422` | 에셋 이미 존재 | 스크립트가 자동 삭제 후 재업로드 |
| `Push GH013` | 민감 파일 포함 | 스크립트가 소스코드만 선택적 add |
| `latest.yml version ❌` | 이전 빌드 잔여물 | `node scripts/fix-latest-yml.js` 후 재업로드 |
