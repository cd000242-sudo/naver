# 매일 홈피드 자동 발행 · 연간 이용권 제한 인계

기록일: 2026-10-21 한국시간. 이 문서는 로컬 구현·검증 상태를 기록하며 실제 운영 배포 완료를 뜻하지 않는다.

## 2026년 10월 21일 앱 직접 실행 연결

Claude Code 자체에 네이버 조작 도구가 없어도, 글 작성 엔진으로 호출하고 Electron 앱의 기존 브라우저 자동화가 입력·예약을 담당할 수 있다. 이번 변경은 이 경로를 앱 상단 `매일 예약발행` 화면에 연결했다. Codex 대화나 확장 HTTP 브리지를 켜 둘 필요는 없지만 앱 실행·로그인·서버 이용권 확인·네이버 계정 준비는 필요하다.

- 설정 화면: `src/renderer/modules/dailyPublishingPanel.ts`, `public/daily-publishing.css`. 계정·실제 카테고리·작성 엔진·이미지 엔진·한국 시간 일정을 지정한다. 기본은 중지 상태이며 반복 실행 동의와 `저장하고 시작`을 누르기 전에는 켜지지 않는다.
- IPC: `src/main/ipc/dailyPublishingHandlers.ts`와 `src/preload.ts`. 메인 앱 창의 고정 조회·저장·중지 요청만 허용한다. 임의 명령이나 네이버 주소를 실행하는 IPC가 아니다.
- 실행: `src/main/services/dailyPublishingRuntime.ts`. 확장 브리지 설정과 독립적으로 시작하며, 초기 로딩·다른 앱 작업 중에는 저장한 계획을 끄지 않고 기다린다. 계정 안전 정지와 이용권 제한은 유지한다.
- 일정: 준비 시각부터 공개 직전까지의 유효한 구간에서 누락 작업을 발견한다. 공개 시각 이후 소급 발행은 하지 않으며 이미 시도한 작업을 자동 재발행하지 않는다.
- 예약 검증: `src/automation/dailyNativeReservationAdapter.ts`. 실제 목록 행과 예약 편집기의 제목·시간·현재 카테고리를 대조하고 목록을 다시 확인한다. 현재 네이버 UI가 다르거나 결과가 불확실하면 완료로 표시하지 않는다.
- 공식 캡처: `docs/daily-official-capture-producer.md`의 글별 승인 계획이 필요하다. 출처·장면·사용 권한 검토 화면이 없으므로 무인 반복 시작은 UI에서 차단한다. AI 이미지 엔진으로 자동 전환하지 않는다.
- 중지는 이후 작업과 진행 중 작업의 취소를 요청한다. 이미 네이버에 저장된 예약 글 자체를 삭제하거나 취소하지 않는다.

개발 확인 명령은 저장소 루트에서 `npm run build`, `npm run lint:ipc`, `npx vitest run src/__tests__/dailyPublishing src/__tests__/dailyNativeReservation src/__tests__/dailyScheduleMainBoundary.test.ts src/__tests__/dailyOfficialCapture --fileParallelism=false`, `npx playwright test e2e/daily-publishing-panel.spec.ts --workers=1`이다. 개발 앱 실행은 `npm run dev`이며 실제 사용자 설정으로 열릴 수 있으므로 운영 계획이 켜져 있는지 먼저 확인한다. E2E는 별도 임시 프로필과 모의 네트워크를 사용한다.

실제 Electron/preload 연결과 격리 브라우저 검사는 수행했지만 이번 변경으로 실계정 글을 작성·예약하지는 않았다. 현재 작업 소스 버전은 2.11.368이고 별도 2.11.370 배포 기록이 있으므로 설치본을 자동 교체하지 않았다. 후속 릴리스는 최신 배포 기준과 변경분을 대조한 후 전체 릴리스 게이트를 거쳐야 한다. 아래 기존 버전 검증 수치를 이번 변경의 새 설치·배포 증빙으로 사용하지 않는다.

## 현재 적용 상태

| 대상 | 확인된 상태 | 아직 하지 않은 작업 |
|---|---|---|
| 자동화 앱 2.11.366 | 소스 버전 변경·로컬 빌드 | 사용자 PC의 실행 앱 설치·교체·재시작, 운영 배포 |
| 라이선스 Apps Script | 로컬 `google-apps-script-code.gs` 수정·문법 검사 | 실제 Apps Script 프로젝트 반영 및 기존 웹앱 배포 업데이트 |
| LDB worker 2.25.10 | 로컬 압축해제 확장 설치 폴더 835개 파일 대조 확인 | Chrome 확장 재로드·실제 열린 패널 새 코드 확인, Chrome Web Store 게시 |

이번 개발·테스트에서 운영 계정의 매일 자동 발행 계획을 켜지 않았다. 이번 기능 검증에 따른 실제 글 작성·임시저장·공개발행·예약발행은 **0건**이다. 예전에 별도로 수행한 블로그 작업 실적과 혼동하지 않는다.

## 권한 의미와 실행 계약

- 기준은 **서버가 발급한 이용권 기간 365일 이상 또는 영구권**이다. 가입 후 1년 경과나 누적 유료 이용 기간으로 계산하지 않는다.
- 서버의 실제 라이선스 행 `type/customDays`를 확인한다. PAID365, CUSTOM 365/730일 등과 LIFE 또는 CUSTOM -1이 해당한다. 현재 만료·차단·NAVER/ALL 범위를 함께 검사한다.
- 선물·보상으로 발급한 CUSTOM365도 이 발급기간 기준에는 해당한다. 이것을 실제 결제 여부나 결제 원장 증명으로 표현하지 않는다.
- 월간·분기·체험 이용권의 **기존 일반 기능은 유지**한다. 이 제한은 새 매일 자동 발행 기능에 적용하며, 해당 기능의 중지 동작은 항상 허용한다.
- 서버가 `entitlements`를 명시하지 않거나 잘못된 값이면 자동 발행을 허용하지 않는다. premium이라는 이름, 만료일 누락, 로컬 디스크의 true, 개발 모드·오프라인 유예로 승격하지 않는다.
- main 전용 `checkDailyPublishingEntitlement({ forceFresh?, serverUrl? })`는 검증된 메모리 결과만 최대 60초 사용한다. 유료 생성 전·최종 발행 직전에는 `forceFresh:true`로 확인한다. 계정 변경·로그아웃·뒤늦은 인증 응답이 새 거부를 되돌리지 못하도록 세대 번호와 저장/삭제 직렬화를 사용한다.

## 운영 반영 순서

1. 운영자가 현재 실제 배포 버전과 복구 가능한 서버 코드 사본을 확보한다. Script Properties, 실제 시트 연결, 비밀값과 앱 환경변수를 별도로 보존한다. 이 문서에 값이나 토큰을 옮기지 않는다.
2. 기존 Apps Script 프로젝트에 이번 변경을 검토하여 반영한다. 인증 성공 분기의 entitlement 전달, 읽기 전용 `daily-entitlement` 액션, 실제 행 기준 판정을 포함한다. 운영 프로젝트가 로컬 소스와 다르면 전체 파일을 무조건 덮어쓰지 않는다.
3. **기존 웹앱 배포를 새 버전으로 업데이트**한다. 기존 배포 URL·실행 주체·공개 범위·시트·Script Properties를 보존한다. 새 프로젝트나 새 URL을 만들고 앱 URL을 임의 교체하지 않는다. 로컬 `.gs` 저장만으로는 서버에 반영되지 않는다.
4. 테스트용 연간·월간·체험·만료 이용권으로 실제 서버 계약을 확인한다. 연간은 허용, 월간·체험·만료는 자동 발행 거부이며 기존 일반 기능은 정상이어야 한다. 서버가 구버전이면 새 자동 발행은 잠기는 상태가 정상이다.
5. 전체 릴리스 게이트와 새 패키지 검증 결과를 확인한 뒤 승인된 2.11.366 설치본으로 앱을 업데이트한다. 이 문서 작성 시점에는 설치하지 않았다. 과거 2.11.365 패키지의 검증 결과를 2.11.366 설치 증빙으로 쓰지 않는다.
6. Chrome에서 로컬 LDB 확장을 재로드하고 패널을 다시 연다. 헤더 우측 진입 버튼·계정 선택·시간·작성/공개 모드·잠금 안내를 확인한다. 먼저 계획 조회와 중지만 확인하고 실제 발행 시작은 운영자의 별도 실행으로 구분한다.

## 검증 스냅샷

- 인증·권한 회귀: 12파일 **135테스트 통과**. 요청 대기 중 로그아웃, 동시 로그인 최신 우선, 저장 중 로그아웃, 새 거부 역전 방지, 민감 오류 로그를 포함한다.
- 통합 스냅샷: 22파일 **336테스트 통과**. 증빙: [daily-combined-final.log](<C:/Users/박성현/Desktop/리더 네이버 자동화/tmp/daily-combined-final.log>).
- 새 권한 helper 커버리지: 문장 98.55%, 분기 96.1%, 함수·라인 100%. [coverage 결과](<C:/Users/박성현/Desktop/리더 네이버 자동화/tmp/daily-annual-entitlement-coverage/index.html>).
- 인증 수정 후 전체 `tsc --noEmit`, Apps Script 문법 파싱, `git diff --check`를 통과했다.
- 앱 전체 회귀·최종 릴리스 검사는 주 작업에서 진행 중이다. 위 focused·통합 스냅샷을 앱 전체 통과로 표현하지 않는다. 최종 결과는 주 작업자가 아래에 덧붙인다.

## 소스와 실제 증빙 위치

- 앱 권한: [licenseManager.ts](<C:/Users/박성현/Desktop/리더 네이버 자동화/src/licenseManager.ts>), [licenseDailyEntitlement.ts](<C:/Users/박성현/Desktop/리더 네이버 자동화/src/licenseDailyEntitlement.ts>).
- 인증 경쟁 상태 테스트: [licenseAuthGeneration.test.ts](<C:/Users/박성현/Desktop/리더 네이버 자동화/src/__tests__/licenseAuthGeneration.test.ts>).
- 서버: [google-apps-script-code.gs](<C:/Users/박성현/Desktop/admin-panel/google-apps-script-code.gs>).
- 확장 설치 파일 대조·백업·ZIP 정보: [annual-extension-package.log](<C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/daily-publishing-verification/annual-extension-package.log>).
- 확장 검사: [annual-extension-release-check.log](<C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/daily-publishing-verification/annual-extension-release-check.log>), [annual-extension-full.log](<C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/daily-publishing-verification/annual-extension-full.log>).
- 헤더 미리보기: [annual-header-preview.png](<C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/daily-publishing-verification/annual-header-preview.png>).
- 확장 ZIP: [LDBIMAGEULTRAv2.25.10.zip](<C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/release-22510-annual-editorial/dist/LDBIMAGEULTRAv2.25.10.zip>).

## 복구

확장 변경 전 백업은 [extension-backup-active-2259-annual-editorial-20261020](<C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/extension-backup-active-2259-annual-editorial-20261020>)이며 설치 대상은 [현재 로컬 확장 폴더](<C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/release-2190-cardnews/dist/LDBIMAGEULTRAv2.19.0>)다. 대상 폴더 이름은 과거 버전 이름이지만 실제 파일 버전은 대조 로그를 따른다. 복원할 때는 운영자가 이 두 절대 경로를 먼저 확인하고 현재본을 보존한 뒤 백업 파일을 대조해 복원하며 Chrome 재로드로 확인한다. 이 문서 작성 중 복원을 실행하지 않았다.

서버는 실제 운영 배포와 대응 관계가 확인된 **운영자 보관 코드 사본/기존 배포 버전만** 복원한다. 저장소의 오래된 `.bak` 이름만 보고 운영 기준본으로 선택하지 않는다. 기존 배포 URL·비밀값·시트 연결을 유지하고 임의 시트 롤백·라이선스 행 변경은 하지 않는다. 아직 서버를 원격 배포하지 않았으므로 이번 로컬 작업에 따른 원격 복원은 필요하지 않다.

## 최종 릴리스 결과 추가란

2026-10-21 최종 소스 동결 후 확인:

- 전체 앱 단위 회귀: 1,245파일, 12,912통과·1건너뜀. 대량 병렬 실행에서 기존 이미지 업로드 시간 검사 1건이 초과됐고, 해당 26검사 재실행 및 작업자2개로 제한한 전체 재실행에서 모두 통과했다. 로그 `tmp/daily-full-test-serial-limit.log`, `tmp/daily-rerun-timing-context.log`.
- 마지막 인증 읽기 경쟁 상태 수정 뒤, 라이선스·홈피드·제목·일일 실행·런타임 지문을 함께 33파일438검사 재확인 통과. 인증 회귀 자체는12파일138검사 통과. 로그 `tmp/daily-final-frozen-regression.log`.
- 새 편집 모듈7개 현재 커버리지: 문장95.25%, 분기90.2%, 함수96.05%, 줄99.61%. 로그 `tmp/daily-coverage-frozen.log`.
- 에이전트 회귀229검사·V3회귀760검사 통과, 분기 각각81.01%·84.12%. TypeScript·로컬 최종 빌드·IPC 계약 검사 통과. 빌드 후 앱 읽기 전용 부팅 확인은 핸드셰이크5/5·렌더러 오류0이었다. 마지막 인증 캐시 수정은 별도138검사와 최종 빌드로 재확인했다.
- 실제 Claude Code 호출3회를 사용한 공개 EBS 자료의 소재 선별·후보 비교·독립 제목 검수가 통과했다. 기존 숫자·근거 검사 실패2회 기록도 보존했다. 최종 선택: `서장훈이 눈 떼지 못한 말 그림 벽, 그 사이에 걸린 다른 한 점`. 로그 `tmp/daily-live-editorial-v3/result.json`. 이 검사는 실제 글쓰기·발행·CTR 측정을 하지 않았다.
- 확장2.25.10은295묶음2,660검사 및 집중36검사 통과. 구버전 앱에 연간 권한 계약이 없으면 업데이트 안내로 막는다.835파일 로컬 대조·백업·교체 완료, Chrome 재로드·열린 실제 패널 확인·웹스토어 게시는 미완료다.
- 최종 런타임 소스 지문: `0f4d624ff55ff9f5d3c7fd360a1957b2c72d6ce028b5899383cd13d97fbbc67d`. 이전 지문의 V3 승인 증거를 재사용해 실행을 승격하지 않는다.

**아직 운영 배포 완료가 아니다.** 이번 버전의 Electron UI E2E를 포함한 전체 릴리스 게이트·새 설치본 패키징/검수·실행 앱 교체·실제 서버 배포/권한 확인은 남아 있다. 기존2.11.365의 릴리스 통과 로그로 대신하지 않는다. Chrome 조작은 다른 확장 UI가 열렸다는 브라우저 차단 응답으로 멈췄으며 사용자가 닫았다는 응답을 기다린다. Chrome 내부 페이지를 다른 방식으로 우회하거나 임의 인증 정보를 복사하지 않는다.
