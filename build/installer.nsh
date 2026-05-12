; ═══════════════════════════════════════════════════════════════════════════
; Better Life Naver — NSIS 커스텀 설치/업데이트 매크로
; ═══════════════════════════════════════════════════════════════════════════
; v2.10.95: taskkill /F /T 기본
; v2.10.96: Electron Helper 프로세스 + tasklist retry 루프
; v2.10.105: /T 옵션 *제거* — 자동 업데이트 시 인스톨러 자기 자신을 죽이던 버그 fix.
; v2.10.123: "cannot be closed" 잔존 해결 — sleep 연장 + retry 2회 + 추가 프로세스
; v2.10.130: 사용자 보고 "30초 대기" → Sleep 단축 + 진행 표시 강화 (체감 단축)
;
; 진짜 원인 (사용자 보고 종합):
;   updater.quitAndInstall() → spawn(인스톨러) → 인스톨러는 *우리 앱의 자식 트리*에 등록.
;   customInit의 'taskkill /F /IM "Better Life Naver.exe" /T'가 /T (자식 트리 전체) 옵션으로
;   메인 exe 트리를 죽이는데, 그 자식 트리에 *인스톨러 자기 자신*이 포함됨 → 자기 자살 → GUI 안 뜸.
;
; v2.10.130 시간 분석:
;   사용자 보고: NSIS 설치 모달까지 30초.
;   customInit = 약 5-8초 (taskkill + Sleep 5000ms)
;   NSIS 자체 = Defender 스캔(5-15s) + Unicode 해제(5-10s) — 우리 영역 외
;   조정: Sleep 5000 → 2500ms (cannot be closed 위험 vs 체감 단축 균형) + DetailPrint 명시

!macro customInit
  DetailPrint "[1/3] 기존 앱 프로세스 종료 중..."

  ; ─── 라운드 1: 메인 + Helper 프로세스 종료 (자식 트리 미포함 → 인스톨러 안전)
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "better-life-naver.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (GPU).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Renderer).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Plugin).exe"'
  Pop $0

  ; ─── 추가 프로세스: electron-updater / crashpad / 부수 자식
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Updater.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "elevate.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "crashpad_handler.exe"'
  Pop $0

  DetailPrint "[2/3] 파일 잠금 해제 대기 (2.5초)..."
  Sleep 2500

  ; ─── 라운드 2: 살아있을 가능성 있는 프로세스 재종료 (Defender 스캔 후 잠금 해제 보장)
  DetailPrint "[3/3] 잔존 프로세스 재확인 중..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (GPU).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Renderer).exe"'
  Pop $0

  Sleep 800
  DetailPrint "✓ 프로세스 종료 완료. 설치 진행..."
!macroend

!macro customUnInit
  DetailPrint "앱 제거 전 프로세스 종료 중..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "better-life-naver.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (GPU).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Renderer).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Updater.exe"'
  Pop $0
  Sleep 2000
!macroend
