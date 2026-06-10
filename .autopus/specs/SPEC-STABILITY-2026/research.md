# SPEC-STABILITY-2026 진단 근거 (research)

> 2026-06-10, 병렬 진단 에이전트 9개 + 메인 세션 코드 직접 검증. 핵심만 발췌 — 수치/라인은 v2.11.32 기준.

## A. 리치 붙여넣기 누락 (S1) — 검증 완료

- 리치 전환 타임라인: richTextPaste.ts 도입 v2.11.14 → 변경 v2.11.15/21/29. `buildMobileRichHtml`은 표/리스트/헤딩/Q&A/문단만 처리 — 구분선/이전글/CTA는 꼬리 단계에서 **타이핑으로** 삽입되는 구조 유지.
- 결함 ①: `editorHelpers.ts` 구 642·676행 `.replace(/━{22}…[^\n]*\n?/g,'')`가 본문 정제 때 **단독 ━ 구분선 줄까지 통삭제** (v1.2.71부터 있던 코드 — 리치 전환으로 노출 확대).
- 결함 ②: v2.11.27(027703e6)에서 `insertPreviousPostTailBlock` 신설 시 구분선이 ━ 38자 → 하이픈 62자로 교체. 앱의 다른 구분선(2157/2195/2248/2338행)은 전부 ━ — 비일관.
- 결함 ③(간헐 누락 메커니즘): 꼬리 블록 전체(구분선/CTA/이전글/해시태그)가 `page.keyboard` 현재 커서에 맹타이핑. 리치 붙여넣기·이미지 업로드가 포커스를 뺏으면 **허공 입력** → 링크카드 폴링 15s 타임아웃 후 그대로 진행(silent) → 누락 발행.
- 주의: `effectiveCtas.some()` 중복체크 제거(v2.11.30/31)와 하이픈 구분선은 **테스트로 잠근 의도적 변경**이었음 (publishMetadataPropagation.test.ts:67,72). 중복체크 복원은 다중계정 `ctaType='previous-post'` 흐름에서 이전글 누락을 재발시키므로 **복원하지 않음**. 구분선만 ━로 복원(사용자 요구 + 앱 일관성).

## B. 세션유지 (S2) — 검증 완료

- `ensureServerSession()` (browserSessionManager.ts:809): v1.6.0 "발행 직전 게이트"로 설계, 주석에 사용법까지 명시 — **호출자 0곳** (grep 전수). 가드 테스트(sessionKeepaliveV2.test.ts:88)는 "메서드 존재"만 정적 매칭 → 배선 누락을 못 잡음.
- `runPostOnly()` (naverBlogAutomation.ts:9237): `if (!this.browser)`일 때만 로그인 → **브라우저 재사용(연속발행·발행 후 SW_HIDE 숨김 유지) 시 검증 0** → 만료 세션으로 에디터 진입 → 리다이렉트 실패.
- keepalive (runKeepalivePing, :1004): 15분±지터, 15% skip. **`accountId === activeAccountId`면 무조건 skip** (:1026, "Bug 10 발행 중 경쟁" 가정) — 그러나 `activeAccountId`는 세션 생성 시 설정, 해제는 closeSession/switchAccount뿐 → **단일계정은 keepalive 영구 0회**. `isAccountLoggedIn`(:875)은 locked면 TTL 검사 생략("keepalive가 리셋 중이므로 안전"이라는 전제가 거짓).
- 기각된 가설: Puppeteer 25 `browser.connected` 호환(이미 반영), updater 변경(세션 경로 무접촉), v2.11.10(타임아웃/로그 강화만).
- 결론: 단일 회귀 커밋 특정 불가 — 구조적 미배선. 체감 악화는 사용 패턴(앱 상시 켜둠)·네이버 TTL 변동 영향 추정.
- 세션 테스트 5파일 81개 GREEN (모킹 한계 — 라이브 회귀 감지 불가했음).

## C. 이미지 3증상 (S3~S5)

- **S3 빈 결과**: fullAutoFlow.ts:774 / main.ts:4606 throw는 의도된 게이트. 빈 배열 근원은 nanoBananaProGenerator.ts — L738 catch가 로그만 남기고 null, L726 응답 없음 null, L1700 쿼터 0 null → null 필터 후 빈 배열. 재시도(L793-810)는 같은 키·같은 파라미터 반복 → 429/쿼터/세션류엔 무의미.
- **S4 뒤섞임**: 매핑이 heading 문자열 정규화 키(imageManagerCore resolveHeadingKey :110-138) + 위치 인덱스 리매핑(:224) 이중 구조. heading 변이(배지/넘버링) 시 정규화 불일치 → 인덱스 폴백이 **다른 소제목에 배정**. 발행 직전 sync(publishingHandlers.ts:1916-1935)는 재검증 없음. 간헐성(1/10)은 "heading 변이가 생긴 글에서만" 발생하는 패턴과 부합.
- **S5 썸네일 공란**: 이미지관리 그리드(imageManagerCore.ts:797-888)가 `filePath`를 그대로 `<img src>` — 풀오토 합성 썸네일이 웹 URL/임시 경로(naverBlogAutomation.ts:9586, fullAutoFlow.ts:542-554)면 403/CORS/삭제로 로드 실패 → onerror 공란. 보조 원인: syncGeneratedImagesArray(:543-546) `getImage('🖼️ 썸네일')` 키 불일치 시 미등록.

## D. 도메인 위험 지도 (4개 explorer 종합 — 상위만)

### 발행 파이프라인
- [P0] 발행 직후 결과 검증 부재 (publishHelpers.ts:1822-1850) — 클릭=성공 간주
- [P0] 예약 설정 3방법 모두 실패해도 즉시발행으로 진행 가능 (:950-1114)
- [P1] 모달 미오픈 상태로 카테고리 선택 강행 (:1774-1826) / 셀렉터 레이스 미결 promise (:21-49)
- 구조: catch-무시 87건, `_prosConsAlreadyInserted` 등 발행 간 상태 리셋 부재, smartTypeWithAutoHighlight 사본 2곳, publishHelpers/editorHelpers/ctaHelpers 직접 테스트 0%

### 콘텐츠/이미지
- [P0] 제목 생성 실패 신호 미전파 → 빈 제목 발행 가능 (contentGenerator.ts:790-962)
- [P1] imageTextConsistencyChecker fail-open(실패 시 score 50 통과) / imageFormatPipeline 실패 시 원본 무검증 반환
- [P1] Gemini SAFETY/RECITATION 영구 에러 재시도 처리 비일관

### 세션/스케줄러/복구
- [P0] 발행 idempotency 부재 — 네트워크 단절 후 재시도 시 중복 발행 가능
- [P0] 예약 타이머 PC 절전 복귀 시 음수 delay (smartScheduler.ts:102-116)
- [P1] 다계정 proxy null 폴백이 기본 warn-only (:268-301) / 타이머 누수 후보

### 빌드/릴리즈
- [P0] 번들 단일 스코프 concat 식별자 충돌 — 런타임 전용 (copy-static.mjs:596-846, 검증 불완전)
- [P0] IPC 계약 검증 0 (main 200+ 채널) / 커버리지 3.7% (vitest 대상 협소)
- [P1] "vX.Y.Z release" 번들 커밋 → bisect 불가 (이번 진단에서도 회귀 시점 특정에 diff 전수 확인 필요했음)

## E. R1 수정·검증 기록 (2026-06-10)

- RED 확인: 신규 가드 6건 실패(수정 전) → 구현 → 대상 6파일 99 GREEN
- 전체 게이트: vitest **226파일 2,885개 0 fail** (기준선: 223파일 2,871 pass + 1 fail) · lint **0 errors**(1,018 warnings) · build 성공 + 번들 검증 통과
- 변경 파일: bodyArtifactCleanup.ts(신설) · editorHelpers.ts · richTextPaste.ts(export 1줄) · naverBlogAutomation.ts(runPostOnly 게이트) · 테스트 4파일(신설 2 + 갱신 2)
