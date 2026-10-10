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
// [2026-10-01] AVIF/HEIC 업로드 지원으로 재계산했다.
//   바뀐 해시 대상: src/automation/imageHelpers.ts, src/main.ts,
//   src/main/ipc/imageExtensionPolicy.ts, src/renderer/modules/headingImageGen.ts,
//   src/renderer/modules/localFolderImageLoader.ts, src/renderer/modules/localImageModals.ts,
//   src/renderer/renderer.ts, src/contentQualityV3/candidateRuntimeFingerprint.ts(목록)
//   신규 해시 대상: src/image/naverImageTranscode.ts
//   내용: 네이버가 받지 않는 AVIF/HEIC 를 업로드/저장 직전 JPEG 로 변환하고, 입구
//   화이트리스트에 avif 를 넣었다. 종전에는 AVIF 바이트가 .jpg 이름으로 저장돼
//   발행 때 "파일 전송 오류 — 알 수 없는 파일"로 거부됐다. 네이버 허용 확장자
//   목록(NAVER_SUPPORTED_IMAGE_EXTENSIONS)은 그대로다 — 변환이 그 앞에서 끝난다.
//
// [2026-10-01 두 번째] 이미지 출처 → 네이버 "사진 설명" 배선으로 재계산했다.
//   바뀐 해시 대상: src/automation/imageHelpers.ts, src/automation/richTextPaste.ts,
//   src/renderer/modules/formAndAutomation.ts, src/renderer/modules/imageDisplayGrid.ts,
//   src/renderer/modules/imageManagerCore.ts, src/renderer/utils/imageHelpers.ts,
//   src/contentQualityV3/candidateRuntimeFingerprint.ts(목록)
//   신규 해시 대상: src/automation/imageCaption.ts
//   내용: 이미지 관리 탭 카드의 출처 입력칸을 ImageManager → 발행 페이로드 → 에디터
//   캡션 칸까지 배선했다. 캡션에 글자가 들어가면 .se-text-paragraph 역순 탐색이 캡션을
//   '마지막 문단'으로 집어 본문이 사진 설명 안으로 들어갈 수 있으므로, richTextPaste 의
//   캐럿 탐색 세 경로에 캡션 제외를 넣었다(캡션이 비어 있던 종전과 같은 블록이 선택된다).
//
// [2026-10-01 세 번째] v2.11.308 버전업으로 재계산했다 (package.json +
//   src/runtime/version.generated.ts). 코드 변경은 위 두 항목뿐이다.
//
// [2026-10-01 네 번째] v2.11.309 — v2.11.308 에서 "별건"으로 남긴 3건 마감.
//   바뀐 해시 대상: package.json, src/main.ts, src/main/services/BlogExecutor.ts,
//   src/main/ipc/imageNarrativeSupportHandlers.ts, src/renderer/modules/formAndAutomation.ts,
//   src/renderer/modules/imageManagementTab.ts, src/renderer/modules/imageManagerCore.ts,
//   src/renderer/modules/imageNarrativeUpload.ts, src/runtime/version.generated.ts
//   내용: (A) 사진 모드가 AVIF 를 받고 sharp 로 변환한다(heic-convert 는 폴백) + EXIF 를
//   변환 전 원본에서 읽는다. (B) localFolder:resizeImage 가 AVIF 입력을 JPG 로 낸다.
//   (C) image.link 를 발행 페이로드 2홉(formAndAutomation·BlogExecutor 4분기)에 싣고,
//   링크 일괄 적용이 ImageManager 에도 기록해 동기화가 덮어쓰지 못하게 했다.
// [2026-10-03] v2.11.311 — 확장 리모컨의 앱 계정·실제 카테고리 선택 연동.
//   신규 렌더러 의존성 ldbDestinationSelection.ts를 런타임 목록에 포함하고,
//   검토한 브리지·계정 선택·렌더러 배선과 버전 변경을 지문에 반영했다.
//   발행 증거를 재사용하거나 품질 게이트를 활성화하는 변경은 아니다.
// [2026-10-08] v2.11.321 — 전용 다운로드 폴더의 실제 이미지 파일을 검증해 수신하고
//   손상된 앱 이미지 복사본을 원자적으로 복구한다. 관련 이미지 수신 모듈을 지문 목록에 포함했다.
// [2026-10-09] 발행 직전 세션 게이트·계정 식별·상태 파일 교체 보정으로 재계산했다.
//   바뀐 해시 대상: src/browserSessionManager.ts, src/naverBlogAutomation.ts,
//   src/automation/serverSessionProbePolicy.ts, src/automation/expectedBlogIdentity.ts,
//   src/automation/accountExecutionGuard.ts, src/automation/publicationCommitJournal.ts,
//   src/contentQualityV3/candidateRuntimeFingerprint.ts(목록)
//   신규 해시 대상: src/automation/safeStateRename.ts
//   내용: 클릭 직전 세션 확인은 보호조치·인증요구·로그인 화면·확정된 다른 블로그일 때만 멈춘다
//   (불명확 증거는 진입 시 확인된 세션으로 계속). 블로그 주소를 붙여 넣은 계정 ID는 순수 ID로
//   환원한다. 저널·가드의 상태 파일 교체는 EPERM/EBUSY/EACCES 에서 최대 5회(≤650ms) 재시도하고
//   그래도 실패하면 종전처럼 멈춘다.
export const CONTENT_QUALITY_V3_CANDIDATE_RUNTIME_SHA256 =
  '20e98331ea8d8af30f974b7755e9251b8b5e58aadab8bb05f6bad925b5649e1c' as const;
