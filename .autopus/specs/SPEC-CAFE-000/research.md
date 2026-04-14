# SPEC-CAFE-000 — Research (사전 분석)

> 이 문서는 4/14(일) 코드 레벨 분석 결과입니다. 4/20(월) 실제 브라우저 실증 후 Results 섹션이 추가됩니다.

## 분석 방법

v1.4.55 코드베이스를 explore 에이전트로 분석하여 3개 기술 가정의 실현 가능성을 코드 레벨에서 추정. 실제 네이버 카페 접속은 하지 않음 (4/20 월요일 Phase 0 당일 수행 예정).

## Assumption Analysis

### A1: 블로그 세션이 카페에서 재사용 가능한가?

**추정**: ✅ **가능성 높음**

**코드 증거**:
1. `src/browserSessionManager.ts:65` — `PROFILE_BASE = ~/.naver-blog-automation/profiles`, `userDataDir` 기반 Chrome 프로필 전체 영속화 → 쿠키 DB 통째 공유
2. `src/browserSessionManager.ts:243` — `--disable-features=ThirdPartyCookieBlocking,SameSiteByDefaultCookies` 플래그로 서브도메인 쿠키 격리 해제
3. `src/naverBlogAutomation.ts:2116` — `page.cookies('https://nid.naver.com', 'https://www.naver.com', 'https://blog.naver.com')` 호출 방식 → `NID_AUT`/`NID_SES`는 `.naver.com` 와일드카드 발행 쿠키
4. `src/naverBlogAutomation.ts:3632` — warmup 시퀀스에 `https://cafe.naver.com` 이미 포함 — **부분 검증 완료된 상태**

**잠재 리스크**:
- `sessionPersistence.ts`의 `saveCookies()/restoreCookies()` 경로가 쿠키 domain을 잘못 저장/복원할 가능성
- 새 Chrome 프로필 생성 시 초기 warmup이 없으면 쿠키 미설정 상태에서 cafe.naver.com 접근 실패 가능

### A2: 카페 에디터가 SmartEditor ONE과 호환되는가?

**추정**: 🟡 **70% 호환 추정**

**코드 증거**:
1. `src/automation/selectors/editorSelectors.ts:35-177` — 블로그 에디터 셀렉터 전체가 `.se-*` 프리픽스 (SmartEditor ONE 공개 네이밍)
2. `src/automation/selectors/editorSelectors.ts:101-115` — 블로그 iframe 단일 depth: `#mainFrame` / `iframe[name="mainFrame"]`
3. 네이버 카페도 SmartEditor ONE 계열 사용으로 알려짐 (공개 정보)

**확인 필요**:
- 카페 `#mainFrame` ID 존재 여부
- `.se-main-container` 셀렉터 실제 매칭 여부
- 게시판 선택 UI 구조 (native select vs custom)
- 사진/동영상 게시판 전용 초기 레이아웃

**불확실성 원인**: 카페 버전의 SmartEditor ONE이 블로그 버전과 버전 번호/릴리즈 주기가 다를 수 있음.

### A3: 게시판 API 접근 가능한가?

**추정**: 🟡 **중간 (브라우저 내부 fetch만 가능)**

**코드 증거**:
1. `src/engagement/commentCrawler.ts:29` — `apis.naver.com/commentBox/cbox5/...` JSONP 호출 선례 (공개 API)
2. `apis.naver.com/cafe-web/cafe2/CafeMenuList.json?cafeId=XXX` — CORS 정책상 Node.js 직접 호출 불가, 브라우저 내부에서만 가능
3. 필요한 헤더: `Referer: https://cafe.naver.com/{clubid}`, 쿠키 `NID_AUT`/`NID_SES`

**불확실성**:
- 일부 카페 API는 추가 토큰(`cafe_token`, `cafeCsrf`) 요구 가능성
- Rate limit 정책 (세션당 요청 수 제한)

## Debug Infrastructure 활용성 (v1.4.54)

v1.4.54에서 추가된 `src/debug/domDumpManager.ts`의 `dumpFailure()`는 **실패 외 시점에도 호출 가능**합니다:

```typescript
await dumpFailure(page, {
  action: 'SPIKE_A2_EDITOR_EXPLORE',  // 임의 문자열
  context: { stage: 'carbon_capture', cafeId, boardId }
  // error, errorCode는 선택 옵션
});
```

자동 캡처 항목:
- 스크린샷 (fullPage)
- 메인 프레임 HTML (스크럽 적용)
- 모든 iframe HTML 결합 (`frames.html`)
- Events log (console + network)
- `meta.json` (계정 마스킹)
- `PRIVACY_REPORT.txt`

→ **카페 DOM 탐사에 그대로 사용 가능.** 별도 디버그 코드 작성 불필요.

## Results (2026-04-20 실행 후 채움)

### A1 Result
- [ ] **Status**: (pending/pass/fail)
- [ ] `NID_AUT` domain: (pending)
- [ ] `cafe.naver.com` 로그인 상태: (pending)
- [ ] Dump path: (pending)

### A2 Result
- [ ] **Status**: (pending)
- [ ] `#mainFrame` 존재: (pending)
- [ ] 블로그 셀렉터 매칭률: __/10
- [ ] 필요한 신규 셀렉터 수: __
- [ ] Dump path: (pending)

### A3 Result
- [ ] **Status**: (pending)
- [ ] API 응답 코드: (pending)
- [ ] 필요한 추가 헤더/토큰: (pending)
- [ ] Dump path: (pending)

## Decision Tree

(spec.md의 Decision Tree 참조)

## Next Action After Research

스파이크 성공 시:
```bash
/auto plan "SPEC-CAFE-A-001: 카페 URL 등록 + 게시판 선택 UI" --auto
```

스파이크 부분 실패 시:
- 실패 항목만 별도 SPEC으로 분리 (예: `SPEC-CAFE-001-LOGIN-REWRITE`)
- 나머지 Phase는 원래 일정대로 진행
