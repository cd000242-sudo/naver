; ═══════════════════════════════════════════════════════════════════════════
; Better Life Naver — NSIS 커스텀 설치/업데이트 매크로
; ═══════════════════════════════════════════════════════════════════════════
; v2.10.95: taskkill /F /T 기본
; v2.10.96: Electron Helper 프로세스 + tasklist retry 루프
; v2.10.105: /T 옵션 *제거* — 자동 업데이트 시 인스톨러 자기 자신을 죽이던 버그 fix.
;
; 진짜 원인 (사용자 보고 종합):
;   updater.quitAndInstall() → spawn(인스톨러) → 인스톨러는 *우리 앱의 자식 트리*에 등록.
;   customInit의 'taskkill /F /IM "Better Life Naver.exe" /T'가 /T (자식 트리 전체) 옵션으로
;   메인 exe 트리를 죽이는데, 그 자식 트리에 *인스톨러 자기 자신*이 포함됨 → 자기 자살 → GUI 안 뜸.
;
; 수동 더블클릭에서 잘 됐던 이유:
;   exe 더블클릭 → 부모가 explorer.exe → 인스톨러는 explorer 자식 → /T로 explorer 안 죽임 → 생존.
;
; 수정: /T 제거. 메인 exe + Helper 프로세스 *개별* 종료. 인스톨러는 자식 트리 영향 안 받음.

!macro customInit
  DetailPrint "기존 앱 프로세스 종료 중 (v2.10.105: /T 제거)..."

  ; 메인 앱 + Helper 프로세스 *개별* 종료 (자식 트리 미포함 → 인스톨러 안전)
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

  ; 파일 핸들 정리 대기
  Sleep 1500
  DetailPrint "프로세스 종료 시퀀스 완료"
!macroend

!macro customUnInit
  DetailPrint "앱 제거 전 프로세스 종료 중 (v2.10.105)..."
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
  Sleep 1500
!macroend
