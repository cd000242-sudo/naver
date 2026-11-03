# 매일 자동발행 인계

2026-10-20: LDB 확장과 앱의 매일 자동 작성·임시저장/공개발행 기능을 구현했다. 앱 소스 버전은 2.11.365이며 실행·설치 여부는 실제 릴리스 검사와 설치 증빙을 확인한다.

전체 설계·사용 흐름·검증·설치 상태는 `C:/Users/박성현/Desktop/LDBIMAGEULTRA/LDB-p14-test/docs/daily-publishing-20261020.md`에 기록한다. 로그는 `C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/daily-publishing-verification/`다.

주요 모듈:

- `src/scheduler/dailyPublishing*.ts`: 계획 검증·직렬 실행·내구 기록·재시작 복구·일일 한도.
- `src/main/ldb-daily-{publishing,http}.ts`: 인증된 loopback 브리지 경로.
- `src/main/services/dailyPublishing{Runtime,Store,Discovery,Executor}.ts`: 앱 실행 연결·저장·소재 탐색/중복 예약·기존 발행 엔진 호출.
- `src/main.ts`: 기존 다중계정 handler를 명명한 내부 함수로 재사용. private WeakMap으로만 daily 문맥 전달.
- `AutomationService.ts`와 `BlogExecutor.ts`: 해당 작업 소유권에 한정된 취소 및 엔진 초기화 경합 방어.

기본 계획은 없으며 실제 계정의 자동 발행을 켜지 않았다. 유료 호출·실발행을 회귀 테스트에 사용하지 않는다. 공개발행은 사용자가 확장에서 공개 모드를 선택하고 시작한 계획에만 적용한다. 기존 `/v1/posts`는 draft-only를 유지한다.

기존 사용자 변경·실계정 세션·공개/예약 글을 보존한다. V3 실행 지문은 정식 `fingerprint:pin` 절차와 실제 import graph 검증으로 갱신하며 기존 승인 증거·활성화를 재사용하지 않는다.

최종 전체 릴리스 게이트와 새 패키지 부팅 검사는 통과했다. 설치 파일은 `C:/Users/박성현/Desktop/LDBIMAGEULTRA/session-work/app-211365-daily-publishing-physical/release_final/Better-Life-Naver-Setup-2.11.365.exe`이며 SHA256은 `488E07B25D5C35E742ED688134BFE56A5C245993AAA7DAEBEA244240B055FD6D`다. 실제 사용자 앱 설치·원격 배포·반복 발행 활성화는 하지 않았다.

이번 패키지는 확장 저장소의 `tools/package-daily-app-20261020.ps1`로 별도 사본에서 만들었다. source node_modules junction 재사용은 의존성 누락을 일으켜 쓰지 않는다. 외부 npm 패키지 punycode와 필수 peer onnxruntime-web을 포함하고, 패키징 사본 manifest에 필수 peer를 승격한다. 다음 릴리스도 이 패키징 절차와 의존성 그래프·실제 unpacked 부팅 검사를 유지해야 한다.
