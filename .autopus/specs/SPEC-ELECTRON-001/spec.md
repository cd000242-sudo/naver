# SPEC-ELECTRON-001 — Electron 31 → 33 업그레이드

**Status**: planned (waiting)
**Created**: 2026-04-14
**Target**: v1.5.x (카페 모드 완료 후, 2026-06)
**Blocker**: electron-updater 6.x의 Electron 33 공식 지원 확인 필요

## Why

Electron 31은 2024년 4월 릴리즈. 현재 Electron LTS 라인은 32/33/34. 보안 패치 + Chromium 업데이트 수령을 위해 업그레이드 필요. CVE 대응력 개선 목적.

## Current State

| 항목 | 값 |
|---|---|
| Electron | 31.7.7 |
| Chromium | 126 |
| Node.js (embedded) | 20.16.x |
| electron-builder | 26.0.12 |
| Node ABI | 115 |

## Target State

| 항목 | 값 |
|---|---|
| Electron | **33.x** (LTS 권장) |
| Chromium | 130 |
| Node.js | 20.18.x |
| Node ABI | **115** (동일 — 네이티브 모듈 재빌드 불필요 예상) |

**Big Bang 방식**: 31 → 33 직행. 32 경유 불필요 (Node ABI 동일).

## Breaking Changes 분석 (31 → 33)

### 32
- `nativeWindowOpen` 완전 제거 — ✅ 미사용
- `ipcRenderer.sendSync` 블로킹 경고 강화 — 🟡 영향 없음 (현재 비동기 IPC만 사용)
- Windows arm64 빌드 개선 — 🟢 해당 없음

### 33
- `sandbox: false` 동작 강화 — ⚠️ **`main.ts:1430` 재검토 필요**
- `onHeadersReceived` 대소문자 처리 강화 — ⚠️ **`main.ts:1440-1449` CSP 핸들러 확인 필요**
- `contextBridge` API 변경 없음 — ✅ 현재 패턴 안전
- Node.js 20.18 기반 — API 차이 거의 없음

## Dependency 호환성 Matrix

| 패키지 | 현재 | 리스크 | 비고 |
|---|---|---|---|
| puppeteer ^24.40.0 | 🟢 낮음 | 자체 Chromium 번들 (Electron 독립) |
| puppeteer-extra | 🟢 낮음 | |
| playwright ^1.58.1 | 🟢 낮음 | 자체 브라우저 번들 |
| **sharp ^0.34.5** | 🟡 **중간** | N-API 네이티브. Node ABI 115 동일 → 재빌드 불필요 예상. 단 `npmRebuild: false` 설정이라 실제 빌드 후 검증 필수 |
| @imgly/background-removal | 🟢 낮음 | WASM/ONNX, Node ABI 무관 |
| ffmpeg-static | 🟢 낮음 | 정적 바이너리 |
| mongoose | 🟢 낮음 | 순수 JS |
| redis | 🟢 낮음 | 순수 JS |
| **electron-updater ^6.7.3** | 🟡 **중간** | **Electron 33 공식 호환 확인 필요** — 이게 GO/WAIT 핵심 blocker |

## 코드 레벨 리스크 지점

### 🟢 변경 불필요
- `src/preload.ts` — `contextBridge` + `ipcRenderer` 표준 패턴
- `src/main/core/WindowManager.ts:32-40` — `nodeIntegration: false`, `contextIsolation: true` (권장 보안)

### 🟡 검토 필요
- **`src/main.ts:1430`** — `sandbox: false` 설정
  - Electron 33에서 여전히 허용되나 preload 동작 회귀 테스트 필수
  - 가능하면 `sandbox: true`로 전환 검토 (추가 테스트 필요)
- **`src/main.ts:1440-1449`** — `onHeadersReceived` CSP 핸들러
  - 대문자 `Content-Security-Policy` 키 사용 중
  - Chromium 132에서 소문자 처리 가능성 → 양쪽 키 모두 커버하도록 수정

### ⚠️ 필수 검증
- **`package.json:205-206`** — `npmRebuild: false` + `nodeGypRebuild: false`
  - sharp가 새 Node ABI에 맞게 재빌드되는지 확인 필요
  - Node ABI는 115 동일하므로 이론상 문제 없지만, `sharp` 실제 동작 테스트 필수

## Implementation Plan

### Phase 1: Blocker 검증 (0.5일)
1. `electron-updater` GitHub Issues에서 Electron 33 호환성 확인
2. sharp 팀 이슈 트래커에서 Electron 33 + sharp 0.34 조합 확인
3. 미검증 항목 발견 시 별도 이슈 트래킹

### Phase 2: 브랜치 업그레이드 (1일)
1. `feat/electron-33` 브랜치 생성
2. `package.json` 수정: `"electron": "^33.0.0"`, `electron-builder` 최신
3. `npm install` 실행
4. `npx tsc --noEmit` + `npm test` 검증

### Phase 3: 로컬 기동 + 검증 (1일)
1. `npm run dev` 로 개발 기동
2. 발행 파이프라인 수동 테스트 (1건)
3. sharp 이미지 처리 회귀 테스트
4. preload 브리지 정상 동작 확인
5. `onHeadersReceived` CSP 적용 확인 (DevTools Network)

### Phase 4: 패키징 + 릴리즈 (1일)
1. `npm run dist` 로 NSIS + portable 빌드
2. 실제 `.exe` 더블클릭으로 설치 후 테스트
3. `electron-updater` 자동 업데이트 동작 확인 (테스트 릴리즈로)
4. 문제 없으면 `main` 머지
5. v1.5.x 릴리즈로 배포

**총 예상 시간**: 3~4일

## Acceptance Criteria

스파이크/업그레이드 완료 조건:
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm test` 287/287 통과
- [ ] `npm run lint` 0 errors
- [ ] `npm run build` 성공
- [ ] `npm run dist` NSIS + portable exe 생성
- [ ] 실제 exe로 네이버 발행 1건 성공
- [ ] sharp 이미지 생성 1건 성공
- [ ] electron-updater 버전 감지 확인
- [ ] 로컬 CSP 핸들러 CSP 헤더 정상 주입 확인

## Rollback Plan

문제 발생 시:
1. `git revert` 업그레이드 커밋
2. `package.json electron` 31.7.7로 복귀
3. `npm install` 재실행
4. 이전 동작 복원 확인

모든 과정을 feat 브랜치에서 수행하므로 main 영향 없음.

## Decision: WAIT (조건부 GO)

**현재 판정**: **WAIT** — 다음 조건 충족 시 GO
1. electron-updater 6.x의 Electron 33 공식 지원 확인됨
2. 카페 모드 v1.5.0 안정화 완료 (5/31 이후)
3. 네이버 블로그 긴급 이슈 없음

**권장 시점**: 2026-06 (카페 모드 완료 후)

## References

- ARCHITECTURE.md — 현재 아키텍처
- Electron release notes: https://releases.electronjs.org/
- electron-updater: https://github.com/electron-userland/electron-builder
- Memory: `project_stabilization_progress.md` — Phase 5C가 이 업그레이드 작업
