---
description: 앱 빌드 후 패키지 실행 (개발 모드 electron . 불가 - 패키지 필수)
---

# 앱 실행 방법

## ⚠️ 중요: `npx electron .` 또는 `npm start`는 사용 불가
이 프로젝트는 개발 모드에서 `require('electron')`이 내장 모듈이 아닌 경로 문자열을 반환하는 환경 문제가 있어,
반드시 **패키지 빌드 후 exe 실행**해야 합니다.

## 단계

// turbo-all

1. TypeScript 빌드
```
npm run build
```

2. 패키지 빌드 (win-unpacked 생성)
```
npm run pack
```

3. 패키지된 앱 실행
```powershell
Start-Process "release_final\win-unpacked\Better Life Naver.exe"
```

4. 앱 프로세스 확인 (5초 후)
```powershell
Start-Sleep -Seconds 5; Get-Process -Name "Better Life Naver" -ErrorAction SilentlyContinue | Format-Table Id, ProcessName, StartTime
```

## 트러블슈팅

- 앱이 바로 종료되면: `release_final\win-unpacked\` 폴더 내 로그 확인
- 빌드 에러 시: `npx tsc --noEmit`으로 타입 에러 먼저 해결
- node_modules 문제 시: `Remove-Item -Recurse -Force node_modules; npm install`
