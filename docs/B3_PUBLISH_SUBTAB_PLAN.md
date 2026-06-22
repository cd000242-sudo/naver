# 서브 울트라플랜 — B3: 글 발행하기 발행 모드 서브탭 (단일/연속/다중계정)

> 목표: 글 발행하기 탭에 **발행 모드 서브탭**(단일발행 / 연속발행 / 다중계정 풀오토). 연속·다중계정은
> 현재 **모달** → 서브탭에 **인라인**으로 깔끔하게. **핵심 발행 흐름 회귀 0**이 최우선.

## 0. 설계 원칙
- ⛔ 대형 모달 HTML을 직접 잘라 옮기지 않는다(회귀 위험). → **B2와 동일 패턴**: 서브탭 스캐폴드 + 모달 내부 패널을 **런타임 relocate** + 백드롭 중립화 + opener 재배선.
- 모달 내부 버튼/핸들러는 `getElementById` 기반이라 DOM 노드 이동 후에도 유효(id 보존).
- 각 Phase = build + vitest + 커밋. 발행은 앱 핵심이라 **라이브 발행 스모크** 권장.

## 1. 현황 (코드 근거)
- 글 발행하기 = `#tab-unified`. 단일발행 흐름이 본문.
  - 내부에 이미 "발행 계정 선택" 서브구조(`single-account-tab`/`multi-account-tab`, account-tab) 존재 — **"계정 수" 선택**(발행 모드와 층위 다름). 건드리지 않고 공존.
- 연속발행 = `#continuous-mode-modal` (index.html:6692, modal-backdrop, z 10006). opener: continuousPublishing.ts:726.
- 다중계정 풀오토 = `#multi-account-modal` (index.html:9150, modal-backdrop, z 10003). opener: multiAccountManager.ts:655(헤더 multi-account-btn). 모달을 body로 옮겨 display:flex.
- 모달 close 로직이 여러 파일에 `modalsToClose=[...]`로 산재 — relocate/중립화해도 no-op이라 안전.

## 2. Phase 분해 (각 게이트·커밋)

### B3-1 — 서브탭 스캐폴드 (SAFE, 기능 불변)
- 글 발행하기 최상단에 **발행 모드 서브탭 바**: 🟢 단일발행 / 🔄 연속발행 / 🚀 다중계정 풀오토.
- 서브패널 host 3개: `pub-mode-single`(기존 본문은 그대로 두고 시각적 그룹만), `pub-mode-continuous`(빈 host), `pub-mode-ma`(빈 host).
- 서브탭 전환 JS: active 패널 show, 나머지 hide. (단일=기존 본문 영역)
- 이 단계에선 연속/다중계정 탭 클릭 = **기존 모달 열기**(기능 100% 보존). 서브탭 바만 새로 보임.
- ✅ 안전: 아무것도 안 깨지고 서브탭 UI만 등장.

### B3-2 — 연속발행 인라인
- init에서 `#continuous-mode-modal` 내부 `.modal-panel`을 `pub-mode-continuous`로 relocate(멱등).
- 백드롭 중립화: 모달 backdrop을 안 띄우고, 패널을 서브탭 패널 안에서 일반 흐름으로 렌더(position/centering 해제, 풀폭).
- 연속발행 서브탭 클릭 → 모달 open 대신 서브패널 표시. opener(continuousPublishing.ts) 재배선: 모달 표시 호출을 서브탭 활성화로 치환.
- close 로직은 no-op 허용.
- 게이트 + 라이브 연속발행 스모크.

### B3-3 — 다중계정 풀오토 인라인
- 동일 패턴: `#multi-account-modal` .modal-panel → `pub-mode-ma` relocate + 중립화 + opener(multiAccountManager.ts:655) 재배선.
- 헤더 `multi-account-btn`(풀오토 다중계정) → 글 발행하기 탭의 다중계정 서브탭으로 전환(사용자 6버튼 목록엔 없으니 헤더에서 제거하고 서브탭으로 일원화).
- 게이트 + 라이브 다중계정 스모크.

### B3-4 — 정리·폴리시
- 인라인 시 중앙정렬 모달패널 → 풀폭/일관 스타일 보정. 잔여 모달 트리거·중복 close 정리(도달불가만).
- 발행 흐름 full-flow 회귀 검증.

## 3. 리스크 & 가드
- 🔴 핵심 발행 흐름 — 각 Phase 후 vitest + 사용자 라이브 발행 1회.
- relocate라 핸들러 id 보존. 백드롭 중립화 시 z-index/positioning 점검.
- 한 Phase에 한 모달만(연속→다중계정 분리)으로 blast radius 축소.

## 4. 진행
B3-1(스캐폴드)부터 게이트·커밋. 단계마다 보고.
