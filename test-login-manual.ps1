# 네이버 로그인 테스트 스크립트
# PowerShell에서 실행하세요

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🧪 네이버 로그인 테스트" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 네이버 아이디/비밀번호 입력
$naverId = Read-Host "네이버 아이디를 입력하세요"
$naverPassword = Read-Host "네이버 비밀번호를 입력하세요" -AsSecureString
$naverPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($naverPassword)
)

Write-Host ""
Write-Host "📝 입력된 아이디: $($naverId.Substring(0, [Math]::Min(3, $naverId.Length)))***" -ForegroundColor Green
Write-Host ""

# 환경변수 설정 및 테스트 실행
$env:TEST_NAVER_ID = $naverId
$env:TEST_NAVER_PASSWORD = $naverPasswordPlain

Write-Host "🚀 테스트 시작..." -ForegroundColor Yellow
Write-Host ""

npm run test:login

# 환경변수 정리
Remove-Item Env:\TEST_NAVER_ID -ErrorAction SilentlyContinue
Remove-Item Env:\TEST_NAVER_PASSWORD -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ 테스트 완료" -ForegroundColor Green





