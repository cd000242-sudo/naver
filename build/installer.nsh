; ═══════════════════════════════════════════════════════════════════════════
; Better Life Naver — NSIS 커스텀 설치/업데이트 매크로
; ═══════════════════════════════════════════════════════════════════════════
; v2.10.95: taskkill /F /T 기본
; v2.10.96: Electron Helper 프로세스 + tasklist retry 루프 (sonnet agent 분석 반영).
;
; 문제: 사용자가 앱 닫았다고 보고해도 자식 프로세스(Puppeteer/Playwright Chromium,
;       Electron Helper, LEWORD detached spawn 등)가 살아있어 NSIS가 기존 exe를
;       덮어쓰지 못함. → "cannot be closed / Retry" 모달.
;
; 해결:
;   1. 메인 exe + 자식 트리 강제 종료 (/F /T)
;   2. Electron Helper 프로세스명 직접 종료 (Renderer/GPU 등 — detached일 수 있음)
;   3. tasklist로 진짜 죽었는지 5회 retry 검증 (최대 3초)
;   4. 1.5초 추가 대기 (OS 파일 핸들 정리)

!macro customInit
  DetailPrint "기존 앱 프로세스 종료 중..."

  ; ───────────────────────────────────────────────────────────────────────
  ; [1] 메인 앱 + 자식 트리 강제 종료
  ; ───────────────────────────────────────────────────────────────────────
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "better-life-naver.exe" /T'
  Pop $0

  ; ───────────────────────────────────────────────────────────────────────
  ; [2] Electron Helper 프로세스 직접 종료 (detached인 경우 메인 트리 밖)
  ;   Electron은 자식을 "${ProductName} Helper", "Helper (GPU)", "Helper (Renderer)"
  ;   등의 이름으로 등록. /T 없이 직접 타겟해야 detached 케이스 잡힘.
  ; ───────────────────────────────────────────────────────────────────────
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (GPU).exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Renderer).exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Plugin).exe" /T'
  Pop $0

  ; ───────────────────────────────────────────────────────────────────────
  ; [3] tasklist retry 루프 — 실제 종료됐는지 검증 (최대 5회 × 600ms = 3초)
  ;   taskkill 반환 0이어도 OS 핸들 지연 해제 케이스 대비.
  ; ───────────────────────────────────────────────────────────────────────
  StrCpy $R1 0
  retry_check_blnaver:
    IntOp $R1 $R1 + 1
    nsExec::Exec '"$SYSDIR\cmd.exe" /c tasklist /FI "IMAGENAME eq Better Life Naver.exe" /FO csv | "$SYSDIR\find.exe" "Better Life Naver.exe"'
    Pop $R0
    ${If} $R0 == 0
      ; 아직 살아있음 — retry
      ${If} $R1 < 5
        DetailPrint "프로세스 확인 retry $R1/5"
        Sleep 600
        Goto retry_check_blnaver
      ${EndIf}
    ${EndIf}

  ; ───────────────────────────────────────────────────────────────────────
  ; [4] 추가 1.5초 — OS 파일 핸들 최종 정리
  ; ───────────────────────────────────────────────────────────────────────
  Sleep 1500
  DetailPrint "프로세스 종료 시퀀스 완료"
!macroend

!macro customUnInit
  DetailPrint "앱 제거 전 프로세스 종료 중..."
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "better-life-naver.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper.exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (GPU).exe" /T'
  Pop $0
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "Better Life Naver Helper (Renderer).exe" /T'
  Pop $0
  Sleep 1500
!macroend
