/**
 * Reviewed runtime identity. This value lives outside the hashed source set to
 * avoid a digest self-reference. Recompute only after the complete runtime
 * source closure is stable and before recording provider or human evidence.
 */
// [2026-09-17] LDB IMAGE ULTRA 수신 브리지 추가로 런타임이 바뀌어 재계산했다.
//   바뀐 해시 대상 파일: src/main.ts, src/preload.ts, src/renderer/renderer.ts
//   (신규 src/main/ldb-bridge.ts 는 목록 밖이다.)
//   내용: 확장이 보낸 완성 원고를 반자동 편집 칸에 채우는 경로만 추가. 발행 경로는 손대지 않았다.
//
// [2026-09-17 두 번째] 환경설정에서 연결 토큰을 확인·복사하는 UI 추가로 재계산했다.
//   바뀐 해시 대상 파일: 위와 같은 3개. 추가한 것은 ipcMain 'ldb:get-bridge-token' 조회 하나와
//   그 값을 읽기 전용 입력칸에 보여 주는 버튼 두 개뿐이다. 토큰을 만들거나 바꾸지 않는다.
//
// [2026-09-17 세 번째] 확장 연결을 '선택 기능'으로 바꾸면서 재계산했다.
//   바뀐 해시 대상 파일: public/index.html, src/configManager.ts, src/main.ts,
//   src/preload.ts, src/renderer/renderer.ts
//   내용: 환경설정 스위치(ldbBridgeEnabled)를 켠 사용자만 로컬 포트 47630 을 연다.
//   기본은 꺼짐 — 쓰지 않는 사용자의 PC 에는 포트가 열리지 않는다. 발행 경로는 그대로다.
//   실측 확인: 껐을 때 포트 닫힘, 켠 뒤 열림, 잘못된 출처 403 / 잘못된 토큰 401 /
//   발행 표시된 글 400 / 정상 전송 200 + 반자동 편집 칸 채움.
//
// [2026-09-17 네 번째] v2.11.291 — 확장 연결이 재시작 후에도 켜져 있도록 고쳤다.
//   바뀐 해시 대상: src/main.ts, src/preload.ts, src/renderer/renderer.ts,
//   src/main/ipc/configHandlers.ts, src/runtime/version.generated.ts(버전)
//   내용: 계정별 설정은 로그인 뒤에야 활성화되는데 브리지를 로그인 전에 읽어서,
//   켜 둔 사용자도 앱을 껐다 켜면 포트가 안 열리고 체크박스도 풀려 있었다.
//   계정 활성화 시점(config:set __userId)에 다시 읽고 화면에도 알려 준다.
//   실측: 재시작만으로 47630 열림 + 체크박스 true.
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '0238b3d4e359cbb1131f78339187bd6e0fdc6156a5d005dedd8d9a05f7d84e90' as const;
