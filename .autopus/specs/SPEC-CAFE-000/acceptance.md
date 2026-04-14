# SPEC-CAFE-000 — Acceptance Criteria

## Spike 완료 조건

다음 3개 산출물을 **모두 획득**했을 때 스파이크 완료:

### 1. A1 (세션 재사용) — Binary 결과

필수 증거:
- [ ] `NID_AUT` 쿠키의 `domain` 필드가 `.naver.com`인지 확인된 로그 출력
- [ ] `cafe.naver.com` 메인 페이지 진입 후 로그인 상태 표시 DOM 요소 존재 확인
- [ ] `%APPDATA%/BetterLifeNaver/debug-dumps/*_SPIKE_A1_SESSION_CHECK*/` 폴더 생성

**Pass**: 두 조건 모두 충족 → A1 성공, cafeLoginFlow 재구현 불필요
**Fail**: 하나라도 실패 → A1 불가, 후속 Phase에 `cafeLoginFlow.ts` 추가

### 2. A2 (에디터 DOM) — 정량 결과

필수 증거:
- [ ] `frames.html`에 카페 글쓰기 페이지 전체 iframe 트리 포함
- [ ] `#mainFrame` 또는 동등 iframe ID 명시
- [ ] 블로그 셀렉터 6개 중 매칭 개수 (예: `.se-main-container`, `.se-section-text`, `.se-text-paragraph`, `.se-editing-area`, `[contenteditable="true"]`, `.cafe-editor`)

**Pass**: `#mainFrame` 존재 + 매칭률 50% 이상 → `editorHelpers.ts` 대부분 재사용 가능
**Partial**: `#mainFrame` 존재 + 매칭률 < 50% → `cafeEditorHelpers.ts` 신규 작성 (+1~2일)
**Fail**: `#mainFrame` 부재 또는 완전히 다른 구조 → 카페 에디터 재설계 (+3~5일, Phase A 일정 재조정)

### 3. A3 (게시판 API) — 응답 샘플

필수 증거:
- [ ] `CafeMenuList.json` 또는 동등 API의 HTTP 응답 코드 기록
- [ ] 200인 경우 response body JSON 샘플 (메뉴 배열)
- [ ] 4xx/5xx인 경우 `events.log`에서 실제 전송된 헤더/쿠키 덤프

**Pass**: status 200 + JSON body에 메뉴 배열 → 자동 크롤링 가능
**Token Required**: status 401/403 + 토큰 힌트 발견 → 토큰 추출 단계 추가 (+0.5일)
**Fail**: 다른 에러 → 사용자 수동 게시판 입력 UI (+1일)

## Overall Spike Verdict

| A1 | A2 | A3 | Verdict | Next Action |
|---|---|---|---|---|
| Pass | Pass | Pass | 🟢 **GO** | SPEC-CAFE-A-001 바로 진행 |
| Pass | Pass | Token | 🟢 **GO** | 토큰 추출 task 추가 |
| Pass | Partial | Pass/Token | 🟡 **CAUTION** | Phase A 일정 +2일 |
| Pass | Fail | - | 🔴 **RECONSIDER** | 카페 에디터 전략 재설계 |
| Fail | - | - | 🔴 **BLOCK** | cafeLoginFlow 우선 필수 |

## Exit Criteria (스파이크 중단 조건)

아래 조건 중 하나라도 충족되면 즉시 스파이크 중단:
- 네이버가 스파이크 중 카페 접근을 차단 (API 전면 수정 등)
- 테스트 계정이 의심 계정으로 마킹되어 추가 인증 요구
- A1~A3 모두 실패 (전면 재설계 필요)

## Final Deliverables

스파이크 완료 시 repo에 커밋:
1. `.autopus/specs/SPEC-CAFE-000/research.md` (Results 섹션 채움)
2. `.autopus/specs/SPEC-CAFE-000/acceptance.md` (이 문서, Final Verdict 추가)
3. `.autopus/specs/SPEC-CAFE-000/review.md` (스파이크 리뷰 요약 — verdict 결정)
4. `scripts/spike/cafe-session-check.ts`, `cafe-editor-dom.ts`, `cafe-api-check.ts`

폴더 보존 (gitignored):
- `%APPDATA%/BetterLifeNaver/debug-dumps/*_SPIKE_*/` — 원본 덤프 파일

## Sign-off

- [ ] 사용자 박성현 (2026-04-20) — Verdict 최종 확인
- [ ] Claude (Autopus 메인 세션) — Research/Acceptance/Review 문서 작성 완료
