# v2.11.3 — 라이선스 인증창 X 닫기 race fix

사용자 보고 hotfix.

## 증상

라이선스 로그인 창에서 우측 상단 X 버튼으로 닫으면 "앱 초기화 오류 — HTML 로드 실패 (loadFile: ERR_FAILED (-2) / fallback loadURL: Object has been destroyed)" 다이얼로그가 떴다. 앱이 정상 종료되지 않고 에러 다이얼로그가 먼저 노출.

## 원인

createWindow 내 `mainWindow.loadFile(htmlPath)` 호출 중 한글 경로 ERR_FAILED 발생 → catch 진입 사이 사용자가 인증창을 닫아 app 종료 절차가 시작되면 mainWindow가 destroy → fallback `loadURL`이 destroyed window에 호출되어 "Object has been destroyed" throw → `dialog.showErrorBox`.

기존 v2.10.240 한글 경로 fallback 자체는 정상 흐름에서 잘 동작했는데, X 닫기와 동시에 발생하는 race는 가드가 없었다.

## 조치

`main.ts` fallback 호출 직전과 직후 두 군데 `isDestroyed()` 가드. mainWindow가 destroy됐으면 사용자 종료 의도로 보고 silent return. 정상 라이선스 통과 후 한글 경로 fallback 흐름은 가드를 통과해서 그대로 동작.

## 회귀 가드

- vitest 2434/2434 PASS (171 files)
- tsc --noEmit exit 0
- main.ts hunk 1개, 13줄 추가 (god file 한도 3 hunks 이내)

## 핵심 commit

- `0181739c` fix(main): 라이선스 인증창 X 닫기 race — loadFile fallback isDestroyed 가드

## 알려진 제한

- race 자체가 사라진 게 아니라 사용자가 보는 다이얼로그가 안 뜨는 거. 한글 경로 ERR_FAILED + 동시 종료는 여전히 발생할 수 있고, 그때 silent return으로 처리.
- showLicenseInputDialog (라이선스 코드 입력 모달) 의 dangling Promise 패턴은 동일하지만 별도 cycle로 분리. 본 hotfix 범위 밖.

🐙 SPEC-MIGRATION-2026 외 hotfix
