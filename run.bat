@echo off
chcp 65001 >nul
echo 네이버 블로그 자동화 앱 실행 중...
cd /d "%~dp0"
node_modules\.bin\electron.cmd .
pause









