# src/shared — 블로그/카페 공통 코드 (v1.5.0+)

> 🚧 **준비 중** — 카페 모드 Phase A 시작 시 기존 코드에서 점진 추출 예정

## 목적
블로그와 카페가 공유하는 코드를 한 곳에 모아:
1. 중복 제거 (DRY)
2. 향후 `leader-naver-cafe` standalone 앱으로 추출 가능하게 경계 설정
3. PublishAdapter 인터페이스 기반 Strategy 패턴 지원

## 구조 (예정)

```
src/shared/
├── automation/
│   ├── browserBase.ts       # Puppeteer 인스턴스 관리 공통
│   ├── loginBase.ts         # 네이버 SSO 로그인 공통
│   └── executionLock.ts     # 뮤텍스/AbortController 패턴
├── ipc/
│   ├── safeHandle.ts        # IPC 에러 래핑
│   └── ipcHelpers.ts        # sendLog, sendStatus
├── selectors/
│   └── selectorUtils.ts     # 셀렉터 대기/실패 리포트 유틸
└── types/
    └── automationBase.ts    # IAutomationInstance, PublishAdapter
```

## 추출 예정 (점진)
- `src/contentGenerator.ts` 상단부 → `shared/contentGenerator.ts` (Electron API 의존 제거 후)
- `src/imageGenerator.ts` → `shared/imageGenerator.ts`
- `src/aiHumanizer.ts` → `shared/humanizer.ts`
- `src/automation/selectors/selectorUtils.ts` → `shared/selectors/`

## 원칙
1. **Electron API 직접 참조 금지** — renderer/main 어디서든 import 가능해야 함
2. **단방향 의존** — `automation/`, `cafe/`가 `shared/` import. 역방향 금지.
3. **테스트 우선** — shared/ 추출 시 반드시 단위 테스트 동반 (shared는 앞으로 라이브러리화될 것)
