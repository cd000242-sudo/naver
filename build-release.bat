@echo off
echo ============================================
echo Better Life Naver 배포 패키지 생성
echo ============================================
echo.

echo [1/5] 빌드 중...
call npm run build
if errorlevel 1 (
    echo 빌드 실패!
    pause
    exit /b 1
)

echo.
echo [2/5] 설정 리셋 중...
call node scripts/reset-config-for-pack.js
if errorlevel 1 (
    echo 설정 리셋 실패!
    pause
    exit /b 1
)

echo.
echo [3/5] Electron Builder 실행 중...
call npx electron-builder --win nsis portable --x64
if errorlevel 1 (
    echo Electron Builder 실패!
    pause
    exit /b 1
)

echo.
echo [4/5] 설정 복원 중...
call node scripts/restore-after-pack.js
if errorlevel 1 (
    echo 설정 복원 실패!
    pause
    exit /b 1
)

echo.
echo [5/5] 압축 파일 생성 중...
call node scripts/create-archives.js
if errorlevel 1 (
    echo 압축 파일 생성 실패!
    pause
    exit /b 1
)

echo.
echo ============================================
echo ✅ 배포 패키지 생성 완료!
echo ============================================
echo.
echo release 폴더를 확인하세요.
echo.
pause

















































