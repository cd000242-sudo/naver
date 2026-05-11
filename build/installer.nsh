; ═══════════════════════════════════════════════════════════════════════════
; Better Life Naver — NSIS 커스텀 설치/업데이트 매크로
; ═══════════════════════════════════════════════════════════════════════════
; v2.10.95: 업데이트 시 "cannot be closed" 오류 차단.
;
; 문제: 사용자가 앱 닫았다고 보고해도 자식 프로세스(Puppeteer/Playwright가
;       spawn한 Chromium, 시스템 트레이 등)가 살아있어 NSIS가 기존 exe를
;       덮어쓰지 못함. → "다시 시도/취소" 모달 발생.
;
; 해결: 인스톨러 진입 시 taskkill /F /T 로 *프로세스 트리 전체* 강제 종료.
;       /F 강제, /IM 이미지명, /T 자식 트리 포함.

!macro customInit
  ; ───────────────────────────────────────────────────────────────────────
  ; [1] 메인 앱 프로세스 + 자식 트리 강제 종료
  ; ───────────────────────────────────────────────────────────────────────
  DetailPrint "기존 앱 프로세스 종료 중..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe" /T'
  Pop $0
  DetailPrint "taskkill 결과: $0"

  ; ───────────────────────────────────────────────────────────────────────
  ; [2] electron-builder가 internal로 만드는 추가 프로세스명 (보험)
  ;   - perMachine: false 설치에서 user-data 디렉토리에 남아있는 helper 등
  ; ───────────────────────────────────────────────────────────────────────
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "better-life-naver.exe" /T'
  Pop $0

  ; ───────────────────────────────────────────────────────────────────────
  ; [3] 프로세스 종료 후 짧은 대기 — OS가 파일 핸들을 정리할 시간
  ; ───────────────────────────────────────────────────────────────────────
  Sleep 1500
!macroend

!macro customUnInit
  ; 언인스톨 진입 시에도 동일하게 강제 종료
  DetailPrint "앱 제거 전 프로세스 종료 중..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "better-life-naver.exe" /T'
  Pop $0
  Sleep 1500
!macroend
