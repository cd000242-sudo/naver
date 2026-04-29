# Reviewer Summary — v2.7.30~42 (2026-04-29)

**리뷰 대상:** 13개 commit (v2.7.30 → v2.7.42), 26 파일 변경, +1,310/-145 라인
**판정:** REQUEST_CHANGES — 사용자 보고 회귀는 정확히 잡았으나, 가드 누락이 다음 라운드 회귀를 예약함

## TRUST 5 점수

| 항목 | 점수 | 핵심 평가 |
|---|---|---|
| **Test (회귀 가드)** | ★★☆☆☆ | 13개 fix commit 중 단위 테스트 추가 0건. v2.7.34의 13건 갱신은 "skip" 처리 위주(27 skipped). FTC 토글, Redirect=Write 화이트리스트, postManager 5초 가드 모두 회귀 가드 없음. |
| **Robustness** | ★★★★☆ | v2.7.39 LEWORD `latestTag === ''` fallback / v2.7.40 silent fail 차단 / v2.7.41 waitForFunction 폴링 — 실패 처리 패턴이 일관되게 강화됨. v2.7.38 Flow 3중 가드만 과방어. |
| **Use case** | ★★★★★ | 모든 commit이 사용자 보고와 1:1 매칭. v2.7.30~32 FTC opt-in, v2.7.40 글 목록 누락, v2.7.41 무한로딩, v2.7.42 메시지 친화 — 의도 정확. |
| **Style** | ★★★☆☆ | `(resolved as any).disableAutoFtcDisclosure`(v2.7.29 → 31에서 제거되었으나 패턴 잔존), `globalThis.__lastOpenAIError`(v2.7.33), `self: any` helpers — 타입 안전성 누수. 주석은 우수(`✅ [v2.7.XX]` 일관). |
| **Trust (보안/안전성)** | ★★★★☆ | API 키 source 노출 안전(prefix 7자리만). FTC 자동삽입 → 사용자 명시 opt-in 전환은 법적 책임 명확화. globalThis 변수만 멀티테넌트 위험. |

## 잠재 회귀 (다음 라운드 깨질 가능성 Top 5)

1. **`globalThis.__lastOpenAIError`** (v2.7.33) — 동시 발행 2개 진행 시 후속 호출이 앞 호출 에러를 덮어씀. 멀티계정/연속발행 흐름에서 잘못된 에러 메시지 표시.
2. **`Math.abs(newBodyLen - existingBodyLen) / Math.max(...) < 0.05`** (v2.7.40 postManager:431) — `newBodyLen=0` 또는 `existingBodyLen=0` 케이스. `similarLength`가 false가 되어 5초 더블클릭 가드 무력화.
3. **FTC 결정 우선순위 분기 3중**(v2.7.32) — checkbox UI > localStorage > mode default. 체크박스가 다른 탭/스크롤 상태에서 미렌더 시 `ftcCheckboxEl` null → localStorage로 fall through. 사용자 의도와 어긋남.
4. **Flow `--start-minimized`** (v2.7.38) — 비표준 flag. Playwright/Chromium 버전업 시 무시. 음수 좌표 -32000도 멀티 모니터 4K+ 환경에서 워크스페이스 좌표계에 따라 화면 안. 4중 가드 누적의 안티패턴.
5. **`isModelNotFound`에 'does not have access' 추가**(v2.7.37) — Anthropic API 에러 메시지 변경 시 즉시 깨짐. 영문 토큰 매칭은 모델 ID 매칭과 같은 SSOT 부재 패턴.

## 추가 개선 Top 5

1. **회귀 가드 6건 신설** — postManager 5s+5%, editorHelpers FTC text-presence, isEditorUrl Redirect=Write, userMessageMapper unit test, openaiImageGenerator quality='medium', LEWORD isUpToDate. 표 기반 unit test 6건이면 다음 라운드 4~5건 회귀 차단.
2. **`__lastOpenAIError` 글로벌 → 함수 스코프 회귀** — `let lastErrorRef` 클로저로 충분. globalThis 안티패턴 제거.
3. **FTC 결정을 단일 함수로 추출** — `resolveFtcSetting(formData, mode): { enabled: boolean; text: string }` — fullAutoFlow.ts/multiAccountManager.ts 양쪽 동일 로직 중복. 4번째 분기점 또 등장하면 재발 100%.
4. **`userMessageMapper.ts` 적용 부위 0** — 신규 모듈을 만들었으나 `flowGenerator.ts`에서 hardcoded 패치만 함. `appendLog/toastManager.error` 1,644개에 호출되도록 통합해야 효과 발생. 현재는 모듈 추가만으로 효과 없음.
5. **ftcDisclosure 결정 IPC 페이로드 vs editorHelpers 가드 불일치** — v2.7.31에서 editorHelpers는 `structured.ftcDisclosure` 텍스트 존재만 보고, v2.7.35에서 `includeFtcDisclosure: ftcEnabled`를 IPC에 추가했으나 main 측은 이를 검증 안 함. 이중 진실 소스 위험.

## 종합

핫픽스 정확도는 high — 사용자 보고 6건이 모두 코드 라인 단위로 진단됨. 단, **테스트 갭이 패턴화**(13 fix : 0 test)되었고 `globalThis` / `as any` / `localStorage 단독 의존` 패턴이 다음 라운드의 시한폭탄. P0 권고는 회귀 가드 6건이며, 이 없이는 v2.7.43~50 동안 동일 사이클 재발 확률 높음.
