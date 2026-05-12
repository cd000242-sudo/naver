; ═══════════════════════════════════════════════════════════════════════════
; Better Life Naver — NSIS 커스텀 설치/업데이트 매크로
; ═══════════════════════════════════════════════════════════════════════════
; v2.10.95: taskkill /F /T 기본
; v2.10.96: Electron Helper 프로세스 + tasklist retry 루프
; v2.10.105: /T 옵션 *제거* — 자동 업데이트 시 인스톨러 자기 자신을 죽이던 버그 fix.
; v2.10.123: "cannot be closed" 잔존 해결 — sleep 연장 + retry 2회 + 추가 프로세스
;
; 진짜 원인 (사용자 보고 종합):
;   updater.quitAndInstall() → spawn(인스톨러) → 인스톨러는 *우리 앱의 자식 트리*에 등록.
;   customInit의 'taskkill /F /IM "Better Life Naver.exe" /T'가 /T (자식 트리 전체) 옵션으로
;   메인 exe 트리를 죽이는데, 그 자식 트리에 *인스톨러 자기 자신*이 포함됨 → 자기 자살 → GUI 안 뜸.
;
; v2.10.123 진단:
;   사용자 보고: 재부팅 후에도 "cannot be closed" 메시지. taskkill만으로 부족.
;   추정 원인:
;     1. file lock — Windows Defender/백신 실시간 스캔이 .exe 잠금
;     2. updater 백업 파일 잠금
;     3. puppeteer/playwright 자식 chrome 프로세스 잔존
;   대응: Sleep 1500 → 3500ms, taskkill 2 라운드, electron crashpad/updater 프로세스 추가

!macro customInit
  DetailPrint "기존 앱 프로세스 종료 중 (v2.10.123: retry 2회 + 추가 프로세스)..."

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

  ; 파일 핸들 정리 대기 (1500 → 3500ms로 연장)
  Sleep 3500

  ; ─── 라운드 2: 살아있을 가능성 있는 프로세스 재종료 (Defender 스캔 후 잠금 해제 보장)
  DetailPrint "프로세스 재종료 (라운드 2)..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper.exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (GPU).exe"'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Renderer).exe"'
  Pop $0

  Sleep 1500
  DetailPrint "프로세스 종료 시퀀스 완료 (총 5000ms 대기)"
!macroend

!macro customUnInit
  DetailPrint "앱 제거 전 프로세스 종료 중 (v2.10.123)..."
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
  Sleep 3000
!macroend
